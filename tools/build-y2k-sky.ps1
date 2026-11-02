# Paints Low FX's hidden backdrop in the bench Chrome (y2k-sky.js) and writes it to
# assets/ as WebP. It is drawn ahead of time so a visitor's machine never has to.
# Needs the site running: tools/perf/serve.ps1.
param([int]$Port = 9418, [string]$Site = 'http://localhost:8862/', [string]$OutDir = (Join-Path $PSScriptRoot '..\assets'))
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'perf\Cdp.psm1') -Force
$profileDir = Join-Path $env:TEMP "aloe-art-$Port"
if (Test-Path $profileDir) { Remove-Item -Recurse -Force $profileDir -ErrorAction SilentlyContinue }
$chrome = Start-BenchChrome -Port $Port -ProfileDir $profileDir -ScaleFactor 1
try {
    $page = Open-BenchPage $chrome
    foreach ($d in 'Page', 'Runtime') { Invoke-Page $page "$d.enable" | Out-Null }
    Set-BenchViewport $page 1200 800
    Invoke-Page $page 'Page.navigate' @{ url = $Site } | Out-Null
    Wait-PageReady $page
    Start-Sleep -Seconds 1
    [string]$code = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'y2k-sky.js'))
    Invoke-Page $page 'Runtime.evaluate' @{ expression = $code } | Out-Null
    foreach ($job in @(@(2200, 1375, 'false', 'y2k-sky.webp'), @(1100, 1950, 'true', 'y2k-sky-tall.webp'))) {
        [string]$call = "window.__paintY2k($($job[0]), $($job[1]), $($job[2]))"
        $result = Invoke-Page $page 'Runtime.evaluate' @{ expression = $call; awaitPromise = $true; returnByValue = $true }
        $url = $result['result']['value']
        if (-not $url) { throw "no picture: $($result | ConvertTo-Json -Depth 6)" }
        $base64 = $url.Substring($url.IndexOf(',') + 1)
        $path = Join-Path $OutDir $job[3]
        [IO.File]::WriteAllBytes($path, [Convert]::FromBase64String($base64))
        '{0}  {1:N0} KB' -f $job[3], ((Get-Item $path).Length / 1KB)
    }
} finally {
    Stop-BenchChrome $chrome
}
