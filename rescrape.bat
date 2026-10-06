@echo off
title AoS Warscrolls - Rescrape
rem Re-scrapes all units + faction rules from the data source into a TEMP copy of the
rem database, then merges the result into backend\warscrolls.db without renumbering
rem units (keeps user marks, saved lists, spearhead data). Report: rescrape-report.txt
cd /d "%~dp0backend"
set "WORK=%TEMP%\aos-rescrape"
if not exist "%WORK%" mkdir "%WORK%"
del /q "%WORK%\scrape.db*" 2>nul
copy /y warscrolls.db "%WORK%\scrape.db" >nul
if exist warscrolls.db-wal copy /y warscrolls.db-wal "%WORK%\scrape.db-wal" >nul
set "LOG=%~dp0rescrape-output.log"
echo Rescrape started %DATE% %TIME% > "%LOG%"
set "DB_PATH=%WORK%\scrape.db"
set "IMAGE_DIR=%~dp0backend\unit-images"
echo [1/3] Scraping units (about 2-3 minutes)...
node scraper.js >> "%LOG%" 2>&1 || goto fail
echo [2/3] Scraping faction rules...
node scrapeRules.js >> "%LOG%" 2>&1 || goto fail
set "DB_PATH="
echo [3/3] Merging into backend\warscrolls.db...
node rescrapeMerge.js "%WORK%\scrape.db" >> "%LOG%" 2>&1 || goto fail
echo.
type "%~dp0rescrape-report.txt"
echo.
echo Done. The auto-push window will push the updated database.
echo Rescrape finished %DATE% %TIME% >> "%LOG%"
pause
exit /b 0
:fail
echo RESCRAPE FAILED - backend\warscrolls.db was not changed. See rescrape-output.log >> "%LOG%"
echo RESCRAPE FAILED - backend\warscrolls.db was not changed. See rescrape-output.log
pause
exit /b 1
