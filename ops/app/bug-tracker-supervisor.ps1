# Keeps the Bug Tracker running without anyone logged in to the server:
#   backend  (Express BFF, port 4000)   node + tsx, backend\src\index.ts
#   app      (built web app, port 5175) vite preview, serving frontend\dist
#
# Started by the scheduled task "Bug Tracker app" (as SYSTEM, at boot and every
# 5 minutes; a second copy never starts while one runs). Every 15 seconds it
# checks both ports and starts whichever is not answering - after a reboot, a
# crash, or someone closing the window they were started from. While a copy
# started by hand (npm run serve) is running, its ports are busy and this does
# nothing.
#
# After changing the code: ops\app\update-bug-tracker.ps1 (builds, then restarts).
# Logs: logs\backend.log, logs\app.log, logs\supervisor.log (in the repo, not committed).
$ErrorActionPreference = 'Continue'

$repo = Split-Path (Split-Path $PSScriptRoot)
$node = 'C:\Program Files\nodejs\node.exe'
$logs = Join-Path $repo 'logs'
New-Item -ItemType Directory -Force $logs | Out-Null
$supervisorLog = Join-Path $logs 'supervisor.log'

$parts = @(
  @{ name = 'backend'; port = 4000; dir = Join-Path $repo 'backend';
     args = 'node_modules\tsx\dist\cli.mjs src\index.ts' },
  @{ name = 'app'; port = 5175; dir = Join-Path $repo 'frontend'; needs = 4000;
     args = '--max-http-header-size=65536 node_modules\vite\bin\vite.js preview' }
)

function Log([string]$message) {
  Add-Content -Path $supervisorLog -Value ('{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $message) -Encoding UTF8
}

function Listening([int]$port) {
  [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

# Keeps each log under 20 MB: the previous one is kept as .old.log.
function Rotate([string]$path) {
  if ((Test-Path $path) -and (Get-Item $path).Length -gt 20MB) {
    Move-Item $path ($path -replace '\.log$', '.old.log') -Force
  }
}

function Start-Part($part) {
  $log = Join-Path $logs "$($part.name).log"
  Rotate $log
  Add-Content -Path $log -Value ('===== {0} starting {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $part.name) -Encoding UTF8
  # cmd appends both output streams to the log; node runs hidden, with no window.
  # The outer quotes are for cmd /c, which strips the first and last one.
  $command = '""{0}" {1} >> "{2}" 2>&1"' -f $node, $part.args, $log
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', $command -WorkingDirectory $part.dir -WindowStyle Hidden | Out-Null
  for ($i = 0; $i -lt 60 -and -not (Listening $part.port); $i++) { Start-Sleep -Seconds 1 }
  if (Listening $part.port) { Log "$($part.name) started (port $($part.port))" }
  else { Log "$($part.name) did NOT start within 60 s - see logs\$($part.name).log" }
}

Rotate $supervisorLog
Log "supervisor started (pid $PID)"
while ($true) {
  foreach ($part in $parts) {
    if (Listening $part.port) { continue }
    if ($part.needs -and -not (Listening $part.needs)) { continue }
    Log "$($part.name) is not running on port $($part.port) - starting it"
    Start-Part $part
  }
  Start-Sleep -Seconds 15
}
