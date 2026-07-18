@echo off
title Talk Quest Launcher
echo ====================================
echo   Talk Quest - starting...
echo ====================================
echo.

REM --- Backend server (WSL, loads ANTHROPIC_KEY from linekeys.env) ---
start "Talk Quest Server" wsl.exe bash -lc "cd /mnt/c/Projects/kids_education && export ANTHROPIC_API_KEY=$(grep -m1 ^ANTHROPIC_KEY= /mnt/c/Projects/linekeys.env | cut -d= -f2- | tr -d '\r') && npm run dev:server"

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
