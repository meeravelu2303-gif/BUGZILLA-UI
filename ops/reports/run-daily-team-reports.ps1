# Daily team reports: every morning (not Sunday), each team leader gets an Excel report of
# what their team members did the PREVIOUS day (00:00-23:59, server time) -
# on Monday, Saturday and Sunday together.
#
# Run by the scheduled task "Bugzilla daily team reports" (09:00 every day).
# By hand:
#   powershell -ExecutionPolicy Bypass -File run-daily-team-reports.ps1                       (yesterday, to the leaders)
#   powershell -ExecutionPolicy Bypass -File run-daily-team-reports.ps1 -Date 2026-10-23 -To meera@kpost.in   (a preview)
#   powershell -ExecutionPolicy Bypass -File run-daily-team-reports.ps1 -From 2026-10-24 -ToDate 2026-10-25 -To meera@kpost.in
#
# Steps: team-report-data.pl (read the day from Bugzilla) -> build-team-report.cjs
# (one Excel per team) -> send-team-reports.pl (email each to its leader).
# If any step fails nothing is sent and the error is logged.
# A day already sent to the leaders is never sent again (unless -Force).
# Files: C:\Bugzilla\data\team-reports\<date>\  (kept 90 days)
# Log:   C:\Bugzilla\data\team-reports\team-reports.log
param(
  [string]$Date,
  [string]$From,
  [string]$ToDate,
  [string]$To,
  [switch]$Force,
  # Build everything but send nothing; -Today pretends the run happens on that date.
  [switch]$DryRun,
  [datetime]$Today = (Get-Date)
)
$ErrorActionPreference = 'Stop'

$perl     = 'C:\Strawberry\perl\bin\perl.exe'
$node     = 'C:\Program Files\nodejs\node.exe'
$bugzilla = 'C:\Bugzilla'
$scripts  = $PSScriptRoot
$root     = Join-Path $bugzilla 'data\team-reports'
$log      = Join-Path $root 'team-reports.log'

# Which days the report covers:
#   Sunday morning   no report (Saturday's work goes into Monday's)
#   Monday morning   Saturday + Sunday together
#   any other day    the previous day
# -Date (one day) or -From/-To (a range) override this, e.g. for a preview.
$today = $Today.Date
if ($From -or $ToDate) {
  if (-not ($From -and $ToDate)) { throw 'Give both -From and -ToDate.' }
  $start = $From; $end = $ToDate
} elseif ($Date) {
  $start = $Date; $end = $Date
} elseif ($today.DayOfWeek -eq 'Sunday') {
  $start = $null
} elseif ($today.DayOfWeek -eq 'Monday') {
  $start = $today.AddDays(-2).ToString('yyyy-MM-dd'); $end = $today.AddDays(-1).ToString('yyyy-MM-dd')
} else {
  $start = $today.AddDays(-1).ToString('yyyy-MM-dd'); $end = $start
}
$label = if (-not $start) { $today.ToString('yyyy-MM-dd') } elseif ($start -eq $end) { $start } else { "$start to $end" }

New-Item -ItemType Directory -Force $root | Out-Null
function Log([string]$message) {
  $line = '{0} [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $label, $message
  Add-Content -Path $log -Value $line -Encoding UTF8
  Write-Output $line
}

if (-not $start) {
  Log "Sunday - no report today; Saturday's work is in Monday's report."
  exit 0
}
foreach ($d in $start, $end) { if ($d -notmatch '^\d{4}-\d{2}-\d{2}$') { throw 'Dates must be YYYY-MM-DD' } }
$preview = [bool]$To
$dir     = Join-Path $root ($(if ($DryRun) { "$label dry-run" } elseif ($preview) { "$label preview" } else { $label }))
$sentMarker = Join-Path (Join-Path $root $label) 'SENT'

function Step([string]$name, [string]$exe, [string[]]$arguments) {
  $output = & $exe @arguments 2>&1 | ForEach-Object { "$_" }
  foreach ($l in $output) { Log "  $name | $l" }
  if ($LASTEXITCODE -ne 0) { throw "$name failed (exit $LASTEXITCODE)" }
}

try {
  if (-not $preview -and -not $DryRun -and -not $Force -and (Test-Path $sentMarker)) {
    Log 'Already sent to the team leaders - skipped (use -Force to send again).'
    exit 0
  }
  Log ($(if ($DryRun) { 'Dry run - nothing is sent' } elseif ($preview) { "Preview to $To" } else { 'Daily run' }))
  if (Test-Path $dir) { Remove-Item $dir -Recurse -Force -Confirm:$false }
  New-Item -ItemType Directory -Force $dir | Out-Null

  Push-Location $bugzilla
  try {
    Step 'data'  $perl @("$scripts\team-report-data.pl", '--from', $start, '--to', $end, '--out', "$dir\data.json")
    Step 'excel' $node @("$scripts\build-team-report.cjs", "$dir\data.json", $dir)
    $send = @("$scripts\send-team-reports.pl", '--dir', $dir)
    if (-not $DryRun) { $send += '--send' }
    if ($preview) { $send += @('--to', $To) }
    Step 'email' $perl $send
  } finally { Pop-Location }

  if (-not $preview -and -not $DryRun) { Set-Content -Path $sentMarker -Value (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') }
  Log 'Done.'

  # Keep 90 days of reports.
  Get-ChildItem $root -Directory | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-90) } |
    ForEach-Object { Remove-Item $_.FullName -Recurse -Force -Confirm:$false }
} catch {
  Log "FAILED: $($_.Exception.Message)"
  exit 1
}
