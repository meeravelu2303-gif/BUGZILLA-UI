<#
.SYNOPSIS
  Registers (or removes) the Windows Scheduled Task that runs the nightly Bugzilla database backup.

.DESCRIPTION
  Creates the task "Bugzilla DB backup" that runs
    powershell -ExecutionPolicy Bypass -File <BackupScript>
  every day at the given time, as SYSTEM, with highest privileges, whether or not anyone is logged on.
  Re-running replaces the existing task, so it is safe to run again after changing the time or path.

.PARAMETER BackupScript
  Path to backup-databases.ps1. Default: D:\TEST-BENCH-AUTOMATIONS\_backups\backup-databases.ps1

.PARAMETER At
  Daily start time (24h). Default 02:00 - after the working day, before the morning.

.PARAMETER Unregister
  Remove the task instead of creating it.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File ops\windows\register-backup-task.ps1
  powershell -ExecutionPolicy Bypass -File ops\windows\register-backup-task.ps1 -At 23:30
  powershell -ExecutionPolicy Bypass -File ops\windows\register-backup-task.ps1 -Unregister

.NOTES
  Run from an elevated (Administrator) PowerShell. Verify afterwards with:
    Get-ScheduledTask -TaskName 'Bugzilla DB backup' | Get-ScheduledTaskInfo
  and run it once by hand to prove it works:
    Start-ScheduledTask -TaskName 'Bugzilla DB backup'
#>
[CmdletBinding()]
param(
  [string]$BackupScript = 'D:\TEST-BENCH-AUTOMATIONS\_backups\backup-databases.ps1',
  [string]$At = '02:00',
  [switch]$Unregister
)

$ErrorActionPreference = 'Stop'
$taskName = 'Bugzilla DB backup'

if ($Unregister) {
  if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    "Removed scheduled task '$taskName'."
  } else {
    "No scheduled task named '$taskName' exists."
  }
  return
}

if (-not (Test-Path $BackupScript)) { throw "Backup script not found: $BackupScript" }
$time = [datetime]::ParseExact($At, 'HH:mm', $null)

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$BackupScript`"" `
  -WorkingDirectory (Split-Path $BackupScript)
$trigger = New-ScheduledTaskTrigger -Daily -At $time
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
# A dump of a few GB takes minutes, not hours; cap it so a hung dump cannot pile up day after day.
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 3) `
  -StartWhenAvailable -RunOnlyIfNetworkAvailable:$false -MultipleInstances IgnoreNew `
  -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 15)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
  -Description 'Nightly mysqldump of the live Bugzilla database (bugs) to D:\TEST-BENCH-AUTOMATIONS\_backups; prunes dumps older than 14 days.' `
  -Force | Out-Null

$info = Get-ScheduledTask -TaskName $taskName | Get-ScheduledTaskInfo
"Registered '$taskName': daily at $At as SYSTEM."
"Next run: $($info.NextRunTime)"
"Backup script: $BackupScript"
