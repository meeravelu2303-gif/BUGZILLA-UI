<#
.SYNOPSIS
  Stops Apache from writing request query strings to Bugzilla's access log, and optionally
  removes the existing log that already contains credentials.

.DESCRIPTION
  Until the BFF switched to JSON-RPC, every call carried a password, session token or API key in
  the URL, and Apache's "combined" format (%r = the full request line) wrote them to
  logs\bugzilla-access.log. This script:
    1. backs up httpd.conf,
    2. adds a "combined_noquery" LogFormat that logs method + path only (%m %U %H),
    3. points the Bugzilla virtual host's CustomLog at it,
    4. tests the configuration and restarts Apache.
  With -PurgeExistingLog it also deletes the current bugzilla-access.log (after Apache has been
  stopped) so no credential survives on disk. Rotated copies (*.log.1, *.gz) are listed for you
  to remove by hand - they are not touched automatically.

  After this, also: rotate the service API key (Bugzilla > Preferences > API Keys), clear Bugzilla's
  login tokens (DELETE FROM logincookies) and ask users to change passwords - the log has already
  exposed the old ones.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File ops\apache\harden-access-log.ps1
  powershell -ExecutionPolicy Bypass -File ops\apache\harden-access-log.ps1 -PurgeExistingLog
#>
[CmdletBinding()]
param(
  [string]$HttpdConf = 'C:\Apache24\conf\httpd.conf',
  [string]$ApacheBin = 'C:\Apache24\bin\httpd.exe',
  [string]$AccessLog = 'C:\Apache24\logs\bugzilla-access.log',
  [switch]$PurgeExistingLog
)
$ErrorActionPreference = 'Stop'

$conf = Get-Content $HttpdConf -Raw
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Copy-Item $HttpdConf "$HttpdConf.bak-$stamp"
"Backed up httpd.conf to $HttpdConf.bak-$stamp"

if ($conf -notmatch 'LogFormat\s+"[^"]*"\s+combined_noquery') {
  $format = 'LogFormat "%h %l %u %t \"%m %U %H\" %>s %b \"%{Referer}i\" \"%{User-Agent}i\"" combined_noquery'
  # Place it right after the stock "combined" format so it reads as one of the standard set.
  $conf = $conf -replace '(?m)^(\s*LogFormat\s+"[^"]*"\s+combined\s*)$', "`$1`r`n    $format"
  "Added LogFormat combined_noquery (method + path, no query string)."
} else {
  "LogFormat combined_noquery already present."
}

$before = $conf
$conf = $conf -replace '(CustomLog\s+"logs/bugzilla-access\.log"\s+)combined\b', '$1combined_noquery'
if ($conf -ne $before) { "Bugzilla virtual host now logs with combined_noquery." } else { "Bugzilla CustomLog already uses combined_noquery (or was not found - check manually)." }
Set-Content -Path $HttpdConf -Value $conf -Encoding ASCII -NoNewline

& $ApacheBin -t
if ($LASTEXITCODE -ne 0) { throw 'Apache configuration test failed; httpd.conf was NOT changed in effect. Restore the backup if needed.' }

if ($PurgeExistingLog) {
  Stop-Service Apache2.4
  if (Test-Path $AccessLog) { Remove-Item $AccessLog -Force; "Deleted $AccessLog" }
  Start-Service Apache2.4
} else {
  Restart-Service Apache2.4
}
"Apache restarted: $((Get-Service Apache2.4).Status)"

$rotated = Get-ChildItem (Split-Path $AccessLog) -Filter 'bugzilla-access*' | Where-Object { $_.FullName -ne $AccessLog }
if ($rotated) { "Rotated log copies that may still hold credentials - review and delete by hand:"; $rotated | ForEach-Object { "  $($_.FullName)  $([math]::Round($_.Length/1MB,1)) MB" } }
if (-not $PurgeExistingLog -and (Test-Path $AccessLog)) {
  $hits = (Select-String -Path $AccessLog -Pattern 'password=|token=|api_key=' -SimpleMatch:$false | Measure-Object).Count
  "The existing $AccessLog still contains $hits credential-bearing lines. Re-run with -PurgeExistingLog to delete it."
}
