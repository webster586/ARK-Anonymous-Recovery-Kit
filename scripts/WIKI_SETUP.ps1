$ErrorActionPreference='Stop'
$base=Split-Path -Parent $MyInvocation.MyCommand.Path
$dir=Join-Path $base 'kiwix-tools'
$zip=Join-Path $env:TEMP 'ark-kiwix-tools-3.8.1.zip'
$tmp=Join-Path $env:TEMP 'ark-kiwix-tools-unpack'
$uri='https://download.kiwix.org/release/kiwix-tools/kiwix-tools_win-x86_64-3.8.1.zip'
# Kiwix publishes only an MD5 sidecar for this release; this SHA256 was computed
# once from that exact, MD5-verified official download and is pinned here as the
# stronger integrity check (same approach as VOICE_SETUP.ps1's whisper.cpp pin).
$zipHash='fcd01ed2b93e9a68632c7863c83b9f66bf64406a66357be1df7b8b75596f3e45'
Write-Host 'ARK WIKIPEDIA // Einmalige Kiwix-Einrichtung' -ForegroundColor Cyan
Write-Host 'Quelle:' $uri
Write-Host 'Das ARK-0-Datenlaufwerk wird NICHT veraendert.'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
if(Test-Path (Join-Path $dir 'kiwix-serve.exe')) { Write-Host 'kiwix-serve.exe bereits vorhanden';exit 0 }
try {
 if(Test-Path $tmp){Remove-Item -LiteralPath $tmp -Recurse -Force}
 Invoke-WebRequest -Uri $uri -OutFile $zip -UseBasicParsing -TimeoutSec 180
 $actual=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
 if($actual -ne $zipHash){Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue;throw 'SHA256-Pruefung der kiwix-tools-Binaries fehlgeschlagen. Nichts installiert.'}
 Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force
 $exe=Get-ChildItem -LiteralPath $tmp -Filter 'kiwix-serve.exe' -File -Recurse | Select-Object -First 1
 if(-not $exe){throw 'kiwix-serve.exe nicht im offiziellen Archiv gefunden'}
 # Keep the EXE together with its required DLL files.
 Copy-Item -Path (Join-Path $exe.Directory.FullName '*') -Destination $dir -Recurse -Force
 if(-not (Test-Path (Join-Path $dir 'kiwix-serve.exe'))){throw 'Exe konnte nicht bereitgestellt werden'}
 Write-Host 'Kiwix Server installiert unter:' $dir -ForegroundColor Green
 Write-Host 'ARK jetzt neu starten. Danach ZIM-Dateipfad im Wikipedia-Bereich eintragen.'
} catch {Write-Host ('Einrichtungsfehler: '+$_.Exception.Message) -ForegroundColor Red;exit 1}
