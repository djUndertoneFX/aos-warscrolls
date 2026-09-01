@echo off
cd /d "%~dp0"
echo Starting AoS Warscrolls auto-push watcher...
echo Leave this window open in the background. Close it or press Ctrl+C to stop.
echo.
node auto-push-watch.js
pause
