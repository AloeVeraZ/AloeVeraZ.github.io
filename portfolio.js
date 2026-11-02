// This file's own version (its ?v=), for the file it fetches later.
const PORTFOLIO_SCRIPT_QUERY = document.currentScript?.src ? new URL(document.currentScript.src).search : '';

// What the page asks WebGL for when it wants to know what it is drawing on (see
// askAboutGraphics): a context that fails rather than run in software.
const GRAPHICS_QUESTION = { powerPreference: 'low-power', failIfMajorPerformanceCaveat: true };

function setupResponsiveEnvironment() {
    const root = document.documentElement;
    const media = {
        coarsePointer: window.matchMedia('(pointer: coarse)'),
        finePointer: window.matchMedia('(pointer: fine)'),
        hover: window.matchMedia('(hover: hover)'),
        portrait: window.matchMedia('(orientation: portrait)'),
        folded: window.matchMedia('(device-posture: folded)'),
        continuous: window.matchMedia('(device-posture: continuous)'),
        horizontalSegments: window.matchMedia('(horizontal-viewport-segments: 2)'),
        verticalSegments: window.matchMedia('(vertical-viewport-segments: 2)')
    };

    // Only an open project reads the window's height, so it goes on the project's
    // overlay. On the root, every change of it -- a phone's toolbars sliding away,
    // the page's own first call -- had the browser restyle the whole page.
    const modal = document.getElementById('project-modal');
    const update = () => {
        const input = media.coarsePointer.matches && !media.hover.matches
            ? 'touch'
            : media.finePointer.matches && media.hover.matches
                ? 'precise'
                : 'mixed';
        const posture = media.folded.matches
            ? 'folded'
            : media.continuous.matches
                ? 'continuous'
                : 'unknown';
        const segments = media.horizontalSegments.matches
            ? 'horizontal-2'
            : media.verticalSegments.matches
                ? 'vertical-2'
                : 'single';

        // Written before anything below reads the page's size: a read has the
        // browser work out the page's style, and a change to the root after it
        // has it do so again. (The tier and the orientation are read by nothing
        // in the stylesheets, so they change nothing whenever they are written.)
        root.dataset.primaryInput = input;
        root.dataset.orientation = media.portrait.matches ? 'portrait' : 'landscape';
        root.dataset.devicePosture = posture;
        root.dataset.viewportSegments = segments;
        // CSS pixels already account for OS scale, browser zoom, and display
        // density. Classify the space the page actually owns instead of trying
        // to infer physical resolution from screen or browser-frame dimensions.
        const width = root.clientWidth || window.innerWidth;
        const visualHeight = window.visualViewport?.height || window.innerHeight;
        root.dataset.viewportTier = width < 360
            ? 'micro'
            : width < 640
                ? 'compact'
                : width < 1008
                    ? 'medium'
                    : width < 1600
                        ? 'large'
                        : width < 2560
                            ? 'wide'
                            : 'ultrawide';
        modal?.style.setProperty('--visual-viewport-height', `${Math.max(Math.round(visualHeight), 1)}px`);
    };

    Object.values(media).forEach(query => query.addEventListener?.('change', update));
    window.addEventListener('resize', update, { passive: true });
    window.addEventListener('orientationchange', update, { passive: true });
    window.visualViewport?.addEventListener('resize', update, { passive: true });
    update();
}

document.addEventListener('DOMContentLoaded', () => {
    setupResponsiveEnvironment();

    const backgroundGrid = document.createElement('div');
    backgroundGrid.className = 'background-grid';
    backgroundGrid.setAttribute('aria-hidden', 'true');
    const galaxyField = document.createElement('canvas');
    galaxyField.className = 'galaxy-field';
    galaxyField.setAttribute('aria-hidden', 'true');
    const galaxyNebula = document.createElement('div');
    galaxyNebula.className = 'galaxy-nebula';
    galaxyNebula.setAttribute('aria-hidden', 'true');
    document.body.prepend(backgroundGrid);
    backgroundGrid.after(galaxyField);
    galaxyField.after(galaxyNebula);
    const pageScrollProgress = document.createElement('div');
    pageScrollProgress.className = 'page-scroll-progress';
    pageScrollProgress.setAttribute('aria-hidden', 'true');
    pageScrollProgress.innerHTML = '<span class="page-scroll-track"><i class="page-scroll-fill"></i></span>';
    galaxyNebula.after(pageScrollProgress);
    const cursorDot = document.createElement('span');
    cursorDot.className = 'cursor-dot';
    cursorDot.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cursorDot);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const galaxy = setupDeferredGalaxy(galaxyField, reducedMotion);
    const stillSky = setupStillSky(backgroundGrid);
    const cursor = setupCursorEffects(cursorDot, reducedMotion);
    setupPointerReactiveSurfaces(reducedMotion);
    setupSteadyLift();
    // ---- Effects levels -------------------------------------------------
    // Three, chosen on the slider in the bar, left to right:
    //
    //   low     the lattice on its own under clear glass, and nothing moves
    //           that need not
    //   medium  a still sky under the lattice (setupStillSky), painted once,
    //           and the cards leaning toward the cursor, its light on them
    //           and the rings turning
    //   high    the sky alive behind glass that frosts and bends what is
    //           behind it, and the cursor's own light
    //
    // The level is decided before the first paint by the script in
    // index.html's head and written to html[data-effects], with the reason
    // in data-effects-reason: 'manual' for a level the visitor chose,
    // 'default' for the Medium every visit starts at, 'lag' for one the page
    // had to step down to. It is read back from there.
    const EFFECT_LEVELS = ['low', 'medium', 'high'];
    const EFFECT_NAMES = { low: 'Low', medium: 'Medium', high: 'High' };
    // A level chosen on the slider, for the rest of the tab's life (the head
    // script reads this). A fresh visit starts at Medium again.
    const levelStorageKey = 'portfolio-effects-level';
    // A visit that had to step down for being slow keeps the lower level for
    // the rest of the tab's life too. A reload, or a trip to the policy pages
    // and back, used to start High FX all over again on the machine that had
    // just shown it could not keep up, and the reader sat through the same
    // seconds of stutter before the monitor below stepped in again.
    const lagStorageKey = 'portfolio-effects-lag';
    // How many times this visit the visitor has put the level back up after
    // the page stepped it down. The third time, the page takes the hint and
    // stops stepping it down for the rest of the visit.
    const overrideStorageKey = 'portfolio-effects-overrides';
    const OVERRIDES_BEFORE_HOLD = 3;
    const storeEffects = (area, key, value) => {
        try {
            if (value) window[area].setItem(key, value);
            else window[area].removeItem(key);
        } catch (error) {
            // Storage can be blocked (private windows, strict settings). The
            // level still applies; it is only forgotten sooner.
        }
    };
    const root = document.documentElement;
    let effectsMode = EFFECT_LEVELS.includes(root.dataset.effects) ? root.dataset.effects : 'medium';
    let effectsReason = ['manual', 'lag', 'default'].includes(root.dataset.effectsReason)
        ? root.dataset.effectsReason : 'default';
    let overrides = 0;
    try {
        overrides = Math.min(Number(sessionStorage.getItem(overrideStorageKey)) || 0, OVERRIDES_BEFORE_HOLD);
    } catch (error) {
        overrides = 0;
    }
    // Whether the page has stepped the level down since the visitor last put
    // it up; a reload after a step down still counts.
    let pageLowered = effectsReason === 'lag';
    const logicalCores = navigator.hardwareConcurrency || 4;
    const deviceMemory = navigator.deviceMemory || 0;
    // The level is stepped down, one stop at a time, as soon as it turns
    // clunky: two seconds in a row where the typical frame runs at 30fps or
    // worse, or where a quarter of the frames stutter -- High to Medium, which
    // puts the sky away and keeps the glass, and Medium to Low. A lone spike
    // -- a GC pause, a collection opening -- is neither, so it never costs
    // anyone a level. Seconds are only measured while the page is visible,
    // focused and settled, so the hitches every machine produces at first
    // paint, when a tab comes back or when a window is resized are never
    // scored either. A level the visitor chose is stepped down the same way,
    // until they have put it back up three times (OVERRIDES_BEFORE_HOLD):
    // from then on it is theirs for the rest of the visit.
    const PERFORMANCE_WINDOW_MS = 1000;
    const PERFORMANCE_WARMUP_MS = 4000;
    const PERFORMANCE_RESUME_DELAY_MS = 2000;
    const MIN_SMOOTH_FPS = 33;
    const CLUNKY_WINDOWS_BEFORE_DOWNGRADE = 2;
    // The steps before that, each taken after two strained seconds running:
    // first the sky is slowed rather than switched off, then the glass stops
    // bending the light at its rim and keeps only its frost -- the frost is
    // most of what it looks like -- and the sky is drawn at CSS-pixel
    // resolution rather than 1.25x. A page is strained when it runs steadily
    // under fifty frames a second, or when it keeps missing frames: one in
    // ten late by a display frame or more is a page that visibly hitches
    // while it scrolls, however good its average. That is what a laptop with
    // other work on it looks like, and it used to pass as smooth. Slowing the
    // sky changes how often it is drawn and nothing in it, so it is the one
    // step still taken once the visitor has insisted on High.
    const MIN_STEADY_FPS = 50;
    const STRAINED_WINDOWS_BEFORE_EASING = 2;
    const MISSED_FRAME_SHARE = .1;
    // And a floor under all of it: a page crawling along at ten frames a
    // second or worse for five seconds running steps down a level at once,
    // whatever easing it has reached. Those seconds count across the easing
    // -- easing the sky does not start them over -- so nobody sits through a
    // slideshow while the page tries its gentler options one by one. A new
    // level gets five seconds of its own before it is judged crawling too.
    const CRAWLING_FPS = 12;
    const CRAWLING_MS = 5000;
    // The monitor measures by asking for every display frame, and a page that
    // asks for every frame keeps the machine awake whether or not it draws
    // anything in them. So it watches while the page is in use -- a cursor
    // moving, a page scrolling, a key or a finger down, which is also when
    // the page is working hardest -- and for a moment after, and otherwise
    // looks in for a second at a time every few seconds. A second's window
    // is filled from those looks, however far apart they are.
    const PERFORMANCE_WATCH_AFTER_INPUT_MS = 1500;
    const PERFORMANCE_SPOT_EVERY_MS = 8000;
    const PERFORMANCE_SPOT_MS = 1300;
    let performanceMonitorFrame = 0;
    let performanceMonitorLastFrame = 0;
    let performanceWindowSampled = 0;
    let performanceWatchUntil = 0;
    let performanceSpotTimer = 0;
    const performanceMonitorFrameTimes = [];
    let performanceSamplingResumesAt = 0;
    let clunkyWindows = 0;
    // When the current run of crawling seconds began, by the clock.
    let crawlingSince = 0;
    let crawlingWindows = 0;
    let strainedWindows = 0;
    let skyEased = false;
    let glassEased = false;
    // Set once the page is as low as the monitor will take it.
    let monitorDone = false;
    let backgroundIdleTimer = 0;
    let backgroundFadeTimer = 0;

    const clearBackgroundIdleTimer = () => {
        if (backgroundIdleTimer) window.clearTimeout(backgroundIdleTimer);
        if (backgroundFadeTimer) window.clearTimeout(backgroundFadeTimer);
        backgroundIdleTimer = 0;
        backgroundFadeTimer = 0;
    };

    // The backdrop used to put itself out whenever nothing was happening: 2.6s
    // after the cursor stopped, and on its own clock after a click -- lit for a
    // second, then three and a half seconds down to nothing. Pressing a
    // collection row ran that whole cycle, so opening one lit the sky up and
    // pressing again took it away, which reads as the background answering the
    // panel rather than sitting behind it. It holds one brightness now. The
    // only thing that still darkens it is the tab going away, where there is
    // nobody to see it and parking the render loop costs nothing.
    const wakeEffectsBackground = () => {
        const root = document.documentElement;
        // Touching classList on every pointermove churns style + observers for
        // no reason; only clear the state when it is actually set.
        if (root.classList.contains('effects-background-idle') || root.classList.contains('effects-background-click-fading')) {
            root.classList.remove('effects-background-idle', 'effects-background-click-fading');
        }
        clearBackgroundIdleTimer();
    };

    document.documentElement.dataset.effectsHardware = `${logicalCores}-threads-${deviceMemory || 'unknown'}gb`;

    const resetPerformanceWindow = timestamp => {
        performanceWindowSampled = 0;
        performanceMonitorLastFrame = timestamp;
        performanceMonitorFrameTimes.length = 0;
    };

    // Pause sampling for a moment after anything that stalls rAF by itself:
    // page load, tab switches, window resizes. The catch-up frames afterwards
    // look exactly like jank but say nothing about how the page really runs.
    const deferPerformanceSampling = (delay, timestamp = performance.now()) => {
        clunkyWindows = 0;
        strainedWindows = 0;
        performanceSamplingResumesAt = Math.max(performanceSamplingResumesAt, timestamp + delay);
        resetPerformanceWindow(timestamp);
    };

    // The frame time a given share of the samples come in under: .5 is the
    // median, .25 the quickest quarter.
    const frameTimeAt = (samples, share) => {
        const sorted = [...samples].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length * share)] || 16.7;
    };

    // Whether the page may still step the level down this visit.
    const mayStepDown = () => overrides < OVERRIDES_BEFORE_HOLD;
    // Nothing left to decide: the page is in Low FX, the call has already
    // been made, or the visitor has insisted on their level and there is
    // nothing left the monitor may do under it (slowing a High FX sky, once).
    // The loop below asks for a frame every frame for as long as it runs,
    // which in Low and Medium FX would be the only thing left on the page
    // still asking -- no sky is drawn there -- and a page that asks for a
    // frame it does nothing with keeps the machine awake for no one. It is
    // started again by whatever could change the answer.
    const monitorIdle = () => monitorDone || effectsMode === 'low'
        || (!mayStepDown() && (effectsMode !== 'high' || skyEased));
    // One stop down: High to Medium, Medium to Low. Each level gets a clean
    // look of its own, crawling seconds included, before it is judged.
    const stepDown = timestamp => {
        const lower = effectsMode === 'high' ? 'medium' : 'low';
        if (lower === 'low') monitorDone = true;
        crawlingSince = 0;
        crawlingWindows = 0;
        applyEffectsMode(lower, false, 'lag');
        deferPerformanceSampling(PERFORMANCE_RESUME_DELAY_MS, timestamp);
    };
    // Frames are timed by when they actually run, not by the time the browser
    // stamps on them. A frame held up by the page is stamped with the time it
    // was due, and the one after it with the next -- measured by the stamps,
    // a page that stalls for twenty milliseconds in every fourth frame runs
    // at a flawless sixty, while on the screen every fourth frame is late.
    const monitorPerformance = () => {
        const timestamp = performance.now();
        performanceMonitorFrame = 0;
        if (monitorIdle()) return;
        // Nothing to watch: nap until the next look or the next input.
        if (performance.now() > performanceWatchUntil) {
            schedulePerformanceSpot();
            return;
        }
        performanceMonitorFrame = requestAnimationFrame(monitorPerformance);
        // An unfocused window still reports visibilityState 'visible', but the
        // browser suspends rAF for it. Sampling then measures the suspension,
        // not our rendering cost.
        if (document.hidden
            || !document.hasFocus()
            || timestamp < performanceSamplingResumesAt) {
            resetPerformanceWindow(timestamp);
            return;
        }

        // The first frame after a nap: the gap before it was the nap, not a
        // frame, and is not scored as one.
        if (!performanceMonitorLastFrame) {
            performanceMonitorLastFrame = timestamp;
            return;
        }
        const frameTime = timestamp - performanceMonitorLastFrame;
        performanceMonitorLastFrame = timestamp;
        // A long gap is the browser suspending rAF (backgrounded, power saving,
        // another app hogging the GPU), not this page rendering slowly. Let it
        // settle instead of scoring the recovery frames.
        if (frameTime > 400) {
            deferPerformanceSampling(PERFORMANCE_RESUME_DELAY_MS, timestamp);
            return;
        }
        performanceMonitorFrameTimes.push(frameTime);
        performanceWindowSampled += frameTime;
        if (performanceWindowSampled < PERFORMANCE_WINDOW_MS) return;

        const frames = performanceMonitorFrameTimes.length;
        const sampledTime = performanceWindowSampled;
        // Judged by the quicker frames, not the average: if even the quickest
        // quarter of a second's frames take longer than a 30fps frame, the
        // page itself is slow, while a lone spike that drags an average down
        // never touches them. Stutter is measured against the display's own
        // cadence, the median frame (16.7ms at 60Hz, 6.9ms at 144Hz): a frame
        // counts as long when it takes three of those or more.
        const quickFrameTime = frameTimeAt(performanceMonitorFrameTimes, .25);
        const longFrameLimit = Math.max(frameTimeAt(performanceMonitorFrameTimes, .5) * 3, 50);
        let longFrames = 0;
        for (const sample of performanceMonitorFrameTimes) {
            if (sample > longFrameLimit) longFrames += 1;
        }
        const clunky = quickFrameTime > 1000 / MIN_SMOOTH_FPS
            || longFrames / Math.max(frames, 1) > .25;
        // A lighter test, for a page that is not falling apart but is not
        // keeping up either: half its frames miss a fifty-frame pace, one in
        // eight stutters, or one in ten comes a display frame or more late.
        // That is what a sky redrawn at sixty behind a screen of frosted glass
        // looks like on a laptop that can almost manage it, or that has other
        // work on it -- never clunky enough to lose High FX, never smooth.
        const medianFrameTime = frameTimeAt(performanceMonitorFrameTimes, .5);
        let missedFrames = 0;
        for (const sample of performanceMonitorFrameTimes) {
            if (sample > medianFrameTime * 1.5) missedFrames += 1;
        }
        const strained = clunky
            || medianFrameTime > 1000 / MIN_STEADY_FPS
            || longFrames / Math.max(frames, 1) > .12
            || missedFrames / Math.max(frames, 1) > MISSED_FRAME_SHARE;
        resetPerformanceWindow(timestamp);

        // Seconds actually sampled, so a window filled from short looks is
        // judged by the frames in it, not by the time between the looks.
        // The five seconds are counted by the clock, so the pauses the page
        // takes to settle after each gentler step count toward them too.
        const crawling = frames / Math.max(sampledTime, 1) * 1000 <= CRAWLING_FPS;
        // At least three of those seconds actually measured, so two brief
        // looks eight seconds apart cannot make the call on their own.
        if (!crawling) { crawlingSince = 0; crawlingWindows = 0; }
        else {
            if (!crawlingSince) crawlingSince = timestamp - sampledTime;
            crawlingWindows += 1;
        }
        // Once the visitor has put the level back up three times it is
        // theirs, crawling or not: they can see the page, and the slider, as
        // well as the monitor can.
        const automatic = mayStepDown();
        if (automatic && crawlingWindows >= 3 && timestamp - crawlingSince >= CRAWLING_MS) {
            stepDown(timestamp);
            return;
        }

        // Before a level is given up, the page is asked for less, a step at a
        // time: in High FX the sky runs slower, every effect kept and only
        // drawn less often; then the glass keeps its frost and lets go of the
        // bend at its rim (glass.js). Only once those have been tried, and the
        // page is still clunky, does it step down a level -- High to Medium,
        // which puts the sky away, then Medium to Low. Each step gets a clean
        // look of its own before the page is judged again.
        const canEaseSky = effectsMode === 'high' && !skyEased;
        // Medium FX draws neither the sky nor the frost and bend, so there is
        // nothing to ease there before stepping down.
        const canEaseGlass = automatic && !glassEased && effectsMode === 'high';
        if (canEaseSky || canEaseGlass) {
            strainedWindows = strained ? strainedWindows + 1 : 0;
            if (strainedWindows >= STRAINED_WINDOWS_BEFORE_EASING) {
                if (canEaseSky) {
                    skyEased = true;
                    galaxy.ease();
                } else {
                    glassEased = true;
                    galaxy.lighten();
                }
                syncEffectsPace();
                deferPerformanceSampling(PERFORMANCE_RESUME_DELAY_MS, timestamp);
            }
            return;
        }
        if (!automatic) return;
        clunkyWindows = clunky ? clunkyWindows + 1 : 0;
        if (clunkyWindows >= CLUNKY_WINDOWS_BEFORE_DOWNGRADE) stepDown(timestamp);
    };
    const startPerformanceMonitor = () => {
        if (performanceMonitorFrame || monitorIdle()) return;
        if (performanceSpotTimer) window.clearTimeout(performanceSpotTimer);
        performanceSpotTimer = 0;
        performanceMonitorLastFrame = 0;
        performanceMonitorFrame = requestAnimationFrame(monitorPerformance);
    };
    // Keep watching for at least `duration` from now.
    const watchPerformance = duration => {
        performanceWatchUntil = Math.max(performanceWatchUntil, performance.now() + duration);
        startPerformanceMonitor();
    };
    // The looks in every few seconds are for the sky, which moves whether
    // or not anyone is using the page; below High FX nothing does.
    const schedulePerformanceSpot = () => {
        if (performanceSpotTimer || monitorIdle() || effectsMode !== 'high') return;
        performanceSpotTimer = window.setTimeout(() => {
            performanceSpotTimer = 0;
            watchPerformance(PERFORMANCE_SPOT_MS);
        }, PERFORMANCE_SPOT_EVERY_MS);
    };
    const watchPerformanceAfterInput = () => watchPerformance(PERFORMANCE_WATCH_AFTER_INPUT_MS);
    ['pointermove', 'pointerdown', 'wheel', 'touchmove', 'keydown'].forEach(type => {
        window.addEventListener(type, watchPerformanceAfterInput, { passive: true });
    });
    // Captured, so a panel or a list scrolling inside the page counts too.
    window.addEventListener('scroll', watchPerformanceAfterInput, { passive: true, capture: true });

    // How far the page has eased itself, for the stylesheets, glass.js and
    // the perf tools: 'eased' once the sky is drawn less often, 'lighter'
    // once the glass has let go of its bend as well.
    const syncEffectsPace = () => {
        if (glassEased) root.dataset.effectsPace = 'lighter';
        else if (skyEased) root.dataset.effectsPace = 'eased';
        else delete root.dataset.effectsPace;
    };
    // Set once the page has found it is drawing on the graphics built into
    // an Intel processor (askAboutGraphics, below): High FX there runs its
    // sky eased from the start, whenever it is turned on.
    let builtInGraphics = false;
    const easeForBuiltInGraphics = () => {
        if (!builtInGraphics || skyEased || effectsMode !== 'high') return;
        skyEased = true;
        galaxy.ease();
        syncEffectsPace();
    };

    // What lies behind the glass when no sky is drawn (portfolio.css): the
    // lattice, and in Medium the still sky with it. Going down
    // to Low or Medium it is put up at once, under the sky as the sky fades
    // out; going up to High it stays until the sky has faded in over it, so
    // a change of level crossfades rather than passing through black.
    let backdropTimer = 0;
    const settleBackdrop = () => {
        window.clearTimeout(backdropTimer);
        backdropTimer = 0;
        if (effectsMode !== 'high') return;
        delete backgroundGrid.dataset.look;
        stillSky.hide();
    };
    const setBackdropLook = (mode, animate) => {
        window.clearTimeout(backdropTimer);
        backdropTimer = 0;
        if (mode !== 'high') backgroundGrid.dataset.look = mode;
        else if (!animate || !backgroundGrid.dataset.look) delete backgroundGrid.dataset.look;
        // Taken down when the sky reports that it is in (below), or after a
        // few seconds if it never does -- a hidden tab draws nothing.
        else backdropTimer = window.setTimeout(settleBackdrop, 4000);
        if (mode === 'medium' && !wantedSkies.medium) stillSky.show();
        else if (mode !== 'high' || !backgroundGrid.dataset.look) stillSky.hide();
    };
    galaxyField.addEventListener('skyshown', settleBackdrop);

    // ---- The other skies -------------------------------------------------
    // Quick presses on a stop of the slider swap that level's backdrop and
    // colours for another era's: ten on Low for the dark web of the turn of the
    // century, five on Medium for a pastel desktop, five on High for a Frutiger
    // Aero sky, five more for a dark one and five more for the stars again. A
    // gap in the presses starts the count again. All of it is in files fetched
    // only when asked for (y2k.css, vapor.*, aero.*, ego.*), so this counter is
    // the only thing it costs anyone who never finds it. Each belongs to its
    // level alone: leaving the level, by choice or because the page had to,
    // hands everything back and coming back brings the choice back with it, for
    // the rest of the visit.
    const SKY_PRESS_GAP_MS = 400;
    const SKY_QUIET_MS = 2500;
    const SKY_VERSION = '20261102b';
    const SKIES = {
        y2k: { level: 'low' },
        vapor: { level: 'medium', script: 'portfolioVapor', file: 'vapor.js' },
        aero: { level: 'high', script: 'portfolioAero', file: 'aero.js' },
        ego: { level: 'high', script: 'portfolioEgo', file: 'ego.js' }
    };
    const SKY_ROUNDS = {
        low: { presses: 10, skies: ['', 'y2k'] },
        medium: { presses: 5, skies: ['', 'vapor'] },
        high: { presses: 5, skies: ['', 'aero', 'ego'] }
    };
    const skyStorageKey = level => `portfolio-sky-${level}`;
    const wantedSkies = {};
    Object.keys(SKY_ROUNDS).forEach(level => {
        let stored = '';
        try {
            stored = sessionStorage.getItem(skyStorageKey(level)) || '';
        } catch (error) {
            stored = '';
        }
        wantedSkies[level] = SKY_ROUNDS[level].skies.includes(stored) ? stored : '';
    });
    let showingSky = '';
    let pressedLevel = '';
    let skyPresses = 0;
    let lastSkyPress = 0;
    let skyQuietUntil = 0;
    // Bumped by every change of mind, so a sky still getting ready when the
    // visitor moves on is not shown over whatever they moved on to.
    let skyRequest = 0;
    const skyLoads = {};
    const NOTHING_TO_RUN = { prepare: () => Promise.resolve(), show() {}, release() {} };
    const loadSky = name => {
        if (skyLoads[name]) return skyLoads[name];
        const fetched = (element, attach) => new Promise((resolve, reject) => {
            element.onload = resolve;
            element.onerror = reject;
            attach(element);
        });
        const { script, file } = SKIES[name];
        const sheet = document.getElementById(`${name}-styles`) ? Promise.resolve() : fetched(Object.assign(document.createElement('link'), {
            id: `${name}-styles`, rel: 'stylesheet', href: `${name}.css?v=${SKY_VERSION}`
        }), element => document.head.appendChild(element));
        const code = script ? fetched(Object.assign(document.createElement('script'), {
            src: `${file}?v=${SKY_VERSION}`
        }), element => document.head.appendChild(element)) : Promise.resolve();
        const load = Promise.all([sheet, code]).then(() => (script ? window[script] : NOTHING_TO_RUN));
        load.catch(() => { delete skyLoads[name]; });
        skyLoads[name] = load;
        return load;
    };
    // The swap is one crossfade of the whole page where the browser can do
    // that: the sky, the ink and the glass all turn together. Not in Low, which
    // is there for a machine that should not be asked for a crossfade of the
    // whole screen.
    const swapSkies = (change, animate) => {
        if (animate && effectsMode !== 'low' && document.startViewTransition && !reducedMotion.matches && !document.hidden) {
            document.startViewTransition(change);
        } else change();
    };
    const putSkyAway = () => {
        if (!showingSky) return;
        const { script } = SKIES[showingSky];
        delete root.dataset[showingSky];
        if (script) window[script]?.release();
        showingSky = '';
    };
    const showOwnBackdrop = mode => {
        if (mode === 'high') galaxy.setQuality('high', false);
        else if (mode === 'medium') stillSky.show();
    };
    const syncSkies = async animate => {
        const want = wantedSkies[effectsMode] || '';
        if (want === showingSky) return;
        const request = ++skyRequest;
        deferPerformanceSampling(PERFORMANCE_RESUME_DELAY_MS);
        // Another level's sky does not stay up while this level's is fetched.
        if (want && showingSky && SKIES[showingSky].level !== effectsMode) putSkyAway();
        if (!want) {
            swapSkies(() => {
                putSkyAway();
                showOwnBackdrop(effectsMode);
            }, animate);
            return;
        }
        try {
            const sky = await loadSky(want);
            await sky.prepare();
            // Moved on while it got ready: another level, or more presses.
            if ((wantedSkies[effectsMode] || '') !== want) {
                sky.release();
                return;
            }
            if (request !== skyRequest) return;
            swapSkies(() => {
                putSkyAway();
                showingSky = want;
                root.dataset[want] = '';
                sky.show();
                if (effectsMode === 'high') galaxy.setQuality('medium', false);
                else if (effectsMode === 'medium') stillSky.hide();
            }, animate);
            deferPerformanceSampling(PERFORMANCE_RESUME_DELAY_MS);
        } catch (error) {
            // Offline, or blocked: the page simply keeps the sky it has.
            if (request !== skyRequest) return;
            wantedSkies[effectsMode] = '';
            storeEffects('sessionStorage', skyStorageKey(effectsMode), '');
            delete root.dataset[want];
            showOwnBackdrop(effectsMode);
        }
    };
    // By when the press happened, not when the page got round to it: on a machine
    // that is struggling, quick presses can be answered slowly.
    const countSkyPress = (level, now) => {
        if (level !== pressedLevel || now - lastSkyPress >= SKY_PRESS_GAP_MS) skyPresses = 0;
        pressedLevel = level;
        lastSkyPress = now;
        // Nobody spamming a button stops at exactly the right number. A sky
        // takes a moment to get ready, and a hand still going through it must
        // not count on and call the whole thing off before it is seen.
        if (now < skyQuietUntil) {
            skyPresses = 0;
            return;
        }
        skyPresses += 1;
        const round = SKY_ROUNDS[level];
        if (!round || skyPresses < round.presses) return;
        skyPresses = 0;
        skyQuietUntil = now + SKY_QUIET_MS;
        const next = round.skies[(round.skies.indexOf(wantedSkies[level]) + 1) % round.skies.length];
        wantedSkies[level] = next;
        storeEffects('sessionStorage', skyStorageKey(level), next);
        syncSkies(true);
    };

    // ---- The slider ------------------------------------------------------
    // Three stops on a short track in the bar; in the phone menu, the last
    // row. A native range input underneath carries the keyboard (arrows,
    // Home, End, Page Up and Down) and what a screen reader announces; the
    // track takes the pointer itself, so a press anywhere on it lands on the
    // nearest stop in every browser -- iOS Safari only moves a range input
    // by its thumb -- and a drag carries the thumb under the finger before
    // it settles on a stop. The thumb's place comes from html[data-effects]
    // (navbar.css), so it is right before any of this runs. No word names
    // the level on screen: the thumb's place and the track's blue say it.
    const fxSlider = document.getElementById('fx-slider');
    const fxInput = document.getElementById('fx-level');
    const fxTrack = fxSlider?.querySelector('.fx-slider-track');
    // A level the page steps down to by itself is read out from here; one the
    // visitor chose, the slider reads out itself. Outside the menu, which on
    // a phone hides everything in it until it is opened.
    const fxStatus = document.createElement('p');
    fxStatus.className = 'visually-hidden';
    fxStatus.setAttribute('role', 'status');
    document.body.appendChild(fxStatus);
    const syncSlider = () => {
        if (!fxInput) return;
        const index = EFFECT_LEVELS.indexOf(effectsMode);
        if (Number(fxInput.value) !== index) fxInput.value = String(index);
        fxInput.setAttribute('aria-valuetext', EFFECT_NAMES[effectsMode]);
    };

    const applyEffectsMode = (mode, remember = false, reason = 'manual', animate = true) => {
        const stepped = reason === 'lag' && mode !== effectsMode;
        effectsMode = mode;
        effectsReason = reason;
        root.dataset.effects = mode;
        root.dataset.effectsReason = reason;
        easeForBuiltInGraphics();
        syncEffectsPace();
        setBackdropLook(mode, animate);
        // The space sky is not started for a visitor who has swapped it for
        // the other one.
        galaxy.setQuality(mode === 'high' && wantedSkies.high ? 'medium' : mode, animate);
        cursor.setEnabled(mode === 'high');
        if (mode !== 'high') {
            document.querySelectorAll('.cursor-spark, .cursor-ripple').forEach(effect => effect.remove());
        }
        wakeEffectsBackground();
        syncSlider();
        if (stepped) {
            pageLowered = true;
            fxStatus.textContent = `Visual effects lowered to ${EFFECT_NAMES[mode]} because the page was running slowly.`;
        }
        if (remember) storeEffects('sessionStorage', levelStorageKey, mode);
        // See lagStorageKey. Whichever came last wins on a reload.
        if (reason === 'lag') storeEffects('sessionStorage', lagStorageKey, mode);
        else if (remember) storeEffects('sessionStorage', lagStorageKey, '');
        // Turning a level on is one of the things that gives the monitor its
        // job again.
        startPerformanceMonitor();
        syncSkies(animate);
    };

    // A level chosen on the slider, kept for the rest of the visit. The
    // monitor may still step it down; putting it back up after it has is
    // counted, and the third time the page stops stepping it down.
    const chooseLevel = level => {
        if (!EFFECT_LEVELS.includes(level)) return;
        if (level === effectsMode && effectsReason === 'manual') {
            syncSlider();
            return;
        }
        if (pageLowered && EFFECT_LEVELS.indexOf(level) > EFFECT_LEVELS.indexOf(effectsMode)) {
            pageLowered = false;
            overrides = Math.min(overrides + 1, OVERRIDES_BEFORE_HOLD);
            storeEffects('sessionStorage', overrideStorageKey, String(overrides));
        }
        // The page took the bend off the glass, not the visitor: a level
        // chosen by hand gets it back. The sky keeps its pace, which only
        // changes how often it is drawn.
        if (glassEased) {
            glassEased = false;
            galaxy.sharpen();
        }
        monitorDone = false;
        crawlingSince = 0;
        crawlingWindows = 0;
        deferPerformanceSampling(PERFORMANCE_RESUME_DELAY_MS);
        applyEffectsMode(level, true, 'manual');
    };

    if (fxSlider && fxInput && fxTrack) {
        // The pointer that is pressing the track, while it is down.
        let drag = null;
        // Keys and assistive technology move the input itself.
        const fromInput = () => {
            const level = EFFECT_LEVELS[Number(fxInput.value)];
            if (level) chooseLevel(level);
        };
        fxInput.addEventListener('input', fromInput);
        fxInput.addEventListener('change', fromInput);

        // The centres of the three stops, where the thumb's centre comes to
        // rest, measured fresh for each press: the bar changes size with the
        // window, and the stop is in a different place in the phone menu.
        const stopCentres = () => [...fxTrack.querySelectorAll('.fx-slider-stop')].map(stop => {
            const box = stop.getBoundingClientRect();
            return box.left + box.width / 2;
        });
        const nearestStop = (stops, x) => {
            let best = 0;
            stops.forEach((centre, index) => {
                if (Math.abs(x - centre) < Math.abs(x - stops[best])) best = index;
            });
            return best;
        };
        const endDrag = () => {
            if (!drag) return;
            try { fxSlider.releasePointerCapture(drag.id); } catch (error) { /* already released */ }
            drag = null;
            fxSlider.classList.remove('is-dragging');
            fxSlider.style.removeProperty('--fx-drag');
        };
        fxSlider.addEventListener('pointerdown', event => {
            if (!event.isPrimary || event.button !== 0) return;
            const stops = stopCentres();
            const box = fxTrack.getBoundingClientRect();
            // The sparkle beside the track only says what the track is for.
            if (event.clientX < box.left - 8) return;
            event.preventDefault();
            // So the arrow keys carry on from a click, without a focus ring
            // for it (:focus-visible). A finger has no keys to carry on with.
            if (event.pointerType === 'mouse') fxInput.focus({ preventScroll: true });
            drag = { id: event.pointerId, x: event.clientX, moved: false, stops };
            try { fxSlider.setPointerCapture(event.pointerId); } catch (error) { /* pointer already gone */ }
        });
        fxSlider.addEventListener('pointermove', event => {
            if (!drag || event.pointerId !== drag.id) return;
            if (!drag.moved && Math.abs(event.clientX - drag.x) < 4) return;
            drag.moved = true;
            const { stops } = drag;
            const offset = Math.min(Math.max(event.clientX - stops[0], 0), stops[2] - stops[0]);
            fxSlider.classList.add('is-dragging');
            fxSlider.style.setProperty('--fx-drag', `${offset.toFixed(1)}px`);
        });
        fxSlider.addEventListener('pointerup', event => {
            if (!drag || event.pointerId !== drag.id) return;
            const level = EFFECT_LEVELS[nearestStop(drag.stops, event.clientX)];
            endDrag();
            chooseLevel(level);
            countSkyPress(level, event.timeStamp);
        });
        // A vertical swipe that started on the slider is the page scrolling
        // (touch-action: pan-y): the thumb goes back where it was.
        fxSlider.addEventListener('pointercancel', event => {
            if (!drag || event.pointerId !== drag.id) return;
            endDrag();
        });
    }
    document.addEventListener('visibilitychange', () => {
        deferPerformanceSampling(PERFORMANCE_RESUME_DELAY_MS);
        if (document.hidden) {
            clearBackgroundIdleTimer();
            document.documentElement.classList.remove('effects-background-click-fading');
            document.documentElement.classList.add('effects-background-idle');
        } else {
            wakeEffectsBackground();
        }
    });
    // Returning to the window resumes rAF mid-stall; start a clean measurement
    // window so the catch-up frames are not mistaken for jank.
    window.addEventListener('focus', () => {
        deferPerformanceSampling(PERFORMANCE_RESUME_DELAY_MS);
    });
    // Resizing re-lays out every canvas in the scene; that cost belongs to the
    // resize, not to the machine running it.
    window.addEventListener('resize', () => {
        deferPerformanceSampling(PERFORMANCE_RESUME_DELAY_MS);
    }, { passive: true });
    applyEffectsMode(effectsMode, false, effectsReason, false);
    // Measure nothing until the page has had time to load, decode images and
    // settle -- startup jank on its own used to be enough to drop a perfectly
    // capable machine to Low FX.
    //
    // applyEffectsMode above has already started the monitor, so this only
    // holds its sampling back. It used to start a second loop of its own as
    // well, and the two ran side by side for the rest of the visit: both are
    // handed the same frame's timestamp, so every frame the second one logged
    // a frame time of zero. With half of every window's samples at zero, the
    // quickest quarter of frames always read as instant, and a page running a
    // steady twenty-five frames a second was never once judged slow.
    //
    // The first look runs past the warm-up for three whole windows, enough
    // for a machine that cannot keep up to have its sky eased straight away.
    // Only High FX has a sky moving at rest to look at: below it the page
    // is still until it is used, and is watched only then.
    deferPerformanceSampling(PERFORMANCE_WARMUP_MS);
    if (effectsMode === 'high') watchPerformance(PERFORMANCE_WARMUP_MS + 3 * PERFORMANCE_WINDOW_MS + 500);

    // A laptop drawing on the graphics built into an Intel processor -- the
    // UHD and Iris chips in most thin laptops -- is the machine that cannot
    // hold the sky at sixty behind a screen of glass, and it was left to find
    // that out the hard way: seconds of stutter before the monitor stepped
    // in. It starts with the sky eased instead, which it would have ended up
    // at anyway: every effect kept, the sky only drawn less often. Asked once
    // the page is idle, because opening a graphics context to ask is not
    // free, and it is thrown away at once.
    //
    // The same question finds a machine with no graphics to draw with at all
    // -- none fitted, its driver on the browser's blocklist, a remote desktop,
    // a virtual machine. Asked to refuse a context that would come with a
    // major performance caveat, WebGL refuses exactly there, where the
    // browser would draw in software or not at all. Such a machine used to
    // be put in Low FX here, when the page started in High and Medium still
    // frosted its glass. Neither is true now: Medium draws nothing the
    // processor cannot keep up with (scrolling and the cursor over the cards
    // both under one frame in a hundred dropped, cycle 24), so it keeps the
    // level it started at and the frame monitor steps it down if it has to.
    // It is asked in every level: a visitor can move the slider up at any
    // moment, and the answer is kept for when they do (easeForBuiltInGraphics).
    const answerAboutGraphics = (renderer, software) => {
        if (software) {
            root.dataset.effectsRenderer = 'software';
            return;
        }
        root.dataset.effectsRenderer = /intel/i.test(renderer) ? 'intel' : 'other';
        // Intel's own graphics cards (Arc) are not built in and keep up.
        builtInGraphics = /intel/i.test(renderer) && !/\barc\b/i.test(renderer);
        easeForBuiltInGraphics();
    };
    const askAboutGraphicsHere = () => {
        let renderer = '';
        let software = false;
        try {
            const gl = document.createElement('canvas').getContext('webgl', GRAPHICS_QUESTION);
            if (gl) {
                const info = gl.getExtension('WEBGL_debug_renderer_info');
                renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
                gl.getExtension('WEBGL_lose_context')?.loseContext();
            } else software = true;
        } catch (error) {
            renderer = '';
        }
        answerAboutGraphics(renderer, software);
    };
    // Opening that context holds the thread that asks until the graphics
    // process has built it: 10 to 40 milliseconds on a quiet machine, more
    // than half a second with High's sky being set up behind it. A worker can
    // wait as long as it likes. It only answers for the machine when it gets a
    // context: a refusal might mean no graphics, or only that this browser
    // gives its workers no WebGL, so a refusal is asked again here, where a
    // refusal costs nothing.
    const askAboutGraphics = () => {
        // A testing hook, as window.__glassForce is in glass.js: a worker is
        // out of reach of what the perf tools lay over the page.
        if (window.__graphicsForce) {
            answerAboutGraphics(window.__graphicsForce, false);
            return;
        }
        if (!('OffscreenCanvas' in window) || !('Worker' in window)) {
            askAboutGraphicsHere();
            return;
        }
        let worker = null, source = '', asked = false;
        const finish = answer => {
            if (asked) return;
            asked = true;
            worker?.terminate();
            if (source) URL.revokeObjectURL(source);
            if (answer) answerAboutGraphics(answer, false);
            else askAboutGraphicsHere();
        };
        try {
            source = URL.createObjectURL(new Blob([`
                let renderer = '';
                try {
                    const gl = new OffscreenCanvas(1, 1).getContext('webgl', ${JSON.stringify(GRAPHICS_QUESTION)});
                    if (gl) {
                        const info = gl.getExtension('WEBGL_debug_renderer_info');
                        renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || 'unnamed');
                        gl.getExtension('WEBGL_lose_context')?.loseContext();
                    }
                } catch (error) {
                    renderer = '';
                }
                postMessage(renderer);`], { type: 'text/javascript' }));
            worker = new Worker(source);
            worker.onmessage = ({ data }) => finish(data);
            worker.onerror = () => finish('');
        } catch (error) {
            finish('');
        }
    };
    // Half a second at most: a machine drawing in software is never idle,
    // and it used to wait out a two-second timeout in High FX.
    if ('requestIdleCallback' in window) window.requestIdleCallback(askAboutGraphics, { timeout: 500 });
    else window.setTimeout(askAboutGraphics, 500);

    let pointerFrame = 0;
    let latestPointerEvent;
    let highEffectsTouchSwipeActive = false;
    let touchSwipeReleased = false;
    const queueHighEffectsMovement = event => {
        wakeEffectsBackground();
        if (effectsMode !== 'high') return;
        latestPointerEvent = event;
        if (pointerFrame) return;
        pointerFrame = requestAnimationFrame(() => {
            // The cursor dot, and the field -- which reads the pointer only to
            // shove the bodies nearest it out of the way. The lens that used to
            // travel with the cursor is gone: it lit whatever it passed over and
            // went out again over every button and card, which is the brightening
            // and dimming the field itself was doing, one light switching on and
            // off under the reader's hand as they moved toward a control.
            cursor.move(latestPointerEvent);
            galaxy.move(latestPointerEvent);
            pointerFrame = 0;
        });
    };
    window.addEventListener('pointermove', queueHighEffectsMovement, { passive: true });
    // Touch drives the field directly rather than being funnelled through the
    // cursor path: a fingertip is a position on the sheet, not a hovering
    // pointer, so it presses its own dent instead of tilting the whole scene.
    window.addEventListener('touchstart', event => {
        highEffectsTouchSwipeActive = false;
        touchSwipeReleased = false;
        wakeEffectsBackground();
        if (effectsMode !== 'high') return;
        Array.from(event.changedTouches).forEach(touch => {
            // touch.target is where the finger landed and stays that element for
            // the life of the touch, which is exactly the test the field wants.
            galaxy.touchStart(touch.identifier, touch.clientX, touch.clientY, touch.target);
        });
    }, { passive: true });
    window.addEventListener('touchmove', event => {
        if (!event.touches.length && !event.changedTouches.length) return;
        if (effectsMode === 'high') highEffectsTouchSwipeActive = true;
        wakeEffectsBackground();
        if (effectsMode !== 'high') return;
        Array.from(event.changedTouches).forEach(touch => {
            galaxy.touchMove(touch.identifier, touch.clientX, touch.clientY);
        });
    }, { passive: true });
    ['touchend', 'touchcancel'].forEach(eventName => {
        window.addEventListener(eventName, event => {
            Array.from(event.changedTouches).forEach(touch => galaxy.touchEnd(touch.identifier));
            if (event.touches.length || !highEffectsTouchSwipeActive) return;
            highEffectsTouchSwipeActive = false;
            touchSwipeReleased = true;
            wakeEffectsBackground();
        }, { passive: true });
    });
    // A stylus is a fingertip with a finer point: same dent, same rebound.
    window.addEventListener('pointerdown', event => {
        wakeEffectsBackground();
        if (effectsMode === 'high' && event.pointerType === 'pen') {
            galaxy.touchStart(`pen-${event.pointerId}`, event.clientX, event.clientY, event.target);
        }
    }, { passive: true });
    window.addEventListener('pointermove', event => {
        if (event.pointerType === 'pen') galaxy.touchMove(`pen-${event.pointerId}`, event.clientX, event.clientY);
    }, { passive: true });
    ['pointerup', 'pointercancel'].forEach(eventName => {
        window.addEventListener(eventName, event => {
            if (event.pointerType === 'pen') galaxy.touchEnd(`pen-${event.pointerId}`);
        }, { passive: true });
    });
    window.addEventListener('keydown', wakeEffectsBackground, { passive: true });
    window.addEventListener('wheel', () => {
        touchSwipeReleased = false;
        wakeEffectsBackground();
    }, { passive: true });
    const pageScrollFill = pageScrollProgress.querySelector('.page-scroll-fill');
    let scrollFrame = 0;
    // How far the page can scroll, measured when it changes size rather than
    // on every scrolled frame: reading it made the browser lay the page out
    // again, mid-scroll, whenever anything had changed since the last frame.
    let maxScroll = 1;
    const measureMaxScroll = () => {
        maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    };
    measureMaxScroll();
    new ResizeObserver(measureMaxScroll).observe(document.body);
    const updateScrollMotion = () => {
        const progress = Math.min(Math.max(window.scrollY / maxScroll, 0), 1);
        pageScrollFill.style.transform = `scaleY(${progress})`;
        galaxy.scroll(window.scrollY);
        document.body.classList.toggle('has-scrolled', window.scrollY > 18);
        scrollFrame = 0;
    };
    window.addEventListener('scroll', () => {
        if (!touchSwipeReleased) wakeEffectsBackground();
        if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScrollMotion);
    }, { passive: true });
    window.addEventListener('resize', () => { measureMaxScroll(); updateScrollMotion(); }, { passive: true });
    updateScrollMotion();
    const revealObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('in-view'); });
    }, { threshold: .12 });
    document.querySelectorAll('main .section').forEach(section => revealObserver.observe(section));
    document.getElementById('current-year').textContent = new Date().getFullYear();
    setupMobileNav();
    setupImageRecovery();
    // `no-cache` revalidates rather than trusting the cached copy: a stale data
    // file naming images that have since been renamed is the one way a correct
    // deploy can still render a grid full of broken pictures.
    // While it is on its way the sections below About stay waiting for it
    // past index.html's four seconds, up to ten: on a slow connection they
    // would otherwise show up empty and be pushed down when it lands.
    window.portfolioDataPending = true;
    // The three faces nothing is drawn in until the data has rendered. Left to
    // the cards to ask for, they are still arriving when the cards are measured
    // (setupProjectCardFit), so every visit measured the cards all over again.
    // They are on their way here before the data is, and on a return visit in
    // by the time it lands. The page draws in all three, so this costs no bytes.
    ['800 1em "Barlow Condensed"', '400 1em "Font Awesome 6 Free"', '400 1em "Font Awesome 6 Brands"']
        .forEach(face => document.fonts?.load(face).catch(() => {}));
    fetch('portfolio-data.json', { cache: 'no-cache' })
        .then(response => { if (!response.ok) throw new Error('Failed to load portfolio data'); return response.json(); })
        .then(data => {
            renderProfile(data.profile);
            renderSkills(data.skillCategories);
            renderFeaturedProjects(data.projects);
            renderProjectCollections(data.projectCollections, data.projects);
            setupModal();
            // The sections that waited for the data appear in this frame,
            // already at their full size (see .awaiting-data, index.html).
            window.portfolioDataPending = false;
            document.documentElement.classList.remove('awaiting-data');
            revealLinkedSection();
            updateScrollMotion();
            window.requestAnimationFrame(() => window.requestAnimationFrame(() => galaxy.refreshLayout()));
        })
        .catch(error => {
            console.error('Error loading portfolio data:', error);
            showDataLoadFailure();
            window.portfolioDataPending = false;
            document.documentElement.classList.remove('awaiting-data');
        });
});

// Arriving by a link to a section, such as the 404 page's "Browse projects" or
// a shared #contact: the browser went looking for it before the data had
// filled the page above it, and a collection did not exist at all yet. Go
// there now, opening a collection on the way. Every section is drawn for the
// jump, so it is measured against their real heights rather than
// content-visibility's 800px guess (portfolio.css); they keep those heights
// once they go back to being skipped off screen.
function revealLinkedSection() {
    let target = null;
    try { target = document.getElementById(decodeURIComponent(window.location.hash.slice(1))); } catch (error) { return; }
    if (!target || !target.closest('main')) return;
    const toggle = target.matches('.project-collection') ? target.querySelector('.collection-toggle') : null;
    if (toggle?.getAttribute('aria-expanded') === 'false') toggle.click();
    const root = document.documentElement;
    const sections = [...document.querySelectorAll('main .section')];
    sections.forEach(section => { section.style.contentVisibility = 'visible'; });
    root.style.scrollBehavior = 'auto';
    target.scrollIntoView({ block: 'start' });
    root.style.removeProperty('scroll-behavior');
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        sections.forEach(section => section.style.removeProperty('content-visibility'));
    }));
}

// If the project data cannot be fetched the page would otherwise sit there with
// four empty sections and no explanation. Say what happened and give a way out.
function showDataLoadFailure() {
    const container = document.getElementById('featured-projects-container');
    if (!container || container.children.length) return;
    container.innerHTML = '<div class="media-placeholder data-error" role="alert">'
        + '<i class="fa-solid fa-gear" aria-hidden="true"></i>'
        + '<span>The project list did not load</span>'
        + '<small>Reload the page, or see every build on '
        + '<a href="https://github.com/AloeVeraZ" target="_blank" rel="noopener">GitHub</a>.</small>'
        + '</div>';
}

// A visitor who loaded the page before the images were converted to WebP can be
// holding a cached portfolio-data.json that still names the old .jpg/.png/.gif
// files, which no longer exist. Rather than leave broken-image icons across the
// grid until their cache expires, retry the WebP sibling, and fall back to the
// same placeholder an imageless project uses if that fails too.
//
// `error` does not bubble, so this listens in the capture phase -- one listener
// covers the cards, the modal and anything rendered later.
function setupImageRecovery() {
    const LEGACY_EXTENSION = /\.(jpe?g|png|gif)$/i;

    const showPlaceholder = image => {
        const inCard = image.classList.contains('project-image');
        const placeholder = document.createElement('div');
        placeholder.className = inCard
            ? 'media-placeholder card-media-placeholder'
            : 'media-placeholder';
        placeholder.innerHTML = '<i class="fa-solid fa-image" aria-hidden="true"></i>'
            + `<span>${escapeAttribute(image.alt || 'Image unavailable')}</span>`;
        image.replaceWith(placeholder);
    };

    document.addEventListener('error', event => {
        const image = event.target;
        if (!(image instanceof HTMLImageElement)) return;
        if (image.dataset.recovered === 'placeholder') return;

        const source = image.getAttribute('src') || '';
        // Try the WebP sibling once; if that fails too, give up and show the
        // placeholder rather than retrying a file that is not there.
        if (image.dataset.recovered !== 'webp' && LEGACY_EXTENSION.test(source)) {
            image.dataset.recovered = 'webp';
            image.removeAttribute('srcset');
            image.removeAttribute('sizes');
            image.src = source.replace(LEGACY_EXTENSION, '.webp');
            return;
        }
        image.dataset.recovered = 'placeholder';
        showPlaceholder(image);
    }, true);
}

// Below 900px the nav links collapse behind a toggle. Without this they were
// simply hidden, leaving a phone with no way to reach a section.
function setupMobileNav() {
    const navbar = document.querySelector('.navbar');
    const toggle = document.getElementById('nav-toggle');
    const links = document.getElementById('nav-links');
    if (!navbar || !toggle || !links) return;

    const setOpen = open => {
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
        if (open) navbar.setAttribute('data-nav-open', '');
        else navbar.removeAttribute('data-nav-open');
    };

    toggle.addEventListener('click', () => {
        setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    // Jumping to a section should close the panel behind you.
    links.addEventListener('click', event => {
        if (event.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
            setOpen(false);
            toggle.focus();
        }
    });
    // Widening past the breakpoint leaves the desktop row visible anyway, so
    // drop the open state rather than keep a stale aria-expanded="true".
    window.matchMedia('(max-width: 900px)').addEventListener('change', event => {
        if (!event.matches) setOpen(false);
    });
}

// ---- The still sky (Medium FX) ------------------------------------------------
// Low lays the bare lattice on one fixed layer that is painted once; High
// draws a living sky on a canvas of its own, frame after frame. Medium sits
// between them: a sky of the same kind -- stars in High's colours, a faint
// band where they crowd, a couple of tight clusters and a few soft clouds --
// drawn once into a picture and laid on the lattice's own layer
// (.background-grid::before, portfolio.css). Nothing in it moves, so a scroll
// still slides the page over a single layer without drawing anything, which
// is all Low costs; it is drawn again only when the window changes shape.
// One seed a visit, so it is the same sky every time it comes back.
//
// The drawing stands alone, with nothing from outside it but its arguments:
// its source text is what the worker below runs.
function paintStillSky(context, width, height, seed) {
    const TAU = Math.PI * 2;
    const colors = ['224,237,255', '174,206,237', '246,221,190', '207,199,227',
        '235,240,247', '214,226,255', '205,168,156', '255,194,142'];
    let state = seed;
    const random = () => {
        state = (state + 0x6D2B79F5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // Three draws averaged: a bell between -1 and 1, for anything that
    // gathers toward a line or a point.
    const bell = () => (random() + random() + random() - 1.5) / 1.5;
    const span = Math.max(width, height);
    const cloud = (x, y, radius, squash, angle, rgb, alpha) => {
        context.save();
        context.translate(x, y);
        context.rotate(angle);
        context.scale(1, squash);
        const light = context.createRadialGradient(0, 0, 0, 0, 0, radius);
        light.addColorStop(0, `rgba(${rgb},${alpha})`);
        light.addColorStop(.42, `rgba(${rgb},${alpha * .42})`);
        light.addColorStop(1, `rgba(${rgb},0)`);
        context.fillStyle = light;
        context.fillRect(-radius, -radius, radius * 2, radius * 2);
        context.restore();
    };
    const star = (x, y, radius, alpha, rgb) => {
        if (radius > .85) {
            const reach = radius * 6;
            const halo = context.createRadialGradient(x, y, 0, x, y, reach);
            halo.addColorStop(0, `rgba(${rgb},${alpha * .38})`);
            halo.addColorStop(.35, `rgba(${rgb},${alpha * .1})`);
            halo.addColorStop(1, `rgba(${rgb},0)`);
            context.fillStyle = halo;
            context.fillRect(x - reach, y - reach, reach * 2, reach * 2);
        }
        context.fillStyle = `rgba(${rgb},${alpha})`;
        context.beginPath();
        context.arc(x, y, radius, 0, TAU);
        context.fill();
        // The brightest few catch the light in a cross, as High's do.
        if (radius > 1.45) {
            context.strokeStyle = `rgba(${rgb},${alpha * .4})`;
            context.lineWidth = Math.max(.35, radius * .22);
            context.beginPath();
            context.moveTo(x - radius * 3, y);
            context.lineTo(x + radius * 3, y);
            context.moveTo(x, y - radius * 3);
            context.lineTo(x, y + radius * 3);
            context.stroke();
        }
    };
    const colour = () => colors[Math.floor(random() ** 1.6 * colors.length)];

    // The clouds: blue behind the hero, violet high on the right, warm low
    // on the right, a breath of teal at the foot -- each a little off
    // where the last visit had it -- and between them the grey haze High's
    // clusters sit in.
    const off = amount => (random() - .5) * amount;
    cloud(width * (.18 + off(.08)), height * (.24 + off(.1)), span * .5, .55, -.3, '112,148,210', .2);
    cloud(width * (.84 + off(.08)), height * (.16 + off(.1)), span * .36, .6, .4, '150,136,198', .13);
    cloud(width * (.8 + off(.1)), height * (.78 + off(.1)), span * .42, .5, -.2, '196,166,138', .11);
    cloud(width * (.1 + off(.08)), height * (.9 + off(.06)), span * .3, .6, .2, '112,164,184', .08);
    for (let i = 0; i < 5; i++) {
        cloud(width * random(), height * random(), 90 + random() * 120, .45 + random() * .4, random() * TAU,
            '200,210,226', .05 + random() * .04);
    }

    // The band: a long, faint glow corner to corner, and a third of the
    // stars gathered along it.
    const bandAngle = -.42 + off(.12);
    const bandX = width * (.5 + off(.1)), bandY = height * (.55 + off(.1));
    const bandWidth = Math.min(width, height) * .17;
    const bandCos = Math.cos(bandAngle), bandSin = Math.sin(bandAngle);
    cloud(bandX, bandY, span * .78, .16, bandAngle, '196,212,255', .085);
    const count = Math.round(width * height / 1250);
    for (let i = 0; i < count; i++) {
        let x = random() * width, y = random() * height;
        if (random() < .32) {
            const along = (random() - .5) * span * 1.5, across = bell() * bandWidth;
            x = bandX + along * bandCos - across * bandSin;
            y = bandY + along * bandSin + across * bandCos;
            if (x < 0 || x > width || y < 0 || y > height) continue;
        }
        star(x, y, .3 + random() ** 3.4 * 1.65, .22 + random() ** 1.5 * .7, colour());
    }

    // Two clusters, each a haze with a knot of faint stars in it.
    for (let c = 0; c < 2; c++) {
        const cx = width * (.12 + random() * .76), cy = height * (.12 + random() * .76);
        cloud(cx, cy, 64, 1, 0, '220,230,255', .06);
        const stars = 30 + Math.floor(random() * 18);
        for (let i = 0; i < stars; i++) {
            star(cx + bell() * 46, cy + bell() * 46, .26 + random() ** 3 * .6, .22 + random() * .5, colour());
        }
    }

    // Fading out toward the edges, as High's veil darkens its sky there.
    context.globalCompositeOperation = 'destination-out';
    const edge = context.createRadialGradient(width / 2, height * .45, Math.min(width, height) * .3,
        width / 2, height * .45, Math.hypot(width, height) * .62);
    edge.addColorStop(0, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(0,0,0,.5)');
    context.fillStyle = edge;
    context.fillRect(0, 0, width, height);
}

// A worker, written out here so the page fetches nothing for it: it draws the
// picture on a canvas of its own, encodes it and goes away again. It draws to
// the graphics card as the page's own canvas does, which comes out the same to
// the byte; on a canvas kept in memory the faintest stars land differently.
const stillSkyWorkerSource = () => `
    const paint = ${paintStillSky};
    onmessage = async ({ data: { width, height, ratio, seed } }) => {
        try {
            const canvas = new OffscreenCanvas(Math.round(width * ratio), Math.round(height * ratio));
            const context = canvas.getContext('2d');
            context.setTransform(ratio, 0, 0, ratio, 0, 0);
            paint(context, width, height, seed);
            postMessage(await canvas.convertToBlob({ type: 'image/png' }));
        } catch (error) {
            postMessage(null);
        }
    };`;

function setupStillSky(layer) {
    const seed = Math.floor(Math.random() * 4294967296);
    const idle = window.requestIdleCallback || (callback => window.setTimeout(callback, 1));
    let wanted = false, url = '', job = 0, resizeTimer = 0, releaseTimer = 0;
    let drawnWidth = 0, drawnHeight = 0, drawnRatio = 0;

    // The finished picture, decoded and laid on the lattice's layer; the sky
    // fades in once it is ready.
    const adopt = (blob, ticket) => {
        if (!blob || ticket !== job) return;
        const next = URL.createObjectURL(blob);
        const picture = new Image();
        picture.src = next;
        picture.decode().catch(() => {}).then(() => {
            if (ticket !== job) {
                URL.revokeObjectURL(next);
                return;
            }
            const previous = url;
            url = next;
            layer.style.setProperty('--still-sky', `url("${next}")`);
            layer.dataset.sky = '';
            if (previous) window.setTimeout(() => URL.revokeObjectURL(previous), 1000);
        });
    };
    // For a browser with no canvas for its workers to draw on. All of it runs
    // on the page's thread: toBlob reads the picture back and encodes it there,
    // a few rows at a time, in the browser's idle moments.
    const buildHere = (width, height, ratio, ticket) => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        const context = canvas.getContext('2d');
        if (!context) return;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        paintStillSky(context, width, height, seed);
        canvas.toBlob(blob => adopt(blob, ticket), 'image/png');
    };
    // Medium is where every visit starts, and on the page's thread this was
    // half of what a load asked of it: on a slow laptop more than a second of
    // drawing, reading back and encoding, in long tasks, while the visitor was
    // already trying to scroll. Off that thread none of it can hold anything
    // up, and with nothing waiting on the page's idle moments the sky arrives
    // sooner.
    const build = () => {
        const width = window.innerWidth, height = window.innerHeight;
        const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
        const ticket = ++job;
        drawnWidth = width; drawnHeight = height; drawnRatio = ratio;
        if (!('OffscreenCanvas' in window) || !('Worker' in window)) {
            buildHere(width, height, ratio, ticket);
            return;
        }
        let worker = null, source = '';
        const finish = () => {
            worker?.terminate();
            if (source) URL.revokeObjectURL(source);
        };
        const fallBack = () => {
            finish();
            if (ticket === job) buildHere(width, height, ratio, ticket);
        };
        try {
            source = URL.createObjectURL(new Blob([stillSkyWorkerSource()], { type: 'text/javascript' }));
            worker = new Worker(source);
        } catch (error) {
            fallBack();
            return;
        }
        worker.onerror = fallBack;
        worker.onmessage = ({ data }) => {
            if (!data) {
                fallBack();
                return;
            }
            finish();
            adopt(data, ticket);
        };
        worker.postMessage({ width, height, ratio, seed });
    };
    // Sized to cover the window, so a phone's address bar sliding away only
    // trims an edge; a new shape or a new zoom draws it again.
    const reshaped = () => window.innerWidth !== drawnWidth
        || Math.abs(window.innerHeight / drawnHeight - 1) > .2
        || Math.min(window.devicePixelRatio || 1, 1.5) !== drawnRatio;
    window.addEventListener('resize', () => {
        if (!wanted) return;
        clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => { if (wanted && reshaped()) build(); }, 250);
    }, { passive: true });

    const release = () => {
        delete layer.dataset.sky;
        layer.style.removeProperty('--still-sky');
        if (url) URL.revokeObjectURL(url);
        url = '';
        drawnWidth = drawnHeight = drawnRatio = 0;
    };
    return {
        show() {
            clearTimeout(releaseTimer);
            if (wanted) return;
            wanted = true;
            if (url && !reshaped()) layer.dataset.sky = '';
            else idle(() => { if (wanted) build(); }, { timeout: 600 });
        },
        // Handed back once the lattice's fade has carried it out.
        hide() {
            if (!wanted) return;
            wanted = false;
            job++;
            clearTimeout(resizeTimer);
            clearTimeout(releaseTimer);
            releaseTimer = window.setTimeout(release, 700);
        }
    };
}

// ---- The living sky (High FX) ------------------------------------------------
// The sky itself is setupGalaxyField, in galaxy.js, and it is most of the site's
// script: three bytes in every five of what used to arrive in this file, seventy
// kilobytes off the wire. Every visit starts at Medium and High is only ever
// chosen on the slider, so most visitors never see it, and they were downloading
// it and having it set up, on the thread that was trying to draw the page, for
// nothing. It is fetched the first time High is wanted, and this stands in for it
// until then. What the page says to it before it arrives is either kept for it
// (its level and how far it has been eased) or is about something it would not
// have been showing yet anyway (the cursor, a scroll).
function setupDeferredGalaxy(canvas, reducedMotion) {
    // The visit's two rolls for the sky, thrown here rather than when it
    // arrives. A visit's Math.random used to be drawn on in that order, and the
    // perf tools seed it so that two runs draw the same sky.
    const landmarkRoll = Math.random(), universeRoll = Math.random();
    let sky = null, script = null, ahead = null;
    // The level the sky was last asked for while it was not here, and anything
    // else to tell it when it is.
    let wanted = null;
    const settings = [];
    // The same version as this file, so what bumps one bumps both.
    const source = `galaxy.js${PORTFOLIO_SCRIPT_QUERY}`;
    const arrive = () => {
        if (!wanted || sky) return;
        sky = setupGalaxyField(canvas, reducedMotion, landmarkRoll, universeRoll);
        settings.splice(0).forEach(name => sky[name]());
        const [mode, animate] = wanted;
        wanted = null;
        sky.setQuality(mode, animate);
    };
    const load = () => {
        if (typeof setupGalaxyField === 'function') {
            arrive();
            return;
        }
        if (script) return;
        script = document.createElement('script');
        script.src = source;
        script.onload = arrive;
        // Asked for again the next time High is chosen.
        script.onerror = () => {
            script.remove();
            script = null;
        };
        document.head.appendChild(script);
    };
    // Fetched, but not run, as soon as the pointer or the keyboard reaches the
    // slider, so a first move to High on a slow connection does not wait for it.
    const fetchAhead = () => {
        if (ahead || script) return;
        ahead = document.createElement('link');
        ahead.rel = 'prefetch';
        ahead.as = 'script';
        ahead.href = source;
        document.head.appendChild(ahead);
    };
    const slider = document.getElementById('fx-slider');
    slider?.addEventListener('pointerenter', fetchAhead, { once: true, passive: true });
    slider?.addEventListener('focusin', fetchAhead, { once: true, passive: true });
    canvas.hidden = true;
    const remember = name => () => {
        if (sky) sky[name]();
        else settings.push(name);
    };
    return {
        move: event => sky?.move(event),
        release: () => sky?.release(),
        scroll: y => sky?.scroll(y),
        refreshLayout: () => sky?.refreshLayout(),
        touchStart: (id, x, y, target) => sky?.touchStart(id, x, y, target),
        touchMove: (id, x, y) => sky?.touchMove(id, x, y),
        touchEnd: id => sky?.touchEnd(id),
        ease: remember('ease'),
        lighten: remember('lighten'),
        sharpen: remember('sharpen'),
        setQuality(mode, animate) {
            if (sky) {
                sky.setQuality(mode, animate);
                return;
            }
            wanted = mode === 'high' ? [mode, animate] : null;
            if (wanted) load();
        }
    };
}

// Which surfaces answer a pointer, and how far each one is allowed to move.
// The spotlight and the tilt are lifted from motion-primitives' Spotlight and
// Tilt; their rotation default is 15deg, which is far too much for a card the
// size of a project card, so this runs at 4deg at the very corner.
const CARD_SURFACE_SELECTOR = '.project-card, .about-highlight, .skill-group';
// The glass buttons answer the pointer as the cards do -- they lean toward it
// -- but lean much further: a button a few dozen pixels across has to turn a
// long way before the lean shows at all.
const GLASS_BUTTON_SELECTOR = '.hero-buttons > .btn, .social-links > a, .social-links > .resume-icon-unavailable, '
    + '.contact-links > .btn, .carousel-arrow, .icon-control';
const REACTIVE_CARD_SELECTOR = `${CARD_SURFACE_SELECTOR}, ${GLASS_BUTTON_SELECTOR}`;
const PRESSABLE_SELECTOR = '.project-card, .about-highlight-link, .btn, .link-btn, .carousel-arrow, .icon-control, .social-links a';
const CARD_TILT_DEGREES = 4;
const BUTTON_TILT_DEGREES = 12;

// Set by setupPointerReactiveSurfaces, and called by anything that moves a card
// out from under a cursor that has not itself moved -- every carousel step, and
// every scroll of the page itself. For a carousel a scroll event would have
// been the natural signal, but an element's scroll does not bubble, and a
// captured one never arrives either.
let retargetPointerSurfaces = () => {};
const PRESS_RIPPLE_MAX_SIZE = 460;

// The lift a card or a button takes under the cursor, held steady. Lifted by
// :hover alone, a card met from below rose off the cursor: its foot climbed
// past the pointer, the hover ended, the card dropped back onto it and rose
// again, over and over, which read as ghosting along its bottom edge. Here a
// card or control is raised (.is-raised, portfolio.css) when the cursor
// reaches it and stays raised for as long as the cursor is anywhere over the
// place it rests, however far it has risen. Cards and controls are tracked
// apart, so a card stays up while the cursor is on a button inside it. Mice
// only, at every effects level; a touch keeps the plain :hover lift.
const LIFT_CARD_SELECTOR = CARD_SURFACE_SELECTOR;
const LIFT_CONTROL_SELECTOR = '.btn, .link-btn, .modal-quick-link, .carousel-arrow, .icon-control, .social-links a, .resume-icon-unavailable';
// How far a raised surface's resting place reaches below where it is now
// drawn: at least its lift (6px for a card, 3px for a control).
const LIFT_REACH = 8;
// A raised surface rides its lift, and its lean, on a compositor layer of its
// own (.is-steady, portfolio.css), taken as it rises and kept until a moment
// after it has settled back. Left to itself the browser made a card a layer
// for exactly as long as it was moving and folded it back into the page the
// instant it landed, and on some screens the strip the card had just left was
// never drawn again: a copy of its lit top edge hung over it after the cursor
// had gone, one more for every pass. Folded back while it sits still, it
// leaves nothing behind. Only the surfaces under the cursor are ever raised,
// so this is a layer or two at a time, never one for each of the page's two
// hundred.
const LIFT_SETTLE_MS = 1000;
function setupSteadyLift() {
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    let x = 0, y = 0, lastTarget = null, frame = 0;
    const track = selector => ({ selector, raised: null, rest: null });
    const tracks = [track(LIFT_CARD_SELECTOR), track(LIFT_CONTROL_SELECTOR)];
    const settling = new Map();
    const hold = element => {
        clearTimeout(settling.get(element));
        settling.delete(element);
        element.classList.add('is-steady');
    };
    const release = element => {
        clearTimeout(settling.get(element));
        settling.set(element, window.setTimeout(() => {
            settling.delete(element);
            element.classList.remove('is-steady');
        }, LIFT_SETTLE_MS));
    };
    const lower = t => {
        if (t.raised) {
            t.raised.classList.remove('is-raised');
            release(t.raised);
        }
        t.raised = t.rest = null;
    };
    const restOf = element => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom + LIFT_REACH };
    };
    const over = rest => rest && x >= rest.left && x <= rest.right && y >= rest.top && y <= rest.bottom;
    const settle = (target, moved) => {
        for (const t of tracks) {
            const hit = target instanceof Element ? target.closest(t.selector) : null;
            if (hit && hit === t.raised) {
                if (moved) t.rest = restOf(hit);
                continue;
            }
            // Off the surface but still over where it rests: the cursor is in
            // the strip its lift uncovered.
            if (!hit && over(t.rest)) continue;
            lower(t);
            if (hit) {
                t.raised = hit;
                t.rest = restOf(hit);
                hold(hit);
                hit.classList.add('is-raised');
            }
        }
    };
    const leave = () => {
        lastTarget = null;
        tracks.forEach(lower);
    };
    document.addEventListener('pointermove', event => {
        if (event.pointerType !== 'mouse' || !finePointer.matches) return leave();
        x = event.clientX;
        y = event.clientY;
        if (event.target !== lastTarget) {
            lastTarget = event.target;
            settle(event.target, false);
        } else {
            for (const t of tracks) if (t.raised && !t.raised.contains(event.target) && !over(t.rest)) lower(t);
        }
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
    window.addEventListener('blur', leave);
    // A scroll or a carousel step moves the surfaces under a cursor that has
    // not moved: ask once a frame what is under it now.
    const relift = () => {
        if (frame || !tracks.some(t => t.raised) && !lastTarget) return;
        frame = window.requestAnimationFrame(() => {
            frame = 0;
            const under = document.elementFromPoint(x, y);
            lastTarget = under;
            settle(under, true);
        });
    };
    window.addEventListener('scroll', relift, { passive: true });
    const retargetOthers = retargetPointerSurfaces;
    retargetPointerSurfaces = () => {
        retargetOthers();
        relift();
    };
}

// Pointer-reactive cards. One listener for the whole page rather than a pair
// per card: the archive can hold a hundred of them, and only one can be under
// the cursor at a time.
function setupPointerReactiveSurfaces(reducedMotion) {
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const highEffects = () => document.documentElement.dataset.effects !== 'low';

    let activeCard = null;
    let activeRect = null;
    let lastHitTarget = null;
    let pointerX = 0;
    let pointerY = 0;
    // Whether that position belongs to a cursor that is over the page right now.
    let pointerInside = false;
    let frame = 0;
    let retargetFrame = 0;

    const clearActiveCard = () => {
        if (!activeCard) return;
        // Dropping the class and zeroing the angles in the same frame lets the
        // card's own transform transition carry it back to flat.
        activeCard.classList.remove('is-tilting');
        // A card's light fades out where the cursor left it: it is slid into
        // place rather than drawn there (portfolio.css), and without its
        // position it would slide off to the corner as it faded. A button's
        // highlight goes back to where it rests.
        const properties = ['--card-glow', '--card-tilt-x', '--card-tilt-y', '--lean-width'];
        if (activeCard.matches(GLASS_BUTTON_SELECTOR)) properties.push('--card-glow-x', '--card-glow-y');
        properties.forEach(property => activeCard.style.removeProperty(property));
        activeCard = null;
        activeRect = null;
    };

    // Every card leans, wherever it stands -- the project cards, and the About
    // and Skills cards beside them. A card inside a carousel is already placed
    // by that carousel, so the CSS folds the same tilt, lift and press
    // properties into the placement it owns rather than replacing it -- the
    // archive rings keep turning underneath the lean.
    const canTilt = () => !reducedMotion.matches && highEffects();

    const paint = () => {
        frame = 0;
        if (!activeCard) return;
        if (!activeRect) activeRect = activeCard.getBoundingClientRect();
        const { left, top, width, height } = activeRect;
        if (!width || !height) return;
        const offsetX = pointerX - left;
        const offsetY = pointerY - top;
        activeCard.style.setProperty('--card-glow-x', `${offsetX.toFixed(1)}px`);
        activeCard.style.setProperty('--card-glow-y', `${offsetY.toFixed(1)}px`);
        activeCard.style.setProperty('--card-glow', '1');
        if (!canTilt()) return;
        // Same mapping motion-primitives uses: the pointer's position across the
        // box as -0.5..0.5, read straight into rotateX and -rotateY, so the card
        // leans toward the cursor.
        const acrossX = offsetX / width - .5;
        const acrossY = offsetY / height - .5;
        const isButton = activeCard.matches(GLASS_BUTTON_SELECTOR);
        const degrees = isButton ? BUTTON_TILT_DEGREES : CARD_TILT_DEGREES;
        // A pill leans over a depth in proportion to its own width (see
        // portfolio.css), so a wide one turns as gently as a narrow one.
        if (isButton) activeCard.style.setProperty('--lean-width', `${width.toFixed(0)}px`);
        activeCard.style.setProperty('--card-tilt-x', `${(acrossY * 2 * degrees).toFixed(2)}deg`);
        activeCard.style.setProperty('--card-tilt-y', `${(-acrossX * 2 * degrees).toFixed(2)}deg`);
        activeCard.classList.add('is-tilting');
    };

    const schedulePaint = () => {
        if (!frame) frame = window.requestAnimationFrame(paint);
    };

    document.addEventListener('pointermove', event => {
        if (event.pointerType !== 'mouse' || !finePointer.matches) {
            pointerInside = false;
            lastHitTarget = null;
            clearActiveCard();
            return;
        }
        pointerX = event.clientX;
        pointerY = event.clientY;
        pointerInside = true;
        // Low FX shows neither the light nor the lean, so nothing is worked
        // out or written for them: every write restyles the card it lands on.
        if (!highEffects()) {
            clearActiveCard();
            lastHitTarget = null;
            return;
        }
        // closest() only when the pointer actually crosses into a new element,
        // which is the same trick the cursor dot uses to stay cheap.
        if (event.target !== lastHitTarget) {
            lastHitTarget = event.target;
            const card = event.target instanceof Element
                ? event.target.closest(REACTIVE_CARD_SELECTOR)
                : null;
            if (card !== activeCard) {
                clearActiveCard();
                activeCard = card;
                if (card) activeRect = card.getBoundingClientRect();
            }
        }
        if (activeCard) schedulePaint();
    }, { passive: true });

    // A wheel carries the cursor's position as well, so a page scrolled right
    // after it loads -- before the mouse has moved at all -- still knows which
    // card the cursor is resting on.
    window.addEventListener('wheel', event => {
        if (!finePointer.matches) return;
        pointerX = event.clientX;
        pointerY = event.clientY;
        pointerInside = true;
    }, { passive: true });

    // Scrolling slides the page under a cursor that has not moved, and no
    // pointermove says so: the card that scrolled away kept its light and its
    // lean, and the one arriving under the cursor never picked them up. Each
    // scrolled frame is treated as the cursor travelling across the page
    // instead -- one hit test and one rectangle read a frame, the same price a
    // real pointermove pays.
    window.addEventListener('scroll', () => retargetPointerSurfaces(), { passive: true });
    window.addEventListener('resize', () => { activeRect = null; }, { passive: true });

    // A carousel slides its cards past a cursor that never moved, so the
    // pointermove listener hears nothing: the lean would stay on the card that
    // has walked away and the one now under the cursor would never take it. Ask
    // the document what is under the pointer instead, coalesced to one hit test
    // per frame -- which is what a real pointermove would have cost anyway.
    retargetPointerSurfaces = () => {
        activeRect = null;
        if (!finePointer.matches || !pointerInside || retargetFrame || !highEffects()) return;
        retargetFrame = window.requestAnimationFrame(() => {
            retargetFrame = 0;
            const under = document.elementFromPoint(pointerX, pointerY);
            const card = under instanceof Element ? under.closest(REACTIVE_CARD_SELECTOR) : null;
            lastHitTarget = under;
            if (card !== activeCard) {
                clearActiveCard();
                activeCard = card;
            }
            // This already runs inside a frame, so paint in it rather than one
            // frame behind whatever just moved the card.
            if (activeCard) {
                window.cancelAnimationFrame(frame);
                paint();
            }
        });
    };
    // A cursor that has left the page leaves only a stale position behind, and
    // nothing should be retargeted to that.
    const leaveCard = () => {
        pointerInside = false;
        lastHitTarget = null;
        clearActiveCard();
    };
    document.documentElement.addEventListener('pointerleave', leaveCard);
    window.addEventListener('blur', leaveCard);

    // ---------------------------------------------------------------- press
    const pressed = new Set();
    const releasePress = () => {
        pressed.forEach(surface => surface.classList.remove('is-pressed'));
        pressed.clear();
    };

    document.addEventListener('pointerdown', event => {
        if (event.button > 0) return;
        const surface = event.target instanceof Element
            ? event.target.closest(PRESSABLE_SELECTOR)
            : null;
        if (!surface || surface.matches('[aria-disabled="true"], :disabled')) return;
        surface.classList.add('is-pressed');
        pressed.add(surface);
        if (reducedMotion.matches || !highEffects()) return;

        const rect = surface.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const offsetX = event.clientX - rect.left;
        const offsetY = event.clientY - rect.top;
        // Reach the furthest corner, so the light always clears the surface it
        // was struck on -- capped, or a tall project card gets washed rather
        // than lit from the point of contact.
        const reachX = Math.max(offsetX, rect.width - offsetX);
        const reachY = Math.max(offsetY, rect.height - offsetY);
        const size = Math.min(Math.hypot(reachX, reachY) * 2, PRESS_RIPPLE_MAX_SIZE);
        surface.querySelectorAll(':scope > .press-ripple').forEach(stale => stale.remove());
        const ripple = document.createElement('span');
        ripple.className = 'press-ripple';
        ripple.style.left = `${offsetX}px`;
        ripple.style.top = `${offsetY}px`;
        ripple.style.setProperty('--ripple-size', `${size.toFixed(0)}px`);
        ripple.setAttribute('aria-hidden', 'true');
        surface.appendChild(ripple);
        ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
    }, { passive: true });

    // pointercancel covers the case that matters on a phone: the browser takes
    // the gesture over to scroll the page, and the card should let go with it.
    window.addEventListener('pointerup', releasePress, { passive: true });
    window.addEventListener('pointercancel', releasePress, { passive: true });
    window.addEventListener('blur', releasePress);
    window.addEventListener('scroll', releasePress, { passive: true });
}

function setupCursorEffects(cursorDot, reducedMotion) {
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    let enabled = true;
    let previousX = window.innerWidth / 2;
    let previousY = window.innerHeight / 2;
    let lastTarget = null;
    let lastSparkAt = 0;

    const syncPointerMode = () => {
        document.documentElement.classList.toggle('enhanced-pointer', enabled && finePointer.matches);
        if (!enabled || !finePointer.matches) {
            cursorDot.classList.remove('is-visible', 'is-interactive', 'is-pressed');
        }
    };
    syncPointerMode();

    const syncInteractive = target => {
        if (target === lastTarget) return;
        lastTarget = target;
        const interactive = target instanceof Element && target.closest('a, button, .project-card, .fx-slider');
        cursorDot.classList.toggle('is-interactive', Boolean(interactive));
    };

    // Scrolling the page under a still cursor changes what the dot is over
    // without a single pointermove. The browser still announces the element it
    // has arrived on with a pointerover, which is all the dot needs.
    window.addEventListener('pointerover', event => {
        if (!enabled || !finePointer.matches || event.pointerType !== 'mouse') return;
        syncInteractive(event.target);
    }, { passive: true });

    const move = event => {
        if (!enabled || !finePointer.matches || event.pointerType !== 'mouse') {
            if (event.pointerType && event.pointerType !== 'mouse') {
                cursorDot.classList.remove('is-visible', 'is-interactive', 'is-pressed');
            }
            return;
        }
        const movementX = event.clientX - previousX;
        const movementY = event.clientY - previousY;
        const movementSpeed = Math.hypot(movementX, movementY);
        previousX = event.clientX;
        previousY = event.clientY;
        cursorDot.style.transform = `translate3d(${previousX}px, ${previousY}px, 0) translate(-50%, -50%)`;
        cursorDot.classList.add('is-visible');
        syncInteractive(event.target);

        const now = performance.now();
        if (!reducedMotion.matches && movementSpeed > 10 && now - lastSparkAt > 80) {
            const reverseAngle = Math.atan2(movementY, movementX) + Math.PI;
            const sparkAngle = reverseAngle + (Math.random() - .5) * .9;
            const sparkDistance = 12 + Math.random() * 14;
            const spark = document.createElement('span');
            spark.className = 'cursor-spark';
            spark.style.left = `${previousX}px`;
            spark.style.top = `${previousY}px`;
            spark.style.setProperty('--spark-x', `${Math.cos(sparkAngle) * sparkDistance}px`);
            spark.style.setProperty('--spark-y', `${Math.sin(sparkAngle) * sparkDistance}px`);
            spark.style.setProperty('--spark-size', `${1.5 + Math.random()}px`);
            spark.setAttribute('aria-hidden', 'true');
            document.body.appendChild(spark);
            spark.addEventListener('animationend', () => spark.remove(), { once: true });
            lastSparkAt = now;
        }
    };

    window.addEventListener('pointerdown', event => {
        if (!enabled || event.button !== 0) return;
        const useMouseDot = finePointer.matches && event.pointerType === 'mouse';
        cursorDot.classList.toggle('is-pressed', useMouseDot);
        if (!useMouseDot) cursorDot.classList.remove('is-visible', 'is-interactive');
        if (reducedMotion.matches) return;
        const ripple = document.createElement('span');
        ripple.className = 'cursor-ripple';
        ripple.style.left = `${event.clientX}px`;
        ripple.style.top = `${event.clientY}px`;
        ripple.setAttribute('aria-hidden', 'true');
        document.body.appendChild(ripple);
        ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
    });
    window.addEventListener('pointerup', () => cursorDot.classList.remove('is-pressed'));
    window.addEventListener('blur', () => cursorDot.classList.remove('is-visible', 'is-pressed'));
    document.documentElement.addEventListener('pointerleave', () => cursorDot.classList.remove('is-visible', 'is-pressed'));
    const setEnabled = nextEnabled => {
        enabled = nextEnabled;
        syncPointerMode();
    };
    finePointer.addEventListener('change', syncPointerMode);
    return { move, setEnabled };
}

// How wide a project card image actually renders: full bleed on a phone, and a
// single grid column on anything larger. Kept next to the card markup because
// it has to match the --carousel-card-max-width the grid resolves to.
const CARD_IMAGE_SIZES = '(max-width: 639px) calc(100vw - 2rem), (max-width: 1007px) calc((100vw - 3.5rem) / 2), (max-width: 1599px) 440px, (max-width: 2559px) 560px, 640px';

// Project prose goes into HTML attributes in a few places. Anything with a
// quote or an angle bracket in it would otherwise break out of the attribute.
function escapeAttribute(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Markup for one project video. Videos live only inside the project modal, so
// nothing is requested from YouTube until someone opens a project that has one.
//
// The privacy-enhanced host is used regardless: it behaves identically for the
// viewer but keeps YouTube from writing tracking storage before playback.
function buildVideoEmbed(src, title, options = {}) {
    const hardened = String(src || '').replace(
        /^https?:\/\/(?:www\.)?youtube\.com\//,
        'https://www.youtube-nocookie.com/'
    );
    if (!hardened) return '';
    return `<iframe src="${escapeAttribute(hardened)}" title="${escapeAttribute(title || 'Project video')}"`
        + (options.lazy ? ' loading="lazy"' : '')
        + ' allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
}

// Every YouTube player runs a Google anti-abuse script that asks WebGPU for
// the graphics adapter, only to read its name. On Windows, Chrome answers by
// building a Direct3D 12 device from scratch, which holds the thread that
// draws every frame for ~400 ms, and once the player's page closes it throws
// that device away again: every project opened with a video froze the screen.
// While the page itself holds an adapter the device stays built, and the
// players are answered at once, so only the first video of a visit pays. It
// is asked for as that first player loads, so the one freeze comes when it
// would have anyway.
let graphicsAdapter = null;
function holdGraphicsAdapter() {
    if (graphicsAdapter || !navigator.gpu) return;
    graphicsAdapter = navigator.gpu.requestAdapter({ powerPreference: 'low-power' }).catch(() => null);
}

// Alt text for a project's lead image. `imageAlt` and `motionImageAlt` in the
// data describe what is actually in the frame; the title is only a fallback for
// a project whose description has not been written yet, and it is a poor one --
// it repeats the heading sitting right next to the image.
function describeImage(project, variant = 'still') {
    const described = variant === 'motion'
        ? project.motionImageAlt || project.imageAlt
        : project.imageAlt;
    return described || project.title;
}

function renderProfile(profile) {
    ['nav-name', 'footer-name', 'hero-name'].forEach(id => document.getElementById(id).textContent = profile.name);
    document.getElementById('hero-tagline').textContent = profile.tagline || profile.title;
    document.getElementById('about-bio').textContent = profile.bio;
    const highlights = document.getElementById('about-highlights');
    if (highlights) {
        highlights.innerHTML = (profile.aboutHighlights || []).map(highlight => {
            const roles = (highlight.roles || []).map(role => `<div class="about-highlight-role"><h4>${role.title}</h4><p>${[role.position, role.period].filter(Boolean).join(' • ')}</p></div>`).join('');
            const content = `<span class="about-highlight-label">${highlight.label}</span><h3>${highlight.title}</h3><p>${highlight.body}</p>${roles}${highlight.subline ? `<p class="about-highlight-subline">${highlight.subline}</p>` : ''}${highlight.cta ? `<span class="about-highlight-cta">${highlight.cta} <i class="fa-solid fa-arrow-down" aria-hidden="true"></i></span>` : ''}`;
            return highlight.targetCollection
                ? `<a class="about-highlight about-highlight-link" href="#${highlight.targetCollection}" data-collection-target="${highlight.targetCollection}" aria-label="${highlight.cta || `View ${highlight.label}`}">${content}</a>`
                : `<article class="about-highlight">${content}</article>`;
        }).join('');
        highlights.querySelectorAll('[data-collection-target]').forEach(link => {
            link.addEventListener('click', event => {
                event.preventDefault();
                const collection = document.getElementById(link.dataset.collectionTarget);
                if (!collection) return;
                const toggle = collection.querySelector('.collection-toggle');
                if (toggle?.getAttribute('aria-expanded') !== 'true') toggle?.click();
                window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
                    collection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }));
            });
        });
        setupResponsiveCardSlider(highlights, {
            cardSelector: '.about-highlight',
            controlLabel: 'Browse education and experience',
            regionLabel: 'Education and experience highlights'
        });
    }
    const emailAddress = profile.email?.trim();
    const prefersNativeEmailApp = navigator.userAgentData?.mobile === true
        || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    const emailUrl = emailAddress
        ? prefersNativeEmailApp
            ? `mailto:${emailAddress}`
            : `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(emailAddress)}`
        : '';
    const links = [
        [profile.github, 'fa-brands fa-github', 'GitHub'], [profile.linkedin, 'fa-brands fa-linkedin', 'LinkedIn'],
        [profile.grabcad, 'fa-solid fa-cube', 'GrabCAD'], [emailUrl, 'fa-solid fa-envelope', `Email ${emailAddress || ''}`, 'Email Me']
    ].filter(([url]) => url && !url.startsWith('UPDATE'));
    const renderProfileLink = ([url, icon, label, buttonLabel], className = '') => {
        const externalAttributes = url.startsWith('mailto:') ? '' : ' target="_blank" rel="noopener"';
        const classAttribute = className ? ` class="${className}"` : '';
        return `<a href="${url}"${externalAttributes}${classAttribute} title="${label}" aria-label="${label}"><i class="${icon}" aria-hidden="true"></i>${className ? ` ${buttonLabel || label}` : ''}</a>`;
    };
    document.getElementById('hero-social').innerHTML = links.map(link => renderProfileLink(link)).join('');
    const resumeButton = profile.resume
        ? `<a href="${profile.resume}" target="_blank" rel="noopener" class="btn secondary-btn"><i class="fa-solid fa-file-arrow-down" aria-hidden="true"></i> Resume</a>`
        : `<span class="btn secondary-btn resume-unavailable" aria-disabled="true" title="Add a résumé PDF to activate this button"><i class="fa-solid fa-file-arrow-down" aria-hidden="true"></i> Resume</span>`;
    const resumeIcon = profile.resume
        ? `<a href="${profile.resume}" target="_blank" rel="noopener" title="Resume"><i class="fa-solid fa-file-arrow-down" aria-hidden="true"></i></a>`
        // Reads as a live control beside the other icons rather than a dead one,
        // because the résumé is coming. It still carries aria-disabled and still
        // goes nowhere, so nothing is promised to a screen reader that the page
        // cannot deliver -- set `resume` in portfolio-data.json and it becomes a
        // real link with no other change.
        : `<span class="resume-icon-unavailable" aria-disabled="true" title="Résumé coming soon"><i class="fa-solid fa-file-arrow-down" aria-hidden="true"></i></span>`;
    document.getElementById('hero-social').innerHTML += resumeIcon;

    // Resume, GitHub and Email Me are one row of equal buttons, and they fill
    // the three cells of the same page grid every other region uses. Email was
    // briefly promoted to a louder primary button above this row; that read as a
    // competing control rather than as the close of the section, so it sits back
    // here in the same weight as the other two.
    document.getElementById('contact-links-container').innerHTML =
        resumeButton + links.map(link => renderProfileLink(link, 'btn secondary-btn')).join('');
}

function renderSkills(categories) {
    const container = document.getElementById('skills-container');
    container.innerHTML = categories.map(cat => `<div class="skill-group"><h3 class="skill-group-title">${cat.name}</h3><div class="skill-tags">${cat.skills.map(skill => `<span class="tag">${skill}</span>`).join('')}</div></div>`).join('');
    setupResponsiveCardSlider(container, {
        cardSelector: '.skill-group',
        controlLabel: 'Browse skill categories',
        regionLabel: 'Skill categories'
    });
}

// The one arrow every carousel control draws: a round-capped chevron stroked in
// the button's own colour, so hover and disabled restyle it along with the
// rest of the button. An inline path rather than an icon-font glyph keeps the
// stroke's rounded ends, and does not depend on which glyphs the Font Awesome
// subset ships.
const CAROUSEL_CHEVRON_LEFT = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15.5 5 8.5 12l7 7"/></svg>';
const CAROUSEL_CHEVRON_RIGHT = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8.5 5l7 7-7 7"/></svg>';

// About and Skills follow the same responsive contract as Featured Projects:
// one complete three-card row when it fits, two cards per view at medium
// widths, and one per view on a compact phone. The class is removed entirely
// on a roomy viewport, which restores the original grid and removes horizontal
// scrolling instead of leaving an invisible carousel around the cards.
function setupResponsiveCardSlider(container, options) {
    const cards = [...container.querySelectorAll(options.cardSelector)];
    if (cards.length < 2 || container.dataset.responsiveSliderReady === 'true') return;
    container.dataset.responsiveSliderReady = 'true';

    const controls = document.createElement('div');
    controls.className = 'carousel-controls responsive-card-slider-controls';
    controls.innerHTML = `<span>${options.controlLabel}</span><div><button class="carousel-arrow carousel-prev" type="button" aria-label="Previous ${options.regionLabel}">${CAROUSEL_CHEVRON_LEFT}</button><button class="carousel-arrow carousel-next" type="button" aria-label="Next ${options.regionLabel}">${CAROUSEL_CHEVRON_RIGHT}</button></div>`;
    container.before(controls);

    const indicators = document.createElement('div');
    indicators.className = 'carousel-indicators responsive-card-slider-indicators';
    indicators.setAttribute('aria-label', `Choose ${options.regionLabel}`);
    container.after(indicators);

    const previous = controls.querySelector('.carousel-prev');
    const next = controls.querySelector('.carousel-next');
    const compactViewport = window.matchMedia('(max-width: 639px)');
    const carouselConstraints = [
        window.matchMedia('(max-width: 1080px)'),
        window.matchMedia('(device-posture: folded)'),
        window.matchMedia('(horizontal-viewport-segments: 2)')
    ];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let currentIndex = 0;
    let maxIndex = 0;
    let scrollFrame = 0;
    let scrollTarget = null;
    let settleTimer = 0;

    const getDistance = () => {
        const gap = Number.parseFloat(getComputedStyle(container).gap) || 0;
        return (cards[0]?.getBoundingClientRect().width || 0) + gap;
    };

    const updateControls = () => {
        previous.disabled = currentIndex <= 0;
        next.disabled = currentIndex >= maxIndex;
        [...indicators.children].forEach((indicator, index) => {
            const active = index === currentIndex;
            indicator.classList.toggle('is-active', active);
            if (active) indicator.setAttribute('aria-current', 'true');
            else indicator.removeAttribute('aria-current');
        });
    };

    const rebuildIndicators = () => {
        const pageCount = maxIndex + 1;
        if (indicators.childElementCount === pageCount) return;
        indicators.innerHTML = '';
        Array.from({ length: pageCount }, (_, index) => {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.className = 'carousel-indicator';
            dot.setAttribute('aria-label', `Show ${options.regionLabel} ${index + 1}`);
            dot.addEventListener('click', () => goTo(index));
            indicators.appendChild(dot);
            return dot;
        });
    };

    const goTo = (index, animate = true) => {
        currentIndex = Math.max(0, Math.min(index, maxIndex));
        const distance = getDistance();
        // Keep the requested destination through intermediate scroll events.
        // Otherwise a second Next click starts from the first animation's
        // halfway position and silently loses a step.
        scrollTarget = currentIndex;
        window.clearTimeout(settleTimer);
        container.scrollTo({
            left: currentIndex * distance,
            behavior: animate && !reducedMotion.matches ? 'smooth' : 'auto'
        });
        updateControls();
        settleTimer = window.setTimeout(settleScroll, 180);
    };

    const settleScroll = () => {
        window.clearTimeout(settleTimer);
        scrollTarget = null;
        const distance = getDistance();
        if (distance) currentIndex = Math.max(0, Math.min(Math.round(container.scrollLeft / distance), maxIndex));
        updateControls();
    };

    const updateLayout = () => {
        const useSlider = carouselConstraints.some(constraint => constraint.matches);
        const wasSlider = container.classList.contains('is-responsive-card-slider');
        container.classList.toggle('is-responsive-card-slider', useSlider);
        container.parentElement?.classList.toggle('has-responsive-card-slider', useSlider);
        controls.classList.toggle('is-active', useSlider);
        indicators.classList.toggle('is-active', useSlider);

        if (!useSlider) {
            currentIndex = 0;
            maxIndex = 0;
            container.removeAttribute('role');
            container.removeAttribute('aria-roledescription');
            container.removeAttribute('aria-label');
            // Only a row that was a slider has anywhere to scroll back from.
            // Setting it anyway makes the browser lay the page out there and
            // then, once for each row, in the middle of the page being built.
            if (wasSlider) container.scrollLeft = 0;
            updateControls();
            return;
        }

        const visibleCards = compactViewport.matches ? 1 : 2;
        maxIndex = Math.max(cards.length - visibleCards, 0);
        currentIndex = Math.min(currentIndex, maxIndex);
        container.setAttribute('role', 'region');
        container.setAttribute('aria-roledescription', 'carousel');
        container.setAttribute('aria-label', options.regionLabel);
        rebuildIndicators();
        goTo(currentIndex, false);
    };

    previous.addEventListener('click', () => goTo(currentIndex - 1));
    next.addEventListener('click', () => goTo(currentIndex + 1));
    container.addEventListener('scroll', () => {
        if (!container.classList.contains('is-responsive-card-slider') || scrollFrame) return;
        scrollFrame = window.requestAnimationFrame(() => {
            scrollFrame = 0;
            const distance = getDistance();
            if (!distance) return;
            if (scrollTarget === null) currentIndex = Math.max(0, Math.min(Math.round(container.scrollLeft / distance), maxIndex));
            updateControls();
            window.clearTimeout(settleTimer);
            settleTimer = window.setTimeout(settleScroll, 180);
            retargetPointerSurfaces();
        });
    }, { passive: true });
    container.addEventListener('scrollend', settleScroll);
    // A new manual gesture takes over from any pending button animation.
    container.addEventListener('pointerdown', settleScroll, { passive: true });
    container.addEventListener('wheel', settleScroll, { passive: true });

    // A mouse drags the row the way it drags Featured, with the same landing
    // rules. Touch is left to the browser: its own swipe already carries
    // momentum and settles on a snap point, so it needs nothing from here.
    let drag = null;
    let suppressClick = false;
    const settleDrag = () => {
        if (!drag?.horizontal) container.classList.remove('is-dragging');
    };
    const finishDrag = event => {
        if (!drag || event.pointerId !== drag.id) return;
        const { horizontal, startX, lastX, startLeft } = drag;
        drag = null;
        if (!horizontal) return;
        const distance = getDistance();
        if (!distance) {
            settleDrag();
            return;
        }
        // Half a card or more lands on whatever the drag reached; anything
        // shorter but deliberate still steps one, the way a phone swipe does;
        // a nudge settles back where it started.
        const travelled = lastX - startX;
        const startIndex = Math.round(startLeft / distance);
        const target = Math.abs(travelled) >= distance * .5
            ? Math.round(container.scrollLeft / distance)
            : Math.abs(travelled) >= 36
                ? startIndex + (travelled < 0 ? 1 : -1)
                : startIndex;
        // The click that follows this release belongs to the drag, not to the
        // card it started on. It is dispatched before any timer can run.
        suppressClick = true;
        window.setTimeout(() => { suppressClick = false; }, 0);
        goTo(target);
        if (Math.abs(container.scrollLeft - currentIndex * distance) < 1) {
            settleDrag();
        } else {
            container.addEventListener('scrollend', settleDrag, { once: true });
            window.setTimeout(settleDrag, 700);
        }
    };
    container.addEventListener('pointerdown', event => {
        if (event.pointerType !== 'mouse' || event.button !== 0
            || !container.classList.contains('is-responsive-card-slider')) return;
        drag = {
            id: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            lastX: event.clientX,
            startLeft: container.scrollLeft,
            horizontal: null
        };
    }, { passive: true });
    container.addEventListener('pointermove', event => {
        if (!drag || event.pointerId !== drag.id) return;
        // Released somewhere this element never heard about.
        if (!(event.buttons & 1)) {
            finishDrag(event);
            return;
        }
        const horizontalDistance = event.clientX - drag.startX;
        const verticalDistance = event.clientY - drag.startY;
        drag.lastX = event.clientX;
        if (drag.horizontal === null) {
            if (Math.hypot(horizontalDistance, verticalDistance) <= 8) return;
            drag.horizontal = Math.abs(horizontalDistance) > Math.abs(verticalDistance) * 1.12;
            if (!drag.horizontal) return;
            try { container.setPointerCapture(event.pointerId); } catch { /* released already */ }
            window.getSelection()?.removeAllRanges();
            container.classList.add('is-dragging');
        }
        if (drag.horizontal) container.scrollLeft = drag.startLeft - horizontalDistance;
    }, { passive: true });
    container.addEventListener('pointerup', finishDrag, { passive: true });
    container.addEventListener('pointercancel', finishDrag, { passive: true });
    window.addEventListener('pointerup', finishDrag, { passive: true });
    window.addEventListener('pointercancel', finishDrag, { passive: true });
    container.addEventListener('lostpointercapture', finishDrag);
    window.addEventListener('blur', () => {
        if (drag) finishDrag({ pointerId: drag.id });
    });
    container.addEventListener('click', event => {
        if (!suppressClick) return;
        event.preventDefault();
        event.stopPropagation();
    }, true);
    // About cards are links, and a link starts the browser's own drag after a
    // few pixels -- which cancels the pointer before the swipe has begun.
    container.addEventListener('dragstart', event => {
        if (container.classList.contains('is-responsive-card-slider')) event.preventDefault();
    });

    // Autoplay only runs while the row really is a slider, so every layout pass
    // that can switch it to or from the grid tells it.
    const autoplay = setupSliderAutoplay({
        areas: [controls, container, indicators],
        track: container,
        isActive: () => container.classList.contains('is-responsive-card-slider'),
        advance: () => goTo(currentIndex >= maxIndex ? 0 : currentIndex + 1)
    });
    const relayout = () => {
        updateLayout();
        autoplay.sync();
    };
    carouselConstraints.forEach(constraint => constraint.addEventListener?.('change', relayout));
    compactViewport.addEventListener?.('change', relayout);
    const layoutObserver = new ResizeObserver(() => window.requestAnimationFrame(relayout));
    layoutObserver.observe(container);
    relayout();
}

// The About, Skills and Featured sliders move on by themselves -- but only for
// someone browsing with a mouse. On a touch screen a row that slides away from
// under a thumb is a nuisance, and a reduced-motion preference turns it off
// outright. Pointing at a slider (its cards, its arrows or its dots) holds it
// still, as does keyboard focus inside it, and one that has just been moved by
// hand waits longer before carrying on. It rests while it is off screen or the
// tab is hidden, and after the last page it comes back round to the first.
// The archive rings under My Projects keep their own autoplay in setupCarousel;
// nothing here touches them.
const SLIDER_AUTOPLAY_INTERVAL = 5500;
const SLIDER_AUTOPLAY_AFTER_INTERACTION = 9000;

function setupSliderAutoplay({ areas, track, isActive, advance }) {
    const mouse = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const hovered = new Set(areas.filter(area => area.matches(':hover')));
    let focused = areas.some(area => area.contains(document.activeElement));
    let visible = false;
    let resumeAt = 0;
    let timer = 0;

    const canRun = () => mouse.matches
        && !reducedMotion.matches
        && isActive()
        && visible
        && hovered.size === 0
        && !focused
        && !document.hidden;

    const tick = () => {
        timer = 0;
        if (!canRun()) return;
        // A project open over the page is waited out, not scrolled behind.
        if (!document.getElementById('project-modal')?.classList.contains('active')) advance();
        start();
    };
    const start = () => {
        timer = window.setTimeout(tick, Math.max(SLIDER_AUTOPLAY_INTERVAL, resumeAt - Date.now()));
    };
    // Bring the timer in line with the current state, without cutting short a
    // countdown that is already running.
    const sync = () => {
        if (!canRun()) {
            window.clearTimeout(timer);
            timer = 0;
        } else if (!timer) {
            start();
        }
    };
    // A fresh countdown: once the pointer has left, or a hand has moved it.
    const restart = () => {
        window.clearTimeout(timer);
        timer = 0;
        sync();
    };

    areas.forEach(area => {
        area.addEventListener('pointerenter', event => {
            if (event.pointerType !== 'mouse') return;
            hovered.add(area);
            sync();
        });
        area.addEventListener('pointerleave', () => {
            hovered.delete(area);
            restart();
        });
        area.addEventListener('focusin', () => {
            focused = true;
            sync();
        });
        area.addEventListener('focusout', event => {
            if (areas.some(other => other.contains(event.relatedTarget))) return;
            focused = false;
            restart();
        });
        ['pointerdown', 'wheel', 'keydown'].forEach(type => area.addEventListener(type, () => {
            resumeAt = Date.now() + SLIDER_AUTOPLAY_AFTER_INTERACTION;
            restart();
        }, { passive: true }));
    });
    new IntersectionObserver(entries => {
        visible = entries[entries.length - 1].intersectionRatio >= .15;
        sync();
    }, { threshold: [0, .15] }).observe(track);
    document.addEventListener('visibilitychange', sync);
    mouse.addEventListener?.('change', sync);
    reducedMotion.addEventListener?.('change', sync);
    return { sync };
}

function renderFeaturedProjects(projects) {
    const container = document.getElementById('featured-projects-container');
    container.innerHTML = '';
    projects
        .filter(project => project.featured)
        .sort((first, second) => (first.featuredOrder ?? Number.MAX_SAFE_INTEGER) - (second.featuredOrder ?? Number.MAX_SAFE_INTEGER))
        .slice(0, 3)
        .forEach(project => container.appendChild(createProjectCard(project)));
    setupFeaturedCarousel(container);
}

function setupFeaturedCarousel(container) {
    const cards = [...container.querySelectorAll('.project-card')];
    if (cards.length < 2) return;
    container.classList.add('featured-project-carousel');
    const controls = document.createElement('div');
    controls.className = 'carousel-controls featured-carousel-controls';
    controls.innerHTML = `<span>Browse featured projects</span><div><button class="carousel-arrow carousel-prev" aria-label="Previous featured project">${CAROUSEL_CHEVRON_LEFT}</button><button class="carousel-arrow carousel-next" aria-label="Next featured project">${CAROUSEL_CHEVRON_RIGHT}</button></div>`;
    container.before(controls);
    const initialize = setupCarousel(container, controls, {
        autoplay: false,
        finite: true,
        indicators: true,
        enabled: () => container.classList.contains('is-responsive-carousel')
    });
    // The featured set is either one complete three-card row or a slider. At
    // medium widths the slider shows two cards; compact screens show one. A
    // folded or segmented viewport also uses the slider even when its combined
    // width exceeds the normal breakpoint, because each half is still narrow.
    const carouselConstraints = [
        window.matchMedia('(max-width: 1080px)'),
        window.matchMedia('(device-posture: folded)'),
        window.matchMedia('(horizontal-viewport-segments: 2)')
    ];
    // Autoplay steps through the dots rather than reaching into setupCarousel,
    // which the archive rings share: a dot already animates to its card, and
    // back round to the first, without the nudge an arrow press plays.
    const indicators = container.nextElementSibling?.classList.contains('carousel-indicators')
        ? container.nextElementSibling
        : null;
    const autoplay = setupSliderAutoplay({
        areas: [controls, container, indicators].filter(Boolean),
        track: container,
        isActive: () => container.classList.contains('is-responsive-carousel'),
        advance: () => {
            const dots = [...(indicators?.children || [])];
            if (!dots.length) return;
            const active = dots.findIndex(dot => dot.classList.contains('is-active'));
            dots[(active + 1) % dots.length].click();
        }
    });
    const updateLayout = () => {
        const useCarousel = carouselConstraints.some(constraint => constraint.matches);
        container.classList.toggle('project-carousel', useCarousel);
        container.classList.toggle('is-responsive-carousel', useCarousel);
        controls.classList.toggle('is-active', useCarousel);
        initialize();
        autoplay.sync();
    };
    carouselConstraints.forEach(constraint => constraint.addEventListener?.('change', updateLayout));
    const layoutObserver = new ResizeObserver(() => window.requestAnimationFrame(updateLayout));
    layoutObserver.observe(container);
    // Settle the first layout synchronously. Deferring it to rAF meant a page
    // opened in a background tab -- where rAF never fires until it is focused --
    // sat on the wrong tier until the visitor looked at it.
    updateLayout();
}

function buildProjectCardSummary(project) {
    const summary = project.cardSummary
        || project.summary
        || project.details
        || project.overview?.result
        || project.sections?.[0]?.body
        || 'Open the project to see the design and build details.';
    return String(summary).trim();
}

// A card in a collection nobody has opened yet holds its picture's address
// aside (data-src, data-srcset) until the collection is opened. Lazy loading
// alone did not hold it back: every card picture in every collection was
// fetched within a moment of the page loading -- twenty-five pictures, a
// megabyte and a half or more of a first visit -- for cards that sat in
// closed rows, and the card's picture box keeps its height either way.
function showDeferredPictures(root) {
    root.querySelectorAll('img[data-src]').forEach(image => {
        // All at once, as they always arrived: a ring turns its cards in from
        // places the browser never sees coming, and a lazy picture there
        // would be seen loading as it came round.
        image.loading = 'eager';
        // srcset first, so the browser picks one file rather than two.
        if (image.dataset.srcset) image.srcset = image.dataset.srcset;
        image.src = image.dataset.src;
        image.removeAttribute('data-src');
        image.removeAttribute('data-srcset');
    });
}

function createProjectCard(project, options = {}) {
    const card = document.createElement('article');
    card.className = 'project-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `View ${project.title} details`);
    const isCertificate = project.imagePresentation === 'certificate';
    // See showDeferredPictures.
    const sourceAttribute = options.deferImage ? 'data-src' : 'src';
    // A card draws into roughly 440 CSS px, so most screens want the 900px
    // variant rather than the full-size file the modal uses.
    const cardSrcset = project.imageSrcset
        ? ` ${options.deferImage ? 'data-srcset' : 'srcset'}="${project.imageSrcset}" sizes="${CARD_IMAGE_SIZES}"`
        : '';
    const cardMedia = project.image
        ? `<img ${sourceAttribute}="${project.image}"${cardSrcset} alt="${escapeAttribute(describeImage(project))}" class="project-image${isCertificate ? ' is-certificate-thumbnail' : ''}" loading="lazy" decoding="async"${project.motionImage ? ` data-motion-src="${project.motionImage}" data-motion-alt="${escapeAttribute(describeImage(project, 'motion'))}" data-still-alt="${escapeAttribute(describeImage(project))}" data-still-srcset="${project.imageSrcset || ''}"` : ''}>`
        : `<div class="media-placeholder card-media-placeholder"><i class="fa-solid fa-film" aria-hidden="true"></i><span>Preview coming soon</span></div>`;
    const projectPeriod = project.period
        ? `<div class="project-period"><i class="fa-regular fa-calendar" aria-hidden="true"></i>${project.period}</div>`
        : '';
    const cardDescription = buildProjectCardSummary(project);
    card.innerHTML = `<div class="project-image-wrapper">${cardMedia}<span class="project-category-badge">${project.category}</span></div><div class="project-info"><div class="project-heading"><h3 class="project-title">${project.title}</h3>${projectPeriod}</div><div class="project-copy"><p class="project-summary">${cardDescription}</p></div><div class="project-tags">${project.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}</div><div class="project-action-links">${buildLinkButtons(project.links)}</div></div>`;
    const motionImage = card.querySelector('[data-motion-src]');
    if (motionImage && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        card.addEventListener('pointerenter', () => {
            // srcset outranks src, so it has to go before the animation can show.
            motionImage.removeAttribute('srcset');
            motionImage.removeAttribute('sizes');
            motionImage.src = motionImage.dataset.motionSrc;
            // The picture changes, so the description has to change with it.
            motionImage.alt = motionImage.dataset.motionAlt || motionImage.alt;
            motionImage.classList.add('is-motion-active');
        }, { passive: true });
        card.addEventListener('pointerleave', () => {
            motionImage.src = project.image;
            if (motionImage.dataset.stillSrcset) {
                motionImage.setAttribute('srcset', motionImage.dataset.stillSrcset);
                motionImage.setAttribute('sizes', CARD_IMAGE_SIZES);
            }
            motionImage.alt = motionImage.dataset.stillAlt || motionImage.alt;
            motionImage.classList.remove('is-motion-active');
        }, { passive: true });
    }
    const activateCard = () => openModal(project);
    card._openProject = activateCard;
    card.addEventListener('click', event => { if (!event.target.closest('a')) activateCard(); });
    card.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        activateCard();
    });
    return card;
}

function renderProjectCollections(collections, projects) {
    const container = document.getElementById('project-collections');
    container.innerHTML = '';
    collections.forEach((collection, index) => {
        const group = document.createElement('section');
        group.className = 'project-collection';
        group.id = collection.id || collection.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const collectionProjects = projects
            .filter(project => collection.categories.includes(project.category)
                || project.additionalCategories?.some(category => collection.categories.includes(category)))
            .sort((first, second) => (first.collectionOrder ?? Number.MAX_SAFE_INTEGER) - (second.collectionOrder ?? Number.MAX_SAFE_INTEGER));
        // A row's standing invitation: how much is behind it, and that it
        // opens. The count is the reason to follow the instruction, so the two
        // are one phrase rather than a label with a separate nudge beside it.
        // The verb turns over with the row, so the words never contradict the
        // arrow next to them or the state the button reports to a reader.
        //
        // Not every collection holds projects: the archive also carries awards
        // and classes, and a row that called those projects would be naming
        // its own contents wrongly. A collection says what it holds with
        // `itemNoun`, and gives `itemNounPlural` as well where the plural is
        // not just an -s away -- "classes", not "classs".
        const nounSingular = collection.itemNoun || 'project';
        const nounPlural = collection.itemNounPlural || `${nounSingular}s`;
        const countLabel = `${collectionProjects.length} ${collectionProjects.length === 1 ? nounSingular : nounPlural}`;
        const cueMarkup = collectionProjects.length
            ? `<span class="collection-cue">View ${countLabel}</span>`
            : '';
        group.innerHTML = `<button class="collection-toggle" aria-expanded="false"><span class="collection-index">0${index + 1}</span><span class="collection-copy"><strong>${collection.name}</strong><small>${collection.description}</small>${cueMarkup}</span><i class="fa-solid fa-arrow-down" aria-hidden="true"></i></button><div class="collection-content" hidden></div>`;
        const content = group.querySelector('.collection-content');
        const gallery = document.createElement('div');
        const useCarousel = collection.carousel !== false && collectionProjects.length > 3;
        gallery.className = useCarousel ? 'project-carousel circular-project-carousel' : 'project-grid compact-project-grid';
        collectionProjects.forEach(project => gallery.appendChild(createProjectCard(project, { deferImage: true })));
        content.appendChild(gallery);
        let initializeCarousel = () => {};
        if (useCarousel) {
            const controls = document.createElement('div');
            controls.className = 'carousel-controls';
            controls.innerHTML = `<div><button class="carousel-arrow carousel-prev" aria-label="Previous project">${CAROUSEL_CHEVRON_LEFT}</button><button class="carousel-arrow carousel-next" aria-label="Next project">${CAROUSEL_CHEVRON_RIGHT}</button></div>`;
            content.prepend(controls);
            initializeCarousel = setupCarousel(gallery, controls, { autoplay: true, ring: true });
        }
        const toggle = group.querySelector('.collection-toggle');
        const cue = group.querySelector('.collection-cue');
        toggle.addEventListener('click', () => {
            const opening = toggle.getAttribute('aria-expanded') !== 'true';
            toggle.setAttribute('aria-expanded', String(opening));
            if (cue) cue.textContent = `${opening ? 'Hide' : 'View'} ${countLabel}`;
            content.hidden = !opening;
            if (opening) showDeferredPictures(content);
            // The backdrop is placed in page coordinates and stays there, so it
            // needs nothing from this beyond a nudge that the document is now a
            // different height -- the star tiles are cut to that height, and a
            // page grown past the sky already laid down needs more of it under
            // the new bottom.
            const announceGrowth = () => document.dispatchEvent(new Event('portfolio:content-shifted'));
            // A carousel sets its own height when it initialises, so on the way
            // open the document is not finished growing until that has run.
            if (opening) {
                window.requestAnimationFrame(() => {
                    initializeCarousel();
                    announceGrowth();
                });
            } else announceGrowth();
        });
        container.appendChild(group);
    });
    // Every card is on the page now, featured and archive alike.
    setupProjectCardFit();
}

// Cards grow to hold the longest front description -- up to their tier
// height, or past it where there is room -- but never past the room the
// window has under the bar (see "Project cards fit the window" in
// portfolio.css): a short window gets a card that fits it, and a description
// that still runs long fades out at the card's foot. How much room a
// description needs depends on how the text wraps at the width a card gets
// right now, so it is measured rather than guessed -- every card laid out once
// off screen, tall enough that its picture sits at full size, and the tallest
// need wins.
const CARD_IMAGE_SHARE = .36; // keep in step with --card-image-height
let refitProjectCards = null;

function setupProjectCardFit() {
    if (refitProjectCards) {
        refitProjectCards();
        return;
    }
    const measure = () => {
        const cards = [...document.querySelectorAll('.project-card:not(.carousel-clone)')];
        const sample = cards.find(card => card.offsetWidth > 0);
        if (!sample) return;
        const probe = document.createElement('div');
        probe.setAttribute('aria-hidden', 'true');
        probe.style.cssText = `position:absolute;left:-10000px;top:0;width:${sample.offsetWidth}px;visibility:hidden;pointer-events:none;`;
        const seen = new Set();
        cards.forEach(card => {
            const key = card.querySelector('.project-title')?.textContent;
            if (!key || seen.has(key)) return;
            seen.add(key);
            const clone = card.cloneNode(true);
            // Only the writing's size matters here; the pictures need not load again.
            clone.querySelectorAll('img').forEach(image => {
                image.removeAttribute('srcset');
                image.removeAttribute('src');
            });
            // The clone's own card height, not the page's: the picture is a
            // share of whichever is in force, and at 2000px that share is past
            // the tier cap, so the picture reads back at its full size.
            clone.style.setProperty('--card-height', '2000px');
            probe.appendChild(clone);
        });
        document.body.appendChild(probe);
        let need = 0;
        probe.querySelectorAll('.project-card').forEach(clone => {
            const info = clone.querySelector('.project-info');
            const copy = clone.querySelector('.project-copy');
            const summary = clone.querySelector('.project-summary');
            if (!info || !copy || !summary) return;
            // The text column with its description given exactly the room it
            // takes. scrollHeight rather than offsetHeight: the leading trim
            // hangs the last line box -- descenders included -- below the
            // paragraph's own box, and that has to fit too.
            const text = info.clientHeight - copy.clientHeight + summary.scrollHeight + 1;
            const pictureCap = clone.querySelector('.project-image-wrapper')?.offsetHeight || 0;
            const byShare = text / (1 - CARD_IMAGE_SHARE);
            need = Math.max(need, byShare * CARD_IMAGE_SHARE <= pictureCap ? byShare : pictureCap + text);
        });
        probe.remove();
        // A few pixels of slack for the sub-pixel rounding between the column
        // measured here and the one the card really gets. On the section that
        // holds the cards: on the root, it restyled and laid out the whole page
        // again for what only a project card reads.
        if (need) document.getElementById('projects').style.setProperty('--card-content-height', `${Math.ceil(need) + 6}px`);
    };
    let timer = 0;
    const schedule = () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(measure, 150);
    };
    refitProjectCards = measure;
    measure();
    // Again once the type has arrived, if it had not when that was measured
    // (laying the cards out above is what asks for any face not loaded yet).
    // With it already loaded, as on any visit but the first, the same cards were
    // measured a second time to the same answer: a tenth of a second on a slow
    // laptop, all in one task.
    if (document.fonts?.status === 'loading') document.fonts.ready.then(schedule);
    window.addEventListener('resize', schedule, { passive: true });
}

function setupCarousel(carousel, controls, options = {}) {
    const settings = typeof options === 'boolean' ? { autoplay: options } : options;
    const originalCards = [...carousel.querySelectorAll('.project-card')];
    if (originalCards.length < 2) return () => {};
    const ringSlots = settings.ring ? originalCards.length : 0;
    const visibleRingRadius = settings.ring && originalCards.length === 4 ? 1.05 : 2.05;
    const cloneCount = settings.finite ? 0 : Math.min(settings.ring ? 3 : 2, originalCards.length);
    const isEnabled = () => typeof settings.enabled !== 'function' || settings.enabled();
    if (settings.ring) {
        carousel.style.setProperty('--ring-project-count', String(ringSlots));
        carousel.dataset.ringVisibleCards = originalCards.length === 4 ? '3' : '5';
    }
    originalCards.forEach((card, index) => { card.dataset.carouselIndex = String(index); });
    const beforeClones = document.createDocumentFragment();
    const prepareClone = card => {
        const clone = card.cloneNode(true);
        clone.classList.add('carousel-clone');
        // A clone taken while the original is under the cursor would carry that
        // moment with it for good: the clone never receives the pointerup that
        // ends a press, and it is pointer-events: none, so nothing would ever
        // clear it.
        clone.classList.remove('is-pressed', 'is-tilting');
        ['--card-glow', '--card-glow-x', '--card-glow-y', '--card-tilt-x', '--card-tilt-y']
            .forEach(property => clone.style.removeProperty(property));
        clone.querySelectorAll('.press-ripple').forEach(ripple => ripple.remove());
        clone.setAttribute('aria-hidden', 'true');
        clone.setAttribute('tabindex', '-1');
        clone.querySelectorAll('img').forEach(image => {
            image.loading = 'eager';
            image.decoding = 'async';
        });
        clone.querySelectorAll('a, button, [tabindex]').forEach(item => item.setAttribute('tabindex', '-1'));
        return clone;
    };
    if (cloneCount > 0) {
        originalCards.slice(-cloneCount).forEach(card => {
            beforeClones.appendChild(prepareClone(card));
        });
        carousel.prepend(beforeClones);
        originalCards.slice(0, cloneCount).forEach(card => {
            carousel.appendChild(prepareClone(card));
        });
    }
    let currentIndex = 0;
    let currentPhysicalIndex = cloneCount;
    let autoplayTimer;
    let scrollAnimation;
    let snapTimer;
    let resizeFrame;
    let initialized = false;
    let isAnimating = false;
    let carouselVisible = true;
    let carouselHovered = false;
    let carouselFocused = false;
    let manualPauseUntil = 0;
    let interactionActive = false;
    let wheelLocked = false;
    let dragPointerId = null;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragStartScrollLeft = 0;
    let dragLastX = 0;
    let dragDirection = null;
    let suppressSwipeClick = false;
    let suppressSnapUntil = 0;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const autoplayEnabled = settings.autoplay && !reducedMotion.matches;
    const indicators = settings.indicators ? document.createElement('div') : null;
    const cards = [...carousel.querySelectorAll('.project-card')];
    const previous = controls.querySelector('.carousel-prev');
    const next = controls.querySelector('.carousel-next');

    if (indicators) {
        indicators.className = 'carousel-indicators';
        indicators.setAttribute('aria-label', 'Choose a featured project');
        originalCards.forEach((card, index) => {
            const dot = document.createElement('button');
            const category = card.querySelector('.project-category-badge')?.textContent || '';
            dot.type = 'button';
            dot.className = 'carousel-indicator';
            dot.style.setProperty('--indicator-color', category.includes('Internship') ? 'var(--red)' : 'var(--blue)');
            dot.setAttribute('aria-label', `Show featured project ${index + 1}`);
            indicators.appendChild(dot);
        });
        carousel.after(indicators);
    }

    const getMetrics = () => {
        const card = originalCards[0];
        if (!card) return null;
        const gap = Number.parseFloat(getComputedStyle(carousel).gap) || 0;
        const cardWidth = card.offsetWidth;
        const distance = cardWidth + gap;
        const centerOffset = Math.max((carousel.clientWidth - cardWidth) / 2, 0);
        return { cardWidth, gap, distance, lastIndex: originalCards.length - 1, centerOffset };
    };

    const getTargetForPhysicalIndex = physicalIndex => {
        const card = cards[Math.max(0, Math.min(physicalIndex, cards.length - 1))];
        if (!card) return 0;
        return card.offsetLeft + card.offsetWidth / 2 - carousel.clientWidth / 2;
    };

    const getNearestPhysicalIndex = () => {
        const carouselCenter = carousel.scrollLeft + carousel.clientWidth / 2;
        let nearestIndex = 0;
        let nearestDistance = Number.POSITIVE_INFINITY;
        cards.forEach((card, index) => {
            const distance = Math.abs(card.offsetLeft + card.offsetWidth / 2 - carouselCenter);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestIndex = index;
            }
        });
        return nearestIndex;
    };

    const setInternalScrollPosition = left => {
        suppressSnapUntil = performance.now() + 180;
        carousel.scrollLeft = left;
    };

    const updateIndicators = () => {
        if (indicators) {
            [...indicators.children].forEach((indicator, index) => {
                const active = index === currentIndex;
                indicator.classList.toggle('is-active', active);
                if (active) indicator.setAttribute('aria-current', 'true');
                else indicator.removeAttribute('aria-current');
            });
        }
        if (settings.finite) {
            previous.disabled = currentIndex <= 0;
            next.disabled = currentIndex >= originalCards.length - 1;
        }
    };

    // How much of a card is left as it goes round the edge of the ring.
    const ringFade = position => {
        const fadeStart = Math.max(0, visibleRingRadius - .05);
        const fadeEnd = visibleRingRadius + .75;
        const fadeProgress = Math.min(Math.max((Math.abs(position) - fadeStart) / (fadeEnd - fadeStart), 0), 1);
        return 1 - (fadeProgress * fadeProgress * (3 - 2 * fadeProgress));
    };
    // The cards too far round for anything of them to show (updateCardDepth).
    const RING_PARKED_FADE = .0125;
    const ringParked = new WeakSet();
    const clearCardDepth = () => {
        cards.forEach(card => {
            ringParked.delete(card);
            [
                '--carousel-position',
                '--carousel-depth',
                '--carousel-ring-x',
                '--carousel-ring-y',
                '--carousel-ring-z',
                '--carousel-ring-rotate',
                '--carousel-ring-scale',
                '--carousel-ring-opacity'
            ].forEach(property => card.style.removeProperty(property));
            card.style.removeProperty('z-index');
            card.style.removeProperty('pointer-events');
            card.classList.remove('is-carousel-active');
        });
    };

    const updateCardDepth = () => {
        if (!isEnabled()) {
            clearCardDepth();
            return;
        }
        const metrics = getMetrics();
        if (!metrics) return;
        const carouselCenter = carousel.scrollLeft + carousel.clientWidth / 2;
        // In Low a ring lies flat and nothing reads where it would place a card
        // (portfolio.css): every write below would only have the browser work
        // the card's style out afresh, for nothing, and on a slow machine that
        // was most of what a turn cost. All that shows is which card is in front.
        if (settings.ring && document.documentElement.dataset.effects === 'low') {
            cards.forEach(card => {
                const cardCenter = card.offsetLeft + card.offsetWidth / 2;
                const depth = Math.abs(cardCenter - carouselCenter) / metrics.distance;
                card.classList.toggle('is-carousel-active', depth < .18);
            });
            retargetPointerSurfaces();
            return;
        }
        const cardStates = cards.map(card => {
            const cardCenter = card.offsetLeft + card.offsetWidth / 2;
            const rawPosition = (cardCenter - carouselCenter) / metrics.distance;
            const position = settings.ring ? rawPosition : Math.max(-2.25, Math.min(2.25, rawPosition));
            return { card, position };
        });
        cardStates.forEach(state => {
            const { card, position } = state;
            const depth = Math.min(Math.abs(position), 1.65);
            // A card round the back of the ring stays where it is until it
            // comes round. A ring of sixteen wrote its cards' places on all
            // twenty-two of them, clones included, on every frame of a turn,
            // and each write has the browser work out that card's style afresh,
            // for a place at no opacity at all. Once its opacity is written as
            // none, nothing else about it can show. Not in High, measured:
            // there the page gives up what it saves here, and more, on the
            // graphics process (cycle 32).
            if (settings.ring && document.documentElement.dataset.effects !== 'high'
                && ringFade(position) <= RING_PARKED_FADE) {
                if (ringParked.has(card)) return;
                ringParked.add(card);
            } else ringParked.delete(card);
            card.style.setProperty('--carousel-position', position.toFixed(3));
            card.style.setProperty('--carousel-depth', depth.toFixed(3));
            if (settings.ring) {
                const rawAbsolutePosition = Math.abs(position);
                const absolutePosition = Math.min(rawAbsolutePosition, 3);
                const direction = Math.sign(position);
                const scaleAt = value => value <= 1
                    ? 1 - value * .08
                    : Math.max(.38, .92 - (value - 1) * .28);
                const spacingScaleAt = value => {
                    if (value <= 1) return 1 - value * .08;
                    if (value <= 2) return .92 - (value - 1) * .56;
                    return Math.max(0, .36 - (value - 2) * .36);
                };
                const ringScale = scaleAt(absolutePosition);
                const wholeSteps = Math.floor(absolutePosition);
                let targetMagnitude = 0;
                for (let step = 0; step < wholeSteps; step += 1) {
                    targetMagnitude += metrics.cardWidth * (spacingScaleAt(step) + spacingScaleAt(step + 1)) / 2 + metrics.gap;
                }
                const remainingStep = absolutePosition - wholeSteps;
                if (remainingStep > 0 && wholeSteps < 3) {
                    targetMagnitude += remainingStep * (
                        metrics.cardWidth * (spacingScaleAt(wholeSteps) + spacingScaleAt(wholeSteps + 1)) / 2 + metrics.gap
                    );
                }
                const targetX = direction * targetMagnitude;
                const naturalX = position * metrics.distance;
                const rotationMagnitude = absolutePosition <= 1
                    ? absolutePosition * 11
                    : 11 + (absolutePosition - 1) * 22;
                const circleRotation = direction * rotationMagnitude;
                const ringDepth = absolutePosition <= 1
                    ? absolutePosition * 88
                    : 88 + (absolutePosition - 1) * 132;
                const visibleOpacity = absolutePosition <= 1
                    ? .98 - absolutePosition * .16
                    : Math.max(.4, .82 - (absolutePosition - 1) * .22);
                const circleOpacity = ringParked.has(card) ? 0 : visibleOpacity * ringFade(position);
                const visibleOnRing = circleOpacity > .01;
                card.style.setProperty('--carousel-ring-x', `${(targetX - naturalX).toFixed(2)}px`);
                card.style.setProperty('--carousel-ring-y', `${Math.min(absolutePosition * 18, 46).toFixed(2)}px`);
                card.style.setProperty('--carousel-ring-z', `${(-ringDepth).toFixed(2)}px`);
                card.style.setProperty('--carousel-ring-rotate', `${circleRotation.toFixed(2)}deg`);
                card.style.setProperty('--carousel-ring-scale', ringScale.toFixed(3));
                card.style.setProperty('--carousel-ring-opacity', circleOpacity.toFixed(3));
                card.style.zIndex = String(Math.round(90 - absolutePosition * 30));
                // Anything the visitor can actually see on the ring answers the
                // pointer: the two outermost cards lean and light up like the
                // three in front of them, and a click on one walks the ring
                // round to it. Only the cards fading out past the edge are shut
                // off, so a card that is barely a ghost cannot take a click
                // meant for the one in front of it.
                card.style.pointerEvents = circleOpacity > .2 ? 'auto' : 'none';
                // A ring holds up to sixteen cards and shows about six. The
                // rest are turned round the back at no opacity at all -- and
                // each of those was still a sheet of glass, which costs the
                // browser a copy of the page behind it, frosted and bent
                // again every frame the sky moves. Ten invisible copies per
                // ring, on every ring the reader has open. Say which ones
                // have nothing to show, and glass.js takes their glass off
                // until they come round again.
                card.toggleAttribute('data-ring-hidden', !visibleOnRing);
            } else {
                card.style.zIndex = String(10 - Math.round(depth * 3));
                card.style.pointerEvents = Math.abs(position) < 1.25 ? 'auto' : 'none';
            }
            card.classList.toggle('is-carousel-active', depth < .18);
        });
        // The cards have just moved; whatever is under the cursor now may not
        // be what was under it a frame ago.
        retargetPointerSurfaces();
    };

    const initialize = () => {
        if (!isEnabled()) {
            window.cancelAnimationFrame(scrollAnimation);
            // The same as a slider that has never been one: nothing to scroll back.
            if (initialized) setInternalScrollPosition(0);
            initialized = false;
            isAnimating = false;
            currentIndex = 0;
            currentPhysicalIndex = cloneCount;
            clearCardDepth();
            updateIndicators();
            return;
        }
        const metrics = getMetrics();
        if (!metrics || metrics.distance <= 0) return;
        window.cancelAnimationFrame(scrollAnimation);
        if (!initialized) currentIndex = 0;
        currentPhysicalIndex = cloneCount + currentIndex;
        setInternalScrollPosition(getTargetForPhysicalIndex(currentPhysicalIndex));
        initialized = true;
        isAnimating = false;
        updateCardDepth();
        updateIndicators();
    };

    const syncIndexToNearestCard = () => {
        const physicalIndex = getNearestPhysicalIndex();
        currentPhysicalIndex = physicalIndex;
        currentIndex = settings.finite
            ? Math.max(0, Math.min(physicalIndex, originalCards.length - 1))
            : ((physicalIndex - cloneCount) % originalCards.length + originalCards.length) % originalCards.length;
        updateIndicators();
    };

    const stopAndCenterCurrentMotion = () => {
        window.cancelAnimationFrame(scrollAnimation);
        if (isAnimating) {
            isAnimating = false;
            syncIndexToNearestCard();
        }
        if (!getMetrics()) return;
        currentPhysicalIndex = cloneCount + currentIndex;
        setInternalScrollPosition(getTargetForPhysicalIndex(currentPhysicalIndex));
        updateCardDepth();
        updateIndicators();
    };

    const snapToNearestCard = () => {
        const metrics = getMetrics();
        if (!metrics) return;
        const physicalIndex = getNearestPhysicalIndex();
        currentPhysicalIndex = physicalIndex;
        currentIndex = settings.finite
            ? Math.max(0, Math.min(physicalIndex, originalCards.length - 1))
            : ((physicalIndex - cloneCount) % originalCards.length + originalCards.length) % originalCards.length;
        updateIndicators();
        animateScroll(getTargetForPhysicalIndex(physicalIndex));
    };

    const animateScroll = (target, onComplete) => {
        window.cancelAnimationFrame(scrollAnimation);
        const start = carousel.scrollLeft;
        const change = target - start;
        const baseDuration = 310;
        let animationProgress = reducedMotion.matches ? 1 : 0;
        let lastFrameAt = performance.now();
        isAnimating = true;
        const frame = now => {
            if (!reducedMotion.matches) {
                const frameTime = Math.min(Math.max(now - lastFrameAt, 0), 64);
                animationProgress = Math.min(animationProgress + (frameTime / baseDuration), 1);
                lastFrameAt = now;
            }
            const progress = animationProgress;
            const eased = progress * progress * (3 - 2 * progress);
            carousel.scrollTo({ left: start + (change * eased), behavior: 'auto' });
            updateCardDepth();
            if (progress < 1) {
                scrollAnimation = window.requestAnimationFrame(frame);
            } else {
                isAnimating = false;
                onComplete?.();
            }
        };
        scrollAnimation = window.requestAnimationFrame(frame);
    };
    const move = (step, button) => {
        if (!isEnabled()) return;
        if (!initialized) initialize();
        if (button) {
            controls.querySelectorAll('.carousel-arrow').forEach(arrow => arrow.classList.remove('is-nudging'));
            void button.offsetWidth;
            button.classList.add('is-nudging');
        }
        const metrics = getMetrics();
        if (!metrics || metrics.lastIndex <= 0) return;
        // A card two out along the ring is two steps away, not one. Never more
        // than the clone buffer, or the rebase above would have nothing
        // identical to land on.
        const requested = Math.trunc(step) || Math.sign(step);
        const direction = cloneCount > 0
            ? Math.max(-cloneCount, Math.min(requested, cloneCount))
            : requested;
        const positionCount = originalCards.length;

        if (isAnimating) {
            window.cancelAnimationFrame(scrollAnimation);
            isAnimating = false;
        }
        // An arrow pressed faster than a step can animate lets the index run
        // away from the ring that is still catching up to it. The clone buffer
        // is the only slack the rebase below has to work with, so the lead can
        // never be allowed past it: beyond that the rebase computes a negative
        // scroll position, the browser clamps it to zero, and the ring lurches
        // several cards at once. Past the limit, the next step starts from
        // where the ring actually is.
        if (!settings.finite && cloneCount > 0
            && Math.abs(currentPhysicalIndex - getNearestPhysicalIndex()) > cloneCount) {
            syncIndexToNearestCard();
        }
        // Rebasing is driven by where the ring *is*, not by where the index has
        // got to. Shifting the scroll back by a turn is only safe once the ring
        // itself is a whole turn along; going by the index instead put the
        // scroll below zero whenever the index was running ahead, and a clamped
        // scroll is a ring that has jumped several cards at once.
        const ringPosition = settings.finite ? 0 : getNearestPhysicalIndex();
        if (!settings.finite
            && (ringPosition < cloneCount
                || ringPosition >= cloneCount + originalCards.length)) {
            // Walking into the clone buffer is rebased back onto the real cards.
            // The clone is identical, so the swap is invisible -- as long as
            // both the index and the scroll move by exactly the same thing: one
            // whole turn of the ring. Re-seating the scroll at the index's
            // canonical position instead threw away however much of the last
            // step had not finished, and with the index a card or two ahead the
            // arithmetic went negative, the browser clamped it to zero, and the
            // ring lurched. Shifting by a turn cannot leave the strip, because
            // the ring has to be a whole turn along before this runs at all.
            const turn = getTargetForPhysicalIndex(cloneCount + originalCards.length)
                - getTargetForPhysicalIndex(cloneCount);
            const direction = ringPosition < cloneCount ? 1 : -1;
            currentPhysicalIndex += direction * originalCards.length;
            setInternalScrollPosition(carousel.scrollLeft + direction * turn);
            updateCardDepth();
        }

        const nextIndex = settings.finite
            ? Math.max(0, Math.min(currentIndex + direction, metrics.lastIndex))
            : ((currentIndex + direction) % positionCount + positionCount) % positionCount;
        if (settings.finite && nextIndex === currentIndex) {
            updateIndicators();
            return;
        }

        const physicalIndex = settings.finite
            ? nextIndex
            : currentPhysicalIndex + direction;
        currentIndex = nextIndex;
        currentPhysicalIndex = physicalIndex;
        updateIndicators();
        animateScroll(getTargetForPhysicalIndex(physicalIndex));
    };
    const scheduleAutoplay = () => {
        window.clearTimeout(autoplayTimer);
        const modalOpen = document.getElementById('project-modal')?.classList.contains('active');
        if (!isEnabled() || !autoplayEnabled || !carouselVisible || interactionActive || carouselHovered || carouselFocused || document.hidden || modalOpen) return;
        const waitForInteraction = Math.max(manualPauseUntil - Date.now(), 0);
        autoplayTimer = window.setTimeout(() => {
            const projectOpen = document.getElementById('project-modal')?.classList.contains('active');
            if (!interactionActive && !carouselHovered && !carouselFocused && !document.hidden && !projectOpen && !carousel.closest('[hidden]') && Date.now() >= manualPauseUntil) move(1);
            scheduleAutoplay();
        }, Math.max(5500, waitForInteraction));
    };
    const cancelAutoplay = () => {
        window.clearTimeout(autoplayTimer);
    };
    const pauseAfterInteraction = (delay = 9000) => {
        manualPauseUntil = Date.now() + delay;
        cancelAutoplay();
        scheduleAutoplay();
    };
    previous.addEventListener('pointerdown', () => {
        pauseAfterInteraction();
    });
    next.addEventListener('pointerdown', () => {
        pauseAfterInteraction();
    });
    previous.addEventListener('click', () => {
        move(-1, previous);
        pauseAfterInteraction();
    });
    next.addEventListener('click', () => {
        move(1, next);
        pauseAfterInteraction();
    });
    indicators?.querySelectorAll('.carousel-indicator').forEach((indicator, targetIndex) => {
        indicator.addEventListener('click', () => {
            if (!isEnabled()) return;
            stopAndCenterCurrentMotion();
            if (targetIndex === currentIndex) return;
            currentIndex = targetIndex;
            currentPhysicalIndex = cloneCount + currentIndex;
            updateIndicators();
            animateScroll(getTargetForPhysicalIndex(currentPhysicalIndex));
            pauseAfterInteraction();
        });
    });
    carousel.addEventListener('pointerdown', event => {
        if (!isEnabled()) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        interactionActive = true;
        dragPointerId = event.pointerId;
        cancelAutoplay();
        // Stop where it stands. Re-centring here slid the card out from under
        // the cursor between press and release, so the click landed on the
        // track instead of on a card and the first press appeared to do
        // nothing -- worst on the outermost cards, which are the narrowest.
        window.cancelAnimationFrame(scrollAnimation);
        if (isAnimating) {
            isAnimating = false;
            syncIndexToNearestCard();
        }
        dragStartX = event.clientX;
        dragStartY = event.clientY;
        dragLastX = event.clientX;
        dragStartScrollLeft = carousel.scrollLeft;
        dragDirection = null;
        carousel.classList.add('is-dragging');
    }, { passive: true });
    carousel.addEventListener('pointermove', event => {
        if (!interactionActive || event.pointerId !== dragPointerId) return;
        const horizontalDistance = event.clientX - dragStartX;
        const verticalDistance = event.clientY - dragStartY;
        dragLastX = event.clientX;
        if (!dragDirection && Math.hypot(horizontalDistance, verticalDistance) > 8) {
            dragDirection = Math.abs(horizontalDistance) > Math.abs(verticalDistance) * 1.12
                ? 'horizontal'
                : 'vertical';
            // A pointer released between the press and this decision no longer
            // exists to capture, and the throw would take the rest of the drag
            // handler with it.
            if (dragDirection === 'horizontal') {
                try { carousel.setPointerCapture?.(event.pointerId); } catch { /* gone already */ }
            }
        }
        if (dragDirection === 'horizontal') {
            event.preventDefault();
            suppressSwipeClick = Math.abs(horizontalDistance) > 7;
            manualPauseUntil = Date.now() + 9000;
            carousel.scrollTo({ left: dragStartScrollLeft - horizontalDistance, behavior: 'auto' });
            updateCardDepth();
        }
    }, { passive: false });
    const finishDrag = event => {
        if (!interactionActive || (event.pointerId !== undefined && event.pointerId !== dragPointerId)) return;
        const horizontalDistance = dragLastX - dragStartX;
        interactionActive = false;
        carousel.classList.remove('is-dragging');
        if (dragPointerId !== null && carousel.hasPointerCapture?.(dragPointerId)) {
            carousel.releasePointerCapture(dragPointerId);
        }
        dragPointerId = null;
        // A drag that actually travelled lands on whatever it was dragged to.
        // Stepping one card from where the drag *started* is what put the ring
        // on the card before the one under the cursor: drag past two and it
        // still only moved by one, backwards from where you let go.
        const dragMetrics = getMetrics();
        const cardTravel = dragMetrics ? dragMetrics.distance : 0;
        if (dragDirection === 'horizontal'
            && cardTravel > 0
            && Math.abs(horizontalDistance) >= cardTravel * .5) {
            snapToNearestCard();
        } else if (dragDirection === 'horizontal' && Math.abs(horizontalDistance) >= 36) {
            // Too short to have reached the next card, but quick and deliberate:
            // a flick still advances one, which is how a phone expects to swipe.
            move(horizontalDistance < 0 ? 1 : -1);
        } else if (dragDirection) {
            snapToNearestCard();
        }
        if (suppressSwipeClick) window.setTimeout(() => { suppressSwipeClick = false; }, 820);
        dragDirection = null;
        pauseAfterInteraction();
    };
    carousel.addEventListener('pointerup', finishDrag, { passive: true });
    carousel.addEventListener('pointercancel', finishDrag, { passive: true });
    // Vertical gestures never capture the pointer. Their release can land
    // outside the track; without these fallbacks the ring stays dragging and
    // autoplay and scroll snapping remain disabled until another click.
    window.addEventListener('pointerup', finishDrag, { passive: true });
    window.addEventListener('pointercancel', finishDrag, { passive: true });
    carousel.addEventListener('lostpointercapture', finishDrag);
    window.addEventListener('blur', () => finishDrag({}));
    carousel.addEventListener('wheel', event => {
        if (!isEnabled()) return;
        // Cancel even the small momentum tail: letting it escape can start
        // Chrome's back/forward swipe at the edge of a track. Pinch zoom and
        // predominantly vertical scrolling remain native.
        if (event.ctrlKey || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
        event.preventDefault();
        if (Math.abs(event.deltaX) < 8) return;
        pauseAfterInteraction();
        if (wheelLocked) return;
        wheelLocked = true;
        move(event.deltaX > 0 ? 1 : -1);
        window.setTimeout(() => { wheelLocked = false; }, 760);
    }, { passive: false });
    carousel.addEventListener('scroll', () => {
        window.clearTimeout(snapTimer);
        if (isAnimating || interactionActive || performance.now() < suppressSnapUntil) return;
        snapTimer = window.setTimeout(() => {
            if (!isAnimating && !interactionActive) snapToNearestCard();
        }, 140);
    }, { passive: true });
    carousel.addEventListener('click', event => {
        if (!isEnabled()) return;
        if (suppressSwipeClick) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        const selectedCard = event.target.closest('.project-card');
        if (!selectedCard || !carousel.contains(selectedCard)) return;
        const clickMetrics = getMetrics();
        const selectedPosition = clickMetrics?.distance
            ? (selectedCard.offsetLeft + selectedCard.offsetWidth / 2 - carousel.scrollLeft - carousel.clientWidth / 2) / clickMetrics.distance
            : 0;
        const logicalIndex = Number(selectedCard.dataset.carouselIndex);
        // The card in front opens where it stands, through its own click
        // listener -- unless it is a clone, which has none: cloneNode copies
        // markup, not handlers, and the ring can come to rest on one.
        if (Math.abs(selectedPosition) < .55) {
            if (!selectedCard.classList.contains('carousel-clone')) return;
            event.preventDefault();
            event.stopPropagation();
            originalCards[logicalIndex]?._openProject?.();
            return;
        }
        // Any other card is brought round first, by however many places it is
        // out, so the project you opened is the one you are looking at.
        event.preventDefault();
        event.stopPropagation();
        stopAndCenterCurrentMotion();
        move(Math.round(selectedPosition) || Math.sign(selectedPosition));
        carousel.dataset.keepAnimatingThroughModal = 'true';
        originalCards[logicalIndex]?._openProject?.();
        delete carousel.dataset.keepAnimatingThroughModal;
        pauseAfterInteraction();
    }, true);
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        carousel.addEventListener('pointerenter', () => {
            carouselHovered = true;
            cancelAutoplay();
        }, { passive: true });
        carousel.addEventListener('pointerleave', () => {
            carouselHovered = false;
            pauseAfterInteraction(2500);
        }, { passive: true });
    }
    carousel.addEventListener('focusin', () => {
        carouselFocused = true;
        cancelAutoplay();
    });
    carousel.addEventListener('focusout', event => {
        if (carousel.contains(event.relatedTarget)) return;
        carouselFocused = false;
        pauseAfterInteraction(2500);
    });
    window.addEventListener('resize', () => {
        window.cancelAnimationFrame(resizeFrame);
        resizeFrame = window.requestAnimationFrame(() => {
            if (!carousel.closest('[hidden]')) initialize();
        });
    }, { passive: true });
    const visibilityObserver = new IntersectionObserver(entries => {
        carouselVisible = entries[0]?.isIntersecting ?? true;
        if (carouselVisible) scheduleAutoplay();
        else cancelAutoplay();
    }, { threshold: .15 });
    visibilityObserver.observe(carousel);
    // Up from Low, an open ring has places to take that were not being written.
    if (settings.ring) {
        new MutationObserver(() => {
            if (initialized && !carousel.closest('[hidden]')) updateCardDepth();
        }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-effects'] });
    }
    document.addEventListener('portfolio:modal-open', () => {
        cancelAutoplay();
        if (carousel.dataset.keepAnimatingThroughModal !== 'true') stopAndCenterCurrentMotion();
    });
    document.addEventListener('portfolio:modal-close', () => {
        pauseAfterInteraction(2500);
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) cancelAutoplay();
        else pauseAfterInteraction(1200);
    });
    scheduleAutoplay();
    return initialize;
}

function buildLinkButtons(links = {}) {
    const map = [['github', 'fa-brands fa-github', 'Code', 'link-btn-github'], ['grabcad', 'fa-solid fa-cube', 'CAD', 'link-btn-grabcad'], ['video', 'fa-solid fa-play', 'Video', ''], ['projectUrl', 'fa-solid fa-arrow-up-right-from-square', 'View', '']];
    return map.flatMap(([key, icon, label, cls]) => {
        const entries = Array.isArray(links[key]) ? links[key] : [links[key]];
        return entries.filter(Boolean).map(entry => {
            const url = typeof entry === 'string' ? entry : entry.url;
            const linkLabel = typeof entry === 'string' ? label : entry.label || label;
            if (!url) return '';
            return `<a href="${url}" target="_blank" rel="noopener" class="link-btn ${cls}"><i class="${icon}" aria-hidden="true"></i> ${linkLabel}</a>`;
        });
    }).join('');
}

function openModal(project) {
    const modal = document.getElementById('project-modal');
    const modalCard = modal.querySelector('.modal-scroll');
    modal.scrollTop = 0;
    if (modalCard) modalCard.scrollTop = 0;
    const isCoursework = project.category === 'Coursework';
    document.getElementById('modal-title').textContent = project.title;
    document.getElementById('modal-category').textContent = project.category;
    const quickLink = document.getElementById('modal-quick-link');
    if (quickLink) {
        const quickLinkUrl = project.quickLink?.url;
        quickLink.hidden = !quickLinkUrl;
        // The label goes in beside the GitHub icon; setting textContent wiped it.
        quickLink.replaceChildren(...quickLink.querySelectorAll('i'), project.quickLink?.label || 'Full Project Breakdown');
        if (quickLinkUrl) quickLink.href = quickLinkUrl;
        else quickLink.removeAttribute('href');
    }
    const modalPeriod = document.getElementById('modal-period');
    if (modalPeriod) {
        modalPeriod.hidden = !project.period;
        modalPeriod.querySelector('span').textContent = project.period || '';
    }
    const modalProgramSummary = document.getElementById('modal-program-summary');
    if (modalProgramSummary) {
        modalProgramSummary.hidden = !project.programSummary;
        modalProgramSummary.textContent = project.programSummary || '';
    }
    document.getElementById('modal-summary').textContent = project.summary;
    const overview = document.getElementById('modal-overview');
    const overviewGrid = document.getElementById('modal-overview-grid');
    const deepDiveHeading = document.getElementById('modal-deep-dive-heading');
    const overviewLabel = overview.querySelector('.modal-section-heading span');
    const overviewTitle = document.getElementById('modal-overview-title');
    overviewLabel.textContent = isCoursework ? 'Coursework' : 'Quick Overview';
    overviewTitle.textContent = isCoursework ? 'What I Did in Class' : 'The Main Parts';
    overviewGrid.classList.remove('is-class-rundown');
    const defaultOverviewHeadings = isCoursework
        ? ['What I Needed to Learn', 'What I Worked On', 'What I Took From It']
        : ['Why I Made It', 'What I Did', 'How It Turned Out'];
    const overviewHeadings = Array.isArray(project.overview?.headings)
        && project.overview.headings.length === 3
        ? project.overview.headings
        : defaultOverviewHeadings;
    const overviewItems = project.overview
        ? [
            [overviewHeadings[0], project.overview.problem],
            [overviewHeadings[1], project.overview.method],
            [overviewHeadings[2], project.overview.result]
        ]
        : (project.sections || [])
            .slice(0, 3)
            .map(section => [section.heading, section.body]);
    overviewGrid.innerHTML = overviewItems
        .map(([heading, body], index) => `<article class="modal-overview-item"><span>0${index + 1}</span><h4>${heading}</h4><p>${body}</p></article>`)
        .join('');
    overview.hidden = overviewItems.length === 0;
    const featureVideo = document.getElementById('modal-feature-video');
    const featureVideoPlayer = document.getElementById('modal-feature-video-player');
    if (featureVideo && featureVideoPlayer) {
        featureVideo.hidden = !project.featureVideo?.src;
        featureVideoPlayer.innerHTML = project.featureVideo?.src
            ? buildVideoEmbed(project.featureVideo.src, project.featureVideo.label || `${project.title} video`)
            : '';
    }
    deepDiveHeading.hidden = isCoursework || !project.sections?.length || overviewItems.length === 0;
    const details = document.getElementById('modal-details');
    details.innerHTML = isCoursework
        ? '<section class="modal-detail-section"><h4>Want to see more?</h4><p>The class README on GitHub has more details and all of the work I saved from the class.</p></section>'
        : project.sections
        ? project.sections.map(section => `<section class="modal-detail-section"><h4>${section.heading}</h4><p>${section.body}</p></section>`).join('')
        : `<p>${project.details || ''}</p>`;
    document.getElementById('modal-tags').innerHTML = project.tags.map(tag => `<span class="tag">${tag}</span>`).join('');
    document.getElementById('modal-links').innerHTML = buildLinkButtons(project.links);
    const image = document.getElementById('modal-image');
    const leadMedia = project.motionImage || project.image;
    image.classList.toggle('has-motion-media', Boolean(project.motionImage));
    image.classList.toggle('is-certificate', project.imagePresentation === 'certificate');
    image.innerHTML = leadMedia
        ? `<img src="${leadMedia}" alt="${escapeAttribute(describeImage(project, project.motionImage ? 'motion' : 'still'))}" decoding="async"${project.motionImage ? ' class="is-motion-media"' : ''}>`
        : `<div class="media-placeholder"><i class="fa-solid fa-film" aria-hidden="true"></i><span>Pictures coming soon</span><small>I have not added pictures for this project yet.</small></div>`;
    const media = document.getElementById('modal-media');
    media.innerHTML = (project.media || []).map(item => item.type === 'video' && item.src
        ? `<figure class="modal-media-item modal-video">${buildVideoEmbed(item.src, item.label, { lazy: true })}<figcaption>${item.label}</figcaption></figure>`
        : item.src
        ? `<figure class="modal-media-item${item.type === 'gif' ? ' is-motion-media' : ''}${item.fit === 'contain' ? ' media-contain' : ''}"><img src="${item.src}" alt="${escapeAttribute(item.alt || item.label)}" loading="lazy" decoding="async"><figcaption>${item.label}</figcaption></figure>`
        : `<div class="modal-media-item media-placeholder"><i class="fa-solid ${item.type === 'gif' ? 'fa-film' : 'fa-image'}" aria-hidden="true"></i><span>${item.label}</span><small>${item.hint || 'Media placeholder'}</small></div>`
    ).join('');
    // Only a player that loaded while the project is still open: one closed
    // first is sent to about:blank, which loads too, and offline the frame
    // loads the browser's error page, where no player will ever ask.
    modal.querySelectorAll('iframe').forEach(video => video.addEventListener('load', () => {
        if (modal.classList.contains('active') && navigator.onLine !== false) holdGraphicsAdapter();
    }, { once: true }));
    // The keyboard goes into the project with the eye: the page behind is
    // shut off while it is open, and whatever opened it (usually the card)
    // gets the focus back when it closes (setupModal).
    if (!modal.classList.contains('active')) modal._returnFocusTo = document.activeElement;
    setPageBehindModalInert(true);
    modal.inert = false;
    modal.classList.add('active'); modal.setAttribute('aria-hidden', 'false');
    document.getElementById('modal-close')?.focus({ preventScroll: true });
    document.dispatchEvent(new CustomEvent('portfolio:modal-open'));
}

// Everything under the project modal, the hero included (it sits outside
// <main>). index.html starts the modal itself inert, so its invisible close
// button and links are out of the tab order until a project opens.
function setPageBehindModalInert(inert) {
    document.querySelectorAll('body > :not(#project-modal, script)')
        .forEach(element => { element.inert = inert; });
}

function setupModal() {
    const modal = document.getElementById('project-modal');
    const modalCard = modal.querySelector('.modal-scroll');
    const close = () => {
        if (!modal.classList.contains('active')) return;
        modal.querySelectorAll('iframe').forEach(video => {
            video.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'stopVideo', args: [] }), '*');
            video.src = 'about:blank';
            video.remove();
        });
        const returnFocusTo = modal._returnFocusTo;
        modal._returnFocusTo = null;
        setPageBehindModalInert(false);
        if (returnFocusTo?.isConnected && returnFocusTo !== document.body) returnFocusTo.focus({ preventScroll: true });
        modal.inert = true;
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        modal.scrollTop = 0;
        if (modalCard) modalCard.scrollTop = 0;
        document.dispatchEvent(new CustomEvent('portfolio:modal-close'));
    };
    document.getElementById('modal-close').addEventListener('click', close);
    // A drag that starts in the sheet and ends on the backdrop is not a click
    // outside. This also avoids closing while selecting project text.
    let startedOnBackdrop = false;
    modal.addEventListener('pointerdown', event => { startedOnBackdrop = event.target === modal; });
    modal.addEventListener('pointercancel', () => { startedOnBackdrop = false; });
    modal.addEventListener('click', event => {
        if (event.target === modal && startedOnBackdrop) close();
        startedOnBackdrop = false;
    });
    document.addEventListener('keydown', event => {
        if (!modal.classList.contains('active')) return;
        if (event.key === 'Escape') { event.preventDefault(); close(); return; }
        if (event.key !== 'Tab') return;
        const controls = [...modal.querySelectorAll('button, a[href], iframe, [tabindex="0"]')]
            .filter(element => !element.disabled && !element.closest('[hidden], [inert]') && element.getClientRects().length);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
            event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
            event.preventDefault(); first?.focus({ preventScroll: true });
        }
    });
}
