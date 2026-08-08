@echo off
setlocal
cd /d "%~dp0"
for /f %%P in ('powershell.exe -NoProfile -Command "$p=3311; while(Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue){$p++}; $p"') do set "PORT=%%P"
set "DATA_DIR=%TEMP%\group-deception-study1-human-ai-review\sessions"
set "ASSIGNMENT_MODE=block"
set "PARTICIPANT_ID_POLICY=open"
set "REQUIRE_PARTICIPANT_ID=false"
set "DEBUG_LINKS=false"
set "ALLOW_QA_PREVIEW=false"
set "ALLOW_TEAM_REVIEW=true"
set "NODE_ENV=development"
if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"
echo Starting Study1 Human-AI Team Review at http://localhost:%PORT%/review
echo Close this window or press Ctrl+C to stop the local server.
start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "$u='http://localhost:%PORT%'; for($i=0;$i -lt 100;$i++){try{if((Invoke-WebRequest ($u+'/health') -UseBasicParsing -TimeoutSec 1).StatusCode -eq 200){Start-Process ($u+'/review'); exit}}catch{}; Start-Sleep -Milliseconds 100}; Write-Error 'Study1 local server did not become healthy.'"
node server/index.js
endlocal
