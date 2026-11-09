@echo off
chcp 65001 >nul
echo ARK VOICE - Windows Offline-Spracherkennung pruefen
echo.
powershell.exe -NoProfile -Command "try { Add-Type -AssemblyName System.Speech -ErrorAction Stop; $r=[System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers(); if ($r.Count -eq 0) { Write-Host 'Keine lokalen Windows-Spracherkennungs-Engines installiert.' } else { $r | ForEach-Object { Write-Host ('Erkannt: '+$_.Culture.Name+' | '+$_.Name) } } } catch { Write-Host ('Fehler: '+$_.Exception.Message) }"
echo.
echo Fuer ARK VOICE wird eine deutsche Engine benoetigt (de-DE).
pause
