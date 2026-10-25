# Puts new code live: builds the web app, then restarts the backend and the app.
# Run after pulling or changing code (PowerShell as Administrator):
#   powershell -ExecutionPolicy Bypass -File D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\app\update-bug-tracker.ps1
#
# If the build fails, nothing is restarted and the running version keeps
# serving. Otherwise both processes are stopped and the supervisor
# (bug-tracker-supervisor.ps1) starts them again within about 15 seconds -
# people see a short "cannot connect" at most.
$ErrorActionPreference = 'Stop'
$repo = Split-Path (Split-Path $PSScriptRoot)

Write-Output 'Building the web app...'
Push-Location (Join-Path $repo 'frontend')
try {
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw "Build failed (exit $LASTEXITCODE) - nothing was restarted; the running version is unchanged." }
} finally { Pop-Location }

Push-Location (Join-Path $repo 'backend')
try {
  & npx tsc --noEmit -p tsconfig.json
  if ($LASTEXITCODE -ne 0) { throw "Backend type check failed - nothing was restarted." }
} finally { Pop-Location }

foreach ($port in 5175, 4000) {
  $pids = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($p in $pids) {
    Write-Output "Stopping the process on port $port (pid $p)"
    Stop-Process -Id $p -Force -Confirm:$false
  }
}

Write-Output 'Waiting for the supervisor to start them again...'
$deadline = (Get-Date).AddSeconds(120)
while ((Get-Date) -lt $deadline) {
  $up = @(4000, 5175 | Where-Object { Get-NetTCPConnection -LocalPort $_ -State Listen -ErrorAction SilentlyContinue })
  if ($up.Count -eq 2) { Write-Output 'Bug Tracker is running again on ports 4000 and 5175.'; exit 0 }
  Start-Sleep -Seconds 3
}
throw 'The Bug Tracker did not come back within 2 minutes - check logs\supervisor.log and the scheduled task "Bug Tracker app".'
