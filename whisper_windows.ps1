# ARK Voice v0.3 - self-contained offline Whisper.cpp frontend.
# stdin protocol: START, STOP, QUIT. stdout protocol: READY / RECORDING / PROCESSING / TEXT\t / EMPTY / ERROR\t.
# Audio is held in memory and a temporary WAV; temp recording removed after transcription.
$ErrorActionPreference='Stop'
[Console]::InputEncoding=New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$root=Split-Path -Parent $MyInvocation.MyCommand.Path
$cli=Join-Path $root 'whisper-runtime\whisper-cli.exe'
$small=Join-Path $root 'models\ggml-small.bin'
$base=Join-Path $root 'models\ggml-base.bin'
try {
 if(!(Test-Path -LiteralPath $cli)){throw 'whisper-cli.exe fehlt. Einmalig VOICE_SETUP.bat ausfuehren.'}
 $model=if(Test-Path -LiteralPath $small){$small}else{$base}
 if(!(Test-Path -LiteralPath $model)){throw 'Kein Whisper-Modell vorhanden. Einmalig VOICE_SETUP.bat ausfuehren.'}
 Add-Type -TypeDefinition (Get-Content -LiteralPath (Join-Path $root 'mic_capture.cs') -Raw) -ErrorAction Stop
 $rec=$null
 [Console]::WriteLine('READY')
 while(($cmd=[Console]::ReadLine()) -ne $null){
  try {
   switch($cmd){
    'START' {
     if($null -ne $rec){break}
     $rec=New-Object ArkMicCapture
     $deviceId=-1
     $audioConfig=Join-Path $root 'audio.json'
     if(Test-Path -LiteralPath $audioConfig){
      $cfg=Get-Content -LiteralPath $audioConfig -Raw -Encoding UTF8 | ConvertFrom-Json
      if([int]$cfg.id -ge 0){
       # Re-resolve the name each time because WinMM IDs may change after reconnect.
       $available=@([ArkMicCapture]::ListDevices())
       $match=$null
       foreach($entry in $available){if($entry.name -eq [string]$cfg.name){$match=$entry;break}}
       if($null -eq $match){throw ('Mikrofon nicht gefunden: '+[string]$cfg.name+'. Bitte unter Einstellungen neu wählen.')}
       $deviceId=[int]$match.id
      }
     }
     $rec.Start($deviceId)
     [Console]::WriteLine('RECORDING')
     break
    }
    'STOP' {
     if($null -eq $rec){break}
     [Console]::WriteLine('PROCESSING')
     $tempDir=Join-Path ([IO.Path]::GetTempPath()) ('ARK_VOICE_'+[guid]::NewGuid().ToString('N'))
     [void](New-Item -Path $tempDir -ItemType Directory -Force)
     $wav=Join-Path $tempDir 'speech.wav'
     $out=Join-Path $tempDir 'transcript'
     try {
      $rec.StopSave($wav)
      $rec=$null
      # Whisper uses -l de: no translation to English; base/small multilingual only.
      $psi=New-Object System.Diagnostics.ProcessStartInfo
      $psi.FileName=$cli
      $psi.Arguments='-m "'+$model+'" -f "'+$wav+'" -l de -t 6 -otxt -of "'+$out+'" -nt -np -ng'
      $wordFile=Join-Path $root 'vocabulary.txt'
      if(Test-Path -LiteralPath $wordFile){
       $terms=(Get-Content -LiteralPath $wordFile -Encoding UTF8 -Raw).Trim().Replace('"','')
       if($terms.Length -gt 250){$terms=$terms.Substring(0,250)}
       if($terms){$psi.Arguments+=' --prompt "'+$terms+'"'}
      }
      $psi.UseShellExecute=$false
      $psi.CreateNoWindow=$true
      $psi.RedirectStandardOutput=$true
      $psi.RedirectStandardError=$true
      $proc=[System.Diagnostics.Process]::Start($psi)
      try {
       $stdOut=$proc.StandardOutput.ReadToEndAsync()
       $stdErr=$proc.StandardError.ReadToEndAsync()
       if(!$proc.WaitForExit(180000)){$proc.Kill();throw 'Whisper brauchte laenger als 3 Minuten und wurde beendet.'}
       if($proc.ExitCode -ne 0){throw ('whisper-cli fehlgeschlagen (Exit '+$proc.ExitCode+'): '+$stdErr.Result.Trim())}
      } finally {$proc.Dispose()}
      $txtFile=$out+'.txt'
      if(!(Test-Path -LiteralPath $txtFile)){throw 'Whisper hat keine Textausgabe erstellt.'}
      $txt=(Get-Content -LiteralPath $txtFile -Encoding UTF8 -Raw).Trim()
      $txt=$txt -replace '[\r\n\t]+',' '
      if([string]::IsNullOrWhiteSpace($txt)){[Console]::WriteLine('EMPTY')}
      else {[Console]::WriteLine('TEXT'+"`t"+$txt)}
     } finally {
      if($null -ne $rec){$rec.Dispose();$rec=$null}
      Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
     }
     break
    }
    'QUIT' {
     if($null -ne $rec){$rec.Dispose();$rec=$null}
     exit 0
    }
   }
  } catch {
   if($null -ne $rec){$rec.Dispose();$rec=$null}
   [Console]::WriteLine('ERROR'+"`t"+($_.Exception.Message -replace '[\r\n\t]+',' '))
  }
 }
 if($null -ne $rec){$rec.Dispose()}
} catch {
 [Console]::WriteLine('ERROR'+"`t"+($_.Exception.Message -replace '[\r\n\t]+',' '))
 exit 1
}
