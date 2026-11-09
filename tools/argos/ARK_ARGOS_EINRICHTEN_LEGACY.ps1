# Windows PowerShell 5.1; initializes Argos only inside the executing ARK LAB copy.
param([switch]$NoNetwork)
$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path $base '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
  if (-not (Get-Command py.exe -ErrorAction SilentlyContinue)) { throw 'Python Launcher (py.exe) fehlt. Python 3.11-3.12 fuer Windows muss zunaechst bereitgestellt werden.' }
  & py.exe -3.11 -m venv (Join-Path $base '.venv')
  if ($LASTEXITCODE -ne 0) { throw 'Python 3.11 venv Erstellung fehlgeschlagen. Eine kompatible Python-Version wird benoetigt.' }
}
& $python -c 'import argostranslate'
if ($LASTEXITCODE -ne 0) {
  if ($NoNetwork) { throw 'Argos Pakete fehlen. Offline-Einrichtung ohne vorab vorbereitete .venv nicht moeglich.' }
  $choice = Read-Host 'Pip soll argostranslate aus dem Internet laden (JA)?'
  if ($choice -cne 'JA') { throw 'Keine Erlaubnis fuer Internet-Installation' }
  & $python -m pip install --disable-pip-version-check 'argostranslate'
  if ($LASTEXITCODE -ne 0) { throw 'Argos Pip Installation fehlgeschlagen' }
}
$worker = Join-Path $base 'ark_argos_worker.py'
if (-not (Test-Path -LiteralPath $worker -PathType Leaf)) { throw 'Worker fehlt' }
$req = '{"action":"status"}'
$req | & $python -X utf8 $worker
if ($LASTEXITCODE -ne 0) { throw 'Argos-Worker Test fehlgeschlagen' }
Write-Host 'Argos Python und Worker sind lokal pruefbar. Fuer Offline-Uebersetzung muessen Modelle installiert sein.' -ForegroundColor Green
