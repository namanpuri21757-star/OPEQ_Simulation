@echo off
rem
rem Double-click this file to run a Crude Accord lesson on Windows.
rem
rem It does nothing clever: it moves into this folder and runs "npm run class",
rem which is the same thing a teacher would type. If anything goes wrong the
rem window stays open so the message can be read, rather than disappearing.

cd /d "%~dp0"
title Crude Accord - leave this window open during the lesson

echo Starting Crude Accord from %CD%
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed on this computer, and Crude Accord needs it.
  echo.
  echo   1. Go to https://nodejs.org
  echo   2. Download the version marked LTS and install it.
  echo   3. Double-click this file again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo This is the first time, so the parts have to be downloaded once.
  echo This needs the internet, takes a few minutes, and happens only once.
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo The download did not finish. Check the internet connection and try again.
    echo.
    pause
    exit /b 1
  )
  echo.
)

call npm run class
if errorlevel 1 (
  echo.
  echo Crude Accord stopped because of a problem.
  echo The message above says what to do. Nothing you saved has been lost.
  echo.
  pause
)
