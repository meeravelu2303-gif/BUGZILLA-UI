@echo off
rem Teaches THIS computer that http://bugtracker.ueducate is the Bug Tracker
rem server (192.168.0.50), by adding one line to the Windows hosts file.
rem Run once per computer: right-click this file > "Run as administrator".
rem Not needed on computers whose DNS (router / DNS server) already knows the name.

set "HOSTS=%SystemRoot%\System32\drivers\etc\hosts"
set "LINE=192.168.0.50 bugtracker.ueducate bugtracker"

net session >nul 2>&1
if errorlevel 1 (
  echo Please right-click this file and choose "Run as administrator".
  pause
  exit /b 1
)

findstr /i /c:"bugtracker.ueducate" "%HOSTS%" >nul 2>&1
if errorlevel 1 (
  echo.>>"%HOSTS%"
  echo %LINE%>>"%HOSTS%"
  echo Added: %LINE%
) else (
  echo This computer already knows bugtracker.ueducate - nothing to change.
)

ipconfig /flushdns >nul
echo.
echo Done. Open http://bugtracker.ueducate in your browser
echo (type the http:// part the first time).
pause
