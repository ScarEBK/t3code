# Installs Scar Mic (the T3 Code mic's speech helper) for this Windows user and starts it.
# Safe to run again: it only adds what is missing and refreshes the helper script.
# Needs: Python 3.10+ and ffmpeg on PATH.
$ErrorActionPreference = "Stop"
$home_ = Join-Path $env:LOCALAPPDATA "ScarMic"
$modelName = "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8"
$modelUrl = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/$modelName.tar.bz2"

New-Item -ItemType Directory -Force (Join-Path $home_ "models") | Out-Null
if (-not (Test-Path (Join-Path $home_ "venv\Scripts\python.exe"))) {
  python -m venv (Join-Path $home_ "venv")
}
& (Join-Path $home_ "venv\Scripts\python.exe") -m pip install --quiet --disable-pip-version-check sherpa-onnx numpy

$modelDir = Join-Path $home_ "models\$modelName"
if (-not (Test-Path (Join-Path $modelDir "encoder.int8.onnx"))) {
  $archive = Join-Path $home_ "models\model.tar.bz2"
  curl.exe -sL -o $archive $modelUrl
  tar -xjf $archive -C (Join-Path $home_ "models")
  Remove-Item $archive
}

Copy-Item (Join-Path $PSScriptRoot "scar_mic.py") (Join-Path $home_ "scar_mic.py") -Force

# Start at sign-in, hidden (pythonw has no console window).
$pythonw = Join-Path $home_ "venv\Scripts\pythonw.exe"
$script = Join-Path $home_ "scar_mic.py"
$startup = [Environment]::GetFolderPath("Startup")
$vbs = Join-Path $startup "Scar Mic.vbs"
Set-Content -Path $vbs -Encoding ASCII -Value @(
  'Set shell = CreateObject("WScript.Shell")',
  "shell.Run """"""$pythonw"""" """"$script"""""", 0, False"
)

# Start it now unless it is already answering.
try {
  Invoke-RestMethod -Uri "http://127.0.0.1:47811/health" -TimeoutSec 2 | Out-Null
  Write-Output "Scar Mic is already running."
} catch {
  Start-Process -FilePath $pythonw -ArgumentList "`"$script`"" -WindowStyle Hidden
  Write-Output "Scar Mic started."
}
