# ARK microphone identification. Records only locally; all test WAVs are deleted.
# First ~0.9s quiet for baseline, then ~4s speech. Each available device monitored in parallel.
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$root=Split-Path -Parent $MyInvocation.MyCommand.Path
$work=Join-Path ([IO.Path]::GetTempPath()) ('ARK_MIC_TEST_'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work -Force | Out-Null
$records=New-Object 'System.Collections.Generic.List[object]'
try {
 Add-Type -TypeDefinition (Get-Content -LiteralPath (Join-Path $root 'mic_capture.cs') -Raw) -ErrorAction Stop
 Add-Type -TypeDefinition (Get-Content -LiteralPath (Join-Path $root 'mic_analysis.cs') -Raw) -ErrorAction Stop
 $available=@([ArkMicCapture]::ListDevices())
 if($available.Count -eq 0){throw 'Windows meldet keine aktiven Aufnahmegeräte.'}
 # Cap the number of simultaneous streams; don't interfere with normal PTT.
 foreach($dev in $available | Select-Object -First 12){
  $rec=New-Object ArkMicCapture
  try {
   $rec.Start([int]$dev.id)
   $records.Add([pscustomobject]@{id=[int]$dev.id;name=[string]$dev.name;rec=$rec})
  } catch {$rec.Dispose()}
 }
 if($records.Count -eq 0){throw 'Keines der Aufnahmegeräte konnte geöffnet werden. Aufnahmeberechtigungen prüfen.'}
 [Console]::WriteLine('STATE' + "`t" + 'BASELINE')
 Start-Sleep -Milliseconds 900
 [Console]::WriteLine('STATE' + "`t" + 'SPEAK')
 Start-Sleep -Milliseconds 4000
 [Console]::WriteLine('STATE' + "`t" + 'ANALYZING')
 $scores=New-Object 'System.Collections.Generic.List[object]'
 foreach($r in $records) {
  $wav=Join-Path $work ('mic_'+$r.id+'.wav')
  try {
   $r.rec.StopSave($wav)
   $scores.Add([ArkMicAnalyzer]::Evaluate($wav,[int]$r.id,[string]$r.name))
  } catch { # A device may have disconnected or returned empty input.
  }
 }
 if($scores.Count -eq 0){throw 'Keine Aufnahme auswertbar. Bitte Mikrofon prüfen.'}
 $ordered=@($scores | Sort-Object -Property score -Descending)
 $valid=@($ordered | Where-Object {$_.detected})
 $suggested=$null
 $confidence='none'
 if($valid.Count -gt 0){
  $suggested=$valid[0]
  $confidence='possible'
  if($valid.Count -eq 1 -or ($valid[0].score -gt 0 -and $valid[0].score -ge $valid[1].score * 1.8)){$confidence='likely'}
 }
 # Never save the selection automatically. Results are a suggestion for the user.
 $result=@{ candidates=$ordered; suggested=$suggested; confidence=$confidence; count=$records.Count }
 [Console]::WriteLine('RESULT' + "`t" + (ConvertTo-Json -InputObject $result -Compress -Depth 6))
} catch {
 [Console]::WriteLine('ERROR' + "`t" + ($_.Exception.Message -replace '[\r\n\t]+',' '))
 exit 1
} finally {
 foreach($r in $records){try{$r.rec.Dispose()}catch{}}
 Remove-Item -LiteralPath $work -Force -Recurse -ErrorAction SilentlyContinue
}
