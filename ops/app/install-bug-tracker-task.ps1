# Makes the Bug Tracker start by itself: registers the scheduled task
# "Bug Tracker app", which runs bug-tracker-supervisor.ps1 as SYSTEM at boot and
# every 5 minutes (never two copies at once). The supervisor starts the backend
# (4000) and the web app (5175) whenever they are not running.
#
# Run once, in PowerShell as Administrator:
#   powershell -ExecutionPolicy Bypass -File D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\app\install-bug-tracker-task.ps1
#
# Safe while a copy started by hand (npm run serve) is running: the supervisor
# sees its ports busy and waits; when that copy stops, it takes over.
# Undo: Unregister-ScheduledTask -TaskName 'Bug Tracker app' -Confirm:$false
$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'bug-tracker-supervisor.ps1'
$repo = Split-Path (Split-Path $PSScriptRoot)

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`"" -WorkingDirectory $repo
$atBoot = New-ScheduledTaskTrigger -AtStartup
$every5 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName 'Bug Tracker app' -Force `
  -Description 'Keeps the Bug Tracker backend (4000) and web app (5175) running. Script: BUGZILLA-UI\ops\app\bug-tracker-supervisor.ps1. Put new code live: ops\app\update-bug-tracker.ps1. Logs: BUGZILLA-UI\logs' `
  -Action $action -Trigger $atBoot, $every5 -Settings $settings -Principal $principal | Out-Null
Start-ScheduledTask -TaskName 'Bug Tracker app'

Start-Sleep -Seconds 5
$state = (Get-ScheduledTask -TaskName 'Bug Tracker app').State
Write-Output "Scheduled task 'Bug Tracker app': $state"
$log = Join-Path $repo 'logs\supervisor.log'
if (Test-Path $log) { Get-Content $log -Tail 3 }
if ($state -ne 'Running') { Write-Output 'The supervisor is not running - check Task Scheduler > Bug Tracker app > History.'; exit 1 }
Write-Output 'Done. The Bug Tracker now starts by itself after a reboot and restarts if it stops.'
