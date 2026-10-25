<#
  Measures the site in a private Chrome, scenario by scenario.

    powershell -NoProfile -ExecutionPolicy Bypass -File tools/perf/bench.ps1 -Config mac -Label baseline

  Needs the local server running (tools/perf/serve.ps1, port 8862). Results go
  to tools/.cache/perf/<label>-<config>-<time>/ as results.json and a
  summary.md table. See README.md in this folder for what each number means.

  Configs (what each stands in for is a guess at the hardware, not the
  hardware itself; see README.md):
    native  this machine as it is: its own display scale and graphics
    mac     2x display scale at a 13-inch MacBook Air's default size, with the
            page told it runs on Apple graphics, so it does not slow its sky
            for Intel graphics as it would on this machine
    lowend  no graphics acceleration (software compositing), a 1366x768 1x
            screen and a main thread slowed 4x: a cheap, old or locked-down PC
    phone   a 390x844 3x touch phone, main thread slowed 4x
#>
param(
    [ValidateSet('native', 'mac', 'lowend', 'phone')][string]$Config = 'native',
    [string[]]$Scenarios = @('idle-top', 'idle-projects', 'scroll', 'hover', 'ring', 'modal', 'fx-toggle', 'collections'),
    [int]$Repeat = 1,
    [string]$Label = 'run',
    # file name as the page requests it -> path of the copy to serve instead
    [hashtable]$Overrides = @{},
    [int]$Port = 9334,
    [string]$Site = 'http://localhost:8862/',
    [switch]$KeepTraces,
    # Extra trace categories, for digging into one scenario (they cost a
    # little time of their own, so leave them off for comparisons).
    [string[]]$ExtraCategories = @(),
    # Reuse the universe: Math.random is seeded, so two runs see the same sky.
    [int]$Seed = 1234,
    # For taking a page apart to see what each piece costs: a stylesheet laid
    # over the site's own, and a script run before any of the page's.
    [string]$InjectCss = '',
    [string]$InjectJs = '',
    # URL patterns the browser refuses to load (Network.setBlockedURLs), for
    # telling the page's own cost from an embed's.
    [string[]]$BlockUrls = @()
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
Import-Module (Join-Path $here 'Cdp.psm1') -Force
if (-not ('TraceStats' -as [type])) { Add-Type -Path (Join-Path $here 'TraceStats.cs') -ReferencedAssemblies System.Core }

$repo = (Resolve-Path (Join-Path $here '..\..')).Path
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$out = Join-Path $repo "tools\.cache\perf\$Label-$Config-$stamp"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$profileDir = Join-Path $env:TEMP "aloe-bench-profile-$Port"

$settings = @{
    native = @{ Scale = 0; Width = 1280; Height = 720; Flags = @(); Throttle = 1; Mobile = $false; Renderer = '' }
    mac = @{ Scale = 2; Width = 1470; Height = 860; Flags = @(); Throttle = 1; Mobile = $false; Renderer = 'Apple M2' }
    lowend = @{ Scale = 1; Width = 1366; Height = 650; Flags = @('--disable-gpu', '--disable-gpu-compositing'); Throttle = 4; Mobile = $false; Renderer = '' }
    phone = @{ Scale = 0; Width = 390; Height = 844; Flags = @(); Throttle = 4; Mobile = $true; Renderer = '' }
}[$Config]

$categories = @('toplevel', 'viz', 'gpu', 'benchmark', 'devtools.timeline', 'blink.user_timing', 'v8') + $ExtraCategories

$init = @"
(() => {
  // A fixed universe, so two runs draw the same sky.
  let state = $Seed >>> 0;
  Math.random = () => { state = (state + 0x6D2B79F5) | 0; let t = Math.imul(state ^ (state >>> 15), 1 | state); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const renderer = '$($settings.Renderer)';
  if (renderer) {
    const patch = proto => { if (!proto) return; const get = proto.getParameter; proto.getParameter = function (p) { return p === 0x9246 || p === 0x1F01 ? renderer : get.call(this, p); }; };
    patch(window.WebGLRenderingContext && WebGLRenderingContext.prototype);
    patch(window.WebGL2RenderingContext && WebGL2RenderingContext.prototype);
  }
  const css = $(ConvertTo-Json $InjectCss);
  if (css) document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); });
  $InjectJs
  window.__bench = { lcp: 0, cls: 0, longTasks: [] };
  try { new PerformanceObserver(list => { for (const e of list.getEntries()) window.__bench.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) {}
  window.__bench.shifts = [];
  const describe = n => { if (!n || !n.tagName) return '?'; let s = n.tagName.toLowerCase(); if (n.id) s += '#' + n.id; if (n.classList && n.classList.length) s += '.' + [...n.classList].slice(0, 2).join('.'); return s; };
  try { new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) { window.__bench.cls += e.value;
    window.__bench.shifts.push({ at: Math.round(e.startTime), value: +e.value.toFixed(4), sources: (e.sources || []).map(s => describe(s.node) + ' ' + Math.round(s.previousRect.y) + '->' + Math.round(s.currentRect.y)) }); } }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
})();
"@

function Get-Metrics {
    param($Page)
    $metrics = @{}
    foreach ($m in (Invoke-Page $Page 'Performance.getMetrics')['metrics']) { $metrics[$m['name']] = [double]$m['value'] }
    $metrics
}

function Open-Site {
    param($Page, [switch]$NoCache)
    Invoke-Page $Page 'Network.setCacheDisabled' @{ cacheDisabled = [bool]$NoCache } | Out-Null
    Invoke-Page $Page 'Page.navigate' @{ url = $Site } | Out-Null
    Wait-PageReady $Page
}

function Get-Rect {
    param($Page, [string]$Selector, [int]$Index = 0)
    $r = Invoke-PageJs $Page "(() => { const e = document.querySelectorAll('$Selector')[$Index]; if (!e) return null; const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2, b.width, b.height]; })()"
    if ($null -eq $r) { throw "No element $Selector[$Index]" }
    $r
}

function Scroll-To {
    param($Page, [string]$Expression)
    Invoke-PageJs $Page "(() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, $Expression); document.documentElement.style.scrollBehavior = ''; return scrollY; })()" | Out-Null
}

function Measure-Scenario {
    param($Page, $Chrome, [string]$Name, [scriptblock]$Action)
    $gpuPid = Get-GpuProcessId $Chrome
    $gpu = if ($gpuPid) { New-GpuCounter $gpuPid } else { @() }
    $m0 = Get-Metrics $Page
    $t0 = Get-ProcessTimes $Page.Session
    Start-BenchTrace $Page.Session $categories
    Invoke-PageJs $Page "performance.mark('bench:start')" | Out-Null
    $clock = [Diagnostics.Stopwatch]::StartNew()
    & $Action
    Invoke-PageJs $Page "performance.mark('bench:end')" | Out-Null
    $seconds = $clock.Elapsed.TotalSeconds
    $gpuPct = Read-GpuCounter $gpu
    $t1 = Get-ProcessTimes $Page.Session
    $m1 = Get-Metrics $Page
    $traceFile = Join-Path $out "$Name.trace.json"
    Stop-BenchTrace $Page.Session $traceFile | Out-Null
    $stats = [TraceStats]::Analyze($traceFile, 'bench:start', 'bench:end')
    if (-not $KeepTraces) { Remove-Item $traceFile }
    $row = [ordered]@{ scenario = $Name; seconds = [math]::Round($seconds, 2) }
    foreach ($type in 'renderer', 'GPU', 'browser') {
        $row["cpu_$type"] = if ($t1.ContainsKey($type)) { [math]::Round(100 * ($t1[$type] - $t0[$type]) / $seconds, 1) } else { $null }
    }
    # The page's own renderer, told apart from any other (an embedded player).
    $pageKey = "pid:$($stats['rendererPid'])"
    $row['cpu_page'] = if ($t0.ContainsKey($pageKey) -and $t1.ContainsKey($pageKey)) { [math]::Round(100 * ($t1[$pageKey] - $t0[$pageKey]) / $seconds, 1) } else { $null }
    $row['gpu3d'] = [math]::Round($gpuPct, 1)
    $row['mainTaskMsPerSec'] = [math]::Round(1000 * ($m1['TaskDuration'] - $m0['TaskDuration']) / $seconds, 1)
    $row['scriptMsPerSec'] = [math]::Round(1000 * ($m1['ScriptDuration'] - $m0['ScriptDuration']) / $seconds, 1)
    $row['layoutMsPerSec'] = [math]::Round(1000 * ($m1['LayoutDuration'] - $m0['LayoutDuration']) / $seconds, 1)
    $row['styleMsPerSec'] = [math]::Round(1000 * ($m1['RecalcStyleDuration'] - $m0['RecalcStyleDuration']) / $seconds, 1)
    $row['heapMB'] = [math]::Round($m1['JSHeapUsedSize'] / 1MB, 1)
    $row['nodes'] = $m1['Nodes']
    $row['listeners'] = $m1['JSEventListeners']
    foreach ($key in $stats.Keys) {
        $value = $stats[$key]
        $row[$key] = if ($value -is [double]) { [math]::Round($value, 2) } else { $value }
    }
    [pscustomobject]$row
}

# A first-time visitor every run. The profile used to be kept between runs, and
# a run that pressed the High FX switch left its choice in localStorage for
# every run after it -- which the page then honoured as the visitor's own.
if (Test-Path $profileDir) { Remove-Item -Recurse -Force $profileDir -ErrorAction SilentlyContinue }
$chrome = Start-BenchChrome -Port $Port -ProfileDir $profileDir -ScaleFactor $settings.Scale -ExtraFlags $settings.Flags
$results = New-Object System.Collections.Generic.List[object]
try {
    $page = Open-BenchPage $chrome
    foreach ($domain in 'Page', 'Runtime', 'Performance', 'Network') { Invoke-Page $page "$domain.enable" | Out-Null }
    Invoke-Page $page 'Emulation.setFocusEmulationEnabled' @{ enabled = $true } | Out-Null
    Set-ScrollSource $(if ($settings.Mobile) { 'touch' } else { 'mouse' })
    if ($settings.Mobile) {
        Invoke-Page $page 'Emulation.setDeviceMetricsOverride' @{ width = $settings.Width; height = $settings.Height; deviceScaleFactor = 3; mobile = $true } | Out-Null
        Invoke-Page $page 'Emulation.setTouchEmulationEnabled' @{ enabled = $true; maxTouchPoints = 5 } | Out-Null
        Invoke-Page $page 'Emulation.setUserAgentOverride' @{ userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' } | Out-Null
    } else {
        Set-BenchViewport $page $settings.Width $settings.Height
    }
    Invoke-Page $page 'Page.addScriptToEvaluateOnNewDocument' @{ source = $init } | Out-Null
    if ($Overrides.Count) { Set-BenchOverrides $page $Overrides }
    if ($BlockUrls.Count) { Invoke-Page $page 'Network.setBlockedURLs' @{ urls = $BlockUrls } | Out-Null }
    if ($settings.Throttle -gt 1) { Invoke-Page $page 'Emulation.setCPUThrottlingRate' @{ rate = $settings.Throttle } | Out-Null }

    # A first load warms the HTTP cache and the compiled-code cache.
    Open-Site $page
    Start-Sleep -Seconds 2
    $env = Invoke-PageJs $page "JSON.stringify({ dpr: devicePixelRatio, w: innerWidth, h: innerHeight, effects: document.documentElement.dataset.effects, reason: document.documentElement.dataset.effectsReason, renderer: document.documentElement.dataset.effectsRenderer, glass: document.documentElement.dataset.glass })"
    Write-Host "[$Config] $env"

    for ($round = 1; $round -le $Repeat; $round++) {
        foreach ($scenario in $Scenarios) {
            # Every scenario starts from a fresh page in the same state.
            Open-Site $page
            Send-Mouse $page 'mouseMoved' 4 ($settings.Height - 4)
            # Past the frame monitor's warm-up, so it is not mid-judgement.
            Start-Sleep -Seconds 9
            $state = Invoke-PageJs $page "JSON.stringify({ effects: document.documentElement.dataset.effects, reason: document.documentElement.dataset.effectsReason, renderer: document.documentElement.dataset.effectsRenderer || '', pace: document.documentElement.dataset.effectsPace || '', glass: document.documentElement.dataset.glass })"
            $row = $null
            switch ($scenario) {
                { $_ -in 'load-cold', 'load-warm' } {
                    # A first visit (nothing cached) or a return visit, timed
                    # from the navigation to four seconds after the page loaded.
                    $cold = $scenario -eq 'load-cold'
                    if ($cold) { Invoke-Page $page 'Network.clearBrowserCache' | Out-Null }
                    Invoke-Page $page 'Network.setCacheDisabled' @{ cacheDisabled = $cold } | Out-Null
                    $row = Measure-Scenario $page $chrome $scenario {
                        Invoke-Page $page 'Page.navigate' @{ url = $Site } | Out-Null
                        Wait-PageReady $page
                        Start-Sleep -Seconds 4
                    }
                    Invoke-Page $page 'Network.setCacheDisabled' @{ cacheDisabled = $false } | Out-Null
                    $load = Invoke-PageJs $page @"
(() => {
  const nav = performance.getEntriesByType('navigation')[0];
  const resources = performance.getEntriesByType('resource');
  const bytes = resources.reduce((sum, r) => sum + (r.transferSize || 0), nav.transferSize || 0);
  const decoded = resources.reduce((sum, r) => sum + (r.decodedBodySize || 0), nav.decodedBodySize || 0);
  const firstSky = performance.getEntriesByType('paint').find(p => p.name === 'first-contentful-paint');
  return JSON.stringify({ dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), lcp: Math.round(window.__bench.lcp), fcp: firstSky ? Math.round(firstSky.startTime) : 0,
    cls: +window.__bench.cls.toFixed(4), requests: resources.length + 1, transferKB: Math.round(bytes / 1024), decodedKB: Math.round(decoded / 1024),
    images: resources.filter(r => r.initiatorType === 'img').length });
})()
"@ | ConvertFrom-Json
                    foreach ($p in $load.PSObject.Properties) { $row | Add-Member -NotePropertyName "load_$($p.Name)" -NotePropertyValue $p.Value }
                    $shifts = Invoke-PageJs $page "JSON.stringify(window.__bench.shifts.filter(s => s.value >= .002))"
                    $row | Add-Member -NotePropertyName 'load_shifts' -NotePropertyValue $shifts
                    if ($load.cls -ge .01) { Write-Host "[$Config] $scenario layout shifts: $shifts" }
                    Write-Host ("[{0}] {1}: fcp {2} dcl {3} lcp {4} load {5} ms, {6} requests, {7} KB transferred ({8} KB decoded), cls {9}" -f $Config, $scenario, $load.fcp, $load.dcl, $load.lcp, $load.load, $load.requests, $load.transferKB, $load.decodedKB, $load.cls)
                }
                'idle-top' {
                    Scroll-To $page '0'
                    Start-Sleep -Seconds 2
                    $row = Measure-Scenario $page $chrome $scenario { Start-Sleep -Seconds 8 }
                }
                'idle-long' {
                    # A minute untouched, for memory that creeps up on its own.
                    Scroll-To $page '0'
                    Invoke-Page $page 'HeapProfiler.enable' | Out-Null
                    Invoke-Page $page 'HeapProfiler.collectGarbage' | Out-Null
                    $before = Get-Metrics $page
                    $row = Measure-Scenario $page $chrome $scenario { Start-Sleep -Seconds 60 }
                    Invoke-Page $page 'HeapProfiler.collectGarbage' | Out-Null
                    $after = Get-Metrics $page
                    foreach ($m in 'JSHeapUsedSize', 'Nodes', 'JSEventListeners', 'LayoutObjects', 'Documents') {
                        $row | Add-Member -NotePropertyName "leak_$m" -NotePropertyValue ("{0} -> {1}" -f [math]::Round($before[$m]), [math]::Round($after[$m]))
                    }
                    Write-Host ("[{0}] idle-long: heap {1:N1} -> {2:N1} MB, nodes {3} -> {4}, listeners {5} -> {6}" -f $Config, ($before['JSHeapUsedSize'] / 1MB), ($after['JSHeapUsedSize'] / 1MB), $before['Nodes'], $after['Nodes'], $before['JSEventListeners'], $after['JSEventListeners'])
                }
                'soak' {
                    # The interactions that build and tear things down, over and
                    # over: anything they leave behind shows up as growth.
                    Scroll-To $page "document.getElementById('featured-projects-container').getBoundingClientRect().top + scrollY - 90"
                    Start-Sleep -Seconds 1
                    Invoke-Page $page 'HeapProfiler.enable' | Out-Null
                    Invoke-Page $page 'HeapProfiler.collectGarbage' | Out-Null
                    $before = Get-Metrics $page
                    $row = Measure-Scenario $page $chrome $scenario {
                        for ($i = 0; $i -lt 4; $i++) {
                            Invoke-PageJs $page "document.querySelectorAll('#featured-projects-container .project-card')[$($i % 3)].click()" | Out-Null
                            Start-Sleep -Milliseconds 500
                            Send-Key $page 'Escape' 'Escape' 27
                            Start-Sleep -Milliseconds 300
                            Invoke-PageJs $page "document.getElementById('performance-toggle').click()" | Out-Null
                            Start-Sleep -Milliseconds 400
                            Invoke-PageJs $page "document.getElementById('performance-toggle').click()" | Out-Null
                            Start-Sleep -Milliseconds 400
                            Invoke-PageJs $page "document.querySelectorAll('.collection-toggle').forEach(t => t.click())" | Out-Null
                            Start-Sleep -Milliseconds 600
                            Invoke-PageJs $page "document.querySelectorAll('.collection-toggle').forEach(t => t.click())" | Out-Null
                            Start-Sleep -Milliseconds 300
                        }
                    }
                    Invoke-Page $page 'HeapProfiler.collectGarbage' | Out-Null
                    $after = Get-Metrics $page
                    foreach ($m in 'JSHeapUsedSize', 'Nodes', 'JSEventListeners', 'LayoutObjects', 'Documents') {
                        $row | Add-Member -NotePropertyName "leak_$m" -NotePropertyValue ("{0} -> {1}" -f [math]::Round($before[$m]), [math]::Round($after[$m]))
                    }
                    Write-Host ("[{0}] soak: heap {1:N1} -> {2:N1} MB, nodes {3} -> {4}, listeners {5} -> {6}" -f $Config, ($before['JSHeapUsedSize'] / 1MB), ($after['JSHeapUsedSize'] / 1MB), $before['Nodes'], $after['Nodes'], $before['JSEventListeners'], $after['JSEventListeners'])
                }
                'idle-projects' {
                    Scroll-To $page "document.getElementById('projects').offsetTop"
                    Start-Sleep -Seconds 2
                    $row = Measure-Scenario $page $chrome $scenario { Start-Sleep -Seconds 8 }
                }
                'scroll' {
                    Scroll-To $page '0'
                    Start-Sleep -Seconds 1
                    $distance = [int](Invoke-PageJs $page 'document.documentElement.scrollHeight - innerHeight')
                    $row = Measure-Scenario $page $chrome $scenario {
                        Send-ScrollGesture $page ($settings.Width / 2) ($settings.Height / 2) $distance 1800
                    }
                }
                'hover' {
                    Scroll-To $page "document.getElementById('featured-projects-container').getBoundingClientRect().top + scrollY - 90"
                    Start-Sleep -Seconds 1
                    $cards = Invoke-PageJs $page "[...document.querySelectorAll('#featured-projects-container .project-card')].slice(0, 3).map(c => { const b = c.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })"
                    $points = New-Object System.Collections.Generic.List[object]
                    $frames = 300
                    for ($i = 0; $i -lt $frames; $i++) {
                        $t = $i / $frames
                        $card = $cards[[Math]::Min(2, [int][Math]::Floor($t * 3))]
                        $u = ($t * 3) % 1
                        $points.Add(@(([double]$card[0] + [double]$card[2] * (0.1 + 0.8 * $u)), ([double]$card[1] + [double]$card[3] * (0.5 + 0.35 * [Math]::Sin($u * 12)))))
                    }
                    $row = Measure-Scenario $page $chrome $scenario { Send-MousePath $page $points.ToArray() }
                }
                'ring' {
                    $toggle = Get-Rect $page '.collection-toggle' 0
                    Invoke-PageJs $page "document.querySelector('.collection-toggle').scrollIntoView({ block: 'start' })" | Out-Null
                    Start-Sleep -Milliseconds 400
                    $toggle = Get-Rect $page '.collection-toggle' 0
                    Send-Click $page $toggle[0] $toggle[1]
                    Start-Sleep -Seconds 1
                    Invoke-PageJs $page "document.querySelector('.project-collection .carousel-controls').scrollIntoView({ block: 'start' }); window.scrollBy(0, -100)" | Out-Null
                    Start-Sleep -Seconds 1
                    $next = Get-Rect $page '.project-collection .carousel-next' 0
                    $row = Measure-Scenario $page $chrome $scenario {
                        for ($i = 0; $i -lt 6; $i++) { Send-Click $page $next[0] $next[1]; Start-Sleep -Milliseconds 650 }
                    }
                }
                'modal' {
                    Scroll-To $page "document.getElementById('featured-projects-container').getBoundingClientRect().top + scrollY - 90"
                    Start-Sleep -Seconds 1
                    $row = Measure-Scenario $page $chrome $scenario {
                        for ($i = 0; $i -lt 2; $i++) {
                            $card = Get-Rect $page '#featured-projects-container .project-card' $i
                            Send-Click $page $card[0] $card[1]
                            Start-Sleep -Milliseconds 900
                            Send-ScrollGesture $page ($settings.Width / 2) ($settings.Height / 2) 1500 1800
                            Start-Sleep -Milliseconds 300
                            Send-Key $page 'Escape' 'Escape' 27
                            Start-Sleep -Milliseconds 700
                        }
                    }
                }
                'modal-idle' {
                    # A project open and being read: eight seconds untouched,
                    # from two seconds after it opened. The third featured
                    # project, which has no video to load.
                    Scroll-To $page "document.getElementById('featured-projects-container').getBoundingClientRect().top + scrollY - 90"
                    Start-Sleep -Seconds 1
                    $card = Get-Rect $page '#featured-projects-container .project-card' 2
                    Send-Click $page $card[0] $card[1]
                    Start-Sleep -Seconds 2
                    $row = Measure-Scenario $page $chrome $scenario { Start-Sleep -Seconds 8 }
                    Send-Key $page 'Escape' 'Escape' 27
                }
                'modal-scroll' {
                    # The same project read down its length: only the scroll,
                    # from two seconds after it opened, so the opening is over.
                    Scroll-To $page "document.getElementById('featured-projects-container').getBoundingClientRect().top + scrollY - 90"
                    Start-Sleep -Seconds 1
                    $card = Get-Rect $page '#featured-projects-container .project-card' 2
                    Send-Click $page $card[0] $card[1]
                    Start-Sleep -Seconds 2
                    $distance = [int](Invoke-PageJs $page "(() => { const c = document.querySelector('#project-modal .modal-card'); return c.scrollHeight - c.clientHeight; })()")
                    $row = Measure-Scenario $page $chrome $scenario {
                        Send-ScrollGesture $page ($settings.Width / 2) ($settings.Height / 2) $distance 1800
                    }
                    Send-Key $page 'Escape' 'Escape' 27
                }
                'fx-toggle' {
                    Scroll-To $page "document.getElementById('projects').offsetTop"
                    Start-Sleep -Seconds 1
                    $row = Measure-Scenario $page $chrome $scenario {
                        for ($i = 0; $i -lt 2; $i++) {
                            Invoke-PageJs $page "document.getElementById('performance-toggle').click()" | Out-Null
                            Start-Sleep -Milliseconds 1500
                        }
                    }
                }
                'collections' {
                    Scroll-To $page "document.getElementById('project-collections').getBoundingClientRect().top + scrollY - 120"
                    Start-Sleep -Seconds 1
                    $row = Measure-Scenario $page $chrome $scenario {
                        Invoke-PageJs $page "document.querySelectorAll('.collection-toggle').forEach(t => t.click())" | Out-Null
                        Start-Sleep -Milliseconds 800
                        $top = [int](Invoke-PageJs $page 'scrollY')
                        $distance = [int](Invoke-PageJs $page 'document.documentElement.scrollHeight - innerHeight - scrollY')
                        Send-ScrollGesture $page ($settings.Width / 2) ($settings.Height / 2) $distance 1800
                    }
                }
            }
            $row | Add-Member -NotePropertyName round -NotePropertyValue $round
            $row | Add-Member -NotePropertyName state -NotePropertyValue $state
            $results.Add($row)
            Write-Host ("[{0}] {1,-14} dropped {2,5}% of {3,4} | swaps {4,5}/s p95 {5,6} | main {6,6} ms/s long {7} | cpu page/gpu {8}/{9} | gpu3d {10} | gpuMain comp {11} canvas {12} tiles {13}" -f $Config, $scenario, $row.droppedPct, ($row.presentedFrames + $row.droppedFrames), $row.fps, $row.frameP95Ms, $row.mainTaskMsPerSec, $row.longTasks, $row.cpu_page, $row.cpu_GPU, $row.gpu3d, $row.gpuMsPerSec_composite, $row.gpuMsPerSec_canvas, $row.gpuMsPerSec_tiles)
        }
    }
} finally {
    Stop-BenchChrome $chrome
}

$results | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 (Join-Path $out 'results.json')
$columns = 'scenario', 'round', 'fps', 'frameMedianMs', 'frameP95Ms', 'frameP99Ms', 'framesOver16_7Pct', 'longTasks', 'longTaskMaxMs', 'mainTaskMsPerSec', 'cpu_renderer', 'cpu_GPU', 'gpu3d', 'heapMB'
$lines = @("| $($columns -join ' | ') |", "| $(($columns | ForEach-Object { '---' }) -join ' | ') |")
foreach ($r in $results) { $lines += "| $(($columns | ForEach-Object { $r.$_ }) -join ' | ') |" }
$lines | Set-Content -Encoding UTF8 (Join-Path $out 'summary.md')
Write-Host "Results: $out"
