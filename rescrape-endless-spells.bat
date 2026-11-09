@echo off
title AoS Warscrolls - Rescrape Endless Spells
rem dj 2026-11-09: adds/refreshes the universal manifestations (Wahapedia's "Endless Spells" page,
rem e.g. Krondspine Incarnate of Ghur). Pulls the latest code first, then rescrapes just that page.
cd /d "%~dp0"
echo Getting the latest code from GitHub...
git pull --rebase --autostash || goto fail
call "%~dp0rescrape.bat" endless-spells
exit /b 0
:fail
echo.
echo git pull failed - see the message above. Nothing was scraped.
pause
exit /b 1
