# One-time online acquisition; after setup, recognition is 100% offline.
# Sources are pinned to official ggml-org binaries and ggerganov GGML Whisper models.
param([ValidateSet('base','small')][string]$Model='base')
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
try {
 [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
 $root=Split-Path -Parent $MyInvocation.MyCommand.Path
 $runtime=Join-Path $root 'whisper-runtime'
 $models=Join-Path $root 'models'
 New-Item -ItemType Directory -Force -Path $runtime,$models | Out-Null
 $work=Join-Path ([IO.Path]::GetTempPath()) ('ARK_WHISPER_SETUP_'+[guid]::NewGuid().ToString('N'))
 New-Item -ItemType Directory -Force -Path $work | Out-Null
 try {
  $zipURL='https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip'
  $zipHash='6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb'
  $zipPath=Join-Path $work 'whisper-bin-x64.zip'
  $exe=Join-Path $runtime 'whisper-cli.exe'
  if(!(Test-Path -LiteralPath $exe)){
   Write-Host '1/2: Lade offizielles whisper.cpp Windows x64 Release ...'
   Invoke-WebRequest -Uri $zipURL -OutFile $zipPath -UseBasicParsing
   $actual=(Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
   if($actual -ne $zipHash){throw 'SHA256-Pruefung der whisper.cpp-Binaries fehlgeschlagen. Nichts installiert.'}
   $tmp=Join-Path $work 'unpacked'
   Expand-Archive -LiteralPath $zipPath -DestinationPath $tmp -Force
   $binary=Get-ChildItem -LiteralPath $tmp -File -Filter whisper-cli.exe -Recurse | Select-Object -First 1
   if(!$binary){throw 'Im Release fehlt whisper-cli.exe.'}
   Get-ChildItem -LiteralPath $binary.Directory.FullName -File | Copy-Item -Destination $runtime -Force
   if(!(Test-Path -LiteralPath $exe)){throw 'whisper-cli.exe konnte nicht in das Laufzeitverzeichnis kopiert werden.'}
  } else { Write-Host '1/2: whisper-cli.exe bereits vorhanden, keine Neuinstallation.' }
  $name=if($Model -eq 'small'){'ggml-small.bin'}else{'ggml-base.bin'}
  $hash=if($Model -eq 'small'){'1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b'}else{'60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe'}
  $modelPath=Join-Path $models $name
  $url='https://huggingface.co/ggerganov/whisper.cpp/resolve/main/'+$name
  if(!(Test-Path -LiteralPath $modelPath)){
   Write-Host ('2/2: Lade mehrsprachiges Whisper-Modell '+$name+' ...')
   $tempModel=Join-Path $work $name
   Invoke-WebRequest -Uri $url -OutFile $tempModel -UseBasicParsing
   $actual=(Get-FileHash -LiteralPath $tempModel -Algorithm SHA256).Hash.ToLowerInvariant()
   if($actual -ne $hash){throw 'SHA256-Pruefung des Whisper-Modells fehlgeschlagen. Modelldatei wird nicht uebernommen.'}
   Move-Item -LiteralPath $tempModel -Destination $modelPath
  } else {
   Write-Host ('2/2: Modell '+$name+' bereits vorhanden; pruefe SHA256 ...')
   $actual=(Get-FileHash -LiteralPath $modelPath -Algorithm SHA256).Hash.ToLowerInvariant()
   if($actual -ne $hash){throw 'Vorhandenes Whisper-Modell hat falsche SHA256-Pruefsumme. Bitte manuell pruefen.'}
  }
  Write-Host ''
  Write-Host ('FERTIG: Whisper '+$Model+' ist fuer ARK vorbereitet.') -ForegroundColor Green
  Write-Host 'ARK beenden und neu starten. Danach funktioniert die Erkennung komplett offline.'
 } finally { Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue }
} catch {
 Write-Host ''
 Write-Host ('FEHLER: '+$_.Exception.Message) -ForegroundColor Red
 Write-Host 'Die bisherige funktionierende Windows-Erkennung bleibt verfuegbar.'
 exit 1
}
