# ARK VOICE v0.2 - offline German dictation, Windows PowerShell 5.1 / System.Speech.
# No network access. No permanent changes to Windows settings.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
  Add-Type -ReferencedAssemblies 'System.Speech' -TypeDefinition @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Threading;
using System.Speech.Recognition;
using System.Globalization;
public sealed class ArkLocalDictation : IDisposable {
  private readonly SpeechRecognitionEngine engine;
  private readonly ManualResetEventSlim finished = new ManualResetEventSlim(false);
  private readonly object gate = new object();
  private readonly List<string> words = new List<string>();
  private bool started = false;
  public ArkLocalDictation() {
    RecognizerInfo selected = null;
    foreach (RecognizerInfo r in SpeechRecognitionEngine.InstalledRecognizers()) {
      if (r.Culture.TwoLetterISOLanguageName == "de") {selected = r; break;}
    }
    if (selected == null) throw new Exception("Kein lokaler deutscher Spracherkenner installiert. Windows-Sprachoptionen (Deutsch / Spracherkennung) pruefen.");
    engine = new SpeechRecognitionEngine(selected);
    engine.LoadGrammar(new DictationGrammar());
    engine.SpeechRecognized += (sender, args) => {
      if (args.Result != null && args.Result.Confidence >= 0.25f) {
        lock(gate) {words.Add(args.Result.Text);}
      }
    };
    engine.RecognizeCompleted += (sender,args) => {finished.Set();};
    engine.SetInputToDefaultAudioDevice();
  }
  public void Start() {
    if (started) return;
    lock(gate) { words.Clear(); }
    finished.Reset();
    engine.RecognizeAsync(RecognizeMode.Multiple);
    started = true;
  }
  public string Stop() {
    if (!started) return "";
    started = false;
    engine.RecognizeAsyncStop();
    finished.Wait(3500);
    lock(gate) {return String.Join(" ", words.ToArray());}
  }
  public void Dispose(){if(started) {try {engine.RecognizeAsyncCancel();}catch {}} engine.Dispose();finished.Dispose();}
}
'@
  $ark = New-Object ArkLocalDictation
  [Console]::WriteLine('READY')
  while (($line = [Console]::ReadLine()) -ne $null) {
    try {
      switch ($line) {
        'START' { $ark.Start(); [Console]::WriteLine('RECORDING'); break }
        'STOP'  {
          [Console]::WriteLine('PROCESSING')
          $result = $ark.Stop()
          if ([string]::IsNullOrWhiteSpace($result)) {[Console]::WriteLine('EMPTY')}
          else {[Console]::WriteLine(('TEXT' + "`t" + ($result -replace "[\r\n\t]",' ').Trim()))}
          break
        }
        'QUIT' { $ark.Dispose(); exit 0 }
      }
    } catch {
      [Console]::WriteLine(('ERROR' + "`t" + ($_.Exception.Message -replace "[\r\n\t]",' ')))
    }
  }
  $ark.Dispose()
} catch {
  [Console]::WriteLine(('ERROR' + "`t" + ($_.Exception.Message -replace "[\r\n\t]",' ')))
  exit 1
}
