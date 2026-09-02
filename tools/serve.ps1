<#
    Serve this folder over HTTP for local testing.

        powershell -ExecutionPolicy Bypass -File tools\serve.ps1 [-Port 8123]

    The app runs fine opened straight from disk, but a few browsers restrict what
    a file:// page may do, and some corporate policies disable it outright. This
    gives you a normal http://localhost address instead. Ctrl+C to stop.

    Deliberately a raw TcpListener rather than HttpListener: HttpListener needs an
    administrator-registered URL ACL for its prefixes, which this does not.
#>

param([int]$Port = 8123)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent

$types = @{
  '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'; '.json' = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'
  '.ico'  = 'image/x-icon'; '.woff2' = 'font/woff2'
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
Write-Host "serving $root at http://localhost:$Port/  (Ctrl+C to stop)"

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = New-Object System.IO.StreamReader($stream)
      $request = $reader.ReadLine()
      if (-not $request) { continue }

      $path = ($request -split ' ')[1]
      $path = ($path -split '\?')[0]
      $path = [System.Uri]::UnescapeDataString($path)
      if ($path -eq '/') { $path = '/index.html' }

      # Resolve inside $root and reject anything that escapes it.
      $full = [System.IO.Path]::GetFullPath((Join-Path $root $path.TrimStart('/')))
      $ok   = $full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $full -PathType Leaf)

      if ($ok) {
        $body = [System.IO.File]::ReadAllBytes($full)
        $type = $types[[System.IO.Path]::GetExtension($full).ToLower()]
        if (-not $type) { $type = 'application/octet-stream' }
        $head = "HTTP/1.1 200 OK`r`nContent-Type: $type`r`nContent-Length: $($body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
        Write-Host "200 $path"
      } else {
        $body = [System.Text.Encoding]::UTF8.GetBytes("404 $path")
        $head = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
        Write-Host "404 $path" -ForegroundColor Yellow
      }

      $hb = [System.Text.Encoding]::ASCII.GetBytes($head)
      $stream.Write($hb, 0, $hb.Length)
      $stream.Write($body, 0, $body.Length)
      $stream.Flush()
    } finally { $client.Close() }
  }
} finally { $listener.Stop() }
