$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = Join-Path $base 'START_ARK.bat'
$icon = Join-Path $base 'icons\ARK.ico'
$link = Join-Path $base 'ARK starten.lnk'
if (!(Test-Path $target)) { throw "START_ARK.bat fehlt." }
if (!(Test-Path $icon)) { throw "ARK.ico fehlt." }
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($link)
$shortcut.TargetPath = $target
$shortcut.WorkingDirectory = $base
$shortcut.IconLocation = "$icon,0"
$shortcut.Description = 'ARK Control Deck starten'
$shortcut.Save()
Write-Host "Start-Verknuepfung erstellt: $link"
