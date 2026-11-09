@echo off
chcp 65001 >nul
cd /d "%~dp0"
title ARK VOICE - Whisper Base einrichten (einmalig)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0VOICE_SETUP.ps1" -Model base
pause
