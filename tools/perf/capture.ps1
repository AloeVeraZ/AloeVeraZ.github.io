<#
  Screenshots of the site's main states on several screens, for checking that
  a change leaves the page looking the same.

    powershell -NoProfile -ExecutionPolicy Bypass -File tools/perf/capture.ps1 -Label before
    powershell -NoProfile -ExecutionPolicy Bypass -File tools/perf/capture.ps1 -Label after -CompareWith before

  Shots land in tools/.cache/perf/visual/<label>/. The sky moves on its own
  clock, so two captures of it never match to the pixel; -TestPattern puts a
  fixed, sharp pattern behind the page in its place, and with it a change to
  the glass, the layout or the type shows up exactly. Compare those.
#>
param(
    [string]$Label = 'reference',
    [string[]]$Devices = @('mac', 'phone', 'tablet'),
    [switch]$TestPattern,
    # The effects level every load starts at, as if chosen on the slider;
    # -LowFx is short for -Level low. Neither: the page picks, as for a first
    # visit.
    [ValidateSet('', 'low', 'medium', 'high')][string]$Level = '',
    [switch]$LowFx,
    [string]$CompareWith = '',
    # file name as the page requests it -> path of the copy to serve instead
    [hashtable]$Overrides = @{},
    [int]$Seed = 1234,
    [int]$Port = 9335,
    [string]$Site = 'http://localhost:8862/',
    [int]$Threshold = 2
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
Import-Module (Join-Path $here 'Cdp.psm1') -Force
if ($LowFx -and -not $Level) { $Level = 'low' }
if (-not ('ImageDiff' -as [type])) { Add-Type -Path (Join-Path $here 'ImageDiff.cs') -ReferencedAssemblies System.Drawing }
$repo = (Resolve-Path (Join-Path $here '..\..')).Path
$root = Join-Path $repo 'tools\.cache\perf\visual'
$out = Join-Path $root $Label
New-Item -ItemType Directory -Force -Path $out | Out-Null

$screens = @{
    mac = @{ W = 1470; H = 860; Scale = 2; Mobile = $false }
    native = @{ W = 1280; H = 720; Scale = 3; Mobile = $false }
    wide = @{ W = 1920; H = 1080; Scale = 1; Mobile = $false }
    tablet = @{ W = 820; H = 1180; Scale = 2; Mobile = $true }
    # An iPad turned sideways: a touch screen wide enough for the desktop bar.
    'tablet-landscape' = @{ W = 1180; H = 820; Scale = 2; Mobile = $true }
    phone = @{ W = 390; H = 844; Scale = 3; Mobile = $true }
}
$pattern = @'
html, body { background: repeating-linear-gradient(90deg, rgba(255,255,255,.16) 0 2px, transparent 2px 23px), repeating-linear-gradient(0deg, rgba(123,168,216,.22) 0 1px, transparent 1px 17px) #080808 !important; background-attachment: fixed !important; }
.galaxy-field, .galaxy-streak, .cursor-dot, .cursor-spark, .cursor-ripple { visibility: hidden !important; }
*, *::before, *::after { transition-duration: 0s !important; animation-duration: 0s !important; caret-color: transparent !important; }
'@
$init = @"
(() => {
  let state = $Seed >>> 0;
  Math.random = () => { state = (state + 0x6D2B79F5) | 0; let t = Math.imul(state ^ (state >>> 15), 1 | state); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const css = $(if ($TestPattern) { ConvertTo-Json $pattern } else { "''" });
  if (css) document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); });
  $(Get-EffectsLevelScript $Level)
})();
"@

function Save-Shot {
    param($Page, [string]$Name)
    $shot = Invoke-Page $Page 'Page.captureScreenshot' @{ format = 'png'; captureBeyondViewport = $false } 60000
    $file = Join-Path $out "$Name.png"
    [IO.File]::WriteAllBytes($file, [Convert]::FromBase64String($shot['data']))
    Write-Host "  $Name"
}
function Go {
    param($Page, [string]$Expression)
    # Every section shown as it is once a visitor has scrolled to it. Each
    # fades and slides 12px into place the first time 12% of it is on screen,
    # and whether the shot before had already shown 12% of the next section
    # decided where the next shot landed.
    Invoke-PageJs $Page "(() => { document.querySelectorAll('main .section').forEach(s => s.classList.add('in-view')); document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, $Expression); document.documentElement.style.scrollBehavior = ''; return true; })()" | Out-Null
    Start-Sleep -Milliseconds 900
}
function Element-Top { param([string]$Selector, [int]$Offset = 90) "document.querySelector('$Selector').getBoundingClientRect().top + scrollY - $Offset" }

$chrome = Start-BenchChrome -Port $Port -ProfileDir (Join-Path $env:TEMP "aloe-capture-profile-$Port")
try {
    $page = Open-BenchPage $chrome
    foreach ($domain in 'Page', 'Runtime') { Invoke-Page $page "$domain.enable" | Out-Null }
    Invoke-Page $page 'Page.addScriptToEvaluateOnNewDocument' @{ source = $init } | Out-Null
    if ($Overrides.Count) { Set-BenchOverrides $page $Overrides }
    foreach ($device in $Devices) {
        $s = $screens[$device]
        Write-Host "$device ($($s.W)x$($s.H) @$($s.Scale)x)"
        Invoke-Page $page 'Emulation.setDeviceMetricsOverride' @{ width = $s.W; height = $s.H; deviceScaleFactor = $s.Scale; mobile = $s.Mobile } | Out-Null
        Invoke-Page $page 'Emulation.setTouchEmulationEnabled' @{ enabled = $s.Mobile; maxTouchPoints = $(if ($s.Mobile) { 5 } else { 1 }) } | Out-Null
        Invoke-Page $page 'Page.navigate' @{ url = $Site } | Out-Null
        Wait-PageReady $page
        Start-Sleep -Seconds 3
        $prefix = "$device"
        Go $page '0'; Save-Shot $page "$prefix-01-hero"
        Go $page (Element-Top '#about'); Save-Shot $page "$prefix-02-about"
        Go $page (Element-Top '#skills'); Save-Shot $page "$prefix-03-skills"
        Go $page (Element-Top '#featured-projects-container' 140); Save-Shot $page "$prefix-04-projects"
        if (-not $s.Mobile) {
            $card = Invoke-PageJs $page "(() => { const b = document.querySelectorAll('#featured-projects-container .project-card')[1].getBoundingClientRect(); return [b.left + b.width * .7, b.top + b.height * .3]; })()"
            Send-Mouse $page 'mouseMoved' ([double]$card[0] - 40) ([double]$card[1])
            Send-Mouse $page 'mouseMoved' ([double]$card[0]) ([double]$card[1])
            Start-Sleep -Milliseconds 700
            Save-Shot $page "$prefix-05-hover"
            Send-Mouse $page 'mouseMoved' 2 ($s.H - 2)
        }
        Go $page (Element-Top '#project-collections' 160)
        Invoke-PageJs $page "document.querySelector('.collection-toggle').click()" | Out-Null
        Start-Sleep -Milliseconds 1200
        Go $page (Element-Top '.project-collection .collection-content' 100); Save-Shot $page "$prefix-06-ring"
        Go $page (Element-Top '#contact'); Save-Shot $page "$prefix-07-contact"
        Go $page (Element-Top '#featured-projects-container' 140)
        Invoke-PageJs $page "document.querySelector('#featured-projects-container .project-card').click()" | Out-Null
        Start-Sleep -Milliseconds 1200
        Save-Shot $page "$prefix-08-modal"
        Send-Key $page 'Escape' 'Escape' 27
        Start-Sleep -Milliseconds 500
    }
} finally {
    Stop-BenchChrome $chrome
}

if ($CompareWith) {
    $base = Join-Path $root $CompareWith
    $diffDir = Join-Path $out "diff-vs-$CompareWith"
    New-Item -ItemType Directory -Force -Path $diffDir | Out-Null
    $rows = foreach ($file in Get-ChildItem $out -Filter '*.png') {
        $other = Join-Path $base $file.Name
        if (-not (Test-Path $other)) { continue }
        $r = [ImageDiff]::Compare($other, $file.FullName, (Join-Path $diffDir $file.Name), $Threshold)
        [pscustomobject]@{ shot = $file.BaseName; differingPct = [math]::Round([double]$r['differingPct'], 3); maxDiff = $r['maxChannelDiff']; meanDiff = [math]::Round([double]$r['meanChannelDiff'], 3); box = $r['diffBox'] }
    }
    $rows | Format-Table -AutoSize | Out-String | Write-Host
    $rows | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $diffDir 'diff.json')
}
Write-Host "Shots: $out"
