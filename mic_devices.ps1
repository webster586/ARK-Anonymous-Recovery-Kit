# Enumerate devices via the same WinMM API used by ArkMicCapture; never activates the microphone.
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$root=Split-Path -Parent $MyInvocation.MyCommand.Path
try {
 Add-Type -TypeDefinition (Get-Content -LiteralPath (Join-Path $root 'mic_capture.cs') -Raw) -ErrorAction Stop
 $list=@([ArkMicCapture]::ListDevices())
 $result=@{devices=$list}
 [Console]::WriteLine((ConvertTo-Json -InputObject $result -Compress -Depth 4))
}catch{[Console]::Error.WriteLine($_.Exception.Message);exit 1}
