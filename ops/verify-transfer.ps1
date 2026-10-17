<#
.SYNOPSIS
  End-to-end check of cross-product transfer: a KPost UI user moves one bug to KPost API,
  keeps seeing THAT bug, and still sees nothing else of KPost API.

.DESCRIPTION
  Dry run by default - signs in, runs every leak check, shows the transfer options, and stops.
  Add -Execute to perform the transfer (this changes the bug on live Bugzilla).

  Pick, before running:
    -UiUser          an account in KPost UI but NOT in KPost API (jmkmani55@kpostindia.com, ayyappan@kpostindia.com)
    -BugId           an OPEN KPost UI bug assigned to that user (or any open KPost UI bug if they are a tester)
    -ForeignBugId    any existing KPost API bug - the user must never be able to open it
    -Component       the target component (default: the first one listed)
    -Assignee        who in the target team takes it (default: the component owner)

  Checks:
    before  1. the foreign API bug is refused (403/404) for this user
            2. KPost API is not in the user's product list
            3. a KPost API bug search returns nothing
            4. transfer options list only directory data (components, versions, people) - no bugs
    after   5. the transferred bug opens (via CC) and is now in KPost API
            6. the foreign API bug is STILL refused
            7. KPost API is STILL not in the product list
            8. a KPost API search returns exactly the transferred bug and nothing else

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File ops\verify-transfer.ps1 -UiUser jmkmani55@kpostindia.com -BugId 1234 -ForeignBugId 900
  powershell -ExecutionPolicy Bypass -File ops\verify-transfer.ps1 -UiUser jmkmani55@kpostindia.com -BugId 1234 -ForeignBugId 900 -Execute
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string]$UiUser,
  [Parameter(Mandatory)] [int]$BugId,
  [Parameter(Mandatory)] [int]$ForeignBugId,
  [string]$BffUrl = 'http://localhost:4000',
  [string]$TargetProduct = 'KPost API',
  [string]$Component = '',
  [string]$Assignee = '',
  [string]$Reason = 'Root cause is in the API response, not the UI - verified with verify-transfer.ps1.',
  [switch]$Execute
)

$ErrorActionPreference = 'Stop'
$failures = 0
function Report([string]$name, [bool]$ok, [string]$detail) {
  "{0} {1,-48} {2}" -f $(if ($ok) { 'PASS' } else { 'FAIL' }), $name, $detail
  if (-not $ok) { $script:failures++ }
}
function Call([string]$method, [string]$path, $body = $null) {
  $req = @{ Uri = "$BffUrl/api$path"; Method = $method; WebSession = $script:web; UseBasicParsing = $true; TimeoutSec = 60 }
  if ($null -ne $body) { $req.Body = ($body | ConvertTo-Json -Depth 6); $req.ContentType = 'application/json' }
  try {
    $r = Invoke-WebRequest @req
    return @{ status = [int]$r.StatusCode; body = $(if ($r.Content) { $r.Content | ConvertFrom-Json } else { $null }) }
  } catch {
    $resp = $_.Exception.Response
    if (-not $resp) { throw }
    $text = (New-Object IO.StreamReader($resp.GetResponseStream())).ReadToEnd()
    return @{ status = [int]$resp.StatusCode; body = $(try { $text | ConvertFrom-Json } catch { $null }) }
  }
}

"Cross-product transfer check  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')   $(if ($Execute) { 'EXECUTE' } else { 'DRY RUN' })"
"--------------------------------------------------------------------------------"

$secure = Read-Host "Password for $UiUser" -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
$script:web = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$login = Call POST '/auth/login' @{ login = $UiUser; password = $plain }
$plain = $null
if ($login.status -ne 200) { "Sign-in failed: HTTP $($login.status) $($login.body.message)"; exit 1 }
"Signed in as $($login.body.user.email) (tester: $($login.body.user.permissions.canTriage))"
""

# ---------------------------------------------------------------- before
$foreign = Call GET "/bugs/$ForeignBugId"
Report '1. foreign API bug hidden' (@(403, 404) -contains $foreign.status) "HTTP $($foreign.status)"

$products = Call GET '/products'
$names = @($products.body.products | ForEach-Object { $_.name })
Report "2. $TargetProduct not in product list" (-not ($names -contains $TargetProduct)) ($names -join ', ')

$search = Call GET ("/bugs?product=" + [uri]::EscapeDataString($TargetProduct) + "&limit=50")
$found = @($search.body.bugs | ForEach-Object { $_.id })
Report "3. $TargetProduct search empty" ($found.Count -eq 0) "$($found.Count) bug(s) visible"

$opts = Call GET "/bugs/$BugId/transfer-options"
if ($opts.status -ne 200) { Report '4. transfer options' $false "HTTP $($opts.status) $($opts.body.message)"; exit 1 }
$target = @($opts.body.targets | Where-Object { $_.product -eq $TargetProduct })[0]
if (-not $target) {
  Report '4. transfer options' $false ("no $TargetProduct target returned (targets: " + (@($opts.body.targets | ForEach-Object { $_.product }) -join ', ') + ') - see the [transfer] line in the BFF log')
  $null = Call POST '/auth/logout'
  exit 1
}
$keys = ($target.PSObject.Properties.Name | Sort-Object) -join ','
Report '4. options are directory data only' ($keys -eq 'components,defaultMilestone,people,product,versions') $keys
"   from      : $($opts.body.from.product) / $($opts.body.from.component)"
"   components: $(@($target.components).Count)   versions: $(@($target.versions) -join ', ')   people: $(@($target.people).Count)"
if ($Component -and -not (@($target.components | ForEach-Object { $_.name }) -contains $Component)) {
  Report "   component '$Component' exists in $TargetProduct" $false 'check the spelling'
}

if (-not $Execute) {
  ""
  "Dry run complete - nothing changed. Re-run with -Execute to transfer bug $BugId to $TargetProduct."
  $null = Call POST '/auth/logout'
  if ($failures -eq 0) { exit 0 } else { exit 1 }
}

# ------------------------------------------------------------- transfer
if (-not $Component) { $Component = $target.components[0].name }
""
"Transferring bug $BugId -> $TargetProduct / $Component ..."
$payload = @{ product = $TargetProduct; component = $Component; reason = $Reason }
if ($Assignee) { $payload.assignee = $Assignee }
$t = Call POST "/bugs/$BugId/transfer" $payload
Report 'transfer accepted' ($t.status -eq 200) $(if ($t.status -eq 200) { "assigned to $($t.body.assignee), CC $($t.body.ccAdded)" } else { "HTTP $($t.status) $($t.body.message)" })
if ($t.status -ne 200) { exit 1 }

# ---------------------------------------------------------------- after
$mine = Call GET "/bugs/$BugId"
Report '5. transferred bug still visible (CC)' ($mine.status -eq 200 -and $mine.body.bug.product -eq $TargetProduct) "HTTP $($mine.status), product $($mine.body.bug.product) / $($mine.body.bug.component)"
if ($Assignee) {
  $now = [string]$mine.body.bug.assignedTo.email
  Report "   assigned to $Assignee" ($now -eq $Assignee) "assignee now $now"
}

$foreign = Call GET "/bugs/$ForeignBugId"
Report '6. foreign API bug STILL hidden' (@(403, 404) -contains $foreign.status) "HTTP $($foreign.status)"

$products = Call GET '/products'
$names = @($products.body.products | ForEach-Object { $_.name })
Report "7. $TargetProduct STILL not in product list" (-not ($names -contains $TargetProduct)) ($names -join ', ')

$search = Call GET ("/bugs?product=" + [uri]::EscapeDataString($TargetProduct) + "&limit=50")
$found = @($search.body.bugs | ForEach-Object { $_.id })
Report "8. $TargetProduct search = only bug $BugId" ($found.Count -eq 1 -and $found[0] -eq $BugId) "visible: $($found -join ', ')"

$null = Call POST '/auth/logout'
"--------------------------------------------------------------------------------"
if ($failures -eq 0) { 'ALL CHECKS PASSED'; exit 0 } else { "$failures CHECK(S) FAILED"; exit 1 }
