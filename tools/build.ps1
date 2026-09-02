<#
    Recombine the split sources back into one self-contained HTML file.

        powershell -ExecutionPolicy Bypass -File tools\build.ps1

    Writes dist\mis-app.html: a single file with the stylesheet and every script
    inlined, which is what you hand to someone who just wants to double-click it.

    The build is driven by index.html itself, in document order. A line that is
    exactly

        <link rel="stylesheet" href="...">      becomes  <style>...</style>
        <script src="..."></script>             becomes  <script>...</script>

    and every other line is copied through untouched. There is no manifest to
    keep in sync: add a script tag to index.html and the build picks it up.

    Inlining is byte-exact -- each file's contents go in verbatim, nothing is
    trimmed or re-indented -- so the output is reproducible and diffable against
    a known-good build. tools\verify.ps1 checks that property against the
    original pre-split file.
#>

$ErrorActionPreference = 'Stop'

$root = Split-Path $PSScriptRoot -Parent
$enc  = New-Object System.Text.UTF8Encoding($false)   # UTF-8, no BOM: the source has none
$out  = Join-Path $root 'dist\mis-app.html'

$linkRe   = '^<link rel="stylesheet" href="([^"]+)">$'
$scriptRe = '^<script src="([^"]+)"></script>$'

function Read-Part([string]$rel) {
  $p = Join-Path $root $rel
  if (-not (Test-Path $p)) { throw "index.html references $rel, which does not exist" }
  [System.IO.File]::ReadAllText($p, $enc)
}

$lines = ([System.IO.File]::ReadAllText((Join-Path $root 'index.html'), $enc)) -split "`n", -1

# The final split element is the empty string after the file's trailing newline.
# Emitting a newline for it would append a spurious blank line, so drop it and
# re-add the trailing newline at the end.
if ($lines[-1] -eq '') { $lines = $lines[0..($lines.Count - 2)] }

$sb = New-Object System.Text.StringBuilder
$inlined = 0

foreach ($line in $lines) {
  if ($line -match $linkRe) {
    [void]$sb.Append("<style>`n").Append((Read-Part $Matches[1])).Append("</style>`n")
    $inlined++
  }
  elseif ($line -match $scriptRe) {
    [void]$sb.Append('<script>').Append((Read-Part $Matches[1])).Append("</script>`n")
    $inlined++
  }
  else {
    [void]$sb.Append($line).Append("`n")
  }
}

$dir = Split-Path $out -Parent
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
[System.IO.File]::WriteAllText($out, $sb.ToString(), $enc)

$kb = [math]::Round((Get-Item $out).Length / 1KB)
Write-Host "built dist\mis-app.html  --  $inlined parts inlined, $kb KB"
