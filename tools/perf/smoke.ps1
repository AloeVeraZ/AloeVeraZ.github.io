<#
  Clicks through the site the way a visitor would and checks that each thing
  still works. Exits 1 if any check fails.

    powershell -NoProfile -ExecutionPolicy Bypass -File tools/perf/smoke.ps1

  Checks: no script errors or failed requests (YouTube aside), every project
  rendered from portfolio-data.json, the nav links land on their sections, a
  project opens and closes (and the sky rests behind it and moves again
  after), a collection opens and its ring turns, the effects slider sets
  each of its three levels, shows no word and is remembered for the visit, a
  slow visit's lower level is kept for the tab and dropped by a choice on the
  slider, putting the level back up after a step down is counted and the
  third time stops the stepping, a level saved by an older version is
  forgotten, and the High FX sky and glass are running.
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

    $data = & $js "fetch('portfolio-data.json').then(r => r.json()).then(d => JSON.stringify({ projects: d.projects.length, featured: d.projects.filter(p => p.featured).length, collections: d.collections.length }))" | ConvertFrom-Json
    $cards = & $js "document.querySelectorAll('.project-card:not(.carousel-clone)').length"
    Check 'every project is rendered' ($cards -ge $data.projects) "$cards cards for $($data.projects) projects"
    Check 'featured row' ((& $js "document.querySelectorAll('#featured-projects-container .project-card').length") -eq [Math]::Min(3, $data.featured))
    Check 'one row per collection' ((& $js "document.querySelectorAll('.project-collection').length") -eq $data.collections)
    # The living sky (cosmos.js), which a machine with no graphics card goes without.
    $living = "(() => { const s = window.portfolioCosmos && window.portfolioCosmos.stats(); return !!s && s.shown && !document.querySelector('.cosmos').hidden; })()"
    $mode = & $js "JSON.stringify({ effects: document.documentElement.dataset.effects, glass: document.documentElement.dataset.glass, living: $living })" | ConvertFrom-Json
    Check 'starts in Medium FX, with its living sky where there is a graphics card' ($mode.effects -eq 'medium' -and $mode.living -eq (-not $Software)) "effects=$($mode.effects) glass=$($mode.glass) living=$($mode.living)"
    # The frame monitor steps a level down when this machine stutters, which
    # would move the levels these checks set out from under them. Told the
    # visitor has insisted three times, it leaves them be; the counting
    # itself is checked at the end.
    & $js "(() => { sessionStorage.setItem('portfolio-effects-overrides', '3'); return 1; })()" | Out-Null

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
        # closes: how many frames it has drawn, a moment apart. High is chosen
        # for this and forgotten again after.
        Set-EffectsLevel $page 'high' | Out-Null
        Start-Sleep -Milliseconds 1500
        $sky = "window.portfolioCosmos ? window.portfolioCosmos.stats().frames : -1"
        & $click '#featured-projects-container .project-card' 2
        Start-Sleep -Milliseconds 600
        $a = & $js $sky; Start-Sleep -Milliseconds 1200; $b = & $js $sky
        Check 'the sky rests behind an open project' ($a -eq $b)
        Send-Key $page 'Escape' 'Escape' 27
        Start-Sleep -Milliseconds 600
        $a = & $js $sky; Start-Sleep -Milliseconds 1200; $b = & $js $sky
        Check 'and moves again once it closes' ($a -ne $b)
        & $js "(() => { sessionStorage.removeItem('portfolio-effects-level'); return 1; })()" | Out-Null
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
    $level = "JSON.stringify({ effects: document.documentElement.dataset.effects, reason: document.documentElement.dataset.effectsReason, glass: document.documentElement.dataset.glass, sky: $living, look: document.querySelector('.background-grid').dataset.look || '', value: document.getElementById('fx-level').value })"
    Set-EffectsLevel $page 'medium' | Out-Null
    Start-Sleep -Milliseconds 900
    $m = & $js $level | ConvertFrom-Json
    Check 'the slider sets Medium: glass, and its living sky' ($m.effects -eq 'medium' -and $m.sky -eq (-not $Software) -and $m.look -eq 'medium' -and $m.value -eq '1') "$($m.effects) glass=$($m.glass) sky=$($m.sky)"
    Set-EffectsLevel $page 'low' | Out-Null
    Start-Sleep -Milliseconds 900
    $l = & $js $level | ConvertFrom-Json
    Check 'the slider sets Low: no sky, no frost' ($l.effects -eq 'low' -and -not $l.sky -and $l.glass -eq 'frost' -and $l.look -eq 'low' -and $l.value -eq '0') "$($l.effects) glass=$($l.glass)"
    # The hint a screen reader hears stays; nothing else may hold words.
    $words = & $js "(() => { const c = document.getElementById('fx-slider').cloneNode(true); c.querySelectorAll('.visually-hidden').forEach(e => e.remove()); return c.textContent.trim(); })()"
    Check 'the slider shows no word for its level' (-not $words) $words
    Invoke-PageJs $page '(window.__stale = 1)' | Out-Null; Invoke-Page $page 'Page.reload' | Out-Null; $fresh = 0; while ((Invoke-PageJs $page '!!window.__stale') -and $fresh -lt 100) { Start-Sleep -Milliseconds 100; $fresh++ }
    Wait-PageReady $page
    $kept = & $js $level | ConvertFrom-Json
    Check 'the choice is kept for the visit' ($kept.effects -eq 'low' -and $kept.reason -eq 'manual' -and $kept.value -eq '0') "$($kept.effects)/$($kept.reason)"
    Set-EffectsLevel $page 'high' | Out-Null
    # The living sky is fetched and built on the side; it is up within a few seconds.
    $polls = 0
    # Without graphics there is no sky to wait for, but the level itself goes up inside its
    # transition, which such a machine is slow to start.
    do { Start-Sleep -Milliseconds 500; $h = & $js $level | ConvertFrom-Json; $polls++ } while (($h.effects -ne 'high' -or (-not $h.sky -and -not $Software)) -and $polls -lt 11)
    Check 'and back to High: the sky again' ($h.effects -eq 'high' -and $h.sky -eq (-not $Software) -and $h.look -eq 'high' -and $h.value -eq '2') "$($h.effects) sky=$($h.sky) look=$($h.look)"

    # A visit the frame monitor had to step down stays there for the tab.
    # Chosen first and stepped down after: the step down is the later word.
    & $js "(() => { sessionStorage.setItem('portfolio-effects-level', 'high'); sessionStorage.setItem('portfolio-effects-lag', 'low'); return 1; })()" | Out-Null
    Invoke-PageJs $page '(window.__stale = 1)' | Out-Null; Invoke-Page $page 'Page.reload' | Out-Null; $fresh = 0; while ((Invoke-PageJs $page '!!window.__stale') -and $fresh -lt 100) { Start-Sleep -Milliseconds 100; $fresh++ }
    Wait-PageReady $page
    $slow = & $js $level | ConvertFrom-Json
    Check 'a slow visit reloads at the level it was stepped down to' ($slow.effects -eq 'low' -and $slow.reason -eq 'lag') "$($slow.effects)/$($slow.reason)"
    Set-EffectsLevel $page 'high' | Out-Null
    # The level is put up inside its transition, which a machine with no graphics is slow to start.
    $polls = 0
    while ((& $js "document.documentElement.dataset.effects") -ne 'high' -and $polls -lt 30) { Start-Sleep -Milliseconds 100; $polls++ }
    Check 'choosing a level by hand forgets it' ((& $js "sessionStorage.getItem('portfolio-effects-lag')") -eq $null -and (& $js "document.documentElement.dataset.effects") -eq 'high')

    # Putting the level back up after the page stepped it down is counted;
    # moving it up when the page had not is not. The third time, the page
    # stops stepping it down for the rest of the visit.
    $overrides = { & $js "sessionStorage.getItem('portfolio-effects-overrides')" }
    # The page puts a chosen level up inside its transition, and stores it again then: storage
    # written by the test before that lands is overwritten by it. So wait for it before a reload.
    $landed = { param($want)
        $polls = 0
        while (((& $js "document.documentElement.dataset.effects") -ne $want -or (& $js "'shift' in document.documentElement.dataset")) -and $polls -lt 40) { Start-Sleep -Milliseconds 100; $polls++ }
    }
    & $js "(() => { ['portfolio-effects-level', 'portfolio-effects-lag', 'portfolio-effects-overrides'].forEach(k => sessionStorage.removeItem(k)); return 1; })()" | Out-Null
    Invoke-PageJs $page '(window.__stale = 1)' | Out-Null; Invoke-Page $page 'Page.reload' | Out-Null; $fresh = 0; while ((Invoke-PageJs $page '!!window.__stale') -and $fresh -lt 100) { Start-Sleep -Milliseconds 100; $fresh++ }
    Wait-PageReady $page
    $fresh = & $js $level | ConvertFrom-Json
    Set-EffectsLevel $page 'high' | Out-Null
    & $landed 'high'
    Check 'a fresh visit starts Medium, and moving up unprompted is not counted' ($fresh.effects -eq 'medium' -and $fresh.reason -eq 'default' -and $null -eq (& $overrides)) "$($fresh.effects)/$($fresh.reason) overrides=$(& $overrides)"
    & $js "(() => { sessionStorage.setItem('portfolio-effects-lag', 'medium'); return 1; })()" | Out-Null
    Invoke-PageJs $page '(window.__stale = 1)' | Out-Null; Invoke-Page $page 'Page.reload' | Out-Null; $fresh = 0; while ((Invoke-PageJs $page '!!window.__stale') -and $fresh -lt 100) { Start-Sleep -Milliseconds 100; $fresh++ }
    Wait-PageReady $page
    Set-EffectsLevel $page 'high' | Out-Null
    & $landed 'high'
    Check 'moving it back up after a step down is counted' ((& $overrides) -eq '1') "overrides=$(& $overrides)"
    & $js "(() => { sessionStorage.setItem('portfolio-effects-overrides', '2'); sessionStorage.setItem('portfolio-effects-lag', 'low'); return 1; })()" | Out-Null
    Invoke-PageJs $page '(window.__stale = 1)' | Out-Null; Invoke-Page $page 'Page.reload' | Out-Null; $fresh = 0; while ((Invoke-PageJs $page '!!window.__stale') -and $fresh -lt 100) { Start-Sleep -Milliseconds 100; $fresh++ }
    Wait-PageReady $page
    Set-EffectsLevel $page 'medium' | Out-Null
    # The level is put up inside its transition, a frame later or more.
    $polls = 0
    while ((& $js "document.documentElement.dataset.effects") -ne 'medium' -and $polls -lt 30) { Start-Sleep -Milliseconds 100; $polls++ }
    Check 'the third time holds the level for the visit' ((& $overrides) -eq '3' -and (& $js "document.documentElement.dataset.effects") -eq 'medium') "overrides=$(& $overrides)"

    # A level an older version of the site saved for every visit is cleared.
    & $js "(() => { localStorage.setItem('portfolio-effects-level', 'high'); ['portfolio-effects-level', 'portfolio-effects-lag', 'portfolio-effects-overrides'].forEach(k => sessionStorage.removeItem(k)); return 1; })()" | Out-Null
    Invoke-PageJs $page '(window.__stale = 1)' | Out-Null; Invoke-Page $page 'Page.reload' | Out-Null; $fresh = 0; while ((Invoke-PageJs $page '!!window.__stale') -and $fresh -lt 100) { Start-Sleep -Milliseconds 100; $fresh++ }
    Wait-PageReady $page
    $old = & $js $level | ConvertFrom-Json
    Check 'a level saved across visits by an older version is forgotten' ($old.effects -eq 'medium' -and $null -eq (& $js "localStorage.getItem('portfolio-effects-level')")) "$($old.effects)/$($old.reason)"

    # The other skies: two quick presses on a stop go round them, not one press and not
    # two slow ones, fetching nothing until then. Leaving a level hands everything back,
    # and a reload forgets it all.
    & $js "(() => { ['portfolio-effects-level', 'portfolio-effects-lag'].forEach(k => sessionStorage.removeItem(k)); sessionStorage.setItem('portfolio-effects-overrides', '3'); return 1; })()" | Out-Null
    Invoke-PageJs $page '(window.__stale = 1)' | Out-Null; Invoke-Page $page 'Page.reload' | Out-Null; $fresh = 0; while ((Invoke-PageJs $page '!!window.__stale') -and $fresh -lt 100) { Start-Sleep -Milliseconds 100; $fresh++ }
    Wait-PageReady $page
    Start-Sleep -Seconds 1
    $skyFiles = { & $js "performance.getEntriesByType('resource').filter(e => /\/(y2k|iris|vapor|ego)\.(js|css)/.test(e.name)).map(e => e.name.split('/').pop().split('?')[0]).sort().join(',')" }
    $look = { & $js "['y2k', 'iris', 'vapor', 'ego'].filter(n => document.documentElement.hasAttribute('data-' + n)).join(',')" }
    $waitFor = { param($name)
        $waited = 0
        while ((& $look) -ne $name -and $waited -lt 60) { Start-Sleep -Milliseconds 250; $waited++ }
        ($waited * 250)
    }
    $stopAt = { param($i) & $js "(() => { const b = document.querySelectorAll('.fx-slider-stop')[$i].getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()" }
    $presses = { param($i, $times, $gap)
        $at = & $stopAt $i
        for ($n = 0; $n -lt $times; $n++) {
            Send-Mouse $page 'mouseMoved' $at[0] $at[1]
            Send-Mouse $page 'mousePressed' $at[0] $at[1] 'left' 1 1
            Send-Mouse $page 'mouseReleased' $at[0] $at[1] 'left' 0 1
            Start-Sleep -Milliseconds $gap
        }
    }
    # Two presses that go round the looks. With no graphics the page answers so slowly
    # that presses sent one at a time arrive further apart than any hand's, so there
    # they are handed to the slider together.
    $twice = { param($i)
        if (-not $Software) { & $presses $i 2 90; return }
        & $js "(() => { const s = document.getElementById('fx-slider'), b = document.querySelectorAll('.fx-slider-stop')[$i].getBoundingClientRect(), x = b.left + b.width / 2, y = b.top + b.height / 2; for (let n = 0; n < 2; n++) for (const type of ['pointerdown', 'pointerup']) s.dispatchEvent(new PointerEvent(type, { bubbles: true, isPrimary: true, button: 0, pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y })); return 1; })()" | Out-Null
    }
    & $presses 0 1 90
    Start-Sleep -Milliseconds 900
    Check 'one press on Low leaves every other sky unfetched' ((& $look) -eq '' -and (& $skyFiles) -eq '')
    & $presses 0 2 650
    Start-Sleep -Milliseconds 800
    Check 'two presses more than half a second apart do nothing' ((& $look) -eq '' -and (& $skyFiles) -eq '')
    & $twice 0
    # A hand that keeps going, into the moment it takes to get ready. With no graphics a
    # press can arrive long after it was sent, past the moment the page stops counting a
    # hand that keeps going, and that hand is not one anyone has.
    if (-not $Software) { & $presses 0 1 90 }
    $waited = & $waitFor 'y2k'
    $eye = & $js "(() => { const c = document.querySelector('.y2k-eye'); return !!c && getComputedStyle(c).imageRendering === 'pixelated'; })()"
    Check 'two quick presses on Low bring up its eye, and one more does not move it on' ((& $look) -eq 'y2k' -and $eye) "$waited ms after the last press"
    Start-Sleep -Seconds 3
    $files = & $skyFiles
    Check 'and every look is fetched, ready for a switch' ($files -eq 'ego.css,ego.js,iris.css,iris.js,vapor.css,vapor.js,y2k.css,y2k.js') $files
    & $twice 0
    # Its way out takes a second or so (portfolio.js, warp).
    Start-Sleep -Milliseconds 300
    $polls = 0
    while ((& $js "'warp' in document.documentElement.dataset") -and $polls -lt 60) { Start-Sleep -Milliseconds 100; $polls++ }
    Check 'two more on Low put it away' ((& $look) -eq '' -and -not (& $js "!!document.querySelector('.y2k-eye')"))
    Start-Sleep -Seconds 1
    & $twice 0
    $waited = & $waitFor 'y2k'
    Check 'and two more bring it back' ((& $look) -eq 'y2k') "$waited ms after the last press"
    Start-Sleep -Seconds 1
    Set-EffectsLevel $page 'medium' | Out-Null
    $waited = & $waitFor 'iris'
    Check 'going up to Medium the eye stays on, as Medium''s own' ((& $look) -eq 'iris' -and (& $js "!!document.querySelector('.iris-eye') && !document.querySelector('.y2k-eye')")) "$waited ms"
    Start-Sleep -Seconds 3
    & $twice 1
    $waited = & $waitFor 'vapor'
    Start-Sleep -Milliseconds 800
    Check 'two presses on Medium bring up its desk, last of all' ((& $look) -eq 'vapor' -and -not (& $js "!!document.querySelector('.iris-eye')") -and (& $js "document.querySelectorAll('.vapor-win:not(.vapor-note)').length === 4")) "$waited ms after the last press"
    Start-Sleep -Seconds 3
    Set-EffectsLevel $page 'high' | Out-Null
    $waited = & $waitFor 'ego'
    Check 'High has no desk, so it goes to the eye that was on' ((& $look) -eq 'ego' -and (& $js "!!document.querySelector('.ego-scene') && !document.querySelector('.vapor-desk')")) "$waited ms"
    $sky = & $js "JSON.stringify({ space: $living, glass: document.documentElement.dataset.glass, bend: getComputedStyle(document.querySelector('.about-highlight')).backdropFilter !== 'none' })" | ConvertFrom-Json
    Check 'the space sky is put away and the glass is left as it was' (-not $sky.space -and $sky.bend) "space sky $($sky.space), glass=$($sky.glass)"
    # It builds itself for a few seconds first, and pays no mind to presses until it is whole
    # and awake (ego.js marks it).
    $polls = 0
    while (-not (& $js "!!document.querySelector('.ego-scene[data-awake]')") -and $polls -lt 120) { Start-Sleep -Milliseconds 100; $polls++ }
    Start-Sleep -Milliseconds 300
    # Pressed twice on an empty part of the page, it fixes on the cursor.
    $empty = & $js "[innerWidth * .62, innerHeight * .2]"
    Check 'the eye does not start out following' (-not (& $js "'following' in document.querySelector('.ego-scene').dataset"))
    if ($Software) {
        & $js "(() => { const t = document.elementFromPoint(innerWidth * .62, innerHeight * .2); for (let n = 0; n < 2; n++) t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, pointerType: 'mouse', clientX: innerWidth * .62, clientY: innerHeight * .2 })); return 1; })()" | Out-Null
    } else {
        foreach ($n in 1, 2) {
            Send-Mouse $page 'mouseMoved' $empty[0] $empty[1]
            Send-Mouse $page 'mousePressed' $empty[0] $empty[1] 'left' 1 1
            Send-Mouse $page 'mouseReleased' $empty[0] $empty[1] 'left' 0 1
        }
    }
    Start-Sleep -Milliseconds 700
    Check 'two presses on it make it follow the cursor' (& $js "'following' in document.querySelector('.ego-scene').dataset")
    Start-Sleep -Seconds 3
    Set-EffectsLevel $page 'medium' | Out-Null
    $waited = & $waitFor 'vapor'
    Check 'coming back to Medium brings its desk back' ((& $look) -eq 'vapor' -and -not (& $js "!!document.querySelector('.ego-scene')")) "$waited ms"
    Start-Sleep -Seconds 2
    Set-EffectsLevel $page 'low' | Out-Null
    $waited = & $waitFor 'y2k'
    Check 'and Low goes to the eye too' ((& $look) -eq 'y2k' -and -not (& $js "!!document.querySelector('.vapor-desk')")) "$waited ms"
    Start-Sleep -Seconds 1
    Set-EffectsLevel $page 'medium' | Out-Null
    $waited = & $waitFor 'vapor'
    # Once the crossfade has played: the page is at its busiest during it, and a
    # press answered more than 400 ms after the last starts the count again.
    Start-Sleep -Seconds 3
    & $twice 1
    $waited = & $waitFor ''
    $stillBack = { & $js "!!document.querySelector('.background-grid').style.getPropertyValue('--still-sky') && !document.querySelector('.vapor-desk')" }
    $polls = 0
    while (-not (& $stillBack) -and $polls -lt 40) { Start-Sleep -Milliseconds 250; $polls++ }
    Check 'two more on Medium put its still sky back' ((& $look) -eq '' -and (& $stillBack)) "$($polls * 250) ms after the swap"
    Set-EffectsLevel $page 'high' | Out-Null
    # Building the stars again takes a machine with no graphics a while.
    $polls = 0
    while (-not $Software -and -not (& $js $living) -and $polls -lt 60) { Start-Sleep -Milliseconds 250; $polls++ }
    $space = & $js "JSON.stringify({ scene: !!document.querySelector('.ego-scene'), space: $living })" | ConvertFrom-Json
    Check 'and going up to High it is on the stars there too' ((& $look) -eq '' -and -not $space.scene -and $space.space -eq (-not $Software)) "space sky $($space.space)"
    Start-Sleep -Seconds 1
    & $twice 2
    $waited = & $waitFor 'ego'
    Check 'two presses work on High as well' ((& $look) -eq 'ego') "$waited ms after the last press"
    Start-Sleep -Seconds 3
    Set-EffectsLevel $page 'low' | Out-Null
    $waited = & $waitFor 'y2k'
    Start-Sleep -Seconds 1
    & $twice 0
    Start-Sleep -Milliseconds 500
    Set-EffectsLevel $page 'high' | Out-Null
    $polls = 0
    while (-not $Software -and -not (& $js $living) -and $polls -lt 60) { Start-Sleep -Milliseconds 250; $polls++ }
    Check 'turned off on Low it is off at High' ((& $look) -eq '' -and (& $js $living) -eq (-not $Software))
    Start-Sleep -Seconds 1
    & $twice 2
    $waited = & $waitFor 'ego'
    Start-Sleep -Seconds 2
    Invoke-PageJs $page '(window.__stale = 1)' | Out-Null; Invoke-Page $page 'Page.reload' | Out-Null; $fresh = 0; while ((Invoke-PageJs $page '!!window.__stale') -and $fresh -lt 100) { Start-Sleep -Milliseconds 100; $fresh++ }
    Wait-PageReady $page
    Start-Sleep -Seconds 1
    Check 'a reload goes back to the default look' ((& $look) -eq '' -and (& $skyFiles) -eq '')
    Start-Sleep -Seconds 1
    & $twice 2
    $waited = & $waitFor 'ego'
    Check 'and two presses find them again' ((& $look) -eq 'ego') "$waited ms after the last press"
    # Every switch plays a transition, never a cut. The eye's own warp in is let finish first:
    # a switch made while one plays goes straight through.
    $polls = 0
    while ((& $js "'warp' in document.documentElement.dataset") -and $polls -lt 60) { Start-Sleep -Milliseconds 100; $polls++ }
    Start-Sleep -Seconds 1
    & $js "(() => { window.__shifts = []; new MutationObserver(() => { const k = document.documentElement.dataset.shift; const w = document.documentElement.dataset.warp; if (k) window.__shifts.push(k); if (w) window.__shifts.push('warp-' + w); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-shift', 'data-warp'] }); return 1; })()" | Out-Null
    & $twice 2
    # Putting the eye away builds High's sky again inside that transition, which takes a while,
    # and a change made while one is playing goes straight through without one of its own.
    $polls = 0
    while ((& $js "'shift' in document.documentElement.dataset || 'warp' in document.documentElement.dataset") -and $polls -lt 60) { Start-Sleep -Milliseconds 100; $polls++ }
    Start-Sleep -Milliseconds 300
    Set-EffectsLevel $page 'low' | Out-Null
    Start-Sleep -Seconds 1
    $shifts = & $js "window.__shifts.join(',')"
    Check 'switching looks and levels plays a transition each time' ($Software -or ($shifts -match 'warp-high' -and $shifts -match 'fall')) $shifts

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
