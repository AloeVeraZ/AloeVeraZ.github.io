<#
  A static server for previewing the site on Windows without Python.

    powershell -NoProfile -ExecutionPolicy Bypass -File tools/perf/serve.ps1 [-Port 8862] [-CacheSeconds 0]

  It answers the way GitHub Pages does where that matters to the page: text is
  gzipped when the browser asks for it, every file carries an ETag and a
  Last-Modified date and a matching revalidation gets a 304, and a missing path
  gets 404.html. -CacheSeconds 600 gives Pages' own max-age, for warm-cache
  measurements; the default of 0 makes every reload fetch your latest edit.
#>
param(
    [int]$Port = 8862,
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
    [int]$CacheSeconds = 0
)

$ErrorActionPreference = 'Stop'
$types = @{
    '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
    '.js' = 'text/javascript; charset=utf-8'; '.json' = 'application/json; charset=utf-8'
    '.md' = 'text/markdown; charset=utf-8'; '.txt' = 'text/plain; charset=utf-8'
    '.xml' = 'application/xml; charset=utf-8'; '.webmanifest' = 'application/manifest+json; charset=utf-8'
    '.svg' = 'image/svg+xml'; '.webp' = 'image/webp'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'
    '.gif' = 'image/gif'; '.ico' = 'image/x-icon'; '.woff2' = 'font/woff2'; '.pdf' = 'application/pdf'
}
$compressible = '.html', '.css', '.js', '.json', '.md', '.txt', '.xml', '.webmanifest', '.svg'

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
Write-Host "Serving $Root at http://localhost:$Port/ (max-age $CacheSeconds)"

$send = {
    param($context, [string]$path, [int]$status)
    $response = $context.Response
    $file = Get-Item -LiteralPath $path
    $extension = $file.Extension.ToLowerInvariant()
    $etag = '"{0:x}-{1:x}"' -f $file.Length, $file.LastWriteTimeUtc.Ticks
    $response.StatusCode = $status
    $response.ContentType = if ($types.ContainsKey($extension)) { $types[$extension] } else { 'application/octet-stream' }
    $response.Headers['ETag'] = $etag
    $response.Headers['Last-Modified'] = $file.LastWriteTimeUtc.ToString('R')
    $response.Headers['Cache-Control'] = if ($CacheSeconds -gt 0) { "max-age=$CacheSeconds" } else { 'no-cache' }
    $response.Headers['Vary'] = 'Accept-Encoding'
    if ($status -eq 200 -and $context.Request.Headers['If-None-Match'] -eq $etag) {
        $response.StatusCode = 304
        $response.Close()
        return
    }
    $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
    if ($compressible -contains $extension -and "$($context.Request.Headers['Accept-Encoding'])" -match 'gzip') {
        $buffer = [System.IO.MemoryStream]::new()
        $gzip = [System.IO.Compression.GZipStream]::new($buffer, [System.IO.Compression.CompressionLevel]::Optimal)
        $gzip.Write($bytes, 0, $bytes.Length)
        $gzip.Dispose()
        $bytes = $buffer.ToArray()
        $response.Headers['Content-Encoding'] = 'gzip'
    }
    $response.ContentLength64 = $bytes.Length
    if ($context.Request.HttpMethod -ne 'HEAD') { $response.OutputStream.Write($bytes, 0, $bytes.Length) }
    $response.Close()
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        try {
            $relative = [System.Uri]::UnescapeDataString($context.Request.Url.AbsolutePath).TrimStart('/')
            if ($relative -eq '' -or $relative.EndsWith('/')) { $relative += 'index.html' }
            $full = [System.IO.Path]::GetFullPath((Join-Path $Root $relative))
            if ($full.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $full -PathType Leaf)) {
                & $send $context $full 200
            } else {
                & $send $context (Join-Path $Root '404.html') 404
            }
        } catch {
            # A browser that gave up on a request mid-answer is not an error
            # worth stopping for.
            try { $context.Response.Abort() } catch { }
        }
    }
} finally {
    $listener.Stop()
}
