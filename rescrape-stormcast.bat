@echo off
rem Re-scrape just Stormcast Eternals (its page timed out during the full rescrape on 2026-10-06).
call "%~dp0rescrape.bat" stormcast-eternals
