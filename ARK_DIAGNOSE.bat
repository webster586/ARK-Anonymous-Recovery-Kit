@echo off
chcp 65001 >nul
cd /d "%~dp0"
title ARK Stream Deck HID Diagnose (nur lesen)
ARK_Controller_Windows_x64.exe --diagnose
echo.
echo Zum Schliessen eine Taste druecken.
pause >nul
