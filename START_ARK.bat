@echo off
chcp 65001 >nul
cd /d "%~dp0"
title ARK Native Controller v1.4.5.11 - NRW3D STRASSEN GEWAESSER
ARK_Controller_Windows_x64.exe
if errorlevel 1 (echo. & echo ARK Controller konnte nicht starten. & pause)
