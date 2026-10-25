<#
  Loads the page on a range of screens -- folding phones to 4K monitors, at
  their own pixel densities, and at browser zoom -- and checks each one for the
  ways a layout breaks: a page wider than the window, text cut off or running
  out of its box, controls off the edge of the screen or too small to tap, and
  type below the 13px floor. Every screen is photographed at the top, in the
  projects and at the contact row, so whatever the checks cannot see can be
  looked at.

    powershell -NoProfile -ExecutionPolicy Bypass -File tools/perf/layout-audit.ps1 [-Label now] [-Only phone-se,mac-13]

  Writes tools/.cache/perf/layout/<label>/report.md and the screenshots.
#>
param(
    [string]$Label = 'now',
    [string[]]$Only = @(),
    [switch]$LowFx,
    [hashtable]$Overrides = @{},
    [int]$Port = 9336,
    [string]$Site = 'http://localhost:8862/',
    [switch]$NoShots
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
Import-Module (Join-Path $here 'Cdp.psm1') -Force
$repo = (Resolve-Path (Join-Path $here '..\..')).Path
$out = Join-Path $repo "tools\.cache\perf\layout\$Label"
New-Item -ItemType Directory -Force -Path $out | Out-Null

# name, CSS width, CSS height, device pixel ratio, touch/mobile
$devices = @(
    @('fold-closed', 280, 653, 3, $true), @('phone-small', 320, 568, 2, $true),
    @('galaxy-s', 360, 800, 3, $true), @('phone-se', 375, 667, 2, $true),
    @('iphone', 393, 852, 3, $true), @('pixel', 412, 915, 2.625, $true),
    @('iphone-max', 430, 932, 3, $true), @('phone-landscape', 852, 393, 3, $true),
    @('fold-open', 673, 841, 2.625, $true), @('ipad-mini', 768, 1024, 2, $true),
    @('ipad-air', 820, 1180, 2, $true), @('ipad-landscape', 1180, 820, 2, $true),
    @('ipad-pro', 1024, 1366, 2, $true), @('laptop-1366', 1366, 768, 1, $false),
    @('win-150pct', 1280, 720, 1.5, $false), @('win-125pct', 1536, 864, 1.25, $false),
    @('mac-13', 1470, 860, 2, $false), @('mac-15', 1710, 1000, 2, $false),
    @('desktop-1080', 1920, 1080, 1, $false), @('desktop-1440', 2560, 1440, 1, $false),
    @('ultrawide', 3440, 1440, 1, $false), @('4k-100pct', 3840, 2160, 1, $false),
    @('zoom-150', 980, 573, 3, $false), @('zoom-200', 735, 430, 4, $false)
)
if ($Only.Count) { $devices = @($devices | Where-Object { $Only -contains $_[0] }) }

# Everything the checks look at, worked out in the page.
$audit = @'
(() => {
  const vw = document.documentElement.clientWidth, vh = innerHeight;
  const problems = [];
  const describe = e => {
    let s = e.tagName.toLowerCase();
    if (e.id) s += '#' + e.id;
    const c = [...e.classList].slice(0, 2).join('.');
    if (c) s += '.' + c;
    const t = (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    return t ? `${s} "${t}"` : s;
  };
  // A clipping ancestor (a slider, a ring, a card) is allowed to hold content
  // past the window's edge: that content is scrolled or turned out of view.
  const clipped = e => {
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      const st = getComputedStyle(p);
      if (/(hidden|clip|auto|scroll)/.test(st.overflowX)) return true;
    }
    return false;
  };
  const visible = e => {
    const st = getComputedStyle(e);
    if (st.display === 'none' || st.visibility === 'hidden' || +st.opacity === 0) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const docWidth = document.documentElement.scrollWidth;
  if (docWidth > vw + 1) problems.push(`page is ${docWidth}px wide in a ${vw}px window (sideways scroll)`);
  const all = [...document.querySelectorAll('body *')].filter(e => !e.closest('#project-modal, .galaxy-field, .galaxy-streak, .cursor-dot, script, style, svg *, .skip-link'));
  for (const e of all) {
    if (!visible(e)) continue;
    const r = e.getBoundingClientRect();
    if ((r.right > vw + 1 || r.left < -1) && !clipped(e) && getComputedStyle(e).position !== 'fixed') {
      problems.push(`off the side: ${describe(e)} spans ${Math.round(r.left)}..${Math.round(r.right)} of ${vw}`);
    }
  }
  // Text that does not fit its box: wider than the element, unless the element
  // is a scroller or a slider meant to be.
  const textual = all.filter(e => e.children.length === 0 && (e.textContent || '').trim().length > 1 && visible(e));
  let smallest = 99, smallestAt = '';
  for (const e of textual) {
    const st = getComputedStyle(e);
    const size = parseFloat(st.fontSize);
    if (size < smallest) { smallest = size; smallestAt = describe(e); }
    if (e.scrollWidth > e.clientWidth + 1 && st.overflowX !== 'visible' && !e.closest('.project-carousel, .is-responsive-card-slider')) {
      problems.push(`text cut off: ${describe(e)} needs ${e.scrollWidth}px, has ${e.clientWidth}px`);
    }
  }
  // Words overflowing their parents horizontally (long unbreakable words).
  // Measured by the text itself, not the element's box: a link can lend its
  // padding back through its margins to reach a thumb without its words moving.
  const textRange = document.createRange();
  for (const e of textual) {
    const p = e.parentElement; if (!p) continue;
    textRange.selectNodeContents(e);
    const r = textRange.getBoundingClientRect(), pr = p.getBoundingClientRect();
    if (r.right > pr.right + 2 && getComputedStyle(p).overflowX === 'visible' && !clipped(e) && getComputedStyle(e).position !== 'absolute') {
      problems.push(`text past its box: ${describe(e)} ends at ${Math.round(r.right)}, box at ${Math.round(pr.right)}`);
    }
  }
  // Controls: on a touch screen every one at least 44px (a 2px allowance).
  const touch = document.documentElement.dataset.primaryInput === 'touch';
  const controls = [...document.querySelectorAll('a[href], button, [role="button"], [tabindex="0"]')]
    .filter(e => visible(e) && !e.closest('#project-modal, .carousel-clone, footer .footer-links, .skip-link') && !e.matches('.project-card, .about-highlight-link, .carousel-indicator'));
  if (touch) for (const e of controls) {
    const r = e.getBoundingClientRect();
    if (r.width < 42 || r.height < 42) problems.push(`small tap target: ${describe(e)} is ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  if (smallest < 13) problems.push(`text at ${smallest}px: ${smallestAt}`);
  // The bar over the hero's first line at load.
  const bar = document.querySelector('.navbar .nav-content').getBoundingClientRect();
  const badge = document.querySelector('.hero-badge').getBoundingClientRect();
  if (badge.top < bar.bottom - 1) problems.push(`hero label sits under the bar (${Math.round(badge.top)} < ${Math.round(bar.bottom)})`);
  const name = document.querySelector('.hero-name').getBoundingClientRect();
  if (name.right > vw + 1) problems.push(`hero name runs past the window: ${Math.round(name.right)} > ${vw}`);
  return JSON.stringify({ vw, vh, dpr: devicePixelRatio, tier: document.documentElement.dataset.viewportTier, input: document.documentElement.dataset.primaryInput,
    effects: document.documentElement.dataset.effects, glass: document.documentElement.dataset.glass, smallest, problems: [...new Set(problems)].slice(0, 40) });
})()
'@

$chrome = Start-BenchChrome -Port $Port -ProfileDir (Join-Path $env:TEMP "aloe-layout-profile-$Port")
$report = New-Object System.Collections.Generic.List[string]
$report.Add("# Layout audit ($Label)")
$report.Add('')
$failures = 0
try {
    $page = Open-BenchPage $chrome
    foreach ($domain in 'Page', 'Runtime') { Invoke-Page $page "$domain.enable" | Out-Null }
    $lowFxScript = if ($LowFx) { "try { localStorage.setItem('portfolio-effects-override-v3', 'low'); } catch (e) {}" } else { "try { localStorage.removeItem('portfolio-effects-override-v3'); } catch (e) {}" }
    Invoke-Page $page 'Page.addScriptToEvaluateOnNewDocument' @{ source = $lowFxScript } | Out-Null
    if ($Overrides.Count) { Set-BenchOverrides $page $Overrides }
    foreach ($d in $devices) {
        $name, $w, $h, $dpr, $mobile = $d
        Invoke-Page $page 'Emulation.setDeviceMetricsOverride' @{ width = $w; height = $h; deviceScaleFactor = $dpr; mobile = $mobile } | Out-Null
        Invoke-Page $page 'Emulation.setTouchEmulationEnabled' @{ enabled = $mobile; maxTouchPoints = $(if ($mobile) { 5 } else { 1 }) } | Out-Null
        $ua = if ($mobile) { 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36' } else { '' }
        Invoke-Page $page 'Emulation.setUserAgentOverride' @{ userAgent = $ua } | Out-Null
        Invoke-Page $page 'Page.navigate' @{ url = $Site } | Out-Null
        Wait-PageReady $page
        Start-Sleep -Milliseconds 1500
        # Every section laid out (content-visibility skips the far ones), and
        # every collection open, so the checks see the whole page.
        Invoke-PageJs $page "document.querySelectorAll('.collection-toggle').forEach(t => t.click()); document.querySelectorAll('.section').forEach(s => { s.style.contentVisibility = 'visible'; s.classList.add('in-view'); }); true" | Out-Null
        Start-Sleep -Milliseconds 1200
        $result = Invoke-PageJs $page $audit | ConvertFrom-Json
        $status = if ($result.problems.Count) { $failures++; 'FAIL' } else { 'ok' }
        Write-Host ("{0,-16} {1,4}x{2,-4} @{3,-5} tier {4,-9} {5,-7} {6}  {7}" -f $name, $w, $h, $dpr, $result.tier, $result.input, $status, ($result.problems -join ' | '))
        $report.Add("## $name ($w x $h CSS px at ${dpr}x, $($result.tier), $($result.input), $($result.effects)/$($result.glass)): $status")
        foreach ($p in $result.problems) { $report.Add("- $p") }
        $report.Add('')
        if (-not $NoShots) {
            Invoke-PageJs $page "document.querySelectorAll('.collection-toggle[aria-expanded=true]').forEach(t => t.click()); true" | Out-Null
            foreach ($stop in @(@('top', '0'), @('projects', "document.getElementById('projects').offsetTop"), @('contact', "document.getElementById('contact').offsetTop"))) {
                Invoke-PageJs $page "(() => { document.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, $($stop[1])); document.documentElement.style.scrollBehavior = ''; return 1; })()" | Out-Null
                Start-Sleep -Milliseconds 700
                $shot = Invoke-Page $page 'Page.captureScreenshot' @{ format = 'jpeg'; quality = 80 } 60000
                [IO.File]::WriteAllBytes((Join-Path $out "$name-$($stop[0]).jpg"), [Convert]::FromBase64String($shot['data']))
            }
        }
    }
} finally {
    Stop-BenchChrome $chrome
}
$report.Add("$failures of $($devices.Count) screens with problems.")
$report | Set-Content -Encoding UTF8 (Join-Path $out 'report.md')
Write-Host "$failures of $($devices.Count) screens with problems. Report: $(Join-Path $out 'report.md')"
