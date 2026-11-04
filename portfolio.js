// This file's own version (its ?v=), for the file it fetches later.
const PORTFOLIO_SCRIPT_QUERY = document.currentScript?.src ? new URL(document.currentScript.src).search : '';

// What the page asks WebGL for when it wants to know what it is drawing on (see
// askAboutGraphics): a context that fails rather than run in software.
const GRAPHICS_QUESTION = { powerPreference: 'low-power', failIfMajorPerformanceCaveat: true };

// Most idle glances stay near the last point of interest, with occasional
// wider looks and a return toward the viewer. The eyes share this rhythm.
function restingEyeGaze(yaw, pitch, maxYaw, maxPitch) {
    const glance = Math.random();
    const limit = (value, range) => Math.max(-range, Math.min(range, value));
    return {
        yaw: glance < .2 ? (Math.random() - .5) * maxYaw * .2
            : glance < .8 ? limit(yaw + (Math.random() - .5) * maxYaw * .65, maxYaw * .85)
                : (Math.random() * 2 - 1) * maxYaw * .85,
        pitch: glance < .2 ? (Math.random() - .5) * maxPitch * .2
            : glance < .8 ? limit(pitch + (Math.random() - .5) * maxPitch * .5, maxPitch * .7)
                : (Math.random() * 2 - 1) * maxPitch * .7,
        delay: 650 + Math.random() ** 2 * 1900
    };
}

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
        // The visible height follows a phone's toolbars sliding; times the zoom, so that a
        // pinch into an open project does not shrink the project with it.
        const visualHeight = window.visualViewport ? window.visualViewport.height * window.visualViewport.scale : window.innerHeight;
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
    document.body.prepend(backgroundGrid);
    const cosmosCanvas = document.createElement('canvas');
    cosmosCanvas.className = 'cosmos';
    cosmosCanvas.setAttribute('aria-hidden', 'true');
    cosmosCanvas.hidden = true;
    backgroundGrid.after(cosmosCanvas);
    const pageScrollProgress = document.createElement('div');
    pageScrollProgress.className = 'page-scroll-progress';
    pageScrollProgress.setAttribute('aria-hidden', 'true');
    pageScrollProgress.innerHTML = '<span class="page-scroll-track"><i class="page-scroll-fill"></i></span>';
    cosmosCanvas.after(pageScrollProgress);
    const cursorDot = document.createElement('span');
    cursorDot.className = 'cursor-dot';
    cursorDot.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cursorDot);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const stillSky = setupStillSky(backgroundGrid, reducedMotion);
    const cosmos = setupDeferredCosmos(cosmosCanvas, stillSky);
    const cursor = setupCursorEffects(cursorDot, reducedMotion);
    setupPointerReactiveSurfaces(reducedMotion);
    setupSteadyLift();
    // ---- Effects levels -------------------------------------------------
    // Three, chosen on the slider in the bar, left to right:
    //
    //   low     a still sky (setupStillSky), painted once, under clear glass,
    //           and nothing moves that need not
    //   medium  that sky with a spiral in it, a few things floating over it
    //           that act on one another (cosmos.js), and the cards leaning
    //           toward the cursor, its light on them and the rings turning
    //   high    a galaxy of its own, everything in it alive and a war across
    //           it, behind glass that frosts and bends what is behind it, and
    //           the cursor's own light
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
    // panel rather than sitting behind it. Now the sky goes dark once nobody
    // has moved for a few seconds, at every level -- the whole backdrop
    // together, so it reads as the sky going out, not a panel answering -- and
    // comes back alive the moment anyone moves (cosmos.js wakes it with a
    // flare). The eyes and the desk keep watching. It darkens too when the
    // tab goes away.
    const IDLE_DARK_MS = 5000;
    let darkensWhenIdle = false;
    const darkenBackdrop = () => {
        backgroundIdleTimer = 0;
        document.documentElement.classList.add('effects-background-idle');
        document.dispatchEvent(new Event('portfolio:backdrop-idle'));
    };
    const wakeEffectsBackground = () => {
        const root = document.documentElement;
        // Touching classList on every pointermove churns style + observers for
        // no reason; only clear the state when it is actually set.
        if (root.classList.contains('effects-background-idle')) {
            root.classList.remove('effects-background-idle');
            document.dispatchEvent(new Event('portfolio:backdrop-wake'));
        }
        clearBackgroundIdleTimer();
        if (darkensWhenIdle && !document.hidden) backgroundIdleTimer = window.setTimeout(darkenBackdrop, IDLE_DARK_MS);
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
        // time: in High FX the sky is drawn nearer the screen's own pixels,
        // every effect kept; then the glass keeps its frost and lets go of the
        // bend at its rim (glass.js). Only once those have been tried, and the
        // page is still clunky, does it step down a level -- High to Medium,
        // then Medium to Low. Each step gets a clean look of its own before
        // the page is judged again.
        const canEaseSky = effectsMode === 'high' && !skyEased;
        // Medium FX draws no frost and bend, and its sky is already drawn at
        // the screen's own pixels, so there is nothing to ease there first.
        const canEaseGlass = automatic && !glassEased && effectsMode === 'high';
        if (canEaseSky || canEaseGlass) {
            strainedWindows = strained ? strainedWindows + 1 : 0;
            if (strainedWindows >= STRAINED_WINDOWS_BEFORE_EASING) {
                if (canEaseSky) {
                    skyEased = true;
                    cosmos.ease();
                } else {
                    glassEased = true;
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
    // the perf tools: 'eased' once the sky is drawn softer, 'lighter' once
    // the glass has let go of its bend as well.
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
        cosmos.ease();
        syncEffectsPace();
    };

    // What lies behind the glass (portfolio.css): at every level the still
    // sky, painted once; at Medium and High the living sky drawn over it
    // (cosmos.js), which is fetched the first time either wants it. A look
    // (the eye, the desk) brings its own and puts these away.
    const showOwnBackdrop = mode => {
        stillSky.show();
        if (mode === 'low') cosmos.hide();
        else cosmos.show(mode);
        darkensWhenIdle = true;
        wakeEffectsBackground();
    };
    const setBackdropLook = mode => {
        backgroundGrid.dataset.look = mode;
        if (!wantedSky(mode)) showOwnBackdrop(mode);
    };

    // ---- The other skies -------------------------------------------------
    // Two quick presses on any stop of the slider go round that level's looks,
    // so anyone pressing about finds them. Every level
    // has its stars and its eye, each built for what that level can spend, and the
    // choice is one choice: an eye turned on at one level is on at all of them.
    // Medium has a pink desktop last of all, which only Medium can show; the other
    // two show whichever of the stars and the eye was on when it came up. A gap in
    // the presses starts the count again. All of it is in files fetched only when
    // asked for (y2k.*, iris.*, vapor.*, ego.*), so this counter is the only thing
    // it costs
    // anyone who never finds it. Each belongs to its level alone: leaving the
    // level, by choice or because the page had to, hands everything back, and
    // coming back brings the choice back with it. A reload forgets all of it and
    // the page starts as it always does.
    const SKY_PRESS_GAP_MS = 500;
    const SKY_PRESSES = 2;
    const SKY_QUIET_MS = 700;
    const SKY_VERSION = '20261104-natural-gaze';
    const SKIES = {
        y2k: { level: 'low', script: 'portfolioY2k', file: 'y2k.js' },
        iris: { level: 'medium', script: 'portfolioIris', file: 'iris.js' },
        vapor: { level: 'medium', script: 'portfolioVapor', file: 'vapor.js' },
        ego: { level: 'high', script: 'portfolioEgo', file: 'ego.js' }
    };
    const EYES = { low: 'y2k', medium: 'iris', high: 'ego' };
    // A look this machine could not show (no WebGL 2, say) is skipped from then on, so
    // it does not stand in the way of the one after it.
    const skippedSkies = new Set();
    let eyeOn = false;
    let deskOn = false;
    let skiesFound = false;
    const wantedSky = level => {
        if (level === 'medium' && deskOn && !skippedSkies.has('vapor')) return 'vapor';
        const eye = EYES[level];
        return eyeOn && eye && !skippedSkies.has(eye) ? eye : '';
    };
    let showingSky = '';
    // What the backdrop will be once every switch already on its way has played: '' for
    // the page's own sky, a look's name, or null for nothing, while a look put away for
    // another level's is still getting ready. A switch changes the page only partway
    // through playing, and presses keep coming while it plays.
    let targetSky = '';
    let pressedLevel = '';
    let skyPresses = 0;
    let lastSkyPress = 0;
    let skyQuietUntil = 0;
    // Bumped by every change of mind, so a sky still getting ready when the
    // visitor moves on is not shown over whatever they moved on to.
    let skyRequest = 0;
    const skyLoads = {};
    const loadSky = name => {
        if (skyLoads[name]) return skyLoads[name];
        const fetched = (element, attach) => new Promise((resolve, reject) => {
            element.onload = resolve;
            // Gone again, so a later try fetches it afresh rather than finding a sheet that
            // never arrived and taking it for loaded.
            element.onerror = error => {
                element.remove();
                reject(error);
            };
            attach(element);
        });
        const { script, file } = SKIES[name];
        const sheet = document.getElementById(`${name}-styles`) ? Promise.resolve() : fetched(Object.assign(document.createElement('link'), {
            id: `${name}-styles`, rel: 'stylesheet', href: `${name}.css?v=${SKY_VERSION}`
        }), element => document.head.appendChild(element));
        const code = window[script] ? Promise.resolve() : fetched(Object.assign(document.createElement('script'), {
            src: `${file}?v=${SKY_VERSION}`
        }), element => document.head.appendChild(element));
        const load = Promise.all([sheet, code]).then(() => window[script]);
        load.catch(() => { delete skyLoads[name]; });
        skyLoads[name] = load;
        return load;
    };
    /* ---- Every switch is seen to happen ----------------------------------
       A change of level or of look is never a cut and never a bare pause, and
       the higher the level the more happens. A change of level holds the page
       as it was while the new one is put together under it, and uncovers the
       new one in a way that says what changed (portfolio.css, html[data-shift]):
       going up to Medium it spreads out from the slider; going up to High it
       bursts out of the slider, blinding at first, while the old page falls
       away behind it; going down it draws back into the slider. The desk breaks
       in torn across, and leaving it switches off like an old screen. Between
       the stars and the eye only the backdrop changes, so only the backdrop
       moves (warp, below). While one plays, anything else that changes shows on
       its new side rather than starting another. Anything new that switches
       the page's look gets one of these, or a new kind of its own. */
    let shiftToken = 0, shiftPlaying = false;
    const shift = (kind, change) => {
        if (shiftPlaying || !document.startViewTransition || reducedMotion.matches || document.hidden) {
            change();
            return;
        }
        const slider = document.getElementById('fx-slider')?.getBoundingClientRect();
        root.style.setProperty('--shift-x', slider?.width ? `${Math.round(slider.left + slider.width / 2)}px` : '85vw');
        root.style.setProperty('--shift-y', slider?.width ? `${Math.round(slider.top + slider.height / 2)}px` : '2rem');
        const token = ++shiftToken;
        root.dataset.shift = kind;
        shiftPlaying = true;
        document.startViewTransition(change).finished.finally(() => {
            if (token !== shiftToken) return;
            shiftPlaying = false;
            delete root.dataset.shift;
        });
    };
    /* Between the stars and the eye. The page stays where it is; only the backdrop -- all
       that comes before the scroll bar in the body -- changes, and only it moves.

       Low: the old one swells, swirls down into a point with a flash where it went, the
       screen behind the page goes black, and the new one climbs up out of the deep from
       behind and overshoots. Transforms and opacity only, for the cheapest machine there is.

       Medium and High go further, both as hard as they like. Leaving the stars, the galaxy falls in on itself to a point, streaks of
       it dragged in after, and goes off like the first moment of everything: a flash, a
       ring going out, sparks thrown everywhere, burning down to black, out of which the eye
       comes (and once it has built itself, light pours into its iris and it starts out at
       the viewer; the eyes do that themselves, and `gather` below draws the light). Leaving
       the eye, it dies: its pupil blows and its lids drop, it tears and jumps, and it comes
       apart into blocks, the iris first, chips of it thrown off, down to pitch black, out
       of which the stars burst back, the dark torn open from the middle. */
    const SPIN = {
        out: [
            { transform: 'none', opacity: 1 },
            { transform: 'scale(1.06) rotate(1.5deg)', opacity: 1, offset: .14 },
            { transform: 'scale(.5) rotate(-70deg)', opacity: .9, offset: .58 },
            { transform: 'scale(.01) rotate(-280deg)', opacity: 0 }
        ],
        outFor: 950, hold: 280,
        in: [
            { transform: 'perspective(1000px) translate3d(0, 16%, -1100px) rotateX(20deg)', opacity: 0 },
            { transform: 'perspective(1000px) translate3d(0, 3%, -160px) rotateX(5deg)', opacity: 1, offset: .55 },
            { transform: 'perspective(1000px) translate3d(0, -.6%, 30px) rotateX(-1deg)', opacity: 1, offset: .8 },
            { transform: 'none', opacity: 1 }
        ],
        inFor: 1300
    };
    let warping = false;
    // How long an eye brought in under the burst stays out of sight; it waits that out.
    let arrival = 0;
    const backdropLayers = () => {
        const layers = [];
        for (const element of document.body.children) {
            if (element === pageScrollProgress) break;
            if (!element.classList.contains('switch-fx') && !element.classList.contains('warp-flash')) layers.push(element);
        }
        return layers;
    };
    const settle = animations => Promise.all(animations.map(animation => animation.finished.catch(() => {})));
    const pause = ms => new Promise(resolve => window.setTimeout(resolve, ms));
    // One canvas over the backdrop and under the page, put up only while a switch draws on
    // it. Each piece of drawing is given how far through it is, 0 to 1, and drawn at 1 on
    // its last frame, so the next piece takes over with nothing showing between them.
    const fx = (() => {
        let canvas = null, context = null, frame = 0, w = 0, h = 0, ratio = 1;
        const jobs = new Set();
        const tick = now => {
            frame = 0;
            context.setTransform(ratio, 0, 0, ratio, 0, 0);
            context.clearRect(0, 0, w, h);
            for (const job of jobs) {
                const t = (now - job.start) / job.duration;
                if (t < 0) continue;
                job.draw(context, Math.min(1, t), w, h);
                if (t >= 1) {
                    jobs.delete(job);
                    job.done();
                }
            }
            if (jobs.size) frame = requestAnimationFrame(tick);
            else {
                canvas.remove();
                canvas = null;
            }
        };
        return {
            play(duration, draw) {
                if (!canvas) {
                    canvas = document.createElement('canvas');
                    canvas.className = 'switch-fx';
                    canvas.setAttribute('aria-hidden', 'true');
                    w = document.documentElement.clientWidth;
                    h = window.innerHeight;
                    ratio = Math.min(window.devicePixelRatio || 1, effectsMode === 'high' ? 1.5 : 1);
                    canvas.width = Math.round(w * ratio);
                    canvas.height = Math.round(h * ratio);
                    context = canvas.getContext('2d');
                    pageScrollProgress.before(canvas);
                }
                return new Promise(resolve => {
                    jobs.add({ start: performance.now(), duration, draw, done: resolve });
                    if (!frame) frame = requestAnimationFrame(tick);
                });
            },
            size: () => [w || document.documentElement.clientWidth, h || window.innerHeight]
        };
    })();
    const easeIn = t => t * t * t, easeOut = t => 1 - (1 - t) ** 3;
    // Low's: the old one swirled away, black, and the new one up from the deep.
    const spin = async change => {
        const outgoing = backdropLayers().map(layer => layer.animate(SPIN.out, { duration: SPIN.outFor, easing: 'cubic-bezier(.5, 0, .8, .4)', fill: 'forwards' }));
        const flash = document.createElement('span');
        flash.className = 'warp-flash';
        flash.setAttribute('aria-hidden', 'true');
        pageScrollProgress.before(flash);
        flash.animate([
            { transform: 'scale(0)', opacity: 1 },
            { transform: 'scale(.6)', opacity: .95, offset: .3 },
            { transform: 'scale(1.5)', opacity: 0 }
        ], { duration: 620, delay: SPIN.outFor - 120, easing: 'cubic-bezier(.2, .8, .3, 1)', fill: 'both' }).finished.finally(() => flash.remove());
        await pause(SPIN.outFor + SPIN.hold);
        change();
        const incoming = backdropLayers().map(layer => layer.animate(SPIN.in, { duration: SPIN.inFor, easing: 'cubic-bezier(.2, .7, .25, 1)', fill: 'backwards' }));
        outgoing.forEach(animation => animation.cancel());
        await settle(incoming);
    };
    // As an eye comes alive (the eyes send portfolio:eye-gather when they are whole): its own
    // dots, thousands of them loose across the screen, are drawn in to its pupil, each on a
    // path of its own that tightens and quickens as it nears, so they make a whirlpool of dust
    // and never arms or any figure; coloured as its iris is -- pale pink at the middle, violet
    // out through it, lavender beyond, some cold cyan -- and the last of them a flash in the
    // pupil as the eye wakes.
    const DOTS = [[158, 107, 255], [255, 92, 184], [107, 230, 255], [206, 190, 255], [120, 70, 220]];
    const mixed = (from, to, k) => from + (to - from) * k;
    // The iris's colours, by how far out from the pupil in irises.
    const irisColour = k => {
        if (k < .6) {
            const s = k / .6;
            return [255, mixed(205, 128, s), mixed(240, 214, s)];
        }
        if (k < 1.3) {
            const s = (k - .6) / .7;
            return [mixed(255, 189, s), 128, mixed(214, 255, s)];
        }
        const s = Math.min(1, (k - 1.3) / 2);
        return [mixed(189, 206, s), mixed(128, 190, s), 255];
    };
    const CYAN = [107, 230, 255];
    const pourIntoIris = ({ x: irisX, y: irisY, r: irisR, ms }) => {
        // A switch's own work is not the machine struggling: the frame monitor looks away.
        deferPerformanceSampling(ms + 800);
        const [w, h] = fx.size();
        const cell = Math.max(6, Math.round(Math.sqrt(w * h / 18000)));
        const cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
        const grid = document.createElement('canvas');
        grid.width = cols;
        grid.height = rows;
        const dots = grid.getContext('2d');
        const image = dots.createImageData(cols, rows), data = image.data;
        const cx = irisX / cell, cy = irisY / cell, iris = irisR / cell;
        const reach = Math.hypot(Math.max(cx, cols - cx), Math.max(cy, rows - cy));
        // Every dot: how far out it starts (spread evenly over the screen's area), at what
        // angle, when it reaches the pupil, how hard it winds, and whether it is a cold one.
        const count = Math.min(4200, Math.round(cols * rows * .2));
        const from = new Float32Array(count), angle = new Float32Array(count), arrive = new Float32Array(count);
        const wind = new Float32Array(count), cold = new Uint8Array(count);
        for (let i = 0; i < count; i++) {
            from[i] = iris * .3 + Math.sqrt(Math.random()) * reach;
            angle[i] = Math.random() * Math.PI * 2;
            arrive[i] = .45 + Math.random() * .4;
            wind[i] = 1.3 + Math.random() * .9;
            cold[i] = Math.random() < .14 ? 1 : 0;
        }
        const put = (x, y, colour, alpha) => {
            const px = Math.round(x), py = Math.round(y);
            if (px < 0 || py < 0 || px >= cols || py >= rows) return;
            const o = (py * cols + px) * 4;
            if (data[o + 3] >= alpha) return;
            data[o] = colour[0];
            data[o + 1] = colour[1];
            data[o + 2] = colour[2];
            data[o + 3] = alpha;
        };
        return fx.play(ms, (context, t) => {
            const swell = Math.min(1, t / .1);
            data.fill(0);
            for (let i = 0; i < count; i++) {
                // Each dot and a tail curving behind it, along its own way in, so the whole
                // reads as a whirlpool turning.
                for (let tail = 0; tail < 6; tail++) {
                    const s = Math.min(1, Math.max(0, t - tail * .02) / arrive[i]);
                    if (s >= 1) break;
                    const r = Math.max(.4, from[i] * (1 - s) ** 1.7);
                    const a = angle[i] + t * 2.4 + wind[i] * Math.log(from[i] / r);
                    const colour = cold[i] ? CYAN : irisColour(r / iris);
                    put(cx + Math.cos(a) * r, cy + Math.sin(a) * r, colour, Math.round(235 * swell * (1 - tail * .15)));
                }
            }
            dots.putImageData(image, 0, 0);
            context.globalCompositeOperation = 'source-over';
            context.imageSmoothingEnabled = false;
            context.drawImage(grid, 0, 0, cols * cell, rows * cell);
            context.imageSmoothingEnabled = true;
            if (t > .7) {
                const k = (t - .7) / .3;
                context.globalCompositeOperation = 'lighter';
                const flash = context.createRadialGradient(irisX, irisY, 0, irisX, irisY, irisR * (.3 + k));
                flash.addColorStop(0, `rgba(255,240,250,${(k * .95).toFixed(3)})`);
                flash.addColorStop(1, 'rgba(189,128,255,0)');
                context.fillStyle = flash;
                context.fillRect(irisX - irisR * 1.4, irisY - irisR * 1.4, irisR * 2.8, irisR * 2.8);
            }
        });
    };

    // Leaving the stars: the galaxy falls in on itself and goes off.
    const bigBang = async change => {
        const [w, h] = fx.size(), cx = w / 2, cy = h / 2, far = Math.hypot(w, h) / 2;
        const fallFor = 900, bangFor = 1000, clearFor = 520;
        const outgoing = backdropLayers().map(layer => layer.animate([
            { transform: 'none', clipPath: 'circle(150vmax at 50% 50%)', filter: 'brightness(1)' },
            { transform: 'scale(.55)', clipPath: 'circle(55vmax at 50% 50%)', filter: 'brightness(1.6)', offset: .6 },
            { transform: 'scale(.02)', clipPath: 'circle(1vmax at 50% 50%)', filter: 'brightness(4)' }
        ], { duration: fallFor, easing: 'cubic-bezier(.55, 0, .9, .35)', fill: 'forwards' }));
        // Streaks of it dragged in after it.
        const streaks = Array.from({ length: 150 }, () => {
            const angle = Math.random() * Math.PI * 2;
            return { angle, from: far * (.5 + Math.random() * .7), late: Math.random() * .35, rgb: Math.random() < .7 ? '220,228,255' : '255,214,170' };
        });
        await fx.play(fallFor, (context, t) => {
            context.globalCompositeOperation = 'lighter';
            context.lineCap = 'round';
            for (const streak of streaks) {
                const k = Math.max(0, (t - streak.late) / (1 - streak.late));
                if (k <= 0) continue;
                const r = streak.from * (1 - easeIn(k)), tail = Math.min(r, 20 + 160 * k);
                const dx = Math.cos(streak.angle), dy = Math.sin(streak.angle);
                context.strokeStyle = `rgba(${streak.rgb},${(.15 + .6 * k).toFixed(3)})`;
                context.lineWidth = 1 + k * 1.5;
                context.beginPath();
                context.moveTo(cx + dx * r, cy + dy * r);
                context.lineTo(cx + dx * (r + tail), cy + dy * (r + tail));
                context.stroke();
            }
        });
        // The eye goes up unseen, under the burst, and waits to build itself till it can be seen.
        arrival = bangFor + clearFor * .5;
        change();
        arrival = 0;
        outgoing.forEach(animation => animation.cancel());
        const sparks = Array.from({ length: 320 }, () => {
            const angle = Math.random() * Math.PI * 2;
            return { dx: Math.cos(angle), dy: Math.sin(angle), speed: far * (.4 + Math.random() * 1.6), size: .8 + Math.random() * 2.2, rgb: ['255,250,240', '255,220,180', '200,215,255'][Math.floor(Math.random() * 3)] };
        });
        await fx.play(bangFor, (context, t) => {
            context.globalCompositeOperation = 'source-over';
            context.fillStyle = '#000';
            context.fillRect(0, 0, w, h);
            context.globalCompositeOperation = 'lighter';
            const core = 30 + far * 1.1 * easeOut(Math.min(1, t * 1.6));
            const flash = context.createRadialGradient(cx, cy, 0, cx, cy, core);
            flash.addColorStop(0, `rgba(255,255,255,${((1 - t) ** 1.6).toFixed(3)})`);
            flash.addColorStop(.25, `rgba(255,232,200,${((1 - t) ** 2 * .7).toFixed(3)})`);
            flash.addColorStop(1, 'rgba(120,90,160,0)');
            context.fillStyle = flash;
            context.fillRect(0, 0, w, h);
            for (const [reach, alpha, width] of [[1.25, .85, 26], [.8, .4, 10]]) {
                context.strokeStyle = `rgba(255,240,225,${((1 - t) ** 1.4 * alpha).toFixed(3)})`;
                context.lineWidth = Math.max(1, width * (1 - t));
                context.beginPath();
                context.arc(cx, cy, far * reach * easeOut(t), 0, Math.PI * 2);
                context.stroke();
            }
            const fadeBy = (1 - t) ** 1.2;
            for (const spark of sparks) {
                const r = spark.speed * easeOut(t), trail = 6 + spark.speed * .05 * (1 - t);
                context.strokeStyle = `rgba(${spark.rgb},${fadeBy.toFixed(3)})`;
                context.lineWidth = spark.size;
                context.beginPath();
                context.moveTo(cx + spark.dx * r, cy + spark.dy * r);
                context.lineTo(cx + spark.dx * Math.max(0, r - trail), cy + spark.dy * Math.max(0, r - trail));
                context.stroke();
            }
        });
        // Burnt down to black, and out of it the eye.
        await fx.play(clearFor, (context, t) => {
            context.globalCompositeOperation = 'source-over';
            context.fillStyle = `rgba(0,0,0,${(1 - easeOut(t)).toFixed(3)})`;
            context.fillRect(0, 0, w, h);
        });
    };
    // Leaving the eye: it dies, and comes apart, down to black; the stars burst back.
    const decompile = async (change, from) => {
        const [w, h] = fx.size();
        const eye = window[SKIES[from]?.script];
        const at = eye?.irisAt?.() || { x: w * .56, y: h * .5, r: Math.min(w, h) * .2 };
        const dieFor = 1250, burstFor = 1000;
        eye?.die?.(dieFor);
        // It tears and jumps as it goes.
        const jolts = backdropLayers().map(layer => layer.animate([
            { translate: '0 0', clipPath: 'inset(0)' },
            { translate: '-1.2vw 0', clipPath: 'inset(0 0 0 0)', offset: .12 },
            { translate: '1.6vw 0', clipPath: 'inset(12% 0 64% 0)', offset: .2 },
            { translate: '-.6vw 0', clipPath: 'inset(0)', offset: .3 },
            { translate: '2vw 0', clipPath: 'inset(48% 0 20% 0)', offset: .42 },
            { translate: '-1vw 0', clipPath: 'inset(0 0 30% 0)', offset: .55 },
            { translate: '.4vw 0', clipPath: 'inset(0)', offset: .66 },
            { translate: '0 0', clipPath: 'inset(0)' }
        ], { duration: dieFor, easing: 'steps(1, end)', fill: 'forwards' }));
        // Blocks, the iris first and outward from it, each flaring in the eye's own light
        // before it goes black; chips of it thrown off.
        const cell = 16, cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
        const reach = Math.hypot(Math.max(at.x, w - at.x), Math.max(at.y, h - at.y));
        const when = new Float32Array(cols * rows);
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const d = Math.hypot((col + .5) * cell - at.x, (row + .5) * cell - at.y) / reach;
                when[row * cols + col] = .22 + .58 * (d * .65 + Math.random() * .35);
            }
        }
        const chips = [];
        const tint = '205,185,255';
        await fx.play(dieFor, (context, t) => {
            context.globalCompositeOperation = 'source-over';
            context.fillStyle = '#000';
            context.beginPath();
            const flaring = [];
            for (let i = 0; i < when.length; i++) {
                const k = (t - when[i]) / .07;
                if (k <= 0) continue;
                const x = (i % cols) * cell, y = Math.floor(i / cols) * cell;
                if (k < 1) {
                    flaring.push(x, y, k);
                    // Its dots evaporate: lifted off upward, wavering, going out.
                    if (chips.length < 1400 && Math.random() < .3) {
                        const angle = -Math.PI / 2 + (Math.random() - .5) * .9, speed = 40 + Math.random() * 120;
                        chips.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, born: t, size: cell * (.5 + Math.random() * .4), sway: Math.random() * 6 });
                    }
                } else context.rect(x, y, cell, cell);
            }
            context.fill();
            context.globalCompositeOperation = 'lighter';
            for (let i = 0; i < flaring.length; i += 3) {
                context.fillStyle = `rgba(${tint},${((1 - flaring[i + 2]) * .85).toFixed(3)})`;
                context.fillRect(flaring[i], flaring[i + 1], cell, cell);
            }
            for (const chip of chips) {
                const age = (t - chip.born) * dieFor / 1000, life = 1.3;
                if (age > life) continue;
                const colour = DOTS[Math.floor(chip.sway) % 5].join(',');
                context.fillStyle = `rgba(${colour},${((1 - age / life) * .75).toFixed(3)})`;
                const sway = Math.sin(age * 7 + chip.sway) * 6 * age;
                context.fillRect(Math.round(chip.x + chip.vx * age + sway), Math.round(chip.y + chip.vy * age), chip.size, chip.size);
            }
            if (t > .9) {
                context.globalCompositeOperation = 'source-over';
                context.fillStyle = `rgba(0,0,0,${((t - .9) / .1).toFixed(3)})`;
                context.fillRect(0, 0, w, h);
            }
        });
        // Pitch black a moment, the stars put up under it, and the dark torn open from the
        // middle with the light of them coming through.
        change();
        jolts.forEach(animation => animation.cancel());
        await fx.play(260, context => {
            context.fillStyle = '#000';
            context.fillRect(0, 0, w, h);
        });
        const incoming = backdropLayers().map(layer => layer.animate([
            { transform: 'scale(1.3)', filter: 'brightness(2.4)' },
            { transform: 'scale(.97)', filter: 'brightness(1.15)', offset: .6 },
            { transform: 'none', filter: 'none' }
        ], { duration: burstFor + 300, easing: 'cubic-bezier(.2, .8, .3, 1)' }));
        const cx = w / 2, cy = h / 2, far = Math.hypot(w, h) / 2;
        await fx.play(burstFor, (context, t) => {
            const open = far * 1.05 * easeOut(t);
            context.globalCompositeOperation = 'source-over';
            context.fillStyle = '#000';
            context.fillRect(0, 0, w, h);
            context.globalCompositeOperation = 'destination-out';
            const hole = context.createRadialGradient(cx, cy, open * .7, cx, cy, Math.max(open, 1));
            hole.addColorStop(0, 'rgba(0,0,0,1)');
            hole.addColorStop(1, 'rgba(0,0,0,0)');
            context.fillStyle = hole;
            context.beginPath();
            context.arc(cx, cy, Math.max(open, 1), 0, Math.PI * 2);
            context.fill();
            context.globalCompositeOperation = 'lighter';
            context.strokeStyle = `rgba(225,232,255,${((1 - t) * .7).toFixed(3)})`;
            context.lineWidth = Math.max(1, 14 * (1 - t));
            context.beginPath();
            context.arc(cx, cy, open, 0, Math.PI * 2);
            context.stroke();
        });
        await settle(incoming);
    };
    // Where the cursor last was, so an eye a switch brings in looks at it straight away
    // rather than waiting for it to move (ego.js, iris.js, y2k.js).
    window.addEventListener('pointermove', event => {
        window.portfolioPointer = { x: event.clientX, y: event.clientY, mouse: event.pointerType === 'mouse' };
    }, { passive: true });
    document.addEventListener('portfolio:eye-gather', ({ detail }) => {
        if (!reducedMotion.matches && !document.hidden) pourIntoIris(detail);
    });
    const warp = (level, change, from, to) => {
        if (warping || shiftPlaying || reducedMotion.matches || document.hidden || !Element.prototype.animate) {
            change();
            return;
        }
        warping = true;
        deferPerformanceSampling(5000);
        // Said on the page while it plays, for the smoke test.
        root.dataset.warp = level;
        let changed = false;
        const once = () => {
            if (changed) return;
            changed = true;
            change();
        };
        const sequence = level === 'low' ? spin(once) : to ? bigBang(once) : decompile(once, from);
        sequence.catch(() => once()).finally(() => {
            warping = false;
            delete root.dataset.warp;
        });
    };
    // The switch still waiting to change the page, partway through its transition: it runs
    // once, when the transition gets there or sooner, if the page is asked to change again.
    let pendingSwap = null;
    const swapSkies = (change, animate, from, to) => {
        let ran = false;
        const once = () => {
            if (ran) return;
            ran = true;
            if (pendingSwap === once) pendingSwap = null;
            change();
        };
        pendingSwap = once;
        if (!animate) once();
        else if (from === 'vapor' || to === 'vapor') shift(to === 'vapor' ? 'glitch' : 'off', once);
        else warp(effectsMode, once, from, to);
    };
    const putSkyAway = () => {
        if (!showingSky) return;
        delete root.dataset[showingSky];
        window[SKIES[showingSky].script]?.release();
        showingSky = '';
    };
    const syncSkies = async animate => {
        const want = wantedSky(effectsMode);
        // Already on its way: but a change asked for while a switch plays applies at once,
        // as every change does then (CLAUDE.md), rather than waiting for the switch to get
        // round to it -- a level changed under a look going away takes the look with it.
        if (want === targetSky) {
            pendingSwap?.();
            return;
        }
        const from = showingSky;
        const request = ++skyRequest;
        deferPerformanceSampling(PERFORMANCE_RESUME_DELAY_MS);
        // Another level's sky does not stay up while this level's is fetched.
        if (want && showingSky && SKIES[showingSky].level !== effectsMode) {
            putSkyAway();
            targetSky = null;
        }
        if (!want) {
            targetSky = '';
            swapSkies(() => {
                // Each switch changes the page partway through playing; by then a newer one
                // may have been asked for, and that one has the last word.
                if (request !== skyRequest) return;
                putSkyAway();
                showOwnBackdrop(effectsMode);
            }, animate, from, want);
            return;
        }
        try {
            const sky = await loadSky(want);
            await sky.prepare();
            // Moved on while it got ready: another level, or more presses. Not put away if it
            // is up after all, from an earlier press, for whatever comes next to take down.
            if (wantedSky(effectsMode) !== want) {
                if (showingSky !== want) sky.release();
                return;
            }
            if (request !== skyRequest) return;
            targetSky = want;
            swapSkies(() => {
                if (request !== skyRequest) return;
                putSkyAway();
                showingSky = want;
                root.dataset[want] = '';
                // From one level's eye to another's it is simply there, where that one was.
                sky.show({ after: arrival, settled: Object.values(EYES).includes(from) });
                stillSky.hide();
                cosmos.hide();
                darkensWhenIdle = false;
                wakeEffectsBackground();
            }, animate, from, want);
            deferPerformanceSampling(PERFORMANCE_RESUME_DELAY_MS);
        } catch (error) {
            // Offline, or blocked: the page simply keeps the sky it has, or puts its own
            // back if another level's was put away for this one.
            if (request !== skyRequest) return;
            skippedSkies.add(want);
            delete root.dataset[want];
            if (!showingSky) {
                targetSky = '';
                showOwnBackdrop(effectsMode);
            } else targetSky = showingSky;
        }
    };
    // By when the press happened, not when the page got round to it: on a machine
    // that is struggling, quick presses can be answered slowly.
    const countSkyPress = (level, now, presses = SKY_PRESSES) => {
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
        if (skyPresses < presses) return;
        skyPresses = 0;
        skyQuietUntil = now + SKY_QUIET_MS;
        // Once found, every look is fetched, so a switch from here on is at once.
        if (!skiesFound) Object.keys(SKIES).forEach(name => loadSky(name).catch(() => {}));
        skiesFound = true;
        if (level === 'medium') {
            if (deskOn) deskOn = eyeOn = false;
            else if (eyeOn || skippedSkies.has('iris')) deskOn = true;
            else eyeOn = true;
        } else {
            deskOn = false;
            eyeOn = !eyeOn;
        }
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
    const fxBackground = document.getElementById('fx-background');
    const fxInput = document.getElementById('fx-level');
    fxBackground?.addEventListener('click', event => {
        countSkyPress(effectsMode, event.timeStamp, 1);
    });
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
        // The space sky is not started for a visitor who has swapped it for
        // the other one.
        setBackdropLook(mode);
        cursor.setEnabled(mode === 'high');
        if (mode !== 'high') {
            document.querySelectorAll('.cursor-spark, .cursor-ripple').forEach(effect => effect.remove());
        }
        // Low leans no card: one still leaning under a cursor that has not moved goes flat.
        if (mode === 'low') retargetPointerSurfaces();
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
        // chosen by hand gets it back. The sky stays as soft as it was eased
        // to, which only changes how finely it is drawn.
        glassEased = false;
        monitorDone = false;
        crawlingSince = 0;
        crawlingWindows = 0;
        deferPerformanceSampling(PERFORMANCE_RESUME_DELAY_MS);
        // Kept at once: the level itself goes up a frame or more later, inside its
        // transition, and a reload in between must still find the visitor's choice.
        storeEffects('sessionStorage', levelStorageKey, level);
        storeEffects('sessionStorage', lagStorageKey, '');
        // The level already showing, chosen by hand (a first visit's Medium, or the one the
        // page stepped down to): nothing on the page changes, so nothing plays. A "going
        // down" played here held the page through the next quick press, and the two presses
        // that go round the looks lost their second.
        if (level === effectsMode) {
            applyEffectsMode(level, true, 'manual', false);
            return;
        }
        const rising = EFFECT_LEVELS.indexOf(level) > EFFECT_LEVELS.indexOf(effectsMode);
        shift(!rising ? 'fall' : level === 'high' ? 'surge' : 'rise', () => applyEffectsMode(level, true, 'manual'));
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

    // ---- The star's hint -------------------------------------------------
    // Paired glints suggest the two presses that reveal another look. Repeat
    // them through the opening ten seconds, then leave a minute between hints.
    // Using the control ends the introduction and gives it a minute's rest.
    // Keep the small animation quiet in hidden tabs, project sheets and for
    // reduced motion; missed opening hints are never replayed on returning.
    const fxIcon = fxBackground?.querySelector('.fx-slider-icon');
    if (fxIcon) {
        const INTRO_MS = 10000, INTRO_EVERY_MS = 3000, HINT_EVERY_MS = 60000;
        const introUntil = performance.now() + INTRO_MS;
        let introducing = true;
        let nextHint = performance.now() + 1000;
        const clearHint = () => fxIcon.classList.remove('is-hinting-twice');
        fxIcon.addEventListener('animationend', clearHint);
        const restHint = () => {
            introducing = false;
            clearHint();
            nextHint = performance.now() + HINT_EVERY_MS;
        };
        fxSlider.addEventListener('pointerdown', restHint, { passive: true });
        fxSlider.addEventListener('keydown', restHint);
        fxBackground.addEventListener('click', restHint);
        const checkHint = () => {
            const now = performance.now();
            if (introducing && now >= introUntil) {
                introducing = false;
                nextHint = introUntil + HINT_EVERY_MS;
            }
            const quiet = document.hidden || reducedMotion.matches
                || document.getElementById('project-modal')?.classList.contains('active');
            if (now >= nextHint && !quiet) {
                fxIcon.classList.add('is-hinting-twice');
                nextHint = now + (introducing ? INTRO_EVERY_MS : HINT_EVERY_MS);
            }
            window.setTimeout(checkHint, 1000);
        };
        window.setTimeout(checkHint, 1000);
    }
    document.addEventListener('visibilitychange', () => {
        deferPerformanceSampling(PERFORMANCE_RESUME_DELAY_MS);
        if (document.hidden) {
            clearBackgroundIdleTimer();
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
            // The cursor dot. The sky reads the pointer for itself (cosmos.js).
            cursor.move(latestPointerEvent);
            pointerFrame = 0;
        });
    };
    window.addEventListener('pointermove', queueHighEffectsMovement, { passive: true });
    // A finger wakes the backdrop as the cursor does. A swipe that has let go
    // leaves the page gliding on, and the glide is not someone there.
    window.addEventListener('touchstart', () => {
        highEffectsTouchSwipeActive = false;
        touchSwipeReleased = false;
        wakeEffectsBackground();
    }, { passive: true });
    window.addEventListener('touchmove', event => {
        if (!event.touches.length && !event.changedTouches.length) return;
        if (effectsMode === 'high') highEffectsTouchSwipeActive = true;
        wakeEffectsBackground();
    }, { passive: true });
    ['touchend', 'touchcancel'].forEach(eventName => {
        window.addEventListener(eventName, event => {
            if (event.touches.length || !highEffectsTouchSwipeActive) return;
            highEffectsTouchSwipeActive = false;
            touchSwipeReleased = true;
            wakeEffectsBackground();
        }, { passive: true });
    });
    window.addEventListener('pointerdown', wakeEffectsBackground, { passive: true });
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
            // Everything a visitor reads comes from here, in the set format
            // portfolio-template.json shows, and every level and every hidden
            // look shows the one page it builds. The project sheet's close,
            // Escape and backdrop are wired first: it is markup already in the
            // page, and a render that throws part-way must not leave a project
            // open that nothing can close.
            setupModal();
            renderContent(data);
            renderProfile(data.profile);
            renderAbout(data.about);
            renderSkills(data.skills);
            renderFeaturedProjects(data.projects);
            renderProjectCollections(data.collections, data.projects);
            // The sections that waited for the data appear in this frame,
            // already at their full size (see .awaiting-data, index.html).
            window.portfolioDataPending = false;
            document.documentElement.classList.remove('awaiting-data');
            revealLinkedSection();
            updateScrollMotion();
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

// A picture that will not load is swapped for the same placeholder an imageless
// project uses, rather than left as a broken-image icon. `error` does not bubble,
// so this listens in the capture phase -- one listener covers the cards, the
// modal and anything rendered later.
function setupImageRecovery() {
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
        if (!(image instanceof HTMLImageElement) || image.dataset.recovered) return;
        // A card's hover animation, fetched on the first hover, did not come (offline,
        // say): the card keeps its picture, which leaving it puts back.
        if (image.dataset.motionSrc && image.getAttribute('src') === image.dataset.motionSrc) return;
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
    // (Guarded like every other media listener here: Safari before 14 has no
    // addEventListener on a media query, and a throw would stop the page building.)
    window.matchMedia('(max-width: 900px)').addEventListener?.('change', event => {
        if (!event.matches) setOpen(false);
    });
}

// ---- The still sky (every level) -------------------------------------------------
// A sky that asks almost nothing: deep space, nebulae, a band of stars and thousands
// more, drawn once into a picture off the page's thread and laid on one fixed layer
// (.background-grid::before, portfolio.css), so a scroll slides the page over it without
// drawing anything. At Low it is all there is, with four stars that brighten and fade
// very slowly and a slow shooting star now and then, every one a compositor animation.
// Medium and High draw the living sky over it (cosmos.js), which is handed the picture
// so that its black holes bend the stars actually there. One seed a visit, so it is the
// same sky every time it comes back.
//
// The drawing stands alone, with nothing from outside it but its arguments: its source
// text is what the worker below runs. Where the galaxy stands is set out here, in
// cosmos.js and in portfolio.css, and they have to agree.
// Medium's (full) has a spiral with a dark heart, far galaxies and clouds of dust;
// cosmos.js makes the heart a hole that feeds. `spot` is where this visit's galaxy stands
// (setupStillSky), anywhere across the screen, and everything bright is spread wide with
// it; without one (Low, as Aloe settled it) the glow is off to the right, the words'
// side kept quiet. With `live` false -- no
// cosmos.js on this machine -- it has the black holes, the ringed world and the dying
// star painted in too, which cosmos.js otherwise floats over it.
function paintGalaxySky(context, width, height, seed, full, live, dark, spot) {
    const TAU = Math.PI * 2;
    let state = seed;
    const random = () => {
        state = (state + 0x6D2B79F5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // Three draws averaged: a bell between -1 and 1, for anything that gathers.
    const bell = () => (random() + random() + random() - 1.5) / 1.5;
    const tall = height >= width * 1.1;
    const [gxShare, gyShare] = spot || (tall ? [.64, .28] : [.76, .5]);
    const gx = width * gxShare, gy = height * gyShare;
    const span = Math.max(width, height);
    // The page's words run down the left; what lies behind them is kept quiet.
    const quiet = x => (tall ? .6 : spot ? .8 + .2 * Math.min(1, Math.max(0, (x / width - .1) / .5)) : .36 + .64 * Math.min(1, Math.max(0, (x / width - .1) / .5)));
    // Dark: darker still and nearly without colour, as High was before the levels shared
    // it: what colour there is kept to a trace, and all of it dimmer. Every level asks for it.
    const tone = dark ? (rgb, dim = .62) => {
        const [r, g, b] = rgb.split(',').map(Number), l = r * .3 + g * .59 + b * .11;
        return [r, g, b].map(v => Math.round((l + (v - l) * .28) * dim)).join(',');
    } : rgb => rgb;
    // The deep: near black, lifting a little toward the galaxy.
    const deep = context.createRadialGradient(gx, gy, 0, gx, gy, span);
    deep.addColorStop(0, dark ? '#07070b' : '#0a0b16');
    deep.addColorStop(.38, dark ? '#030305' : '#05050c');
    deep.addColorStop(1, dark ? '#000000' : '#010103');
    context.fillStyle = deep;
    context.fillRect(0, 0, width, height);
    const puff = (x, y, radius, rgb, alpha, squash, angle) => {
        context.save();
        context.translate(x, y);
        context.rotate(angle);
        context.scale(1, squash);
        const light = context.createRadialGradient(0, 0, 0, 0, 0, radius);
        rgb = tone(rgb);
        light.addColorStop(0, `rgba(${rgb},${alpha})`);
        light.addColorStop(.4, `rgba(${rgb},${alpha * .45})`);
        light.addColorStop(1, `rgba(${rgb},0)`);
        context.fillStyle = light;
        context.fillRect(-radius, -radius, radius * 2, radius * 2);
        context.restore();
    };
    // Nebulae: each a drifting trail of soft light in two or three colours, added up.
    // Dark and cold: colour only where something is burning, and not much of it.
    const violet = '70,52,140', magenta = '110,40,96', blue = '40,64,140', teal = '30,86,104';
    const ember = '150,70,46', rose = '130,46,70';
    const glow = dark ? .5 : full ? .6 : .72;
    const nebula = (x, y, reach, palette, puffs, strength) => {
        let px = x, py = y, heading = random() * TAU;
        for (let i = 0; i < puffs; i++) {
            heading += bell() * 1.1;
            px += Math.cos(heading) * reach * .07;
            py += Math.sin(heading) * reach * .07;
            const rgb = palette[Math.floor(random() * palette.length)];
            puff(px, py, reach * (.1 + random() * .28), rgb, strength * (.5 + random()) * quiet(px), .35 + random() * .65, random() * TAU);
        }
    };
    context.globalCompositeOperation = 'lighter';
    nebula(gx + span * .08, gy - height * .2, span * .5, [violet, magenta, blue], 46, .05 * glow);
    nebula(gx - span * .06, gy + height * .22, span * .42, [blue, teal, violet], 40, .045 * glow);
    nebula(width * .12, height * .88, span * .34, [teal, blue], 26, .035 * glow);
    nebula(width * (tall ? .2 : .34), height * .08, span * .3, [violet, rose], 22, .028 * glow);
    nebula(width * .95, height * .92, span * .3, [ember, rose, magenta], 24, .03 * glow);
    // Dark dust drifting across the brightest of it.
    context.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 26; i++) {
        const along = random() - .5;
        puff(gx + along * span * .9 + bell() * 60, gy - along * height * .3 + bell() * height * .2,
            30 + random() * 110, '4,4,10', .12 + random() * .16, .25 + random() * .4, -.5 + bell() * .5);
    }
    // The band: long and faint, corner to corner, with a third of the stars along it.
    const bandAngle = -.5 + bell() * .1;
    const bandCos = Math.cos(bandAngle), bandSin = Math.sin(bandAngle);
    const bandX = width * .5, bandY = height * .55, bandWidth = Math.min(width, height) * .16;
    context.globalCompositeOperation = 'lighter';
    puff(bandX, bandY, span * .8, '170,186,255', .05, .14, bandAngle);
    // Stars. Most are faint, a few are bright with a halo, and the brightest catch the
    // light in long spikes.
    const colors = ['224,237,255', '190,214,255', '246,226,196', '214,206,240', '240,244,250', '255,206,160', '200,220,255', '255,186,170'];
    // The stars keep their brightness; only their colour goes.
    const colour = () => tone(colors[Math.floor(random() ** 1.7 * colors.length)], 1);
    const spike = (x, y, dx, dy, length, rgb, alpha, thick) => {
        const line = context.createLinearGradient(x - dx * length, y - dy * length, x + dx * length, y + dy * length);
        line.addColorStop(0, `rgba(${rgb},0)`);
        line.addColorStop(.5, `rgba(${rgb},${alpha})`);
        line.addColorStop(1, `rgba(${rgb},0)`);
        context.strokeStyle = line;
        context.lineWidth = thick;
        context.beginPath();
        context.moveTo(x - dx * length, y - dy * length);
        context.lineTo(x + dx * length, y + dy * length);
        context.stroke();
    };
    const star = (x, y, radius, alpha, rgb) => {
        if (radius > .9) {
            const reach = radius * 7;
            const halo = context.createRadialGradient(x, y, 0, x, y, reach);
            halo.addColorStop(0, `rgba(${rgb},${alpha * .45})`);
            halo.addColorStop(.3, `rgba(${rgb},${alpha * .12})`);
            halo.addColorStop(1, `rgba(${rgb},0)`);
            context.fillStyle = halo;
            context.fillRect(x - reach, y - reach, reach * 2, reach * 2);
        }
        context.fillStyle = `rgba(${rgb},${alpha})`;
        context.beginPath();
        context.arc(x, y, radius, 0, TAU);
        context.fill();
        if (radius > 1.55) {
            const long = radius * (9 + random() * 8);
            spike(x, y, 1, 0, long, rgb, alpha * .55, Math.max(.5, radius * .28));
            spike(x, y, 0, 1, long * .8, rgb, alpha * .55, Math.max(.5, radius * .28));
        }
    };
    const count = Math.round(width * height / 640);
    for (let i = 0; i < count; i++) {
        let x = random() * width, y = random() * height;
        if (random() < .3) {
            const along = (random() - .5) * span * 1.5, across = bell() * bandWidth;
            x = bandX + along * bandCos - across * bandSin;
            y = bandY + along * bandSin + across * bandCos;
            if (x < 0 || x > width || y < 0 || y > height) continue;
        }
        star(x, y, .28 + random() ** 4.2 * 1.9, (.2 + random() ** 1.4 * .75) * (.55 + .45 * quiet(x)), colour());
    }
    // A few clusters: a haze with a knot of faint stars in it.
    for (let c = 0; c < 3; c++) {
        const cx = width * (spot ? .04 + random() * .92 : .3 + random() * .66), cy = height * (.1 + random() * .8);
        puff(cx, cy, 70, '220,230,255', .05, 1, 0);
        const stars = 30 + Math.floor(random() * 24);
        for (let i = 0; i < stars; i++) {
            star(cx + bell() * 50, cy + bell() * 50, .26 + random() ** 3 * .7, .25 + random() * .5, colour());
        }
    }
    if (full) {
        const blot = (x, y, radius, rgb, alpha, squash = 1, angle = 0) => puff(x, y, radius, rgb, alpha, squash, angle);
        // Clouds of dust across the light, darker than the dark.
        context.globalCompositeOperation = 'source-over';
        for (let i = 0; i < 18; i++) {
            blot(width * random(), height * random(), 60 + random() * 200, '1,1,4', .22 + random() * .2, .3 + random() * .5, random() * TAU);
        }
        // Far galaxies, small and tilted, each a core and a fainter disc.
        context.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 16; i++) {
            const x = width * (.02 + random() * .96), y = height * random(), size = 5 + random() ** 2 * 24;
            const squash = .2 + random() * .6, angle = random() * TAU, warm = random() < .35;
            blot(x, y, size, warm ? '170,140,110' : '120,140,180', .07 + random() * .07, squash, angle);
            blot(x, y, size * .28, warm ? '240,210,180' : '210,220,245', .22, squash, angle);
        }
        // The spiral, where the living one stands at High: pale arms, heavy
        // dust, and at its heart not a light but a hole, with fire round it.
        const radius = (tall ? Math.min(width * 1.25, height * .64) : Math.min(width * .64, height * 1.28)) * .46;
        const unit = radius / 400;
        context.save();
        context.translate(gx, gy);
        context.rotate(-.42);
        context.scale(1, .42);
        const turnAt = u => Math.log(Math.max(u, .07) / .07) / .46;
        const at = (u, angle) => [Math.cos(angle) * u * radius, Math.sin(angle) * u * radius];
        context.globalCompositeOperation = 'lighter';
        blot(0, 0, radius * 1.1, '50,58,96', .12);
        blot(0, 0, radius * .34, '150,128,110', .12);
        for (let arm = 0; arm < 2; arm++) {
            for (let u = .07; u < 1; u += .008) {
                const [x, y] = at(u + bell() * .03, arm * Math.PI + turnAt(u) + bell() * .1);
                blot(x, y, (10 + random() * 22) * unit, '110,124,160', .05 * (1.1 - u * .6));
            }
        }
        for (let i = 0; i < 2600; i++) {
            const arm = random() < .5 ? 0 : Math.PI, onArm = random() < .7;
            const u = onArm ? .07 + random() ** .8 * .93 : Math.abs(bell()) * .3;
            const angle = onArm ? arm + turnAt(u) + bell() * (.05 + u * .1) : random() * TAU;
            const [x, y] = at(u, angle);
            context.fillStyle = `rgba(${tone(random() < .8 ? '205,215,235' : '235,215,195', .85)},${(.25 + random() * .6).toFixed(2)})`;
            context.fillRect(x, y, unit * 1.6, unit * 1.6);
        }
        for (let i = 0; i < 26; i++) {
            const u = .25 + random() * .7;
            const [x, y] = at(u, (random() < .5 ? 0 : Math.PI) + turnAt(u) + bell() * .08);
            blot(x, y, (4 + random() * 7) * unit, '170,36,56', .45);
        }
        context.globalCompositeOperation = 'source-over';
        for (let arm = 0; arm < 2; arm++) {
            for (let u = .1; u < .92; u += .007) {
                const [x, y] = at(u + bell() * .015, arm * Math.PI + turnAt(u) - .24 + bell() * .05);
                blot(x, y, (7 + random() * 13) * unit, '2,1,5', .22 + random() * .22);
            }
        }
        context.globalCompositeOperation = 'lighter';
        const fire = context.createRadialGradient(0, 0, radius * .03, 0, 0, radius * .1);
        fire.addColorStop(0, 'rgba(0,0,0,0)');
        fire.addColorStop(.25, 'rgba(255,186,120,.55)');
        fire.addColorStop(.55, 'rgba(220,100,50,.22)');
        fire.addColorStop(1, 'rgba(120,40,20,0)');
        context.fillStyle = fire;
        context.fillRect(-radius * .1, -radius * .1, radius * .2, radius * .2);
        context.globalCompositeOperation = 'source-over';
        context.fillStyle = '#000000';
        context.beginPath();
        context.arc(0, 0, radius * .034, 0, TAU);
        context.fill();
        context.restore();
        // What cosmos.js floats over the picture, when it is not there to.
        if (!live) {
            // Black holes: nothing at all, and a disc of gas it lights as it pulls it in.
            const holes = tall ? [[.22, .62, 22], [.8, .84, 14]] : [[.46, .82, 26], [.93, .16, 16], [.58, .2, 11]];
            for (const [hx, hy, size] of holes) {
                const x = width * hx + bell() * 20, y = height * hy + bell() * 20, r = size * (.8 + random() * .4);
                const tilt = -.3 + random() * .6;
                context.globalCompositeOperation = 'lighter';
                blot(x, y, r * 4, '120,60,30', .1);
                context.save();
                context.translate(x, y);
                context.rotate(tilt);
                context.scale(1, .28);
                const disc = context.createRadialGradient(0, 0, r * 1.15, 0, 0, r * 3.4);
                disc.addColorStop(0, 'rgba(255,214,170,.7)');
                disc.addColorStop(.3, 'rgba(240,140,70,.35)');
                disc.addColorStop(1, 'rgba(120,40,20,0)');
                context.fillStyle = disc;
                context.fillRect(-r * 3.4, -r * 3.4, r * 6.8, r * 6.8);
                context.restore();
                context.globalCompositeOperation = 'source-over';
                context.fillStyle = '#000000';
                context.beginPath();
                context.arc(x, y, r, 0, TAU);
                context.fill();
            }
            // A world with a ring, lit from the upper left, the ring behind it and in front.
            const [wx, wy, wr] = tall ? [width * .2, height * .9, 20] : [width * .9, height * .86, 24];
            const ring = (from, to) => {
                context.save();
                context.translate(wx, wy);
                context.rotate(-.3);
                context.scale(1, .24);
                context.strokeStyle = 'rgba(170,150,126,.42)';
                context.lineWidth = wr * .9;
                context.beginPath();
                context.arc(0, 0, wr * 1.75, from, to);
                context.stroke();
                context.restore();
            };
            context.globalCompositeOperation = 'source-over';
            ring(Math.PI, TAU);
            const ball = context.createRadialGradient(wx - wr * .45, wy - wr * .4, wr * .1, wx, wy, wr);
            ball.addColorStop(0, 'rgb(150,116,90)');
            ball.addColorStop(.55, 'rgb(48,34,30)');
            ball.addColorStop(1, 'rgb(5,4,6)');
            context.fillStyle = ball;
            context.beginPath();
            context.arc(wx, wy, wr, 0, TAU);
            context.fill();
            ring(0, Math.PI);
            // A star dying, deep red, with the shells it threw off standing round it.
            const [sx, sy] = tall ? [width * .82, height * .07] : [width * .67, height * .09];
            context.globalCompositeOperation = 'lighter';
            blot(sx, sy, 34, '170,40,30', .22);
            blot(sx, sy, 6, '255,150,110', .9);
            for (let i = 1; i <= 3; i++) {
                context.strokeStyle = `rgba(200,60,44,${(.3 / i).toFixed(3)})`;
                context.lineWidth = 2 + i;
                context.beginPath();
                context.ellipse(sx, sy, 16 * i + bell() * 3, 15 * i + bell() * 3, random() * TAU, 0, TAU);
                context.stroke();
            }
        }
        // A galaxy seen edge on, a dark lane through the middle of it.
        const [ex, ey] = tall ? [width * .32, height * .42] : [width * .34, height * .72];
        const edgeAngle = -.2 + bell() * .3;
        blot(ex, ey, 80, '190,180,160', .2 * quiet(ex) + .05, .1, edgeAngle);
        blot(ex, ey, 14, '245,230,205', .55, .45, edgeAngle);
        context.globalCompositeOperation = 'source-over';
        blot(ex, ey, 72, '1,1,3', .7, .025, edgeAngle);
    }
    // Darker toward the edges.
    context.globalCompositeOperation = 'source-over';
    const edge = context.createRadialGradient(width / 2, height * .45, Math.min(width, height) * .35,
        width / 2, height * .45, Math.hypot(width, height) * .62);
    edge.addColorStop(0, 'rgba(2,2,6,0)');
    edge.addColorStop(1, 'rgba(0,0,2,.7)');
    context.fillStyle = edge;
    context.fillRect(0, 0, width, height);
}

// A worker, written out here so the page fetches nothing for it: it draws the picture
// on a canvas of its own, encodes it and goes away again.
const stillSkyWorkerSource = () => `
    const paint = ${paintGalaxySky};
    onmessage = async ({ data: { width, height, ratio, seed, full, live, dark, spot } }) => {
        try {
            const canvas = new OffscreenCanvas(Math.round(width * ratio), Math.round(height * ratio));
            const context = canvas.getContext('2d');
            context.setTransform(ratio, 0, 0, ratio, 0, 0);
            paint(context, width, height, seed, full, live, dark, spot);
            postMessage(await canvas.convertToBlob({ type: 'image/png' }));
        } catch (error) {
            postMessage(null);
        }
    };`;
function setupStillSky(layer, reducedMotion) {
    const seed = Math.floor(Math.random() * 4294967296);
    const idle = window.requestIdleCallback || (callback => window.setTimeout(callback, 1));
    // `adopted`: the build whose picture is on the layer. `fading`: the picture before it,
    // while it fades out. `stopBuild`: ends the build under way, when a newer one starts.
    let wanted = false, url = '', job = 0, adopted = 0, fading = '', stopBuild = null, resizeTimer = 0, releaseTimer = 0, swapTimer = 0;
    let drawnWidth = 0, drawnHeight = 0, drawnRatio = 0, drawnFull = false, drawnLive = true, drawnDark = false, drawnSpot = false;
    // Whether cosmos.js is drawing over this; until it is found it cannot, it is taken to.
    let live = true;
    const root = document.documentElement;
    // Medium's things are painted in; so are they at High where cosmos.js cannot run, so
    // that High never shows less than Medium.
    const wantFull = () => root.dataset.effects === 'medium' || (!live && root.dataset.effects === 'high');
    // Every level the same dark sky; Low only shows it dimmer (portfolio.css).
    const wantDark = () => true;
    // Where this visit's galaxy stands, as shares of the screen: anywhere across it, one visit
    // behind the words and the next off to a side, and the bright things spread wide with it.
    // cosmos.js stands High's living galaxy and Medium's feeding heart there too. Low keeps
    // its sky as Aloe settled it.
    const across = (seed >>> 3) % 997 / 997, down = (seed >>> 13) % 991 / 991;
    const skySpot = tall => (tall ? [.3 + across * .4, .2 + down * .16] : [.2 + across * .6, .34 + down * .3]);
    window.portfolioSkySpot = skySpot;
    const wantSpot = (width, height) => (root.dataset.effects === 'low' ? null : skySpot(height >= width * 1.1));

    // What moves on it, at Low (the other levels hide it): four stars that glint and a
    // shooting star. Where the glints stand is part of the visit's sky too.
    const life = document.createElement('div');
    life.className = 'sky-life';
    life.setAttribute('aria-hidden', 'true');
    life.hidden = true;
    {
        let state = seed ^ 0x2545f491;
        const random = () => {
            state = (state + 0x6D2B79F5) | 0;
            let t = Math.imul(state ^ (state >>> 15), 1 | state);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        for (let i = 0; i < 4; i++) {
            const glint = document.createElement('span');
            glint.className = 'sky-glint';
            // Most of them off to the right, clear of the page's words.
            const x = random() < .72 ? 44 + random() * 54 : 2 + random() * 42;
            const y = 4 + random() * 92;
            // A draw no longer used, kept so each visit's glints stand and turn where they did.
            random();
            glint.style.cssText = `--x:${x.toFixed(1)}%;--y:${y.toFixed(1)}%;--slow:${(16 + random() * 14).toFixed(2)}s;--delay:${(-random() * 30).toFixed(2)}s`;
            life.appendChild(glint);
        }
    }
    const shooter = document.createElement('span');
    shooter.className = 'sky-shooting';
    shooter.addEventListener('animationend', () => shooter.classList.remove('is-shooting'));
    life.appendChild(shooter);
    layer.after(life);
    const living = () => wanted && !life.hidden && !document.hidden && !reducedMotion.matches;

    // Now and then, at Low, a slow shooting star, seldom.
    let shootTimer = 0, resting = false;
    const shoot = fromLeft => {
        shooter.style.setProperty('--from-x', `${(fromLeft ? 8 + Math.random() * 30 : 45 + Math.random() * 50).toFixed(1)}vw`);
        shooter.style.setProperty('--from-y', `${(4 + Math.random() * 40).toFixed(1)}vh`);
        shooter.style.setProperty('--angle', `${(fromLeft ? 18 + Math.random() * 22 : 140 + Math.random() * 22).toFixed(1)}deg`);
        shooter.style.setProperty('--travel', `${(18 + Math.random() * 22).toFixed(1)}vmax`);
        shooter.classList.remove('is-shooting');
        void shooter.offsetWidth;
        shooter.classList.add('is-shooting');
    };
    // Only Low shows them, so only Low keeps a timer for them; show() runs on every
    // change of level, which starts or stops it.
    const scheduleShot = () => {
        clearTimeout(shootTimer);
        if (root.dataset.effects !== 'low' || reducedMotion.matches) return;
        shootTimer = window.setTimeout(() => {
            if (living() && !resting) shoot(Math.random() < .35);
            if (wanted) scheduleShot();
        }, 18000 + Math.random() * 16000);
    };
    const rest = () => {
        resting = true;
        life.classList.add('is-resting');
    };
    const wake = () => {
        resting = false;
        life.classList.remove('is-resting');
    };
    document.addEventListener('portfolio:modal-open', rest);
    document.addEventListener('portfolio:modal-close', wake);

    // The picture as cosmos.js takes it: the image, and the size it was drawn for.
    const handOver = detail => {
        window.portfolioStillSky = detail;
        document.dispatchEvent(new CustomEvent('portfolio:sky-picture', { detail }));
    };
    // The finished picture, decoded and laid on the layer; it fades in once it is ready,
    // and one that takes the place of another fades over it (.background-grid::after).
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
            adopted = ticket;
            if (previous) {
                clearTimeout(swapTimer);
                // One still fading out from a swap a moment ago is done with now; left to its
                // cleared timer, its picture would be held for the rest of the visit.
                if (fading) URL.revokeObjectURL(fading);
                fading = previous;
            }
            if (previous && 'sky' in layer.dataset) {
                layer.style.setProperty('--still-sky-old', `url("${previous}")`);
                delete layer.dataset.swap;
                void layer.offsetWidth;
                layer.dataset.swap = '';
            }
            layer.style.setProperty('--still-sky', `url("${next}")`);
            layer.dataset.sky = '';
            if (wanted) life.hidden = false;
            handOver({ picture, width: drawnWidth, height: drawnHeight });
            if (previous) {
                swapTimer = window.setTimeout(() => {
                    delete layer.dataset.swap;
                    layer.style.removeProperty('--still-sky-old');
                    URL.revokeObjectURL(previous);
                    fading = '';
                }, 1000);
            }
        });
    };
    // At Low, for the cheapest machine there is, at the screen's plain resolution: a
    // quarter of the memory of the sharper picture, and the stars are points anyway.
    const targetRatio = () => Math.min(window.devicePixelRatio || 1, root.dataset.effects === 'low' ? 1 : 1.5);
    // For a browser with no canvas for its workers to draw on. All of it runs on the
    // page's thread.
    const buildHere = (width, height, ratio, ticket) => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        const context = canvas.getContext('2d');
        if (!context) return;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        paintGalaxySky(context, width, height, seed, wantFull(), live, wantDark(), wantSpot(width, height));
        canvas.toBlob(blob => adopt(blob, ticket), 'image/png');
    };
    // Every visit starts at Medium, so this is drawn on every load. Off the page's
    // thread none of it can hold anything up.
    const build = () => {
        const width = window.innerWidth, height = window.innerHeight;
        const ratio = targetRatio();
        const ticket = ++job;
        drawnWidth = width; drawnHeight = height; drawnRatio = ratio; drawnFull = wantFull(); drawnLive = live; drawnDark = wantDark(); drawnSpot = !!wantSpot(width, height);
        // A build still painting a picture nobody will take is stopped, not left to finish:
        // on Low's dual core it would be painting against the page.
        stopBuild?.();
        stopBuild = null;
        if (!('OffscreenCanvas' in window) || !('Worker' in window)) {
            buildHere(width, height, ratio, ticket);
            return;
        }
        let worker = null, source = '';
        const finish = () => {
            worker?.terminate();
            worker = null;
            if (source) URL.revokeObjectURL(source);
            source = '';
        };
        stopBuild = finish;
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
        worker.postMessage({ width, height, ratio, seed, full: wantFull(), live, dark: wantDark(), spot: wantSpot(width, height) });
    };
    // Sized to cover the window, so a phone's address bar sliding away only trims an
    // edge; a new shape, a new zoom or a level that wants it sharper or fuller draws it
    // again.
    const reshaped = () => window.innerWidth !== drawnWidth
        || Math.abs(window.innerHeight / drawnHeight - 1) > .2
        || targetRatio() !== drawnRatio
        || wantFull() !== drawnFull
        || wantDark() !== drawnDark
        || !!wantSpot(window.innerWidth, window.innerHeight) !== drawnSpot
        || (drawnFull && live !== drawnLive);
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
        drawnFull = false;
        handOver(null);
    };
    return {
        show() {
            clearTimeout(releaseTimer);
            if (wanted) {
                // From one level to another: the picture at the resolution, and with the
                // things, that level wants, started at once so it is in by the end of the
                // change's transition (it is painted off the page's thread).
                if (reshaped()) build();
                scheduleShot();
                return;
            }
            wanted = true;
            scheduleShot();
            if (url && !reshaped()) {
                layer.dataset.sky = '';
                life.hidden = false;
            } else idle(() => { if (wanted) build(); }, { timeout: 600 });
        },
        // Handed back once the layer's fade has carried it out.
        hide() {
            if (!wanted) return;
            wanted = false;
            // A build under way is dropped. What it was drawing for is no longer what the
            // layer holds, so the next show() must draw again, not take the older picture.
            if (adopted !== job) drawnWidth = 0;
            job++;
            stopBuild?.();
            stopBuild = null;
            life.hidden = true;
            clearTimeout(shootTimer);
            clearTimeout(resizeTimer);
            clearTimeout(releaseTimer);
            // Kept a while, so coming back from an eye has it at once.
            releaseTimer = window.setTimeout(release, 20000);
        },
        // cosmos.js could not run here: Medium's picture gets the things it would have floated.
        alone() {
            if (!live) return;
            live = false;
            if (wanted && reshaped()) idle(() => { if (wanted) build(); }, { timeout: 600 });
        }
    };
}

// ---- The living sky (Medium and High FX) -----------------------------------------
// cosmos.js, fetched the first time Medium or High wants it and never for Low. Every visit
// starts at Medium, so it is asked for on every load -- once the page has settled, so the
// first paint does not wait on it. Its canvas is put up now, empty and hidden, so it has
// its place among the backdrop's layers. Where it cannot run (no WebGL 2, or a graphics
// card the browser only imitates), the still sky is painted with what it would have
// floated over it.
function setupDeferredCosmos(canvas, stillSky) {
    let wanted = '', script = null, failed = false, eased = false, asked = false;
    const fail = () => {
        failed = true;
        stillSky.alone();
    };
    document.addEventListener('portfolio:cosmos-failed', fail);
    const arrive = () => {
        // A script that loaded but could not run here (too old a browser for it) defines
        // nothing: the still sky paints in what it would have drawn.
        if (!window.portfolioCosmos) {
            fail();
            return;
        }
        if (!wanted || failed) return;
        if (eased) window.portfolioCosmos.ease();
        if (!window.portfolioCosmos.show(canvas, wanted)) fail();
    };
    const load = () => {
        // Not for a visitor who went to Low before the page got round to it.
        if (script || failed || !wanted) return;
        script = document.createElement('script');
        script.src = `cosmos.js${PORTFOLIO_SCRIPT_QUERY}`;
        script.onload = arrive;
        script.onerror = () => {
            script.remove();
            script = null;
        };
        document.head.appendChild(script);
    };
    return {
        show(level) {
            wanted = level;
            if (failed) return;
            if (window.portfolioCosmos) {
                arrive();
                return;
            }
            if (asked) {
                load();
                return;
            }
            asked = true;
            (window.requestIdleCallback || (callback => window.setTimeout(callback, 200)))(load, { timeout: 1500 });
        },
        hide() {
            wanted = '';
            window.portfolioCosmos?.hide();
        },
        ease() {
            eased = true;
            window.portfolioCosmos?.ease();
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
    // Called on every scroll too, through retargetPointerSurfaces, which the page's
    // own scroll listener runs (setupPointerReactiveSurfaces).
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
        // Low leans nothing: a card still leaning from Medium, its level changed from the
        // keyboard with the cursor resting on it, is let go here.
        if (!highEffects()) {
            clearActiveCard();
            return;
        }
        if (!finePointer.matches || !pointerInside || retargetFrame) return;
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
    finePointer.addEventListener?.('change', syncPointerMode);
    return { move, setEnabled };
}

// How wide a project card image actually renders: full bleed on a phone, and a
// single grid column on anything larger. Kept next to the card markup because
// it has to match the --carousel-card-max-width the grid resolves to.
const CARD_IMAGE_SIZES = '(max-width: 639px) calc(100vw - 2rem), (max-width: 1007px) calc((100vw - 3.5rem) / 2), (max-width: 1599px) 440px, (max-width: 2559px) 560px, 640px';

// Every word from portfolio-data.json that goes into markup goes through this,
// in text and in attributes alike: a "<Servo.h>" in a write-up would otherwise
// vanish as a tag, and a quote in a label break out of its attribute.
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
    const hardened = youtubeEmbedUrl(src);
    if (!hardened) return '';
    return `<iframe src="${escapeAttribute(hardened)}" title="${escapeAttribute(title || 'Project video')}"`
        + (options.lazy ? ' loading="lazy"' : '')
        + ' allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
}

// A video's address as the player needs it, from any form YouTube hands out. An
// embed keeps its own settings and only moves to the privacy-enhanced host; a
// watch page, a youtu.be share link or a Short -- each of which refuses to be
// framed, and youtu.be skips the privacy-enhanced host as well -- becomes the
// embed of the same video, starting where the link said. Anything else is left
// as it was.
function youtubeEmbedUrl(src) {
    const raw = String(src || '').trim();
    let url;
    try { url = new URL(raw); } catch (error) { return raw; }
    const host = url.hostname.replace(/^(?:www|m)\./, '');
    if (host !== 'youtube.com' && host !== 'youtube-nocookie.com' && host !== 'youtu.be') return raw;
    const [kind, value] = url.pathname.split('/').filter(Boolean);
    if (kind === 'embed') return `https://www.youtube-nocookie.com${url.pathname}${url.search}`;
    const id = host === 'youtu.be' ? kind : kind === 'watch' ? url.searchParams.get('v') : kind === 'shorts' || kind === 'live' ? value : '';
    if (!id) return raw;
    // t=75, t=75s or t=1m15s.
    const time = url.searchParams.get('t') || url.searchParams.get('start') || '';
    const part = unit => Number(time.match(new RegExp(`(\\d+)${unit}`))?.[1] || 0);
    const seconds = /^\d+$/.test(time) ? Number(time) : part('h') * 3600 + part('m') * 60 + part('s');
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}${seconds ? `?start=${seconds}` : ''}`;
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

// Every link in portfolio-data.json is written the same way: what kind of
// link it is, the words on it and where it goes ({ type, label, url }). The
// kind picks the icon, so a new link needs no markup. A link with no url is
// left off the page, except the résumé, which says it is coming.
const LINK_ICONS = {
    github: 'fa-brands fa-github', linkedin: 'fa-brands fa-linkedin', cad: 'fa-solid fa-cube',
    video: 'fa-solid fa-play', resume: 'fa-solid fa-file-arrow-down', email: 'fa-solid fa-envelope',
    link: 'fa-solid fa-arrow-up-right-from-square', projects: 'fa-solid fa-cubes',
    contact: 'fa-solid fa-paper-plane', section: 'fa-solid fa-arrow-down'
};
const LINK_WORDS = { github: 'Code', cad: 'CAD', video: 'Video', link: 'View', resume: 'Resume', email: 'Email Me' };
const linkIcon = link => LINK_ICONS[link?.type] || LINK_ICONS.link;
const linkLabel = link => link?.label || LINK_WORDS[link?.type] || 'View';
// An email link opens Gmail's compose window on a computer, where a mailto:
// so often lands in a mail program nobody set up, and the phone's own mail
// app on a phone.
function linkHref(link) {
    const url = String(link?.url || '').trim();
    if (link?.type !== 'email' || !url.startsWith('mailto:')) return url;
    const prefersNativeEmailApp = navigator.userAgentData?.mobile === true
        || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    return prefersNativeEmailApp ? url : `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(url.slice(7))}`;
}

// The page's own words: each element marked data-content in index.html shows
// the field it names, such as "sections.about.title". index.html keeps a copy
// for the first paint (tools/check-data.py --fix keeps it the same). An empty
// field hides its element, so a section intro can be added or taken away from
// the data alone. A Font Awesome icon in front of the words stays.
function renderContent(data) {
    document.querySelectorAll('[data-content]').forEach(element => {
        const value = element.dataset.content.split('.').reduce((at, key) => at?.[key], data);
        if (typeof value !== 'string') return;
        const icons = [...element.querySelectorAll(':scope > i')];
        if (icons.length) element.replaceChildren(...icons, ` ${value}`);
        else element.textContent = value;
        element.hidden = !value;
    });
}

function renderProfile(profile) {
    const tagline = document.getElementById('hero-tagline');
    if (!profile.tagline && profile.title) {
        tagline.textContent = profile.title;
        tagline.hidden = false;
    }
    // The hero's buttons are changed where they stand rather than drawn
    // again: they are on screen from the first paint, with the glass and the
    // press already on them.
    const actionRow = document.getElementById('hero-actions');
    const actions = (profile.actions || []).filter(action => action.url);
    const buttons = [...actionRow.querySelectorAll('.hero-action')];
    actions.forEach((action, index) => {
        let button = buttons[index];
        if (!button) {
            button = document.createElement('a');
            button.className = 'btn hero-action';
            actionRow.appendChild(button);
        }
        const icon = button.querySelector('i') || document.createElement('i');
        icon.className = linkIcon(action);
        icon.setAttribute('aria-hidden', 'true');
        button.href = action.url;
        button.replaceChildren(icon, ` ${linkLabel(action)}`);
    });
    buttons.slice(actions.length).forEach(button => button.remove());

    const links = profile.links || [];
    const resume = links.find(link => link.type === 'resume');
    const others = links.filter(link => link.type !== 'resume' && String(link.url || '').trim());
    const renderProfileLink = (link, className = '') => {
        const url = linkHref(link);
        const address = link.type === 'email' ? String(link.url).trim().replace(/^mailto:/, '') : '';
        const named = address ? `Email ${address}` : linkLabel(link);
        const externalAttributes = url.startsWith('mailto:') ? '' : ' target="_blank" rel="noopener"';
        const classAttribute = className ? ` class="${className}"` : '';
        return `<a href="${escapeAttribute(url)}"${externalAttributes}${classAttribute} title="${escapeAttribute(named)}" aria-label="${escapeAttribute(named)}"><i class="${linkIcon(link)}" aria-hidden="true"></i>${className ? ` ${escapeAttribute(linkLabel(link))}` : ''}</a>`;
    };
    const resumeUrl = String(resume?.url || '').trim();
    const resumeButton = !resume ? ''
        : resumeUrl
        ? `<a href="${escapeAttribute(resumeUrl)}" target="_blank" rel="noopener" class="btn secondary-btn"><i class="${linkIcon(resume)}" aria-hidden="true"></i> ${escapeAttribute(linkLabel(resume))}</a>`
        : `<span class="btn secondary-btn resume-unavailable" aria-disabled="true" title="Add a résumé PDF to activate this button"><i class="${linkIcon(resume)}" aria-hidden="true"></i> ${escapeAttribute(linkLabel(resume))}</span>`;
    const resumeIcon = !resume ? ''
        : resumeUrl
        ? `<a href="${escapeAttribute(resumeUrl)}" target="_blank" rel="noopener" title="${escapeAttribute(linkLabel(resume))}"><i class="${linkIcon(resume)}" aria-hidden="true"></i></a>`
        // Reads as a live control beside the other icons rather than a dead one,
        // because the résumé is coming. It still carries aria-disabled and still
        // goes nowhere, so nothing is promised to a screen reader that the page
        // cannot deliver -- give the résumé link a url in portfolio-data.json and
        // it becomes a real link with no other change.
        : `<span class="resume-icon-unavailable" aria-disabled="true" title="Résumé coming soon"><i class="${linkIcon(resume)}" aria-hidden="true"></i></span>`;
    // The hero's row of icons ends with the résumé.
    document.getElementById('hero-social').innerHTML = others.map(link => renderProfileLink(link)).join('') + resumeIcon;

    // Resume, GitHub and Email Me are one row of equal buttons, in the order
    // the data lists them, and they fill the three cells of the same page grid
    // every other region uses. Email was briefly promoted to a louder primary
    // button above this row; that read as a competing control rather than as
    // the close of the section, so it sits back here in the same weight.
    document.getElementById('contact-links-container').innerHTML = links
        .map(link => link === resume ? resumeButton : others.includes(link) ? renderProfileLink(link, 'btn secondary-btn') : '')
        .join('');
}

// The About cards: label, title, summary, then any roles, a smaller line under
// them and a link. A link to a folder of the archive opens the folder on the
// way there.
function renderAbout(cards = []) {
    const highlights = document.getElementById('about-highlights');
    if (!highlights) return;
    highlights.innerHTML = cards.map(card => {
        const roles = (card.roles || []).map(role => `<div class="about-highlight-role"><h4>${escapeAttribute(role.title)}</h4><p>${escapeAttribute([role.position, role.period].filter(Boolean).join(' • '))}</p></div>`).join('');
        const link = card.link?.url ? card.link : null;
        const content = `<span class="about-highlight-label">${escapeAttribute(card.label)}</span><h3>${escapeAttribute(card.title)}</h3><p>${escapeAttribute(card.summary)}</p>${roles}${card.subline ? `<p class="about-highlight-subline">${escapeAttribute(card.subline)}</p>` : ''}${link?.label ? `<span class="about-highlight-cta">${escapeAttribute(link.label)} <i class="${linkIcon(link)}" aria-hidden="true"></i></span>` : ''}`;
        return link
            ? `<a class="about-highlight about-highlight-link" href="${escapeAttribute(link.url)}"${link.url.startsWith('#') ? ` data-collection-target="${escapeAttribute(link.url.slice(1))}"` : ' target="_blank" rel="noopener"'} aria-label="${escapeAttribute(link.label || `View ${card.label}`)}">${content}</a>`
            : `<article class="about-highlight">${content}</article>`;
    }).join('');
    highlights.querySelectorAll('[data-collection-target]').forEach(link => {
        link.addEventListener('click', event => {
            const target = document.getElementById(link.dataset.collectionTarget);
            if (!target) return;
            event.preventDefault();
            const toggle = target.querySelector(':scope > .collection-toggle');
            if (toggle && toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
            window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }));
        });
    });
    setupResponsiveCardSlider(highlights, {
        cardSelector: '.about-highlight',
        controlLabel: 'Browse education and experience',
        regionLabel: 'Education and experience highlights'
    });
}

function renderSkills(groups = []) {
    const container = document.getElementById('skills-container');
    container.innerHTML = groups.map(group => `<div class="skill-group"><h3 class="skill-group-title">${escapeAttribute(group.title)}</h3><div class="skill-tags">${group.items.map(skill => `<span class="tag">${escapeAttribute(skill)}</span>`).join('')}</div></div>`).join('');
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
        // Disabling the arrow that has the keyboard's focus would drop the focus
        // to the page; the other arrow takes it.
        const focused = document.activeElement;
        previous.disabled = currentIndex <= 0;
        next.disabled = currentIndex >= maxIndex;
        if (focused === previous && previous.disabled && !next.disabled) next.focus();
        else if (focused === next && next.disabled && !previous.disabled) previous.focus();
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
    // Two cards fit side by side at two-up, so a slider of two is one only where
    // a phone shows a card at a time; otherwise its arrows would move nothing.
    const oneUp = window.matchMedia('(max-width: 639px)');
    const updateLayout = () => {
        const useCarousel = carouselConstraints.some(constraint => constraint.matches)
            && (cards.length > 2 || oneUp.matches);
        container.classList.toggle('project-carousel', useCarousel);
        container.classList.toggle('is-responsive-carousel', useCarousel);
        controls.classList.toggle('is-active', useCarousel);
        initialize();
        autoplay.sync();
    };
    carouselConstraints.forEach(constraint => constraint.addEventListener?.('change', updateLayout));
    if (cards.length === 2) oneUp.addEventListener?.('change', updateLayout);
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
    const text = escapeAttribute;
    const isCertificate = project.imagePresentation === 'certificate';
    // See showDeferredPictures.
    const sourceAttribute = options.deferImage ? 'data-src' : 'src';
    // A card draws into roughly 440 CSS px, so most screens want the 900px
    // variant rather than the full-size file the modal uses.
    const cardSrcset = project.imageSrcset
        ? ` ${options.deferImage ? 'data-srcset' : 'srcset'}="${text(project.imageSrcset)}" sizes="${CARD_IMAGE_SIZES}"`
        : '';
    const cardMedia = project.image
        ? `<img ${sourceAttribute}="${text(project.image)}"${cardSrcset} alt="${text(describeImage(project))}" class="project-image${isCertificate ? ' is-certificate-thumbnail' : ''}" loading="lazy" decoding="async"${project.motionImage ? ` data-motion-src="${text(project.motionImage)}" data-motion-alt="${text(describeImage(project, 'motion'))}" data-still-alt="${text(describeImage(project))}" data-still-srcset="${text(project.imageSrcset)}"` : ''}>`
        : `<div class="media-placeholder card-media-placeholder"><i class="fa-solid fa-film" aria-hidden="true"></i><span>Preview coming soon</span></div>`;
    const projectPeriod = project.period
        ? `<div class="project-period"><i class="fa-regular fa-calendar" aria-hidden="true"></i>${text(project.period)}</div>`
        : '';
    const cardDescription = buildProjectCardSummary(project);
    card.innerHTML = `<div class="project-image-wrapper">${cardMedia}<span class="project-category-badge">${text(project.category)}</span></div><div class="project-info"><div class="project-heading"><h3 class="project-title">${text(project.title)}</h3>${projectPeriod}</div><div class="project-copy"><p class="project-summary">${text(cardDescription)}</p></div><div class="project-tags">${(project.tags || []).map(tag => `<span class="tag">${text(tag)}</span>`).join('')}</div><div class="project-action-links">${buildLinkButtons(project.links)}</div></div>`;
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
        group.id = collection.id || collection.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
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
            ? `<span class="collection-cue">View ${escapeAttribute(countLabel)}</span>`
            : '';
        group.innerHTML = `<button class="collection-toggle" aria-expanded="false"><span class="collection-index">${String(index + 1).padStart(2, '0')}</span><span class="collection-copy"><strong>${escapeAttribute(collection.title)}</strong><small>${escapeAttribute(collection.summary)}</small>${cueMarkup}</span><i class="fa-solid fa-arrow-down" aria-hidden="true"></i></button><div class="collection-content" hidden></div>`;
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
            // Said once the page has changed height: the card fit measures the
            // cards then if none was on show to measure before
            // (setupProjectCardFit).
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

function setupProjectCardFit() {
    let timer = 0;
    const schedule = () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(measure, 150);
    };
    const measure = () => {
        const cards = [...document.querySelectorAll('.project-card:not(.carousel-clone)')];
        const sample = cards.find(card => card.offsetWidth > 0);
        // No card on show yet (no featured projects, every folder shut): measured
        // when a folder opens instead.
        if (!sample) {
            document.addEventListener('portfolio:content-shifted', schedule, { once: true });
            return;
        }
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
    measure();
    // Again once the type has arrived, if it had not when that was measured
    // (laying the cards out above is what asks for any face not loaded yet).
    // With it already loaded, as on any visit but the first, the same cards were
    // measured a second time to the same answer: a tenth of a second on a slow
    // laptop, all in one task.
    if (document.fonts?.status === 'loading') document.fonts.ready.then(schedule);
    // Again when the writing could wrap differently: a new width, or a window
    // crossing a height at which the stylesheet sets the cards' type smaller. A
    // phone's toolbar sliding in and out is neither, and every card was laid out
    // again for it.
    const shortWindows = ['(max-height: 820px)', '(max-height: 420px)'].map(query => window.matchMedia(query));
    const shape = () => `${window.innerWidth}:${shortWindows.map(query => query.matches).join()}`;
    let measuredShape = shape();
    window.addEventListener('resize', () => {
        if (shape() === measuredShape) return;
        measuredShape = shape();
        schedule();
    }, { passive: true });
}

function setupCarousel(carousel, controls, options = {}) {
    const settings = options;
    const originalCards = [...carousel.querySelectorAll('.project-card')];
    if (originalCards.length < 2) return () => {};
    const visibleRingRadius = settings.ring && originalCards.length === 4 ? 1.05 : 2.05;
    const cloneCount = settings.finite ? 0 : Math.min(settings.ring ? 3 : 2, originalCards.length);
    const isEnabled = () => typeof settings.enabled !== 'function' || settings.enabled();
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
        clone.removeAttribute('tabindex');
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
    const autoplayEnabled = () => settings.autoplay && !reducedMotion.matches;
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
        return { cardWidth, gap, distance, lastIndex: originalCards.length - 1 };
    };

    const getTargetForPhysicalIndex = physicalIndex => {
        const card = cards[Math.max(0, Math.min(physicalIndex, cards.length - 1))];
        if (!card) return 0;
        return card.offsetLeft + card.offsetWidth / 2 - carousel.clientWidth / 2;
    };

    // By where each card would bring the row to rest, which a row that cannot
    // scroll past its ends stops short of: at the last stop of the featured row
    // at two-up the middle falls exactly between two cards, and the tie went to
    // the one before, so the row bounced back from its own end.
    const getNearestPhysicalIndex = () => {
        const furthest = Math.max(carousel.scrollWidth - carousel.clientWidth, 0);
        let nearestIndex = 0;
        let nearestDistance = Number.POSITIVE_INFINITY;
        cards.forEach((card, index) => {
            const rest = Math.min(Math.max(card.offsetLeft + card.offsetWidth / 2 - carousel.clientWidth / 2, 0), furthest);
            const distance = Math.abs(rest - carousel.scrollLeft);
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
            // Disabling the arrow that has the keyboard's focus would drop the
            // focus to the page; the other arrow takes it.
            const focused = document.activeElement;
            previous.disabled = currentIndex <= 0;
            next.disabled = currentIndex >= originalCards.length - 1;
            if (focused === previous && previous.disabled && !next.disabled) next.focus();
            else if (focused === next && next.disabled && !previous.disabled) previous.focus();
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

    // How far in a card sits, and how close it stands to the next, by how many
    // places round the ring it is.
    const scaleAt = value => value <= 1
        ? 1 - value * .08
        : Math.max(.38, .92 - (value - 1) * .28);
    const spacingScaleAt = value => {
        if (value <= 1) return 1 - value * .08;
        if (value <= 2) return .92 - (value - 1) * .56;
        return Math.max(0, .36 - (value - 2) * .36);
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
            // Every place read first, then every class written: read and written by
            // turns, a change of the card in front had the browser work the style
            // out again part-way through.
            const depths = cards.map(card => Math.abs(card.offsetLeft + card.offsetWidth / 2 - carouselCenter) / metrics.distance);
            cards.forEach((card, index) => card.classList.toggle('is-carousel-active', depths[index] < .18));
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
            if (settings.ring) {
                const rawAbsolutePosition = Math.abs(position);
                const absolutePosition = Math.min(rawAbsolutePosition, 3);
                const direction = Math.sign(position);
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

    const animateScroll = target => {
        window.cancelAnimationFrame(scrollAnimation);
        const start = carousel.scrollLeft;
        const change = target - start;
        // Nowhere to go -- a press or an upward drag that ended where it began:
        // the cards are placed once, not on every frame of a turn that goes
        // nowhere.
        if (Math.abs(change) < 1) {
            isAnimating = false;
            updateCardDepth();
            return;
        }
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
        if (!isEnabled() || !autoplayEnabled() || !carouselVisible || interactionActive || carouselHovered || carouselFocused || document.hidden || modalOpen) return;
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
                // Only now: a press, or the start of a scroll up the page, is no drag.
                carousel.classList.add('is-dragging');
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
        } else {
            // Short, upward, or no drag at all -- a press that stopped a turn
            // part-way included: back onto the nearest card, rather than left
            // between two with nothing ever moving it on.
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
    carousel.addEventListener('focusin', event => {
        carouselFocused = true;
        cancelAutoplay();
        // A card reached with the keyboard is brought round to the front, as a
        // press on it would be. Left to the browser's own scroll it was shown
        // half a ring off, turned away and unseen. (A click focuses the card
        // too, but the press itself turns the ring then.)
        const card = event.target.closest?.('.project-card');
        let keyboard = false;
        try { keyboard = !!card?.matches(':focus-visible'); } catch (error) { /* Safari before 15.4 */ }
        if (!card || !keyboard || !isEnabled() || !initialized) return;
        const metrics = getMetrics();
        const position = metrics?.distance
            ? (card.offsetLeft + card.offsetWidth / 2 - carousel.scrollLeft - carousel.clientWidth / 2) / metrics.distance
            : 0;
        if (Math.abs(position) < .5) return;
        window.cancelAnimationFrame(scrollAnimation);
        currentPhysicalIndex = cards.indexOf(card);
        currentIndex = Number(card.dataset.carouselIndex) || 0;
        updateIndicators();
        animateScroll(getTargetForPhysicalIndex(currentPhysicalIndex));
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
        if (!initialized || carousel.closest('[hidden]')) return;
        if (carousel.dataset.keepAnimatingThroughModal !== 'true') stopAndCenterCurrentMotion();
    });
    document.addEventListener('portfolio:modal-close', () => {
        pauseAfterInteraction(2500);
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) cancelAutoplay();
        else pauseAfterInteraction(1200);
    });
    // Reduced motion asked for in the middle of a visit stops the turning; let go,
    // it starts again.
    reducedMotion.addEventListener?.('change', scheduleAutoplay);
    scheduleAutoplay();
    return initialize;
}

// A project's links, in the order the data lists them (see LINK_ICONS).
function buildLinkButtons(links = []) {
    return links
        .filter(link => link?.url)
        .map(link => `<a href="${escapeAttribute(linkHref(link))}" target="_blank" rel="noopener" class="link-btn"><i class="${linkIcon(link)}" aria-hidden="true"></i> ${escapeAttribute(linkLabel(link))}</a>`)
        .join('');
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
        // The label goes in beside the icon; setting textContent wiped it.
        const quickLinkIcon = quickLink.querySelector('i');
        if (quickLinkIcon && project.quickLink?.type) quickLinkIcon.className = linkIcon(project.quickLink);
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
    const modalSummary = document.getElementById('modal-summary');
    modalSummary.textContent = project.summary || '';
    modalSummary.hidden = !project.summary;
    const overview = document.getElementById('modal-overview');
    const overviewGrid = document.getElementById('modal-overview-grid');
    const deepDiveHeading = document.getElementById('modal-deep-dive-heading');
    const overviewLabel = overview.querySelector('.modal-section-heading span');
    const overviewTitle = document.getElementById('modal-overview-title');
    overviewLabel.textContent = isCoursework ? 'Coursework' : 'Quick Overview';
    overviewTitle.textContent = isCoursework ? 'What I Did in Class' : 'The Main Parts';
    const defaultOverviewHeadings = isCoursework
        ? ['What I Needed to Learn', 'What I Worked On', 'What I Took From It']
        : ['Why I Made It', 'What I Did', 'How It Turned Out'];
    const overviewHeadings = Array.isArray(project.overview?.headings)
        && project.overview.headings.length === 3
        ? project.overview.headings
        : defaultOverviewHeadings;
    // A project whose overview is left empty shows its first three sections
    // in its place, and "How I Built It" goes on from the fourth rather than
    // telling them twice. An overview part left empty is left out.
    const hasOverview = Boolean(project.overview?.problem || project.overview?.method || project.overview?.result);
    const sections = project.sections || [];
    const overviewItems = (hasOverview
        ? [
            [overviewHeadings[0], project.overview.problem],
            [overviewHeadings[1], project.overview.method],
            [overviewHeadings[2], project.overview.result]
        ]
        : sections
            .slice(0, 3)
            .map(section => [section.heading, section.body]))
        .filter(([, body]) => body);
    const detailSections = hasOverview ? sections : sections.slice(3);
    overviewGrid.innerHTML = overviewItems
        .map(([heading, body], index) => `<article class="modal-overview-item"><span>${String(index + 1).padStart(2, '0')}</span><h4>${escapeAttribute(heading)}</h4><p>${escapeAttribute(body)}</p></article>`)
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
    deepDiveHeading.hidden = isCoursework || !detailSections.length || overviewItems.length === 0;
    const details = document.getElementById('modal-details');
    details.innerHTML = isCoursework
        ? '<section class="modal-detail-section"><h4>Want to see more?</h4><p>The class README on GitHub has more details and all of the work I saved from the class.</p></section>'
        : detailSections.map(section => `<section class="modal-detail-section"><h4>${escapeAttribute(section.heading)}</h4><p>${escapeAttribute(section.body)}</p></section>`).join('');
    document.getElementById('modal-tags').innerHTML = (project.tags || []).map(tag => `<span class="tag">${escapeAttribute(tag)}</span>`).join('');
    document.getElementById('modal-links').innerHTML = buildLinkButtons(project.links);
    const image = document.getElementById('modal-image');
    const leadMedia = project.motionImage || project.image;
    image.classList.toggle('has-motion-media', Boolean(project.motionImage));
    image.classList.toggle('is-certificate', project.imagePresentation === 'certificate');
    image.innerHTML = leadMedia
        ? `<img src="${escapeAttribute(leadMedia)}" alt="${escapeAttribute(describeImage(project, project.motionImage ? 'motion' : 'still'))}" decoding="async"${project.motionImage ? ' class="is-motion-media"' : ''}>`
        : `<div class="media-placeholder"><i class="fa-solid fa-film" aria-hidden="true"></i><span>Pictures coming soon</span><small>I have not added pictures for this project yet.</small></div>`;
    const media = document.getElementById('modal-media');
    // A media slot with nothing in it yet is left off the page.
    media.innerHTML = (project.media || []).filter(item => item?.src).map(item => item.type === 'video'
        ? `<figure class="modal-media-item modal-video">${buildVideoEmbed(item.src, item.label, { lazy: true })}<figcaption>${escapeAttribute(item.label)}</figcaption></figure>`
        : `<figure class="modal-media-item${item.type === 'gif' ? ' is-motion-media' : ''}${item.fit === 'contain' ? ' media-contain' : ''}"><img src="${escapeAttribute(item.src)}" alt="${escapeAttribute(item.alt || item.label)}" loading="lazy" decoding="async"><figcaption>${escapeAttribute(item.label)}</figcaption></figure>`
    ).join('');
    // Only a player that loaded while the project is still open: offline the
    // frame loads the browser's error page, where no player will ever ask.
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
        // Taking a player off the page ends it, sound and all. (Sending it to
        // about:blank first fired its load while the project was still open,
        // which could wake the graphics adapter for a player that never ran.)
        modal.querySelectorAll('iframe').forEach(video => video.remove());
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
