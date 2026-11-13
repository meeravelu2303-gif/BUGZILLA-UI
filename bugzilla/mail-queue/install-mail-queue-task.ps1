# Makes bug saves fast: Bugzilla stops sending emails DURING the save and
# queues them instead; a background worker sends them within a few seconds.
#
# Run once, in PowerShell as Administrator:
#   powershell -ExecutionPolicy Bypass -File D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\bugzilla\install-mail-queue-task.ps1
#
# What it does:
#   1. Copies mail-queue-worker.pl to C:\Bugzilla.
#   2. Registers the scheduled task "Bugzilla mail queue" (runs as SYSTEM at
#      startup and every minute; never two copies at once) and starts it.
#   3. Checks the worker is running, THEN turns on Bugzilla's use_mailer_queue
#      param (params.json is backed up first).
#
# Undo: Unregister-ScheduledTask -TaskName 'Bugzilla mail queue' -Confirm:$false
#       and set use_mailer_queue back to 0 (Administration > Parameters > Email,
#       or restore the params.json backup this script prints).
$ErrorActionPreference = 'Stop'
$perl = 'C:\Strawberry\perl\bin\perl.exe'
$bz = 'C:\Bugzilla'
$log = "$bz\data\mail-queue-worker.log"

Copy-Item (Join-Path $PSScriptRoot 'mail-queue-worker.pl') "$bz\mail-queue-worker.pl" -Force

$action = New-ScheduledTaskAction -Execute $perl -Argument "$bz\mail-queue-worker.pl" -WorkingDirectory $bz
$atStartup = New-ScheduledTaskTrigger -AtStartup
$everyMinute = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName 'Bugzilla mail queue' -Force `
  -Description 'Sends Bugzilla queued emails in the background (repo ops/bugzilla/mail-queue-worker.pl).' `
  -Action $action -Trigger $atStartup, $everyMinute -Settings $settings -Principal $principal | Out-Null
Start-ScheduledTask -TaskName 'Bugzilla mail queue'

Start-Sleep -Seconds 6
$state = (Get-ScheduledTask -TaskName 'Bugzilla mail queue').State
$lastLine = if (Test-Path $log) { Get-Content $log -Tail 1 } else { '' }
if ($state -ne 'Running' -or $lastLine -notmatch 'started') {
  Write-Host "The worker did not start (task state: $state; log: $lastLine)."
  Write-Host 'Emails are still sent the old way - nothing else was changed.'
  exit 1
}
Write-Host "Worker running: $lastLine"

$backup = "$bz\data\params.json.bak-$(Get-Date -Format yyyyMMdd-HHmmss)"
Copy-Item "$bz\data\params.json" $backup
Push-Location $bz
try {
  & $perl -I. -Ilib -Ilocal/lib/perl5 -e 'use Bugzilla; use Bugzilla::Config qw(SetParam write_params); SetParam("use_mailer_queue", 1); write_params(); print "use_mailer_queue = ", Bugzilla->params->{use_mailer_queue}, "\n";'
  if ($LASTEXITCODE -ne 0) { Write-Host 'Could not turn on use_mailer_queue - emails are still sent the old way.'; exit 1 }
} finally { Pop-Location }
Write-Host "params.json backup: $backup"
Write-Host 'Done. Bug saves no longer wait for emails; the worker sends them within a few seconds.'
Write-Host "Worker log: $log"
