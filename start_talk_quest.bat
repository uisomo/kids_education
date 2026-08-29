@echo off
title Talk Quest Launcher
echo ====================================
echo   Talk Quest - starting...
echo ====================================
echo.

REM --- Kill leftover dev servers from a previous run ---
REM Zombie tsx/vite processes keep holding ports 5179/5173, so a fresh launch
REM silently serves OLD code from the stale instance. Clear them first. This is
REM a synchronous wsl call (no "start"), so it finishes before we relaunch.
echo Clearing any leftover Talk Quest servers...
wsl.exe bash -lc "pkill -9 -f 'src/backend/server.ts'; pkill -9 -f 'src/game/vite.config.ts'; pkill -9 -f 'tsx watch src/backend'; exit 0" >nul 2>&1

REM --- Backend server (WSL, loads ANTHROPIC_KEY from linekeys.env) ---
REM tr strips CR, double and single quotes (octal escapes: \015 \042 \047)
start "Talk Quest Server" wsl.exe bash -lc "cd /mnt/c/Projects/kids_education && export ANTHROPIC_API_KEY=$(grep -m1 ^ANTHROPIC_KEY= /mnt/c/Projects/linekeys.env | cut -d= -f2- | tr -d '\015\042\047') && npm run dev:server"

REM --- Game frontend (Vite) ---
start "Talk Quest Game" wsl.exe bash -lc "cd /mnt/c/Projects/kids_education && npm run dev:game"

echo Waiting for servers to boot...
timeout /t 8 /nobreak >nul

REM --- Open the game in the default browser ---
start http://localhost:5173

echo.
echo ====================================
echo   Talk Quest is running!
echo   Game:   http://localhost:5173
echo   Server: http://localhost:5179
echo.
echo   Tip: start VOICEVOX for anime voices
echo   (without it, browser voices are used)
echo.
echo   Close the two WSL windows to stop.
echo ====================================
pause
