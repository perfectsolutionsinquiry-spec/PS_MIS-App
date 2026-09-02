<#
    Prove the split lost nothing.

        powershell -ExecutionPolicy Bypass -File tools\verify.ps1

    Runs the build, then compares dist\mis-app.html byte for byte against the
    pre-split file recorded in the baseline commit. They must be identical: the
    split only moved text between files, so recombining it has to reproduce the
    original exactly. Any difference means a block boundary is wrong.

    Once you start editing the sources this check is expected to fail, because
    the output is then meant to differ from the original. It is a one-time proof
    of the split, kept because it also re-runs usefully against any tagged
    known-good build: point BaselineRef at that tag.
#>

param(
  [string]$BaselineRef = 'baseline-import:index.html'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent

& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'build.ps1')
if ($LASTEXITCODE -ne 0) { throw 'build failed' }

$built = Join-Path $root 'dist\mis-app.html'
$ref   = Join-Path ([System.IO.Path]::GetTempPath()) 'mis-baseline.html'

# A PowerShell pipeline decodes native command output as text and re-encodes it,
# which corrupts the byte comparison. cmd.exe redirects raw bytes instead.
Push-Location $root
try     { & cmd.exe /c "git show $BaselineRef > ""$ref""" }
finally { Pop-Location }

$a = [System.IO.File]::ReadAllBytes($built)
$b = [System.IO.File]::ReadAllBytes($ref)

if ($a.Length -ne $b.Length) {
  Write-Host "DIFFERENT: built $($a.Length) bytes, baseline $($b.Length) bytes" -ForegroundColor Red
  exit 1
}
for ($i = 0; $i -lt $a.Length; $i++) {
  if ($a[$i] -ne $b[$i]) {
    Write-Host "DIFFERENT: first mismatch at byte $i" -ForegroundColor Red
    exit 1
  }
}
Write-Host "IDENTICAL: $($a.Length) bytes match the baseline exactly" -ForegroundColor Green
