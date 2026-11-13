<#
.SYNOPSIS
  One-shot health check of the Bug Tracker stack. Exit code 0 = all good, 1 = something failed.

.DESCRIPTION
  Checks, in order:
    1. BFF liveness        GET <BffUrl>/api/health            (the Node server answers)
    2. BFF -> Bugzilla     GET <BffUrl>/api/health?deep=1     (the BFF can reach Bugzilla on the service key)
    3. Bugzilla REST       GET <BugzillaUrl>/rest/version     (Apache + Perl + database up)
    4. Database port       TCP 127.0.0.1:3307
    5. Windows services    Apache2.4, MariaDB
    6. Backup freshness    newest bugzilla-full-*.sql younger than -MaxBackupAgeHours
    7. Session store       the BFF reports its store type (file/redis expected in production)
    8. Outbound mail       Bugzilla's mail_delivery_method is not None (password resets need it)

  Suitable for Task Scheduler (hourly) with an alert on a non-zero exit code, or for a monitor
  that only needs the single URL: <BffUrl>/api/health?deep=1 returns 200 when healthy, 503 otherwise.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File ops\health-check.ps1
  powershell -ExecutionPolicy Bypass -File ops\health-check.ps1 -BffUrl http://192.168.0.50:4000 -MaxBackupAgeHours 26
#>
[CmdletBinding()]
param(
  [string]$BffUrl = 'http://localhost:4000',
  [string]$BugzillaUrl = 'http://localhost',
  [string]$BackupDir = 'D:\TEST-BENCH-AUTOMATIONS\_backups',
  [string]$BugzillaDir = 'C:\Bugzilla',
  [int]$MaxBackupAgeHours = 26
)

$failures = 0
function Report([string]$name, [bool]$ok, [string]$detail) {
  $mark = if ($ok) { 'OK  ' } else { 'FAIL' }
  "{0} {1,-22} {2}" -f $mark, $name, $detail
  if (-not $ok) { $script:failures++ }
}
function Get-Json([string]$url) {
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 20
    return @{ status = [int]$r.StatusCode; body = ($r.Content | ConvertFrom-Json) }
  } catch {
    $resp = $_.Exception.Response
    if ($resp -and $resp.StatusCode) {
      try { $text = (New-Object IO.StreamReader($resp.GetResponseStream())).ReadToEnd(); return @{ status = [int]$resp.StatusCode; body = ($text | ConvertFrom-Json) } } catch {}
      return @{ status = [int]$resp.StatusCode; body = $null }
    }
    return @{ status = 0; body = $null; error = $_.Exception.Message }
  }
}

"Bug Tracker health check  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
"----------------------------------------------------------------"

$live = Get-Json "$BffUrl/api/health"
Report 'BFF liveness' ($live.status -eq 200) ("HTTP {0}{1}" -f $live.status, $(if ($live.body) { ", up $([int]$live.body.uptimeSeconds)s" } else { " $($live.error)" }))

$deep = Get-Json "$BffUrl/api/health?deep=1"
$bzOk = ($deep.status -eq 200) -and $deep.body -and $deep.body.bugzilla.ok
Report 'BFF -> Bugzilla' $bzOk ($(if ($deep.body -and $deep.body.bugzilla) { "Bugzilla $($deep.body.bugzilla.version)$(if ($deep.body.bugzilla.error) { ': ' + $deep.body.bugzilla.error })" } else { "HTTP $($deep.status)" }))

$ver = Get-Json "$BugzillaUrl/rest/version"
Report 'Bugzilla REST' ($ver.status -eq 200) ($(if ($ver.body) { "version $($ver.body.version)" } else { "HTTP $($ver.status) $($ver.error)" }))

$db = Test-NetConnection -ComputerName 127.0.0.1 -Port 3307 -WarningAction SilentlyContinue -InformationLevel Quiet
Report 'MariaDB port 3307' $db $(if ($db) { 'listening' } else { 'not listening' })

foreach ($svc in 'Apache2.4', 'MariaDB') {
  $s = Get-Service -Name $svc -ErrorAction SilentlyContinue
  Report "Service $svc" ($s -and $s.Status -eq 'Running') $(if ($s) { "$($s.Status)" } else { 'not installed' })
}

$newest = Get-ChildItem -Path $BackupDir -Filter 'bugzilla-full-*.sql' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($newest) {
  $age = (Get-Date) - $newest.LastWriteTime
  Report 'Backup freshness' ($age.TotalHours -le $MaxBackupAgeHours) ("{0} ({1:N1} h old, {2:N1} GB)" -f $newest.Name, $age.TotalHours, ($newest.Length / 1GB))
} else {
  Report 'Backup freshness' $false "no bugzilla-full-*.sql in $BackupDir"
}

$task = Get-ScheduledTask -TaskName 'Bugzilla DB backup' -ErrorAction SilentlyContinue
Report 'Backup task' ($null -ne $task) $(if ($task) { "state $($task.State), next $((Get-ScheduledTaskInfo -TaskName 'Bugzilla DB backup').NextRunTime)" } else { 'not registered (ops\windows\register-backup-task.ps1)' })

if ($live.body) {
  $store = [string]$live.body.sessionStore
  Report 'Session store' ($store -ne 'memory') $(if ($store -eq 'memory') { 'memory - sessions lost on restart' } else { $store })
}

$paramsFile = Join-Path $BugzillaDir 'data\params.json'
if (Test-Path $paramsFile) {
  try {
    $bzParams = Get-Content $paramsFile -Raw | ConvertFrom-Json
    $method = [string]$bzParams.mail_delivery_method
    Report 'Outbound mail' ($method -ne 'None') $(if ($method -eq 'None') { 'mail_delivery_method None - no reset emails (ops\bugzilla\setup-smtp.pl)' } else { "$method via $($bzParams.smtpserver)" })
  } catch {
    Report 'Outbound mail' $false "cannot read $paramsFile"
  }
}

"----------------------------------------------------------------"
if ($failures -eq 0) { 'ALL CHECKS PASSED'; exit 0 } else { "$failures CHECK(S) FAILED"; exit 1 }
