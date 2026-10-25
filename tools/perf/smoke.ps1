<#
  Clicks through the site the way a visitor would and checks that each thing
  still works. Exits 1 if any check fails.

    powershell -NoProfile -ExecutionPolicy Bypass -File tools/perf/smoke.ps1

  Checks: no script errors or failed requests (YouTube aside), every project
  rendered from portfolio-data.json, the nav links land on their sections, a
  project opens and closes (and the sky rests behind it and moves again
  after), a collection opens and its ring turns, the effects slider sets
  each of its three levels and is remembered, a slow visit's lower level is
  kept for the tab and dropped by a choice on the slider, and the High FX
  sky and glass are running.
#>
param([int]$Port = 9345, [string]$Site = 'http://localhost:8862/', [switch]$Software)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
Import-Module (Join-Path $here 'Cdp.psm1') -Force
$results = New-Object System.Collections.Generic.List[object]
function Check { param([string]$Name, [bool]$Ok, [string]$Detail = '')
    $results.Add([pscustomobject]@{ check = $Name; ok = $Ok; detail = $Detail })
    Write-Host ('{0}  {1}{2}' -f $(if ($Ok) { 'PASS' } else { 'FAIL' }), $Name, $(if ($Detail) { "  ($Detail)" } else { '' }))
}
$profileDir = Join-Path $env:TEMP "aloe-smoke-profile-$Port"
if (Test-Path $profileDir) { Remove-Item -Recurse -Force $profileDir -ErrorAction SilentlyContinue }
$flags = if ($Software) { @('--disable-gpu', '--disable-gpu-compositing') } else { @() }
$chrome = Start-BenchChrome -Port $Port -ProfileDir $profileDir -ExtraFlags $flags
try {
    $page = Open-BenchPage $chrome
    foreach ($d in 'Page', 'Runtime', 'Network', 'Log') { Invoke-Page $page "$d.enable" | Out-Null }
    Set-BenchViewport $page 1470 860
    $js = { param($e) Invoke-PageJs $page $e }
    $click = { param($selector, $index = 0)
        $r = & $js "(() => { const e = document.querySelectorAll('$selector')[$index]; if (!e) return null; e.scrollIntoView({ block: 'center', behavior: 'instant' }); const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()"
        if ($null -eq $r) { throw "nothing to click: $selector" }
        Start-Sleep -Milliseconds 400
        $r = & $js "(() => { const b = document.querySelectorAll('$selector')[$index].getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()"
        Send-Click $page $r[0] $r[1]
        Start-Sleep -Milliseconds 700
    }
    Invoke-Page $page 'Page.navigate' @{ url = $Site } | Out-Null
    Wait-PageReady $page
    Start-Sleep -Seconds 3

    $data = & $js "fetch('portfolio-data.json').then(r => r.json()).then(d => JSON.stringify({ projects: d.projects.length, featured: d.projects.filter(p => p.featured).length, collections: d.projectCollections.length }))" | ConvertFrom-Json
    $cards = & $js "document.querySelectorAll('.project-card:not(.carousel-clone)').length"
    Check 'every project is rendered' ($cards -ge $data.projects) "$cards cards for $($data.projects) projects"
    Check 'featured row' ((& $js "document.querySelectorAll('#featured-projects-container .project-card').length") -eq [Math]::Min(3, $data.featured))
    Check 'one row per collection' ((& $js "document.querySelectorAll('.project-collection').length") -eq $data.collections)
    $mode = & $js "JSON.stringify({ effects: document.documentElement.dataset.effects, glass: document.documentElement.dataset.glass, canvas: document.querySelector('.galaxy-field').width > 0 && !document.querySelector('.galaxy-field').hidden })" | ConvertFrom-Json
    Check 'starts in Medium FX, with no sky drawing' ($mode.effects -eq 'medium' -and -not $mode.canvas) "effects=$($mode.effects) glass=$($mode.glass)"

    foreach ($target in 'about', 'skills', 'projects', 'contact') {
        # From the top of a fresh load, with a real click on the link.
        Invoke-Page $page 'Page.navigate' @{ url = $Site } | Out-Null
        Wait-PageReady $page
        Start-Sleep -Milliseconds 800
        $r = & $js "(() => { const b = document.querySelector('.nav-links a[href=""#$target""]').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()"
        Send-Click $page $r[0] $r[1]
        # A smooth scroll down a long page takes its time; wait for it to stop.
        $last = -1; $still = 0
        for ($i = 0; $i -lt 40 -and ($still -lt 3 -or $i -lt 6); $i++) {
            Start-Sleep -Milliseconds 150
            $y = & $js 'Math.round(scrollY)'
            if ($y -eq $last) { $still++ } else { $still = 0 }
            $last = $y
        }
        $where = & $js "JSON.stringify({ top: Math.round(document.getElementById('$target').getBoundingClientRect().top), bottom: scrollY >= document.documentElement.scrollHeight - innerHeight - 2 })" | ConvertFrom-Json
        Check "nav link lands on #$target" ([Math]::Abs($where.top) -lt 140 -or $where.bottom) "section top at $($where.top) px$(if ($where.bottom) { ', page bottom reached' })"
    }
    Invoke-Page $page 'Page.navigate' @{ url = $Site } | Out-Null
    Wait-PageReady $page
    Start-Sleep -Seconds 1

    & $click '#featured-projects-container .project-card' 0
    $open = & $js "JSON.stringify({ active: document.getElementById('project-modal').classList.contains('active'), title: document.getElementById('modal-title').textContent, aria: document.getElementById('project-modal').getAttribute('aria-hidden') })" | ConvertFrom-Json
    Check 'a project opens' ($open.active -and $open.title -ne 'Project Title' -and $open.aria -eq 'false') $open.title
    Send-Key $page 'Escape' 'Escape' 27
    Start-Sleep -Milliseconds 600
    Check 'Escape closes it' (-not (& $js "document.getElementById('project-modal').classList.contains('active')"))
    & $click '#featured-projects-container .project-card' 1
    & $click '#modal-close'
    Check 'the close button closes it' (-not (& $js "document.getElementById('project-modal').classList.contains('active')"))
    if (-not $Software) {
        # The sky is parked behind an open project and has to wake once it
        # closes. A checksum of what the sky's canvas holds, a moment apart.
        # The page starts in Medium, which draws no sky, so High is chosen
        # for this and forgotten again after.
        Set-EffectsLevel $page 'high' | Out-Null
        Start-Sleep -Milliseconds 1500
        $sky ="(() => { const d = document.querySelector('.galaxy-field').toDataURL(); let h = 0; for (let i = 0; i < d.length; i++) h = (h * 31 + d.charCodeAt(i)) | 0; return h; })()"
        & $click '#featured-projects-container .project-card' 2
        Start-Sleep -Milliseconds 600
        $a = & $js $sky; Start-Sleep -Milliseconds 1200; $b = & $js $sky
        Check 'the sky rests behind an open project' ($a -eq $b)
        Send-Key $page 'Escape' 'Escape' 27
        Start-Sleep -Milliseconds 600
        $a = & $js $sky; Start-Sleep -Milliseconds 1200; $b = & $js $sky
        Check 'and moves again once it closes' ($a -ne $b)
        & $js "(() => { localStorage.removeItem('portfolio-effects-level'); return 1; })()" | Out-Null
    }

    & $click '.collection-toggle' 0
    $opened = & $js "document.querySelector('.collection-toggle').getAttribute('aria-expanded') === 'true' && !document.querySelector('.collection-content').hidden"
    Check 'a collection opens' $opened
    $before = & $js "document.querySelector('.project-collection .project-carousel').scrollLeft"
    & $click '.project-collection .carousel-next' 0
    Start-Sleep -Milliseconds 500
    $after = & $js "document.querySelector('.project-collection .project-carousel').scrollLeft"
    Check 'its ring turns' ($after -ne $before) "scrollLeft $before -> $after"

    # The effects slider: each level, what it draws, and that it is kept.
    $level = "JSON.stringify({ effects: document.documentElement.dataset.effects, reason: document.documentElement.dataset.effectsReason, glass: document.documentElement.dataset.glass, sky: !document.querySelector('.galaxy-field').hidden, look: document.querySelector('.background-grid').dataset.look || '', value: document.getElementById('fx-level').value })"
    Set-EffectsLevel $page 'medium' | Out-Null
    Start-Sleep -Milliseconds 900
    $m = & $js $level | ConvertFrom-Json
    Check 'the slider sets Medium: glass, no sky' ($m.effects -eq 'medium' -and -not $m.sky -and $m.look -eq 'medium' -and $m.value -eq '1') "$($m.effects) glass=$($m.glass) sky=$($m.sky)"
    Set-EffectsLevel $page 'low' | Out-Null
    Start-Sleep -Milliseconds 900
    $l = & $js $level | ConvertFrom-Json
    Check 'the slider sets Low: no sky, no frost' ($l.effects -eq 'low' -and -not $l.sky -and $l.glass -eq 'frost' -and $l.look -eq 'low' -and $l.value -eq '0') "$($l.effects) glass=$($l.glass)"
    Invoke-Page $page 'Page.reload' | Out-Null
    Wait-PageReady $page
    $kept = & $js $level | ConvertFrom-Json
    Check 'the choice is remembered' ($kept.effects -eq 'low' -and $kept.reason -eq 'manual' -and $kept.value -eq '0') "$($kept.effects)/$($kept.reason)"
    Set-EffectsLevel $page 'high' | Out-Null
    Start-Sleep -Milliseconds 1500
    $h = & $js $level | ConvertFrom-Json
    Check 'and back to High: the sky again' ($h.effects -eq 'high' -and $h.sky -and $h.look -eq '' -and $h.value -eq '2') "$($h.effects) sky=$($h.sky) look=$($h.look)"

    # A visit the frame monitor had to step down stays there for the tab.
    & $js "(() => { localStorage.removeItem('portfolio-effects-level'); sessionStorage.setItem('portfolio-effects-lag', 'low'); return 1; })()" | Out-Null
    Invoke-Page $page 'Page.reload' | Out-Null
    Wait-PageReady $page
    $slow = & $js $level | ConvertFrom-Json
    Check 'a slow visit reloads at the level it was stepped down to' ($slow.effects -eq 'low' -and $slow.reason -eq 'lag') "$($slow.effects)/$($slow.reason)"
    Set-EffectsLevel $page 'high' | Out-Null
    Start-Sleep -Milliseconds 300
    Check 'choosing a level by hand forgets it' ((& $js "sessionStorage.getItem('portfolio-effects-lag')") -eq $null -and (& $js "document.documentElement.dataset.effects") -eq 'high')
    & $js "(() => { localStorage.removeItem('portfolio-effects-level'); return 1; })()" | Out-Null

    # Everything the page logged or failed to load along the way.
    Clear-CdpEvents $page.Session -Keep '*'
    $events = @($page.Session.Events | Where-Object { $_ -is [System.Collections.IDictionary] })
    $exceptions = @($events | Where-Object { $_['method'] -eq 'Runtime.exceptionThrown' } | ForEach-Object { [string]$_['params']['exceptionDetails']['text'] + ' ' + [string]$_['params']['exceptionDetails']['exception']['description'] })
    $consoleErrors = @($events | Where-Object { $_['method'] -eq 'Runtime.consoleAPICalled' -and $_['params']['type'] -eq 'error' } | ForEach-Object { (@($_['params']['args']) | ForEach-Object { "$($_['value'])$($_['description'])" }) -join ' ' })
    $failed = @($events | Where-Object { $_['method'] -eq 'Network.loadingFailed' -and -not $_['params']['canceled'] })
    $requests = @{}; foreach ($e in $events | Where-Object { $_['method'] -eq 'Network.requestWillBeSent' }) { $requests[$e['params']['requestId']] = $e['params']['request']['url'] }
    $failedUrls = @($failed | ForEach-Object { $requests[$_['params']['requestId']] } | Where-Object { $_ -and $_ -notmatch 'youtube|ytimg|googlevideo|doubleclick|google' })
    $badStatus = @($events | Where-Object { $_['method'] -eq 'Network.responseReceived' -and [int]$_['params']['response']['status'] -ge 400 } | ForEach-Object { "$($_['params']['response']['status']) $($_['params']['response']['url'])" } | Where-Object { $_ -notmatch 'youtube|ytimg|googlevideo|google' })
    $detail = (@($exceptions) | Select-Object -First 3) -join ' | '
    Check 'no script errors' ($exceptions.Count -eq 0) $detail
    $detail = (@($consoleErrors) | Select-Object -First 3) -join ' | '
    Check 'no console errors' ($consoleErrors.Count -eq 0) $detail
    $detail = ((@($failedUrls) + @($badStatus)) | Select-Object -First 4) -join ' | '
    Check 'no failed requests' ($failedUrls.Count -eq 0 -and $badStatus.Count -eq 0) $detail
} finally {
    Stop-BenchChrome $chrome
}
$failures = @($results | Where-Object { -not $_.ok }).Count
Write-Host "$($results.Count - $failures) of $($results.Count) checks passed."
if ($failures) { exit 1 }
