@echo off
chcp 65001 >nul
cd /d "%~dp0"
title ARK VOICE - Whisper Small erweitern (einmalig)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0VOICE_SETUP.ps1" -Model small
pause
