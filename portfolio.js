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

    const update = () => {
        // CSS pixels already account for OS scale, browser zoom, and display
        // density. Classify the space the page actually owns instead of trying
        // to infer physical resolution from screen or browser-frame dimensions.
        const width = root.clientWidth || window.innerWidth;
        const visualHeight = window.visualViewport?.height || window.innerHeight;
        const tier = width < 360
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

        root.dataset.viewportTier = tier;
        root.dataset.primaryInput = input;
        root.dataset.orientation = media.portrait.matches ? 'portrait' : 'landscape';
        root.dataset.devicePosture = posture;
        root.dataset.viewportSegments = segments;
        root.style.setProperty('--visual-viewport-height', `${Math.max(Math.round(visualHeight), 1)}px`);
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
    const galaxy = setupGalaxyField(galaxyField, reducedMotion);
    const cursor = setupCursorEffects(cursorDot, reducedMotion);
    setupPointerReactiveSurfaces(reducedMotion);
    const performanceToggle = document.getElementById('performance-toggle');
    const performanceToggleLabel = document.getElementById('performance-toggle-label');
    // v3 intentionally resets the old Low FX override once. The previous
    // hardware gate was too strict for capable laptops, so an earlier manual
    // or stale Low FX choice should not keep overriding the new baseline.
    const performanceStorageKey = 'portfolio-effects-override-v3';
    let savedEffectsMode = '';
    try {
        savedEffectsMode = localStorage.getItem(performanceStorageKey) || '';
    } catch (error) {
        savedEffectsMode = '';
    }
    const logicalCores = navigator.hardwareConcurrency || 4;
    const deviceMemory = navigator.deviceMemory || 0;
    const dataSaverEnabled = Boolean(navigator.connection?.saveData);
    // Start High FX for a normal modern laptop and let the sustained frame
    // monitor below make the final call. Truly low-end devices still begin in
    // Low FX, while capable machines are not penalized by an arbitrary
    // desktop-class requirement.
    const meetsHighEffectsBaseline = logicalCores >= 4
        && (!deviceMemory || deviceMemory >= 4)
        && !dataSaverEnabled
        && !reducedMotion.matches;
    let effectsMode = ['low', 'high'].includes(savedEffectsMode)
        ? savedEffectsMode
        : (meetsHighEffectsBaseline ? 'high' : 'low');
    let effectsReason = savedEffectsMode ? 'manual' : 'hardware';
    // Low FX takes over as soon as High FX turns clunky: two seconds in a row
    // where the typical frame runs at 30fps or worse, or where a quarter of
    // the frames stutter. A lone spike -- a GC pause, a collection opening --
    // is neither, so it never costs anyone High FX. Seconds are only measured
    // while the page is visible, focused and settled, so the hitches every
    // machine produces at first paint, when a tab comes back or when a window
    // is resized are never scored either.
    const PERFORMANCE_WINDOW_MS = 1000;
    const PERFORMANCE_WARMUP_MS = 4000;
    const PERFORMANCE_RESUME_DELAY_MS = 2000;
    const MIN_SMOOTH_FPS = 33;
    const CLUNKY_WINDOWS_BEFORE_DOWNGRADE = 2;
    // The steps before that, each taken after three strained seconds running:
    // first the sky is slowed rather than switched off, then the glass stops
    // bending the light at its rim and keeps only its frost -- the rim is a
    // third of what the glass costs, and the frost is most of what it looks
    // like. A page is strained when it runs steadily under fifty frames a
    // second, or when it keeps missing frames: one in ten late by a display
    // frame or more is a page that visibly hitches while it scrolls, however
    // good its average. That is what a laptop with other work on it looks
    // like, and it used to pass as smooth.
    const MIN_STEADY_FPS = 50;
    const STRAINED_WINDOWS_BEFORE_EASING = 3;
    const MISSED_FRAME_SHARE = .1;
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
    let strainedWindows = 0;
    let skyEased = false;
    let glassEased = false;
    let automaticDowngradeComplete = false;
    // Set when the visitor turns High FX back on after it was switched off
    // for them: they have overruled the monitor, so it stands down for the
    // rest of the visit.
    let highKeptDespiteLag = false;
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

    // Nothing left to decide: High FX is off, or the call has already been
    // made and will not be made again. The loop below asks for a frame every
    // frame for as long as it runs, which in Low FX is the only thing left on
    // the page still asking -- the field has stopped drawing by then -- and a
    // page that asks for a frame it does nothing with keeps the machine awake
    // for no one. It is started again by whatever could change the answer.
    const monitorIdle = () => effectsMode !== 'high' || automaticDowngradeComplete || highKeptDespiteLag;
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

        // Before High FX is given up, the page is asked for less, a step at a
        // time: the sky runs slower, every effect kept and only drawn less
        // often; then the glass keeps its frost and lets go of the bend at its
        // rim (glass.js). Only once both have been tried, and the page is
        // still clunky, does it fall back to Low FX. Each step gets a clean
        // look of its own before the page is judged again.
        if (!skyEased || !glassEased) {
            strainedWindows = strained ? strainedWindows + 1 : 0;
            if (strainedWindows >= STRAINED_WINDOWS_BEFORE_EASING) {
                if (!skyEased) {
                    skyEased = true;
                    galaxy.ease();
                    document.documentElement.dataset.effectsPace = 'eased';
                } else {
                    glassEased = true;
                    document.documentElement.dataset.effectsPace = 'lighter';
                }
                deferPerformanceSampling(PERFORMANCE_RESUME_DELAY_MS, timestamp);
            }
            return;
        }
        clunkyWindows = clunky ? clunkyWindows + 1 : 0;
        if (clunkyWindows >= CLUNKY_WINDOWS_BEFORE_DOWNGRADE) {
            automaticDowngradeComplete = true;
            applyEffectsMode('low', false, 'lag');
        }
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
    const schedulePerformanceSpot = () => {
        if (performanceSpotTimer || monitorIdle()) return;
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

    const applyEffectsMode = (mode, remember = false, reason = 'manual') => {
        effectsMode = mode;
        effectsReason = reason;
        const useHighEffects = mode === 'high';
        // High FX is the only mode with anything to measure, and turning it
        // back on is one of the things that gives the monitor its job again.
        startPerformanceMonitor();
        document.documentElement.dataset.effects = mode;
        document.documentElement.dataset.effectsReason = reason;
        galaxy.setQuality(mode);
        cursor.setEnabled(useHighEffects);
        wakeEffectsBackground();
        performanceToggle.setAttribute('aria-checked', String(useHighEffects));
        performanceToggle.setAttribute('aria-label', `Use ${useHighEffects ? 'low' : 'high'} performance visual effects`);
        performanceToggle.title = reason === 'lag'
            ? 'Low FX turned on because the page was running slowly'
            : `${useHighEffects ? 'High' : 'Low'} FX selected ${reason === 'hardware' ? 'for this device' : 'manually'}`;
        performanceToggleLabel.textContent = useHighEffects ? 'High FX' : 'Low FX';
        if (!useHighEffects) {
            document.querySelectorAll('.cursor-spark, .cursor-ripple').forEach(effect => effect.remove());
        }
        if (remember) {
            try {
                localStorage.setItem(performanceStorageKey, mode);
            } catch (error) {
                // Private browsing can block storage, but the visual mode should still work.
            }
        }
    };

    performanceToggle.addEventListener('click', () => {
        // Turning High FX back on after the monitor switched it off is the
        // visitor overruling it, and that stands for the rest of the visit.
        if (effectsMode === 'low' && effectsReason === 'lag') highKeptDespiteLag = true;
        automaticDowngradeComplete = false;
        deferPerformanceSampling(PERFORMANCE_RESUME_DELAY_MS);
        applyEffectsMode(effectsMode === 'high' ? 'low' : 'high', true, 'manual');
    });
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
    applyEffectsMode(effectsMode, false, effectsReason);
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
    deferPerformanceSampling(PERFORMANCE_WARMUP_MS);
    watchPerformance(PERFORMANCE_WARMUP_MS + 3 * PERFORMANCE_WINDOW_MS + 500);

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
    fetch('portfolio-data.json', { cache: 'no-cache' })
        .then(response => { if (!response.ok) throw new Error('Failed to load portfolio data'); return response.json(); })
        .then(data => {
            renderProfile(data.profile);
            renderSkills(data.skillCategories);
            renderFeaturedProjects(data.projects);
            renderProjectCollections(data.projectCollections, data.projects);
            setupModal();
            updateScrollMotion();
            window.requestAnimationFrame(() => window.requestAnimationFrame(() => galaxy.refreshLayout()));
        })
        .catch(error => {
            console.error('Error loading portfolio data:', error);
            showDataLoadFailure();
        });
});

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

// Deterministic PRNG (mulberry32) so procedurally-placed objects keep the
// same composition across reloads instead of reshuffling every visit.
function createSeededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6D2B79F5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function setupGalaxyField(canvas, reducedMotion) {
    // No desynchronized flag: the low-latency path presents this canvas outside
    // the normal compositing sync, which shows up as flicker/tearing against the
    // page behind it. It only exists to cut stylus latency, which we do not need.
    //
    // Opaque. The sky used to be a transparent canvas at 94% opacity with a
    // page-length veil laid over it as a second element, and the browser
    // blended both, across the whole screen, into every frame the sky drew --
    // at 3x that is two extra full-screen passes a frame, a fifth of what a
    // frame costs. The page's own background is painted in first now, the
    // opacity and the veil are folded into the drawing (see finishSky), and
    // the canvas is one solid layer with nothing under it worth blending.
    //
    // `let`, not `const`: a shooting star is drawn by the same code as the
    // rest of the sky, into a small canvas of its own -- see drawStreaks.
    const skyContext = canvas.getContext('2d', { alpha: false });
    let context = skyContext;
    if (!context) return { move() {}, release() {}, scroll() {}, setQuality() {}, refreshLayout() {}, touchStart() {}, touchMove() {}, touchEnd() {}, ease() {} };

    // Keep the existing tiered, seeded canvas architecture. Regions now own
    // their lights and haze, so a system has a shared composition at every scale.
    const TAU = Math.PI * 2;
    const colors = ['224,237,255', '174,206,237', '246,221,190', '207,199,227', '235,240,247', '205,168,156'];
    // High FX uses a wider stellar palette for the deep-field layer. The
    // warmer points remain uncommon so the field keeps its near-black tone.
    const deepFieldColors = [...colors, '255,194,142', '214,226,255', '238,177,128'];
    const tiers = {
        galaxies: { factor: .23, points: false },
        dust: { factor: .34, points: true },
        tinyDistant: { factor: .48, points: false },
        clusterHaze: { factor: .7, points: false },
        starClusters: { factor: .7, points: true },
        stars: { factor: .68, points: true },
        smallPlanets: { factor: .83, points: false },
        mediumStars: { factor: .96, points: false },
        mediumPlanets: { factor: 1.04, points: false },
        largePlanets: { factor: 1.26, points: false },
        massivePlanets: { factor: 1.58, points: false }
    };
    const tierList = Object.values(tiers);
    // Drawn as squares rather than discs; see the tier loop in drawSky.
    const dustTier = tiers.dust, DUST_SIDE = 1.65;
    let width = 0, height = 0, pixelRatio = 1;
    let pageHeight = 0, scrollPosition = window.scrollY;
    let quality = 'low', frameInterval = 1000 / 18, aimedInterval = 1000 / 60;
    // The resting rate over open sky and under a window full of glass; see
    // the pacing note above drawSky.
    let restFps = 15, restFpsCovered = 10;
    // Whether the last painted frame had anything crossing the sky under its
    // own speed, in the sky itself. It paces the next one; see the pacing
    // note above drawSky.
    let skyCrossing = false;
    // Whether the machine has been found unable to hold the full rates. The
    // page watches its own frame times (see the monitor in the page setup)
    // and, before it gives up on High FX, asks the sky to run slower instead:
    // every effect kept, only drawn less often. Once eased, it stays eased.
    let eased = false;
    // The rates the sky runs at; see the pacing note above drawSky. A phone
    // is a step lower throughout, as it always was, and an eased machine a
    // step lower again.
    const applyRates = () => {
        const mobile = width < 700;
        aimedInterval = 1000 / (eased ? (mobile ? 24 : 30) : 60);
        frameInterval = 1000 / (eased ? (mobile ? 20 : 24) : (mobile ? 24 : 30));
        restFps = eased ? (mobile ? 10 : 12) : (mobile ? 12 : 15);
        restFpsCovered = eased ? (mobile ? 6 : 8) : (mobile ? 8 : 10);
    };
    let animationFrame = 0, layoutFrame = 0, layoutTimer = 0;
    let sleeping = false, sleepTimer = 0;
    let lastFrame = 0, sceneTime = 0;
    let protectedRects = [], visibleRects = [], regions = [], orbitingBodies = [], blackHoles = [], pulsars = [], layoutSignature = '';
    // Every sheet of glass on the page, in page coordinates, and the ones near
    // the window: what the resting rate and the shooting stars steer by.
    let glassRects = [], visibleGlass = [];
    let builtPageHeight = 0;
    const projectedHoles = [];
    let navigationBottom = 80;
    const spriteCache = new Map();
    // The deep-field layer contains thousands of tiny, non-interactive stars.
    // Rasterize those once per scene segment and composite the tiles each
    // frame. The larger bodies and bright stars remain live so High FX keeps
    // its motion, parallax, and interaction quality.
    //
    // Bands are cut on demand and only near the window -- see staticStarTile.
    // Four hundred pixels of page rather than six hundred and eighty, so the
    // handful held at once is cut closer to what the window can actually
    // reach, and each one costs less to cut when the reader arrives at it.
    const staticStarTileHeight = 400;
    const staticStarTiles = new Map();    // band index -> { canvas, start, end }
    let staticStarField = null;           // the baked stars, in page order
    // 3rem, matching the lattice the stylesheet used to paint. Measured in the
    // layout pass so a root font-size change carries through.
    let gridSpacing = 48;
    // The lattice is anchored to the viewport, not to the page. It used to be
    // drawn in document space and dragged by a scroll-velocity spring, which
    // meant every flick slid, stretched and lit the whole sheet -- at a 12px
    // minor pitch that reads as the backdrop shaking rather than as elastic.
    // A ruled surface has to hold still to be a ruler. The only thing that
    // moves it now is a finger pressed into it.
    let lastScrollAt = 0;
    // Fixed for this visit, so scrolling/resizing never rerolls the rare anchor.
    const hasGiantLandmark = Math.random() < .08;
    // One roll decides the whole sky. Every seeded generator below mixes this
    // in, so each visit lands somewhere different -- but it is drawn once and
    // held, so expanding a collection or rotating the phone rebuilds the same
    // universe instead of dealing a new one mid-scroll.
    const universeSeed = (Math.random() * 0x100000000) >>> 0;
    const seedFor = (salt, index = 0) =>
        (universeSeed ^ salt ^ Math.imul(index + 1, 2654435761)) >>> 0;
    const pointer = { x: 0, y: 0, sx: 0, sy: 0, active: false,
        px: 0, py: 0, vx: 0, vy: 0, sampledAt: 0, speed: 0 };
    const particles = Array.from({ length: 160 }, () => ({ active: false }));
    const ripples = Array.from({ length: 5 }, () => ({ active: false }));
    let pressedSpace = null, suppressSpaceClick = false;
    // The sheet is reachable across the whole page -- over headings, over body
    // copy, over the row that opens a collection -- because all of that is text
    // printed on the field rather than an object sitting on top of it. What does
    // sit on top is the cards: the skill groups, the About highlights, and the
    // project cards a collection opens. A press landing on one of those belongs
    // to the card, so the field must not answer it. Modals, the fixed nav, a
    // carousel mid-swipe and any real input are excluded for the same reason --
    // something in front of the sheet is already using that press.
    //
    // This used to also refuse anywhere within 12px of text, which is most of a
    // page made of text: the field read as dead almost everywhere it was not
    // literally empty sky.
    // The same three cards that lean and press, so a card can never answer a
    // pointer and let the field answer it too.
    const cardSelector = `${CARD_SURFACE_SELECTOR}, .modal-card, `
        + '.modal, .modal-overlay, .navbar, .project-carousel, '
        + 'input, textarea, select, [contenteditable]';
    const openSpaceAt = (target, clientY) => !document.querySelector('.modal-overlay.active')
        && !(target instanceof Element && target.closest(cardSelector))
        && clientY > navigationBottom + 8;
    const openSpace = event => openSpaceAt(event.target, event.clientY);
    // A fingertip presses a dimple into the field. The sheet sags under it,
    // nearby scenery slides down the slope, and on release it springs back
    // through flat before settling. Wells live in screen space: the page
    // scrolls underneath while the finger stays where it is put.
    const touchWells = [];
    // The cursor and every fingertip drive the scenery through one list and one
    // force law, so a finger gliding over the field moves things exactly the way
    // the mouse does. A finger carries two extras a mouse has no equivalent for:
    // the sheet sags under it, and its own travel sweeps bodies along with it.
    // `x/y` is the smoothed position the body physics reads -- raw pointer
    // samples can flip force direction between frames and make bodies flash.
    // `lx/ly` is the live position, which the light warp wants instead so the
    // bending stays under the cursor rather than trailing a third of a second
    // behind it. For a fingertip the two are the same: the well already lags.
    const pushers = Array.from({ length: 8 }, () => ({
        x: 0, y: 0, lx: 0, ly: 0, vx: 0, vy: 0, speed: 0, gain: 0, carry: 0, sag: 0, sagReach: 0
    }));
    let pusherCount = 0;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const smoothstep = value => value * value * (3 - 2 * value);
    const randomRange = (rng, min, max) => min + rng() * (max - min);
    const chooseColor = rng => colors[rng() < .82 ? Math.floor(rng() * 5) : 5];
    const chooseDeepColor = rng => {
        const roll = rng();
        if (roll < .72) return deepFieldColors[Math.floor(rng() * 5)];
        if (roll < .94) return deepFieldColors[5 + Math.floor(rng() * 2)];
        return deepFieldColors[7];
    };
    const createSprite = size => {
        const sprite = document.createElement('canvas');
        sprite.width = sprite.height = size;
        return sprite;
    };

    // A small reusable atlas: all gradients are painted at rebuild, never in
    // the animation loop. Three profiles separate stars, soft bodies and haze.
    const lightSprite = (color, profile) => {
        const key = `${color}:${profile}`;
        if (spriteCache.has(key)) return spriteCache.get(key);
        const size = profile === 2 ? 256 : 128;
        const sprite = createSprite(size);
        const ctx = sprite.getContext('2d');
        const radius = size / 2;
        const glow = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
        const stops = profile === 2
            ? [[0, .24], [.14, .20], [.32, .11], [.58, .036], [.82, .006], [1, 0]]
            : profile === 1
                ? [[0, 1], [.055, .99], [.12, .8], [.22, .38], [.4, .105], [.68, .018], [1, 0]]
                : [[0, 1], [.025, .98], [.065, .67], [.16, .22], [.35, .055], [.64, .009], [1, 0]];
        for (const [at, alpha] of stops) {
            glow.addColorStop(at, `rgba(${profile !== 2 && at < .1 ? '255,253,248' : color},${alpha})`);
        }
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, size, size);
        // Kept so a body can work out how much of this sprite is actually
        // worth painting. These fade to nothing well before the edge, and the
        // dead ring around them is the single most expensive thing the field
        // draws -- see trimSprite.
        sprite.stops = stops;
        spriteCache.set(key, sprite);
        return sprite;
    };

    // Irregular elliptical concentrations of unresolved lights, with offset
    // knots and dark lanes. These are procedural cached sprites, not textures.
    //
    // Every one of these used to be drawn into a 320px canvas, whatever it was
    // for. Most of them are not galaxies you can see the shape of -- they are
    // the unresolved smudges scattered between the systems, eight to nineteen
    // pixels across on the page, and a 320px sheet behind a nineteen-pixel
    // smudge is four hundred kilobytes to say almost nothing. A hundred and
    // fifteen of them came to forty-seven megabytes of texture the reader
    // could never have seen a pixel of.
    //
    // So the sheet is cut to the body that will wear it: the widest it can
    // ever be drawn, in device pixels, rounded up to a power of two. The
    // drawing itself is unchanged -- it is laid out in the same 320-unit space
    // and the canvas is scaled to fit -- so a galaxy comes out the same
    // picture, from a sheet it can actually fill.
    const GALAXY_SPAN = 320;
    // The largest a body is ever drawn past its own radius: a touch well can
    // swell it by a third (clamp(sink, .3, 1.3) in the frame). The device
    // ratio is the one the layout caps at rather than the live one, so moving
    // the window to another display never leaves a sprite short.
    const GALAXY_HEADROOM = 1.3 * 1.25;
    const galaxySpriteSize = radius => {
        const wanted = radius * 2 * GALAXY_HEADROOM;
        let size = 64;
        while (size < wanted && size < GALAXY_SPAN) size *= 2;
        return Math.min(size, GALAXY_SPAN);
    };
    // Paints a galaxy into its own sheet, from the seed it was dealt. Every
    // choice it makes comes from that seed, so the same galaxy can be painted
    // again later -- after its sheet was handed back while it was nowhere
    // near the window -- and come out the same picture.
    const paintGalaxy = sprite => {
        const { seed, color, size } = sprite.galaxy;
        const rng = createSeededRandom(seed);
        // Elliptical, elongated, irregular, edge-on, compact core, diffuse cloud.
        const family = Math.floor(rng() * 6);
        const flatten = [ .62, .3, .8, .09, .48, .95 ][family];
        const ctx = sprite.getContext('2d');
        // One scale over the whole sprite, so every coordinate below stays in
        // the 320-unit space the composition was drawn in.
        const scale = size / GALAXY_SPAN;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.globalCompositeOperation = 'lighter';
        const haze = lightSprite(color, 2);
        // An edge-on galaxy is a thin band across the middle of a square
        // sprite, and the empty sky above and below it was being blended over
        // the page every frame at full size. Note what actually gets painted
        // as it is painted, so the frame can hand over the band alone.
        //
        // The clouds are kept apart from the rest. A cloud is a gradient that
        // fades out well inside the rectangle it is drawn into, and how far in
        // depends on how brightly the galaxy carrying it is drawn -- which is
        // not known here. So they are recorded where they land and shrunk
        // later, per galaxy; see trimSprite.
        let x0 = GALAXY_SPAN, y0 = GALAXY_SPAN, x1 = 0, y1 = 0;
        const mark = (left, top, w, h) => {
            if (left < x0) x0 = left;
            if (top < y0) y0 = top;
            if (left + w > x1) x1 = left + w;
            if (top + h > y1) y1 = top + h;
        };
        const clouds = [];
        ctx.drawImage(haze, 4, 160 - 150 * flatten, 312, 300 * flatten);
        clouds.push([4, 160 - 150 * flatten, 312, 300 * flatten]);
        if (family === 4 || family === 0) {
            ctx.globalAlpha = family === 4 ? .6 : .22;
            ctx.drawImage(lightSprite(color, 1), 95, 160 - 65 * flatten, 130, 130 * flatten);
            mark(95, 160 - 65 * flatten, 130, 130 * flatten);
        }
        for (let knot = 0; knot < (family === 2 || family === 5 ? 8 : 3); knot++) {
            const x = 55 + rng() * 200;
            const y = 160 + (rng() - .5) * 100 * flatten + Math.sin(x * .027) * 15 * flatten;
            ctx.globalAlpha = .22 + rng() * .35;
            ctx.drawImage(haze, x - 58, y - 55 * flatten, 116, 110 * flatten);
            clouds.push([x - 58, y - 55 * flatten, 116, 110 * flatten]);
        }
        // The unresolved points the composition is made of are a fraction of a
        // unit across, and on a sheet cut down to sixty-four pixels that is a
        // fifth of a device pixel -- small enough that the rasteriser drops
        // most of what it is handed. A dot smaller than half a pixel is drawn
        // at half a pixel and dimmed by exactly the area it gained, so the
        // light it puts into the sprite is the light it always put in. That is
        // what survives being scaled down to the size the body is drawn at,
        // which is the only place any of this is ever seen.
        const floorRadius = .5 / scale;
        for (let i = 0; i < 130; i++) {
            const u = (rng() + rng() + rng() - 1.5) / 1.5;
            const x = 160 + u * 145;
            const y = 160 + (rng() + rng() - 1) * (1 - Math.abs(u)) * 100 * flatten + Math.sin(u * 5) * 12 * flatten;
            const r = .18 + rng() ** 3 * 1.1;
            const drawn = Math.max(r, floorRadius);
            ctx.globalAlpha = (.06 + rng() ** 2 * .5) * (r / drawn) ** 2;
            ctx.fillStyle = `rgb(${color})`;
            ctx.beginPath();
            ctx.arc(x, y, drawn, 0, TAU);
            ctx.fill();
            mark(x - drawn, y - drawn, drawn * 2, drawn * 2);
        }
        // The lit parts that are not clouds, and the clouds themselves, left
        // for trimSprite to combine once it knows how bright this galaxy is.
        // Both are handed over in the sprite's own pixels, which is where
        // trimSprite cuts, rather than in the space they were laid out in.
        sprite.solid = { x0: x0 * scale, y0: y0 * scale, x1: x1 * scale, y1: y1 * scale };
        sprite.clouds = clouds.map(([cx, cy, cw, ch]) =>
            [cx * scale, cy * scale, cw * scale, ch * scale]);
        sprite.cloudStops = haze.stops;
    };
    const galaxySprite = (rng, color, radius) => {
        const size = galaxySpriteSize(radius);
        const sprite = createSprite(size);
        // One draw of the scene's generator seeds the whole picture, rather
        // than the picture drawing on the scene's generator as it goes, so it
        // can be repainted from that seed alone.
        sprite.galaxy = { seed: (rng() * 0x100000000) >>> 0, color, size };
        paintGalaxy(sprite);
        return sprite;
    };
    // The sheets big enough to be worth handing back. Every galaxy used to
    // keep its sheet for the whole visit, and the page lays down three of
    // these a screen -- with every collection open that is fifty-odd sheets
    // at four hundred kilobytes, of which the window can reach about a third.
    // The small smudges are a sixteenth of that each and are left alone.
    const GALAXY_RELEASE_SIZE = 256;
    const releaseGalaxy = sprite => {
        if (!sprite.width) return;
        // Zero size frees the pixels and keeps the canvas, so every body
        // holding it still holds the same sheet, and trimSprite's cut of it
        // stays good for when it is painted again.
        sprite.width = sprite.height = 0;
    };
    const restoreGalaxy = sprite => {
        if (sprite.width) return;
        sprite.width = sprite.height = sprite.galaxy.size;
        paintGalaxy(sprite);
    };
    // Hands back the sheet of every big galaxy more than a screen beyond the
    // window at its own depth. Asked again only once the page has moved a
    // fair way, or the sky under it has changed, because nothing about the
    // answer changes between one frame and the next.
    let galaxySweepAt = NaN;
    const sweepGalaxies = () => {
        if (Math.abs(scrollPosition - galaxySweepAt) < 200) return;
        galaxySweepAt = scrollPosition;
        const half = height / 2;
        for (const tier of [tiers.galaxies, tiers.tinyDistant]) {
            for (const object of tier.objects) {
                const sprite = object.sprite;
                if (!sprite || !sprite.galaxy || sprite.galaxy.size < GALAXY_RELEASE_SIZE) continue;
                const y = (object.documentY - scrollPosition - half) * tier.factor + half;
                const reach = object.radius * 1.6;
                if (y + reach < -height || y - reach > height * 2) releaseGalaxy(sprite);
            }
        }
    };
    // Cached layered disk: asymmetric emission, a bent rear image, a photon
    // ring, and a foreground disk crossing the horizon. No per-pixel filters.
    const blackHoleSprite = (color, variant = 0) => {
        const key = `black-hole:${color}:${variant}`;
        if (spriteCache.has(key)) return spriteCache.get(key);
        const sprite = createSprite(512), ctx = sprite.getContext('2d');
        ctx.translate(256, 256);
        ctx.drawImage(lightSprite(color, 2), -240, -140, 480, 280);
        const disk = front => {
            for (let band = 0; band < 36; band++) {
                const r = 65 + band * 4.5;
                ctx.beginPath();
                ctx.ellipse(0, 0, r, r * (.25 + variant * .035), 0,
                    front ? 0 : Math.PI, front ? Math.PI : TAU);
                ctx.lineWidth = 5;
                ctx.strokeStyle = `rgba(${band < 7 ? '255,242,218' : color},${(.38 * Math.exp(-band / 12)) * (front ? 1 : .65)})`;
                ctx.stroke();
            }
        };
        disk(false);
        // Light from the back of the disk appears bent above/below the shadow.
        for (let band = 0; band < 12; band++) {
            ctx.beginPath();
            ctx.ellipse(0, -3, 62 + band * 1.4, 65 + band * .7, 0, Math.PI * 1.06, Math.PI * 1.94);
            ctx.strokeStyle = `rgba(${color},${.22 * (1 - band / 12)})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
        const rim = ctx.createRadialGradient(0, 0, 47, 0, 0, 73);
        rim.addColorStop(0, 'rgba(0,0,0,1)');
        rim.addColorStop(.4, 'rgba(0,0,0,1)');
        rim.addColorStop(.64, `rgba(${color},.34)`);
        rim.addColorStop(.75, `rgba(${color},.12)`);
        rim.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = rim;
        ctx.beginPath(); ctx.arc(0, 0, 73, 0, TAU); ctx.fill();
        disk(true);
        // Asymmetric hot crescent, never a saturated rainbow.
        ctx.save();
        ctx.globalAlpha = .16;
        ctx.drawImage(lightSprite('255,239,217', 1), -97, -28, 100, 56);
        ctx.restore();
        spriteCache.set(key, sprite);
        return sprite;
    };

    // A drifting world is the same soft, additive light sprite the seeded
    // scenery uses -- no shaded terminator, no surface, nothing that would
    // read as a photograph of a planet next to a field of drawn stars.
    const drawPlanet = (body, x, y, radius, alpha) => {
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        context.save(); context.translate(x, y);
        context.rotate(body.angle);
        context.globalCompositeOperation = 'lighter'; context.globalAlpha = alpha;
        const stretch = body.stretch || 1;
        context.drawImage(body.sprite, -radius, -radius * stretch, radius * 2, radius * 2 * stretch);
        context.restore();
    };

    // Granular content protection leaves gutters and the spaces between
    // collection rows available. The fixed navigation is handled separately.
    //
    // Only what the backdrop can actually be seen through belongs here. Cards
    // -- project, About, Skills -- are opaque, so the field behind one is
    // already hidden by the card itself; protecting them bought nothing and
    // cost a great deal, because the clearance falls off over a radius and so
    // reached out past every card edge into the gutters around it. Opening one
    // collection put sixty card-sized rectangles on the page at once, and the
    // black holes and drifting bodies anywhere near them faded out until it
    // was closed again. They stay lit now, and simply sit behind the cards.
    const protectedSelector = '.hero-badge, .hero-name, .hero-tagline, .social-links a, '
        + '.resume-icon-unavailable, .hero-buttons .btn, .section-label, .section-title, '
        + '.section-subtitle, .bio-text, '
        + '.library-heading, .collection-index, .collection-copy strong, .collection-copy small, '
        + '.collection-toggle > i, .carousel-controls, .carousel-indicators, '
        + '.contact-desc, .contact-links .btn, footer';
    const textProtectionSelector = '.hero-name, .hero-tagline, .section-title, .section-subtitle, '
        + '.bio-text, .library-heading, .collection-copy strong, .collection-copy small, .contact-desc';
    // Every sheet of glass on the page (glass.js and the stylesheets draw it).
    // A ring of cards, and the row of featured ones, is taken whole, as the
    // carousel it sits in.
    const glassSelector = '.about-highlight, .skill-group, .project-carousel, .featured-project-carousel, '
        + '.hero-buttons > .btn, '
        + '.social-links > a, .social-links > .resume-icon-unavailable, .contact-links > .btn';
    const updateVisibleRects = () => {
        visibleRects = protectedRects.filter(rect => rect.bottom > scrollPosition - 180 && rect.top < scrollPosition + height + 180);
        visibleGlass = glassRects.filter(rect => rect.bottom > scrollPosition - 180 && rect.top < scrollPosition + height + 180);
    };
    const clearanceAt = (x, y, radius, rects) => {
        let visibility = 1;
        for (const rect of rects) {
            const dx = Math.max(rect.left - x, 0, x - rect.right);
            const dy = Math.max(rect.top - y, 0, y - rect.bottom);
            if (dx >= radius || dy >= radius) continue;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance === 0) return 0;
            if (distance < radius) visibility = Math.min(visibility, smoothstep(distance / radius));
        }
        return visibility;
    };
    // Whether a point on screen is open sky: inside the window, and under no
    // sheet of glass. Anything moving elsewhere is behind frost, where no
    // frame rate shows, and is no reason to redraw the sky faster.
    const openSky = (x, y) => x > -40 && x < width + 40 && y > -40 && y < height + 40
        && clearanceAt(x, y + scrollPosition, 1, visibleGlass) > 0;

    const makeObject = (rng, x, documentY, radius, color, options = {}) => ({
        x, documentY, radius, color,
        phase: rng() * TAU,
        // Drift cycled about once every 180s and the orbit once every 350s,
        // which reads as a still image. These periods land near 20-45s: clearly
        // alive, still slow enough to stay cinematic rather than bobbing.
        speed: .13 + rng() * .25,
        drift: 3 + rng() * 10,
        pulse: .1 + rng() * .22,
        alpha: .2 + rng() ** 2 * .75,
        stretch: .88 + rng() * .24,
        angle: rng() * TAU,
        orbit: rng() < .45 ? 4 + rng() * 9 : 0,
        ...options
    });
    const add = (name, object) => tiers[name].objects.push(object);
    const around = (rng, region, spread = 1) => {
        const angle = rng() * TAU;
        const distance = Math.pow(rng(), .68) * region.radius * spread;
        return {
            x: clamp(region.x + Math.cos(angle) * distance, -24, width + 24),
            y: region.y + Math.sin(angle) * distance * region.flatten
        };
    };
    const placeBody = (rng, name, region, minRadius, maxRadius, anchor = false) => {
        const radius = randomRange(rng, minRadius, maxRadius) * (width < 700 ? .75 : 1);
        let position, score = -1;
        // Prefer real negative space, but retain dim bodies when the layout is
        // crowded; their alpha is checked again against the projected position.
        for (let attempt = 0; attempt < 14; attempt++) {
            const candidate = around(rng, region, anchor ? .45 : 1.25);
            const candidateScore = clearanceAt(candidate.x, candidate.y, Math.max(8, radius * .48), protectedRects);
            if (candidateScore > score) { position = candidate; score = candidateScore; }
            if (score > .94) break;
        }
        const color = rng() < .7 ? region.color : chooseColor(rng);
        add(name, makeObject(rng, position.x, position.y, radius, color, {
            interactive: name.endsWith('Planets'),
            alpha: anchor ? .78 + rng() * .22 : .16 + rng() ** 1.6 * .72,
            sprite: lightSprite(color, rng() < .55 ? 1 : 0)
        }));
    };

    const pickOpenPosition = (rng, targetX, targetY, radius, yJitter = 130) => {
        let best = { x: targetX, y: targetY };
        let bestScore = -1;
        for (let attempt = 0; attempt < 22; attempt++) {
            const x = clamp(targetX + randomRange(rng, -width * .16, width * .16), radius * .55, width - radius * .55);
            const y = clamp(targetY + randomRange(rng, -yJitter, yJitter), radius * .35, pageHeight - radius * .35);
            const score = clearanceAt(x, y, radius * .58, protectedRects);
            if (score > bestScore) {
                best = { x, y };
                bestScore = score;
            }
            if (score > .97) break;
        }
        return best;
    };

    const buildMotionSystems = () => {
        blackHoles = []; orbitingBodies = []; pulsars = [];
        const rng = createSeededRandom(seedFor(0xB1AC4A));
        const mobile = width < 700;
        // Spread the extra wells across the document. The hero keeps a well out
        // toward a gutter, but which gutter, how far down and how big are all
        // rolled per visit -- a fixed ladder of fractions was the tell that the
        // sky had been placed rather than found.
        const heroSide = rng() < .5 ? 1 : -1;
        const slots = [
            { x: width * (.5 + heroSide * randomRange(rng, .33, .44)), y: height * randomRange(rng, .42, .78),
              radius: (mobile ? 62 : 110) * randomRange(rng, .82, 1.2), factor: randomRange(rng, .8, .95) },
            { x: width * randomRange(rng, .18, .42), y: pageHeight * randomRange(rng, .6, .84),
              radius: (mobile ? 24 : 38) * randomRange(rng, .8, 1.3), factor: randomRange(rng, .42, .56) }
        ];
        // Walk down the page in shuffled bands so two wells never stack, while
        // the column each one lands in stays free.
        const bands = [.24, .45, .68, .88].sort(() => rng() - .5);
        for (let i = 0; i < (mobile ? 2 : 3); i++) slots.push({
            x: width * randomRange(rng, .16, .84),
            y: pageHeight * (bands[i] + randomRange(rng, -.06, .06)),
            radius: (mobile ? 45 + i * 5 : [72, 88, 60][i]) * randomRange(rng, .8, 1.25),
            factor: randomRange(rng, .78, 1.02)
        });
        if (!mobile && hasGiantLandmark) slots.push({
            x: rng() < .5 ? -95 : width + 95, y: pageHeight * randomRange(rng, .55, .95),
            radius: 270, factor: 1.12
        });
        for (const [index, slot] of slots.entries()) {
            const position = slot.radius > 200 ? slot : pickOpenPosition(rng, slot.x, slot.y, slot.radius, 120);
            const hole = {
                x: position.x, documentY: position.y, radius: slot.radius,
                parallaxFactor: slot.factor, angle: randomRange(rng, -.45, .45),
                phase: rng() * TAU, flare: 0, color: ['239,201,157', '190,215,239', '215,221,232'][index % 3],
                sprite: blackHoleSprite(['239,201,157', '190,215,239', '215,221,232'][index % 3], index % 2)
            };
            blackHoles.push(hole);
            // A couple of nearby bodies give the cursor something reachable to
            // nudge into the well. They use the same physics as existing planets.
            if (slot.radius < 200) for (let i = 0; i < 2; i++) {
                const direction = hole.x > width / 2 ? Math.PI : 0;
                const angle = direction + (i ? .46 : -.46);
                add('mediumPlanets', makeObject(rng,
                    hole.x + Math.cos(angle) * hole.radius * 1.95,
                    hole.documentY + Math.sin(angle) * hole.radius * 1.6,
                    randomRange(rng, 18, 31), hole.color,
                    { interactive: true, reachable: true, alpha: .72, sprite: lightSprite(hole.color, 1), drift: 2 }
                ));
            }
            // Just two tiny grains, faded at the shadow; no repeating explosion.
            for (let i = 0; i < (mobile ? 1 : 2); i++) orbitingBodies.push({
                hole, radius: randomRange(rng, 2, 4), angle: rng() * TAU,
                orbitRadius: hole.radius * randomRange(rng, .65, .94),
                speed: randomRange(rng, .035, .06), phase: rng() * TAU,
                sprite: lightSprite(hole.color, 0)
            });
        }
        // Stride widened alongside the third system per segment, so the number
        // of orbiting bodies stays where it was while now sampling mid-field
        // systems too.
        for (let index = 0; index < regions.length; index += mobile ? 9 : 6) {
            const region = regions[index];
            orbitingBodies.push({
                region, radius: randomRange(rng, 8, 20), angle: rng() * TAU,
                orbitRadius: randomRange(rng, 28, 80), speed: randomRange(rng, .022, .048),
                phase: rng() * TAU, sprite: lightSprite(region.color, 1)
            });
        }
        for (let i = 0; i < (mobile ? 1 : 2); i++) {
            const pos = pickOpenPosition(rng, width * randomRange(rng, .18, .82),
                pageHeight * (i ? randomRange(rng, .55, .95) : randomRange(rng, .12, .5)), 35);
            pulsars.push({ x: pos.x, documentY: pos.y, phase: rng() * TAU,
                factor: .55, sprite: lightSprite('206,225,248', 0) });
        }
    };

    // One scheduler, driven by active scene time. Tab hiding, Low FX and
    // reduced motion pause time; no timers, catch-up storms, or page-length rate.
    const eventDefinitions = {
        // Common streaks share a capped event budget with the rarer spectacles.
        shootingStar: { minCooldown: .8, maxCooldown: 2.8, probability: 1, maxSimultaneous: 3, cost: 1, high: true, low: false },
        meteor: { minCooldown: 16, maxCooldown: 42, probability: .9, maxSimultaneous: 1, cost: 2, high: true, low: false },
        comet: { minCooldown: 42, maxCooldown: 110, probability: .85, maxSimultaneous: 1, cost: 2, high: true, low: false },
        supernova: { minCooldown: 65, maxCooldown: 155, probability: .85, maxSimultaneous: 1, cost: 2, high: true, low: false },
        distantExplosion: { minCooldown: 35, maxCooldown: 95, probability: .7, maxSimultaneous: 1, cost: 1, high: true, low: false }
    };
    Object.assign(eventDefinitions, {
        meteorShower: { minCooldown: 30, maxCooldown: 80, probability: .75, maxSimultaneous: 1, cost: 2, high: true },
        binaryStar: { minCooldown: 35, maxCooldown: 85, probability: .8, maxSimultaneous: 1, cost: 1, high: true },
        pulsar: { minCooldown: 45, maxCooldown: 100, probability: .75, maxSimultaneous: 1, cost: 1, high: true },
        cosmicFlare: { minCooldown: 22, maxCooldown: 65, probability: .8, maxSimultaneous: 1, cost: 1, high: true },
        satellite: { minCooldown: 90, maxCooldown: 210, probability: .6, maxSimultaneous: 1, cost: 1, high: true },
        roguePlanet: { minCooldown: 100, maxCooldown: 220, probability: .65, maxSimultaneous: 1, cost: 2, high: true },
        feeding: { minCooldown: 20, maxCooldown: 55, probability: .9, maxSimultaneous: 1, cost: 2, high: true },
        // A lander picks a world in view, comes down on it, sits a while, then
        // leaves. Two can be running at once, so the sky usually has traffic.
        rocket: { minCooldown: 12, maxCooldown: 38, probability: .95, maxSimultaneous: 3, cost: 2, high: true },
        // A running skirmish between two fleets, anchored wherever the sky is
        // open. Rarer than the landers -- it should be a thing you catch.
        dogfight: { minCooldown: 55, maxCooldown: 140, probability: .8, maxSimultaneous: 1, cost: 2, high: true }
    });
    const stationaryEvent = type => ['supernova', 'distantExplosion', 'binaryStar', 'pulsar', 'cosmicFlare', 'dogfight'].includes(type);
    const eventEntries = Object.entries(eventDefinitions);
    const eventPool = Array.from({ length: 8 }, () => ({ active: false }));
    const eventDue = {};
    let nextEventWindow = 0;
    const eventRandom = Math.random;
    const cooldown = definition => randomRange(eventRandom, definition.minCooldown, definition.maxCooldown) * (width > 0 && width < 700 ? 1.6 : 1);
    const resetEvents = () => {
        for (const event of eventPool) event.active = false;
        for (const [type, definition] of eventEntries) eventDue[type] = sceneTime + cooldown(definition);
        nextEventWindow = sceneTime + 4;
    };
    // Select an entire trajectory against cached protected rectangles. Coordinates
    // are inverted through the depth projection so events begin in this viewport.
    const chooseEventPath = (type, factor) => {
        const stationary = stationaryEvent(type);
        // A shooting star runs on a layer of its own, which is only cheap
        // where there is no glass over it: steer it through open sky. Under
        // the frost it only ever showed as a smudge.
        const steerGlass = STREAK_TYPES.has(type);
        let best = null, bestScore = -1;
        for (let attempt = 0; attempt < 24; attempt++) {
            const fromLeft = eventRandom() < .5;
            const x = randomRange(eventRandom, .06, .94) * width;
            const y = randomRange(eventRandom, navigationBottom + 45, height - 40);
            const angle = randomRange(eventRandom, .08, 1.48);
            const length = Math.min(width * .88, randomRange(eventRandom, 280, 1000));
            const dx = stationary ? 0 : (fromLeft ? 1 : -1) * Math.cos(angle) * length;
            const dy = stationary ? 0 : Math.sin(angle) * length * (eventRandom() < .12 ? -.6 : 1);
            const protection = type === 'meteor' ? 60 : type === 'comet' ? 95 : stationary ? 80 : 16;
            let score = 1;
            for (let sample = 0; sample <= 8; sample++) {
                const progress = type === 'comet' ? -.65 + sample / 8 * 1.65 : sample / 8;
                const sx = x + dx * progress, sy = y + dy * progress;
                if (sy < navigationBottom + 20 || sy > height + 20 || sx < -40 || sx > width + 40) score *= .8;
                score = Math.min(score, clearanceAt(sx, sy + scrollPosition, protection, visibleRects));
                if (steerGlass) score = Math.min(score, clearanceAt(sx, sy + scrollPosition, 30, visibleGlass));
            }
            if (score > bestScore) {
                bestScore = score;
                best = { x, documentY: scrollPosition + height / 2 + (y - height / 2) / factor, dx, dy: dy / factor };
            }
            if (score > .92) break;
        }
        // Bright effects wait for another opportunity if the viewport is crowded.
        return bestScore < .4 && !['shootingStar', 'meteorShower', 'feeding'].includes(type) ? null : best;
    };
    // Where a body actually is on screen this frame, matching the tier loop's
    // own projection so a rocket sits on the world rather than near it.
    const bodySite = { x: 0, y: 0, radius: 0 };
    const projectBody = (body, time, cameraX, cameraY) => {
        const factor = body.factor || 1;
        const motion = Math.sin(time * body.speed + body.phase) * body.drift;
        const orbit = Math.sin(time * .055 + body.phase) * body.orbit;
        bodySite.x = body.x + motion + orbit - cameraX * factor * factor * 10
            + (body.physics ? body.physics.ox : 0);
        bodySite.y = (body.documentY - scrollPosition - height / 2) * factor + height / 2
            + motion * .6 - cameraY * factor * factor * 7
            + (body.physics ? body.physics.oy : 0);
        bodySite.radius = body.radius;
        return bodySite;
    };
    // Landing sites are chosen when a rocket launches, not every frame: a full
    // scan of the two mid-size planet tiers costs nothing once a minute.
    const chooseLandingSite = (time, cameraX, cameraY) => {
        let best = null, bestScore = 0;
        for (const tier of [tiers.mediumPlanets, tiers.largePlanets]) {
            for (const body of tier.objects) {
                if (body.haze || body.radius < 24 || body.radius > 110) continue;
                if (body.physics && (body.physics.capture || body.physics.respawnAt > time)) continue;
                const site = projectBody(body, time, cameraX, cameraY);
                if (site.y < navigationBottom + 110 || site.y > height - 90) continue;
                if (site.x < 90 || site.x > width - 90) continue;
                // Needs open sky around it, or the landing happens behind text.
                const clearance = clearanceAt(site.x, site.y + scrollPosition, body.radius * 2.2, visibleRects);
                if (clearance < .8) continue;
                const score = clearance * (.4 + eventRandom());
                if (score > bestScore) { best = body; bestScore = score; }
            }
        }
        return best;
    };
    // A lander: hull, nose, two fins, and a plume that only burns when it is
    // actually under thrust. Drawn solid rather than additive -- a craft should
    // read as a silhouette against the glow, not as another light in it.
    const drawRocket = (x, y, angle, scale, thrust, alpha, beacon) => {
        context.save();
        context.translate(x, y);
        context.rotate(angle);
        if (thrust > .01) {
            const length = (11 + thrust * 30) * scale * (.82 + Math.random() * .36);
            context.globalCompositeOperation = 'lighter';
            context.globalAlpha = alpha;
            const plume = context.createLinearGradient(0, 0, -length, 0);
            plume.addColorStop(0, `rgba(255,231,190,${(.8 * thrust).toFixed(3)})`);
            plume.addColorStop(.4, `rgba(255,176,102,${(.34 * thrust).toFixed(3)})`);
            plume.addColorStop(1, 'rgba(255,140,70,0)');
            context.fillStyle = plume;
            context.beginPath();
            context.moveTo(-scale * 2.8, -scale * 1.6);
            context.lineTo(-length, 0);
            context.lineTo(-scale * 2.8, scale * 1.6);
            context.closePath();
            context.fill();
        }
        context.globalCompositeOperation = 'source-over';
        context.globalAlpha = alpha;
        context.fillStyle = '#5d6b7d';
        context.beginPath();
        context.moveTo(-scale * 1.5, -scale * 1.75);
        context.lineTo(-scale * 4.4, -scale * 3.5);
        context.lineTo(-scale * 3.1, -scale * 1.5);
        context.closePath(); context.fill();
        context.beginPath();
        context.moveTo(-scale * 1.5, scale * 1.75);
        context.lineTo(-scale * 4.4, scale * 3.5);
        context.lineTo(-scale * 3.1, scale * 1.5);
        context.closePath(); context.fill();
        context.fillStyle = '#d9e0e8';
        context.beginPath();
        context.moveTo(scale * 5.4, 0);
        context.lineTo(scale * .8, -scale * 1.85);
        context.lineTo(-scale * 3.1, -scale * 1.6);
        context.lineTo(-scale * 3.1, scale * 1.6);
        context.lineTo(scale * .8, scale * 1.85);
        context.closePath(); context.fill();
        context.fillStyle = '#8d9bab';
        context.fillRect(-scale * .6, -scale * 1.7, scale * 1.1, scale * 3.4);
        if (beacon > .01) {
            context.globalCompositeOperation = 'lighter';
            context.globalAlpha = alpha * beacon;
            context.fillStyle = '#ff9f7a';
            context.beginPath(); context.arc(scale * 2.4, 0, scale * .7, 0, TAU); context.fill();
        }
        context.restore();
    };
    // Two fleets, scattered around the anchor rather than lined up facing each
    // other. Each ship picks the nearest enemy, circles it rather than ramming
    // it, and fires when it is roughly on target. Bounded on every axis: six
    // ships, sixteen bolts, no allocation once the arrays exist.
    const HUMAN = 0, ALIEN = 1;
    const armFleet = event => {
        event.ships = event.ships || Array.from({ length: 6 }, () => ({}));
        event.bolts = event.bolts || Array.from({ length: 16 }, () => ({ life: 0 }));
        for (const [index, ship] of event.ships.entries()) {
            const faction = index % 2 === 0 ? HUMAN : ALIEN;
            const side = faction === HUMAN ? -1 : 1;
            Object.assign(ship, {
                faction, alive: true, wreck: 0, hp: 2 + Math.floor(eventRandom() * 2),
                // Scattered: each ship gets its own offset and stand-off, so the
                // two sides read as loose swarms instead of ranks.
                x: side * randomRange(eventRandom, 55, 150) + randomRange(eventRandom, -40, 40),
                y: randomRange(eventRandom, -85, 85),
                vx: -side * randomRange(eventRandom, 10, 34), vy: randomRange(eventRandom, -18, 18),
                angle: side > 0 ? Math.PI : 0,
                fireAt: randomRange(eventRandom, .4, 2.6),
                orbit: eventRandom() < .5 ? 1 : -1,
                size: randomRange(eventRandom, .85, 1.25),
                // The alien side flies a mixed fleet: saucers alongside the two
                // hulls that also turn up as landers.
                design: Math.floor(eventRandom() * 3)
            });
        }
        for (const bolt of event.bolts) bolt.life = 0;
    };
    const drawHumanShip = (x, y, angle, size, alpha) => {
        context.save();
        context.translate(x, y); context.rotate(angle);
        context.globalCompositeOperation = 'lighter';
        context.globalAlpha = alpha * .8;
        const plume = context.createLinearGradient(-size * 3, 0, -size * 11, 0);
        plume.addColorStop(0, 'rgba(178,214,255,.5)');
        plume.addColorStop(1, 'rgba(150,190,255,0)');
        context.fillStyle = plume;
        context.fillRect(-size * 11, -size * .8, size * 8, size * 1.6);
        context.globalCompositeOperation = 'source-over';
        context.globalAlpha = alpha;
        // A hard-edged wedge: angular reads as built, next to the alien curve.
        context.fillStyle = '#cfd9e4';
        context.beginPath();
        context.moveTo(size * 7, 0);
        context.lineTo(-size * 2.5, -size * 3.2);
        context.lineTo(-size * 3.4, 0);
        context.lineTo(-size * 2.5, size * 3.2);
        context.closePath(); context.fill();
        context.fillStyle = '#71829a';
        context.beginPath();
        context.moveTo(size * 2.2, 0);
        context.lineTo(-size * 2.5, -size * 1.5);
        context.lineTo(-size * 2.5, size * 1.5);
        context.closePath(); context.fill();
        context.restore();
    };
    const drawAlienShip = (x, y, angle, size, alpha, time) => {
        context.save();
        context.translate(x, y); context.rotate(angle);
        context.globalAlpha = alpha;
        // A saucer, always level to its heading, with a lit underside rim.
        context.fillStyle = '#2f4a42';
        context.beginPath(); context.ellipse(0, 0, size * 6, size * 2.1, 0, 0, TAU); context.fill();
        context.fillStyle = '#9fe6c4';
        context.beginPath(); context.ellipse(0, -size * .5, size * 2.6, size * 1.25, 0, 0, TAU); context.fill();
        context.globalCompositeOperation = 'lighter';
        context.globalAlpha = alpha * (.45 + Math.sin(time * 3.4 + size * 9) * .2);
        context.fillStyle = '#6ff0b0';
        context.beginPath(); context.ellipse(0, size * 1.2, size * 4.4, size * .8, 0, 0, TAU); context.fill();
        context.restore();
    };
    // Alien craft hold themselves up on light rather than on a flame, so their
    // "thrust" reads as a brightening underglow instead of a plume. That is the
    // cheapest way to make them legible as not-ours at background scale.
    const drawAlienPod = (x, y, angle, scale, thrust, alpha, beacon, time) => {
        context.save();
        context.translate(x, y); context.rotate(angle);
        context.globalAlpha = alpha;
        context.strokeStyle = '#4e6f63'; context.lineWidth = Math.max(.5, scale * .28);
        for (let i = -1; i <= 1; i++) {
            context.beginPath();
            context.moveTo(-scale * .8, i * scale * .9);
            context.lineTo(-scale * 3.6, i * scale * 2.9);
            context.stroke();
        }
        context.fillStyle = '#33544b';
        context.beginPath(); context.ellipse(0, 0, scale * 4.2, scale * 2.4, 0, 0, TAU); context.fill();
        context.fillStyle = '#a9efcd';
        context.beginPath(); context.ellipse(scale * .7, -scale * .5, scale * 1.7, scale * 1, 0, 0, TAU); context.fill();
        context.globalCompositeOperation = 'lighter';
        context.globalAlpha = alpha * (.3 + thrust * .6 + beacon * .3);
        context.drawImage(lightSprite('120,240,180', 2),
            -scale * 5, -scale * 1.5, scale * 10, scale * 6);
        context.restore();
    };
    const drawAlienDart = (x, y, angle, scale, thrust, alpha, beacon, time) => {
        context.save();
        context.translate(x, y); context.rotate(angle);
        context.globalAlpha = alpha;
        // A swept manta: one concave sweep back from the nose on each side.
        context.fillStyle = '#3b3552';
        context.beginPath();
        context.moveTo(scale * 5.6, 0);
        context.quadraticCurveTo(-scale * .5, -scale * 1.6, -scale * 3.6, -scale * 3.6);
        context.quadraticCurveTo(-scale * 1.4, 0, -scale * 3.6, scale * 3.6);
        context.quadraticCurveTo(-scale * .5, scale * 1.6, scale * 5.6, 0);
        context.closePath(); context.fill();
        context.globalCompositeOperation = 'lighter';
        context.globalAlpha = alpha * (.45 + thrust * .5 + beacon * .35);
        context.fillStyle = '#c79bff';
        for (let i = -1; i <= 1; i += 2) {
            context.beginPath();
            context.ellipse(-scale * 1.6, i * scale * 1.5, scale * 1.5, scale * .5, 0, 0, TAU);
            context.fill();
        }
        context.globalAlpha = alpha * (.3 + thrust * .55);
        context.drawImage(lightSprite('190,150,255', 2),
            -scale * 7, -scale * 3.4, scale * 8, scale * 6.8);
        context.restore();
    };
    const CRAFT_HUMAN = 0, CRAFT_POD = 1, CRAFT_DART = 2;
    const drawCraft = (design, x, y, angle, scale, thrust, alpha, beacon, time) => {
        if (design === CRAFT_HUMAN) drawRocket(x, y, angle, scale, thrust, alpha, beacon);
        else if (design === CRAFT_POD) drawAlienPod(x, y, angle, scale, thrust, alpha, beacon, time);
        else drawAlienDart(x, y, angle, scale, thrust, alpha, beacon, time);
    };
    const cometTailSprite = color => {
        const key = `comet-tail:${color}`;
        if (spriteCache.has(key)) return spriteCache.get(key);
        const sprite = createSprite(384), ctx = sprite.getContext('2d');
        const length = ctx.createLinearGradient(0, 0, 384, 0);
        length.addColorStop(0, `rgba(${color},0)`);
        length.addColorStop(.35, `rgba(${color},.16)`);
        length.addColorStop(.9, `rgba(${color},.65)`);
        length.addColorStop(1, `rgba(${color},.15)`);
        ctx.fillStyle = length;
        ctx.fillRect(0, 0, 384, 384);
        ctx.globalCompositeOperation = 'destination-in';
        const cross = ctx.createLinearGradient(0, 0, 0, 384);
        cross.addColorStop(0, 'transparent');
        cross.addColorStop(.3, 'rgba(0,0,0,.03)');
        cross.addColorStop(.47, 'rgba(0,0,0,.4)');
        cross.addColorStop(.5, 'rgba(0,0,0,1)');
        cross.addColorStop(.53, 'rgba(0,0,0,.4)');
        cross.addColorStop(.7, 'rgba(0,0,0,.03)');
        cross.addColorStop(1, 'transparent');
        ctx.fillStyle = cross; ctx.fillRect(0, 0, 384, 384);
        spriteCache.set(key, sprite);
        return sprite;
    };
    const spawnEvent = type => {
        const event = eventPool.find(item => !item.active);
        if (!event) return false;
        if (type === 'rocket') {
            const target = chooseLandingSite(sceneTime, pointer.x, pointer.y);
            if (!target) return false;
            // Both sides fly the same errand. Which one turns up is a coin
            // flip, so a human lander and an alien lander can end up at
            // neighbouring worlds -- and then they see each other.
            const alien = eventRandom() < .5;
            event.bolts = event.bolts || Array.from({ length: 8 }, () => ({ life: 0 }));
            for (const bolt of event.bolts) bolt.life = 0;
            // It arrives along the same radial it will stand on, so the descent,
            // the landing and the departure all read as one line of travel.
            Object.assign(event, {
                active: true, type, started: sceneTime, capture: null, body: target,
                duration: randomRange(eventRandom, 26, 40),
                siteAngle: eventRandom() * TAU,
                entry: randomRange(eventRandom, 5.5, 9) * Math.max(60, target.radius),
                sweep: randomRange(eventRandom, -.5, .5),
                scale: Math.max(1.5, Math.min(3.4, target.radius / 22)),
                puffed: false, faction: alien ? ALIEN : HUMAN,
                design: alien ? (eventRandom() < .5 ? CRAFT_POD : CRAFT_DART) : CRAFT_HUMAN,
                hp: 3, duel: null, duelStart: 0, dead: 0, hit: 0,
                sx: undefined, sy: undefined, blendFrom: null, blendAt: -10,
                fx: 0, fy: 0, fvx: 0, fvy: 0, fireAt: 0,
                orbitDir: eventRandom() < .5 ? 1 : -1
            });
            return true;
        }
        const depth = eventRandom();
        let factor = .45 + depth * .6;
        let path = chooseEventPath(type, factor);
        let feedingHole = null;
        if (type === 'feeding') {
            feedingHole = projectedHoles.find(hole => hole.clearance > .65 && hole.screenY > navigationBottom + 60);
            if (!feedingHole) return false;
            factor = feedingHole.parallaxFactor;
            path = { x: feedingHole.x - feedingHole.radius * 1.05, documentY: feedingHole.documentY, dx: 0, dy: 0 };
        }
        if (!path) return false;
        const color = ['220,235,255', '246,231,208', '194,218,241'][Math.floor(eventRandom() * 3)];
        const duration = type === 'shootingStar' ? randomRange(eventRandom, .65, 1.5) - depth * .22
            : type === 'meteor' ? randomRange(eventRandom, 1.6, 2.6)
            : type === 'comet' ? randomRange(eventRandom, 18, 28)
            : type === 'supernova' ? randomRange(eventRandom, 8, 12)
            : type === 'roguePlanet' || type === 'satellite' ? randomRange(eventRandom, 18, 30)
            : type === 'binaryStar' || type === 'pulsar' ? randomRange(eventRandom, 10, 17)
            : type === 'dogfight' ? randomRange(eventRandom, 22, 38) : randomRange(eventRandom, 5, 8);
        Object.assign(event, path, {
            active: true, type, factor, color, duration, started: sceneTime,
            capture: null, burst: false, variant: type === 'shootingStar'
                ? ['normal', 'normal', 'normal', 'long', 'distant', 'distant', 'double', 'bright'][Math.floor(eventRandom() * 8)] : '',
            giant: type === 'comet' && eventRandom() < .12,
            depth, bend: randomRange(eventRandom, -12, 12),
            radius: type === 'meteor' ? 9 + depth * 6 : 4 + depth * 5,
            alpha: type === 'meteor' ? .38 : type === 'comet' ? .34 : type === 'supernova' ? .8 : type === 'distantExplosion' ? .6 : .3 + depth * .18,
            tail: type === 'comet' ? .65 : randomRange(eventRandom, .1, .22),
            sprite: lightSprite(color, 0), bloom: lightSprite(color, 2),
            tailSprite: type === 'comet' ? cometTailSprite(color) : null
        });
        if (event.variant === 'long') { event.tail = .42; event.duration *= 1.25; }
        if (event.variant === 'distant') { event.radius *= .45; event.alpha *= .55; event.tail *= .6; }
        if (event.variant === 'bright') { event.radius *= 1.8; event.alpha = .72; }
        if (type === 'roguePlanet') { event.sprite = lightSprite(color, 1); event.radius = 42 + depth * 40; event.alpha = .55; }
        if (type === 'feeding') {
            const point = projectPosition(path.x, path.documentY, factor, pointer.x, pointer.y);
            event.capture = beginCapture(feedingHole, point.x, point.y, sceneTime, 5.5);
            event.sprite = lightSprite(color, 1); event.radius = 14; event.alpha = .8;
        }
        if (event.giant) { event.radius *= 1.7; event.tail = .95; }
        if (type === 'dogfight') armFleet(event);
        return true;
    };
    const updateEvents = time => {
        for (const event of eventPool) if (event.active && (event.capture
            ? time - event.capture.started >= event.capture.duration
            : time - event.started >= event.duration)) {
            if (event.capture) {
                const point = capturePoint(event.capture, 1, pointer.x, pointer.y);
                feedHole(event.capture.hole, point.x, point.y);
            }
            event.active = false;
        }
        for (const [type, definition] of eventEntries) {
            if (eventDue[type] === undefined) eventDue[type] = time + cooldown(definition);
            if (time < eventDue[type] || time < nextEventWindow || !definition[quality]) continue;
            let count = 0, cost = 0, same = 0;
            for (const event of eventPool) if (event.active) {
                count++; cost += eventDefinitions[event.type].cost;
                if (event.type === type) same++;
            }
            if (count >= (width < 700 ? 3 : 6) || cost + definition.cost > (width < 700 ? 4 : 8)
                || same >= definition.maxSimultaneous) continue;
            eventDue[type] = time + cooldown(definition);
            if (eventRandom() > definition.probability || !spawnEvent(type)) continue;
            nextEventWindow = time + randomRange(eventRandom, .3, .85);
        }
    };

    // How much of a sprite can still put ink on the page, and where it sits.
    //
    // Every body in front of the deep field is a soft sprite blended additively
    // over whatever is behind it, and the browser pays for every pixel of the
    // rectangle it is handed -- including the wide transparent margin these
    // sprites carry, which is most of their area. A haze cloud a thousand
    // pixels across spends nine tenths of that budget adding zero to the sky.
    //
    // So each body works out, once, the box of its own sprite that is still
    // worth drawing: past the point where the gradient falls below half of one
    // step in eight bits, nothing it adds can survive being written to the
    // canvas, at that body's brightness. What is left is the same picture,
    // drawn from a smaller rectangle.
    const visibleRadiusFraction = (stops, alpha) => {
        const floor = .5 / (255 * Math.max(alpha, 1e-6));
        for (let i = 1; i < stops.length; i++) {
            const [nearAt, nearAlpha] = stops[i - 1], [farAt, farAlpha] = stops[i];
            if (farAlpha >= floor) continue;        // the whole band still shows
            if (nearAlpha <= floor) return nearAt;  // it was already too faint
            return nearAt + (farAt - nearAt) * (nearAlpha - floor) / (nearAlpha - farAlpha);
        }
        return 1;
    };
    const trimSprite = (object, brightenable) => {
        const sprite = object.sprite;
        if (!sprite) return;
        // A galaxy may have handed its sheet back for now (see releaseGalaxy),
        // which leaves the canvas at no size; the size it paints at is its own.
        const size = sprite.galaxy ? sprite.galaxy.size : sprite.width;
        const height = sprite.galaxy ? sprite.galaxy.size : sprite.height;
        // The brightest this body can ever be drawn: its own alpha, dimmed by
        // the text it was placed behind -- frozen at placement, see
        // finalizeTiers -- and lifted by at most a fifth, which is all a touch
        // well can add. A body the cursor is allowed to light up has no such
        // ceiling worth counting, so it is trimmed against a fully lit one;
        // the frame clamps every alpha to 1 regardless.
        const clearance = object.clearance ?? 1;
        const shade = object.haze ? .5 + clearance * .5 : .07 + clearance * .93;
        const ceiling = brightenable ? 1 : Math.min(1, object.alpha * shade * 1.2);
        let x0 = 0, y0 = 0, x1 = size, y1 = height;
        if (sprite.clouds) {
            // A galaxy: whatever it drew sharply, plus each of its clouds
            // pulled in to the radius that still shows at this brightness.
            const fraction = visibleRadiusFraction(sprite.cloudStops, ceiling);
            let left = sprite.solid.x0, top = sprite.solid.y0;
            let right = sprite.solid.x1, bottom = sprite.solid.y1;
            for (const [cloudX, cloudY, cloudW, cloudH] of sprite.clouds) {
                const midX = cloudX + cloudW / 2, midY = cloudY + cloudH / 2;
                const reachX = cloudW / 2 * fraction, reachY = cloudH / 2 * fraction;
                if (midX - reachX < left) left = midX - reachX;
                if (midY - reachY < top) top = midY - reachY;
                if (midX + reachX > right) right = midX + reachX;
                if (midY + reachY > bottom) bottom = midY + reachY;
            }
            x0 = Math.max(0, Math.floor(left)); y0 = Math.max(0, Math.floor(top));
            x1 = Math.min(size, Math.ceil(right)); y1 = Math.min(height, Math.ceil(bottom));
        } else if (sprite.stops) {
            const fraction = visibleRadiusFraction(sprite.stops, ceiling);
            if (fraction >= .999) return;
            const inset = (1 - fraction) / 2;
            x0 = Math.floor(size * inset); y0 = Math.floor(height * inset);
            x1 = Math.ceil(size - size * inset); y1 = Math.ceil(height - height * inset);
        } else return;
        if (x1 <= x0 || y1 <= y0) return;
        if (x1 - x0 >= size && y1 - y0 >= height) return;
        object.sx = x0; object.sy = y0;
        object.sw = x1 - x0; object.sh = y1 - y0;
        // Where that box lands, as multiples of the body's radius, so the
        // frame only has to scale them. The full sprite spans -1..1 across and
        // -stretch..stretch down, which is what these reduce to when nothing
        // was trimmed.
        object.dx = 2 * (x0 / size) - 1;
        object.dy = (2 * (y0 / height) - 1) * object.stretch;
        object.dw = 2 * (x1 - x0) / size;
        object.dh = 2 * (y1 - y0) / height * object.stretch;
    };

    // Everything the draw loop assumes about a tier: sorted by page position so
    // the visible slice can be found by binary search, a margin wide enough for
    // the largest sprite it holds, and the live list the animated frames walk.
    // Run after any change to what a tier contains -- a full build, or a single
    // band of sky grown or removed under a collection opening and closing.
    const finalizeTiers = () => {
        for (const tier of tierList) {
            tier.objects.sort((a, b) => a.documentY - b.documentY);
            tier.margin = tier.objects.reduce((max, item) => Math.max(max, item.radius * 1.3 + 28), 20);
            if (tier.objects.some(item => item.interactive)) tier.margin += 360;
            // Keep the full list for reduced motion, which draws the points
            // directly. Animated frames only visit stars not already in tiles.
            tier.liveObjects = tier === tiers.stars
                ? tier.objects.filter(object => !object.staticField) : tier.objects;
            // Conservative bounds for finding only the stars in a live patch
            // of a cached tier. Include drift, orbit and the original overlap
            // margin; the exact position/overlap check still runs afterwards.
            tier.liveReach = 0;
            for (const object of tier.objects) {
                object.liveReach = Math.abs(object.drift) + Math.abs(object.orbit) + object.radius * 3 + 2;
                tier.liveReach = Math.max(tier.liveReach, object.liveReach);
                object.fillColor = `rgb(${object.color})`;
                // A body's angle is dealt once, where it is placed, and never
                // turns again -- the tilt is the object's, not the frame's. So
                // the sine and cosine the sprite is hung on are its own too,
                // taken here instead of twice a frame for the rest of a visit.
                object.angleCos = Math.cos(object.angle);
                object.angleSin = Math.sin(object.angle);
                // Likewise the phase its orbit is offset by: fixed at
                // placement, so the frame can turn the shared orbit clock onto
                // this body with a multiply instead of its own sine.
                object.phaseCos = Math.cos(object.phase);
                object.phaseSin = Math.sin(object.phase);
                // Rockets have to find a world and follow it while it parallaxes,
                // which means each body has to know its own depth.
                object.factor = tier.factor;
                // How much text this object sits behind, measured once, where it
                // was placed, and then its own property for good. It used to be
                // recomputed every frame against wherever the text happened to
                // be, so a heading sliding down when a collection opened took a
                // planet from full brightness to seven percent of it -- the same
                // planet, in the same place, blinking out and back as the page
                // grew and shrank under it. Nothing about the sky should answer
                // to what the page is doing in front of it.
                if (!tier.points && object.clearance === undefined) {
                    object.clearance = clearanceAt(object.x, object.documentY,
                        Math.max(10, object.radius * .46), protectedRects);
                }
                // Trimmed against the brightest this body can ever be drawn,
                // which is settled once its clearance is. A planet dimmed to a
                // fifteenth behind a heading needs far less of its sprite than
                // one burning in open sky.
                if (!tier.points) trimSprite(object, !object.haze && tier === tiers.mediumStars);
            }
        }
    };

    // One band of sky: three overlapping systems, the scenery that belongs to
    // them, and a jittered lattice that fills whatever the three leave bare.
    // Lifted out of buildScene so an opening collection can grow new sky into
    // the gap it makes without rerolling the universe around it. `index` seeds
    // the band and `top` places it, and nothing else varies -- so the same gap
    // always grows the same sky back.
    const SEGMENT_HEIGHT = 680;
    const buildSegment = (index, top, salt = 0xC0FFEE, segmentHeight = SEGMENT_HEIGHT) => {
        const mobile = width < 700;
        const density = mobile ? .68 : 1;
        const rng = createSeededRandom(seedFor(salt, index));
        const type = Math.floor(rng() * 4); // luminous system, binary, cloud, loose association
        const side = rng() < .5;
        // Anchoring three quarters of the systems in the gutters left a
        // conspicuously empty column down the middle of the page. Half of
        // them sit in the central band now, and the bands overlap so the
        // field reads as one continuous scene instead of three stripes.
        const centerMass = rng() < .5;
        const region = {
            x: width * (centerMass ? randomRange(rng, .3, .7)
                : (side ? randomRange(rng, .015, .3) : randomRange(rng, .7, .985))),
            y: top + randomRange(rng, .25, .71) * segmentHeight,
            radius: Math.min(width * .45, randomRange(rng, 220, 380)),
            flatten: randomRange(rng, .45, .95),
            color: chooseColor(rng), type
        };
        regions.push(region);
        // An exact mirror produced matched pairs hugging both edges, which
        // is what made the layout look placed rather than found. Drift the
        // companion off the reflection so the two sit at unrelated
        // distances from the centre.
        const companion = {
            ...region,
            x: clamp(width - region.x + width * randomRange(rng, -.22, .22), width * .06, width * .94),
            y: region.y + randomRange(rng, -220, 240),
            radius: region.radius * .65
        };
        regions.push(companion);
        // A third, dimmer system in the middle band. It carries the fine
        // scenery -- dust, unresolved smudges, small bodies -- rather than
        // bright landmarks, so the centre fills in without competing with
        // the text sitting over it.
        const midfield = {
            ...region,
            x: width * randomRange(rng, .34, .66),
            y: region.y + randomRange(rng, -300, 340),
            radius: region.radius * randomRange(rng, .5, .78),
            flatten: randomRange(rng, .5, 1),
            color: chooseColor(rng)
        };
        regions.push(midfield);

        // Give the hero's open right side its own system, above the title's
        // baseline, instead of pushing every light below the large heading.
        // The side is fixed by the layout -- the name owns the left -- but
        // where it sits in that space is not.
        if (!index && !top && !mobile) {
            region.x = width * randomRange(rng, .82, .96);
            region.y = height * randomRange(rng, .24, .48);
            region.radius = width * randomRange(rng, .12, .19);
        }

        // An even baseline under uneven systems, with many nearly invisible
        // points. No page-height cap that thins out expanded collections.
        // Deep-field stars are deliberately tiny and numerous in High FX,
        // like a telescope exposure: density rises while individual alpha
        // and radius stay restrained.
        const count = Math.round((width * segmentHeight / 500) * density * (mobile ? .72 : 1));
        for (let i = 0; i < count; i++) {
            const clustered = rng() < .48;
            const groupRoll = rng();
            const group = groupRoll < .5 ? region : groupRoll < .78 ? companion : midfield;
            const position = clustered ? around(rng, group) : { x: rng() * width, y: top + rng() * segmentHeight };
            const depth = rng();
            const bright = rng() < .022;
            add('stars', makeObject(rng, position.x, position.y,
                bright ? 1.15 + rng() * 1.15 : .2 + rng() ** 1.9 * .9,
                chooseDeepColor(rng), {
                alpha: bright ? .64 + rng() * .3 : .1 + rng() ** 1.8 * .62,
                drift: .6 + depth * 3.4, pulse: .2 + rng() * .4,
                glint: bright && rng() < .38,
                staticField: !bright
            }));
        }
        // A fine veil of unresolved dust prevents the field from feeling
        // algorithmically empty between the larger seeded systems.
        for (let i = 0; i < Math.round(150 * density); i++) {
            const dustRoll = rng();
            const position = around(rng, dustRoll < .44 ? region : dustRoll < .72 ? companion : midfield, 1.4);
            add('dust', makeObject(rng, position.x, position.y, .16 + rng() * .34, chooseDeepColor(rng), { alpha: .035 + rng() * .12, drift: .5, pulse: .16 }));
        }
        for (const group of [region, companion]) {
            const galaxyRadius = group.radius * (type === 2 ? 1.1 : .75);
            add('galaxies', makeObject(rng, group.x, group.y, galaxyRadius, group.color, {
                sprite: galaxySprite(rng, group.color, galaxyRadius), alpha: type === 2 ? .8 : .5, drift: 2, stretch: .65 + rng() * .3, haze: true
            }));
            // Cluster-linked atmospheric light shares the midground's
            // projection, while the unresolved galaxy sits much farther back.
            add('smallPlanets', makeObject(rng, group.x, group.y, group.radius * 1.6, group.color, {
                sprite: lightSprite(group.color, 2), alpha: .13, stretch: .66, haze: true, drift: 3
            }));
            for (let i = 0; i < Math.round(10 * density); i++) {
                const p = around(rng, group, 1.3);
                const color = rng() < .7 ? group.color : chooseColor(rng);
                add('tinyDistant', makeObject(rng, p.x, p.y, 3 + rng() * 8, color, {
                    sprite: lightSprite(color, 0), alpha: .17 + rng() * .5, drift: .7
                }));
            }
            // Small, unresolved galaxy smudges echo deep-field exposures;
            // they are sparse enough to remain landmarks rather than icons.
            for (let i = 0; i < Math.round(2.5 * density); i++) {
                const p = around(rng, group, 1.15);
                const microColor = chooseDeepColor(rng);
                const microRadius = 7 + rng() * 12;
                add('tinyDistant', makeObject(rng, p.x, p.y, microRadius, microColor, {
                    sprite: galaxySprite(rng, microColor, microRadius), alpha: .08 + rng() * .16,
                    stretch: .32 + rng() * .55, angle: rng() * TAU, drift: .32, haze: true
                }));
            }
            for (let i = 0; i < Math.round((type === 2 ? 11 : 16) * density); i++) placeBody(rng, 'smallPlanets', group, 7, 18);
            for (let i = 0; i < Math.round(7 * density); i++) placeBody(rng, 'mediumStars', group, 12, 27);
            for (let i = 0; i < Math.round((type === 1 ? 6 : 5) * density); i++) placeBody(rng, 'mediumPlanets', group, 25, 52);
            const largePlanetCount = type === 2 ? 1 : 2;
            for (let i = 0; i < largePlanetCount; i++) {
                placeBody(rng, 'largePlanets', group, 64, 115, type !== 2 && i === 0);
            }
        }
        if (type === 0) placeBody(rng, 'largePlanets', region, 85, 140, true);

        // The middle band gets the same kinds of scenery at reduced weight:
        // a soft galaxy, its haze, a scatter of unresolved smudges and a
        // handful of small bodies. No large planets and no anchors -- the
        // centre should read as depth behind the page, not as a subject.
        const midfieldRadius = midfield.radius * .8;
        add('galaxies', makeObject(rng, midfield.x, midfield.y, midfieldRadius, midfield.color, {
            sprite: galaxySprite(rng, midfield.color, midfieldRadius), alpha: .32, drift: 2,
            stretch: .6 + rng() * .35, haze: true
        }));
        add('smallPlanets', makeObject(rng, midfield.x, midfield.y, midfield.radius * 1.45, midfield.color, {
            sprite: lightSprite(midfield.color, 2), alpha: .085, stretch: .7, haze: true, drift: 3
        }));
        for (let i = 0; i < Math.round(8 * density); i++) {
            const p = around(rng, midfield, 1.35);
            const color = rng() < .7 ? midfield.color : chooseColor(rng);
            add('tinyDistant', makeObject(rng, p.x, p.y, 2.5 + rng() * 6.5, color, {
                sprite: lightSprite(color, 0), alpha: .13 + rng() * .38, drift: .7
            }));
        }
        for (let i = 0; i < Math.round(2 * density); i++) {
            const p = around(rng, midfield, 1.2);
            const microColor = chooseDeepColor(rng);
            const microRadius = 6 + rng() * 11;
            add('tinyDistant', makeObject(rng, p.x, p.y, microRadius, microColor, {
                sprite: galaxySprite(rng, microColor, microRadius), alpha: .07 + rng() * .13,
                stretch: .32 + rng() * .55, angle: rng() * TAU, drift: .32, haze: true
            }));
        }
        // Bodies are the expensive half of a system -- the planet tiers are
        // interactive, so each one is hit-tested every frame. The middle
        // gets a restrained handful; its density comes from the dust and
        // the unresolved smudges above, which are cheap.
        for (let i = 0; i < Math.round(5 * density); i++) placeBody(rng, 'smallPlanets', midfield, 6, 15);
        for (let i = 0; i < Math.round(3 * density); i++) placeBody(rng, 'mediumStars', midfield, 10, 22);
        for (let i = 0; i < Math.round(1 * density); i++) placeBody(rng, 'mediumPlanets', midfield, 22, 44);

        // Three systems per segment always leave holes between them, and a
        // hole in a star field reads as a rendering failure rather than as
        // space. Walk a jittered lattice over the segment; wherever a cell
        // lands outside every system's envelope, give it its own faint
        // scatter. Weighted toward baked stars because those cost nothing
        // per frame, so filling the gaps does not cost what the systems do.
        const systems = [region, companion, midfield];
        const columns = mobile ? 3 : 5, rows = 3;
        for (let column = 0; column < columns; column++) for (let row = 0; row < rows; row++) {
            const gapX = (column + randomRange(rng, .15, .85)) / columns * width;
            const gapY = top
                + (row + randomRange(rng, .15, .85)) / rows * segmentHeight;
            let covered = 0;
            for (const system of systems) {
                const dx = (gapX - system.x) / system.radius;
                const dy = (gapY - system.y) / (system.radius * system.flatten);
                covered = Math.max(covered, 1 - Math.min(1, Math.hypot(dx, dy) / 1.35));
            }
            // Anything already within reach of a system is left alone; the
            // rest fills in proportionally to how bare it actually is.
            if (covered > .3) continue;
            const emptiness = 1 - covered / .3;
            const patch = {
                x: gapX, y: gapY, radius: randomRange(rng, 110, 210),
                flatten: randomRange(rng, .6, 1)
            };
            for (let i = 0; i < Math.round(34 * density * emptiness); i++) {
                const p = around(rng, patch, 1.15);
                add('stars', makeObject(rng, p.x, p.y, .2 + rng() ** 1.9 * .8, chooseDeepColor(rng), {
                    alpha: .09 + rng() ** 1.8 * .5, drift: .6,
                    pulse: .2 + rng() * .35, staticField: true
                }));
            }
            for (let i = 0; i < Math.round(7 * density * emptiness); i++) {
                const p = around(rng, patch, 1.3);
                add('dust', makeObject(rng, p.x, p.y, .16 + rng() * .3, chooseDeepColor(rng),
                    { alpha: .03 + rng() * .1, drift: .5, pulse: .16 }));
            }
            // One unresolved smudge now and then, so a gap has something to
            // rest on rather than reading as evenly sprinkled noise.
            if (rng() < .55 * emptiness) {
                const p = around(rng, patch, .8);
                const color = chooseDeepColor(rng);
                const smudgeRadius = 4 + rng() * 9;
                add('tinyDistant', makeObject(rng, p.x, p.y, smudgeRadius, color, {
                    sprite: rng() < .5 ? galaxySprite(rng, color, smudgeRadius) : lightSprite(color, 0),
                    alpha: .07 + rng() * .18, stretch: .35 + rng() * .5,
                    angle: rng() * TAU, drift: .35, haze: true
                }));
            }
        }
    };

    // Segment N is seeded by N and sits at N * SEGMENT_HEIGHT, always. So the
    // sky is not a picture cut to fit the page -- it is one fixed universe the
    // page reveals as much of as it happens to need. Asking for more of it can
    // never disturb a single thing already placed above.
    let builtSegments = 0;
    const extendSceneTo = target => {
        if (!width) return false;
        const needed = Math.ceil(target / SEGMENT_HEIGHT);
        if (needed <= builtSegments) return false;
        for (; builtSegments < needed; builtSegments++) {
            buildSegment(builtSegments, builtSegments * SEGMENT_HEIGHT);
        }
        builtPageHeight = Math.max(builtPageHeight, builtSegments * SEGMENT_HEIGHT);
        finalizeTiers();
        return true;
    };
    const buildScene = () => {
        for (const tier of tierList) tier.objects = [];
        regions = [];
        builtSegments = 0;
        const mobile = width < 700;
        // Build past the current page so the height churn that content-visibility
        // causes while scrolling never has to reach for more sky.
        const sceneHeight = Math.max(builtPageHeight, pageHeight);
        for (; builtSegments < Math.ceil(sceneHeight / SEGMENT_HEIGHT); builtSegments++) {
            buildSegment(builtSegments, builtSegments * SEGMENT_HEIGHT);
        }
        // A few much bigger crops sell scale. Their hot center stays close to
        // the edge and their atmospheric envelope extends far beyond it.
        const rng = createSeededRandom(seedFor(0x4A551));
        const anchorCount = 1;
        for (let i = 0; i < anchorCount; i++) {
            const radius = randomRange(rng, 270, 430) * (mobile ? .56 : 1);
            // Which edge it crops against, and how far down, is part of the roll.
            const left = rng() < .5;
            const offset = radius * randomRange(rng, .015, .075);
            const color = chooseColor(rng);
            add('massivePlanets', makeObject(rng, left ? -offset : width + offset,
                sceneHeight * randomRange(rng, .08, .92), radius, color, {
                    alpha: .22, sprite: lightSprite(color, 2), drift: 2, pulse: .025, orbit: 0,
                    interactive: true
                }));
        }
        buildMotionSystems();
        // Compact, multi-core star clusters share one depth, so their haze and
        // individual lights stay together as the page moves.
        for (let i = 0; i < Math.min(7, Math.ceil(sceneHeight / 1100)); i++) {
            const clusterRng = createSeededRandom(seedFor(0x57A2C, i));
            const radius = randomRange(clusterRng, 60, 105) * (mobile ? .65 : 1);
            // A free column per cluster rather than a rotation through five
            // fixed ones -- any repeating stride is a pattern the eye picks up.
            const p = pickOpenPosition(clusterRng, width * randomRange(clusterRng, .12, .88),
                (i + randomRange(clusterRng, .1, .9)) * 1050, radius, 180);
            const color = chooseColor(clusterRng);
            add('clusterHaze', makeObject(clusterRng, p.x, p.y, radius * 1.8, color,
                { sprite: lightSprite(color, 2), alpha: .32, haze: true, drift: .5, orbit: 0 }));
            for (let j = 0; j < (mobile ? 42 : 78); j++) {
                const angle = clusterRng() * TAU;
                const distance = clusterRng() ** 1.5 * radius;
                const knot = j % 3 - 1;
                add('starClusters', makeObject(clusterRng,
                    p.x + Math.cos(angle) * distance + knot * radius * .22,
                    p.y + Math.sin(angle) * distance * .7 + knot * radius * .1,
                    .28 + clusterRng() ** 2 * 1.05, color,
                    { alpha: .18 + clusterRng() * .56, drift: .5, orbit: 0, pulse: .08 }));
            }
        }
        finalizeTiers();
        pressedSpace = null;
        // Anything holding a reference into the old scene is now pointing at a
        // world that no longer exists.
        for (const event of eventPool) if (event.body) { event.active = false; event.body = null; }
        resetStaticStarTiles();
    };

    // One band of baked deep field. A band is cut and kept only while the page
    // is near it, and dropped once it is not.
    //
    // Every one of these used to be cut at once, for the whole document, and
    // cut again from scratch each time a collection opened and the document
    // grew under it. A band is the width of the window by four hundred pixels
    // of page, which is a megabyte and a half of canvas; a long page with
    // every collection open carried thirty of them, all but four of which were
    // nowhere a reader could see, and threw all thirty away and cut thirty
    // more every time a row was pressed.
    //
    // What is drawn is unchanged -- the same stars, baked at the same size, in
    // the same place. Only how many of them are held at once has changed, and
    // it no longer has anything to do with how long the page is.
    //
    // A band the page has scrolled away from hands its canvas on to the next
    // one cut, rather than one being thrown away and another allocated for
    // every band a fast scroll passes -- a couple of dozen a second on a
    // quick flick down the page.
    const spareStarTiles = [];
    const staticStarTile = band => {
        const held = staticStarTiles.get(band);
        if (held) return held;
        if (!staticStarField) staticStarField = tiers.stars.objects.filter(object => object.staticField);
        if (!staticStarField.length || !width) return null;
        const start = band * staticStarTileHeight;
        const end = start + staticStarTileHeight;
        const tileWidth = Math.max(1, Math.ceil(width));
        let canvas = spareStarTiles.pop();
        if (!canvas || canvas.width !== tileWidth || canvas.height !== staticStarTileHeight) {
            canvas = document.createElement('canvas');
            canvas.width = tileWidth;
            canvas.height = staticStarTileHeight;
        }
        const tileContext = canvas.getContext('2d', { alpha: true });
        if (!tileContext) return null;
        tileContext.setTransform(1, 0, 0, 1, 0, 0);
        tileContext.clearRect(0, 0, tileWidth, staticStarTileHeight);
        tileContext.globalCompositeOperation = 'lighter';
        for (let i = lowerBound(staticStarField, start); i < staticStarField.length; i++) {
            const object = staticStarField[i];
            // Keep each star in exactly one tile. Duplicating stars at a
            // tile edge would make those few pixels visibly brighter.
            if (object.documentY >= end) break;
            tileContext.globalAlpha = object.alpha;
            tileContext.fillStyle = object.fillColor;
            tileContext.beginPath();
            tileContext.ellipse(
                object.x,
                object.documentY - start,
                object.radius,
                object.radius,
                0,
                0,
                TAU
            );
            tileContext.fill();
        }
        tileContext.globalAlpha = 1;
        const tile = { canvas, start, end };
        staticStarTiles.set(band, tile);
        return tile;
    };
    // The scene was rerolled, or there is nothing left to show it on: every
    // band cut from the old sky is now a picture of somewhere else.
    const resetStaticStarTiles = () => {
        galaxySweepAt = NaN;
        staticStarTiles.clear();
        spareStarTiles.length = 0;
        staticStarField = null;
        forgetBakedBands(false);
    };
    // The document outgrew the sky and more was laid down under it. Bands
    // already cut are untouched -- new sky only ever arrives below them -- so
    // only the list they are cut from has to be taken again.
    const restackStaticStarField = () => {
        galaxySweepAt = NaN;
        staticStarField = null;
        forgetBakedBands();
    };

    // ---- Dust and cluster stars, baked ------------------------------------
    //
    // The dust is the most numerous thing in the sky and the least visible:
    // motes smaller than a pixel, at three to fifteen per cent, each a
    // rectangle of its own. The stars of the clusters are the next most
    // numerous -- four hundred of them a frame over the busiest stretch of
    // the page -- and each is a disc, a path the graphics library takes one
    // at a time. Between them they were well over half of the drawing the
    // graphics process was handed for every frame of the sky, and on a 3x
    // laptop screen it is the graphics process, not the page, that runs out
    // of time first. Yet what either does between frames is next to nothing:
    // half a pixel of drift, a slow orbit of a few pixels over a couple of
    // minutes for the dust and none for the clusters, a twinkle of a few
    // levels.
    //
    // So each is drawn into bands of its own, at its own depth -- a band is a
    // strip of that tier's parallax plane, so it slides under the page at
    // exactly the rate each of its points did -- and the sky copies the bands
    // across, pixel for pixel: a few copies a frame instead of hundreds of
    // points. A band is drawn again every `rebake` seconds, so its points go
    // on drifting, orbiting and twinkling as they did, by what they move in
    // that time: a pixel or so of dust, and for a cluster star, drawn as it
    // is halfway through the time it will be shown, a twinkle within a
    // couple of levels of where it would be.
    //
    // Where light bends -- under the cursor, around a black hole, in a
    // ripple's ring -- nothing is copied: those patches are cut out of the
    // copy and their points drawn one by one as before, bent the same way
    // (see bakedLive). A fingertip in the sheet bends all of it, and all of
    // it is drawn as before.
    const BAKED_BAND = 384;
    // drawPoint draws one point as the tier loop does, stretched sideways by
    // `stretch` where light is bending it.
    const bakedTier = (tier, rebake, drawPoint) => ({ tier, rebake, drawPoint, bands: new Map(), spares: [] });
    const bakedTiers = [
        bakedTier(dustTier, 2, (target, x, y, radius, stretch) => {
            const side = radius * DUST_SIDE;
            target.fillRect(x - side * stretch / 2, y - side / 2, side * stretch, side);
        }),
        bakedTier(tiers.starClusters, .5, (target, x, y, radius, stretch) => {
            target.beginPath();
            target.ellipse(x, y, radius * stretch, radius, 0, 0, TAU);
            target.fill();
        })
    ];
    const forgetBakedBands = (keepSpares = true) => {
        for (const baked of bakedTiers) {
            baked.bands.clear();
            if (!keepSpares) baked.spares.length = 0;
        }
    };
    // Patches this frame where the tier being drawn is drawn point by point,
    // in CSS px.
    const bakedCuts = [];
    let bakedCutCount = 0;
    // The row a band starts at, in device pixels of its plane. Rounded once,
    // here, so neighbouring bands meet without a gap or an overlap.
    const bakedBandTop = band => Math.round(band * BAKED_BAND * pixelRatio);
    // Every band's canvas is the same size, so a band the page has scrolled
    // away from hands its canvas to the next one it arrives at rather than
    // the browser allocating a new one mid-scroll.
    const retireBakedBand = (baked, band) => {
        const held = baked.bands.get(band);
        baked.bands.delete(band);
        if (held && held.canvas && baked.spares.length < 2) baked.spares.push(held);
    };
    // `shift` is the part of a device pixel the plane sits off the screen's
    // own rows at the moment of drawing (see drawBakedTier), drawn into the
    // band so its points land where the sky would have put them.
    const bakeBand = (baked, band, time, shift) => {
        const top = bakedBandTop(band), rows = bakedBandTop(band + 1) - top;
        const columns = Math.ceil(width * pixelRatio), capacity = Math.ceil(BAKED_BAND * pixelRatio) + 1;
        const f = baked.tier.factor, objects = baked.tier.objects;
        // A couple of pixels past each edge of the band, so a point on the
        // line between two is drawn into both and each copies its own half.
        const from = (band * BAKED_BAND - 3) / f, to = ((band + 1) * BAKED_BAND + 3) / f;
        const first = lowerBound(objects, from);
        let held = baked.bands.get(band);
        // Nothing of this tier in the band: nothing to hold or copy.
        if (first >= objects.length || objects[first].documentY >= to) {
            if (held && held.canvas && baked.spares.length < 2) baked.spares.push(held);
            held = { band, top, rows, shift, bakedAt: time, canvas: null };
            baked.bands.set(band, held);
            return held;
        }
        if (!held || !held.canvas || held.canvas.width !== columns || held.canvas.height !== capacity) {
            held = baked.spares.pop();
            if (!held || held.canvas.width !== columns || held.canvas.height !== capacity) {
                const canvas = document.createElement('canvas');
                canvas.width = columns;
                canvas.height = capacity;
                held = { canvas, context: canvas.getContext('2d') };
            }
            baked.bands.set(band, held);
        }
        held.band = band; held.top = top; held.rows = rows; held.shift = shift;
        const bandContext = held.context;
        bandContext.setTransform(1, 0, 0, 1, 0, 0);
        bandContext.clearRect(0, 0, columns, capacity);
        bandContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, shift - top);
        bandContext.globalCompositeOperation = 'lighter';
        // Drawn as the points will be halfway through the time the band is
        // shown, which halves how far any of them is from where it would be.
        const at = time + baked.rebake / 2;
        const orbitSin = Math.sin(at * .055), orbitCos = Math.cos(at * .055);
        let lastFill = null;
        let inkLeft = columns, inkTop = capacity, inkRight = 0, inkBottom = 0;
        for (let i = first; i < objects.length && objects[i].documentY < to; i++) {
            const object = objects[i];
            // Exactly as the tier loop places and lights an undisturbed point,
            // in the tier's own plane instead of on the screen.
            const motion = Math.sin(at * object.speed + object.phase) * object.drift;
            const orbit = object.orbit ? (orbitSin * object.phaseCos + orbitCos * object.phaseSin) * object.orbit : 0;
            const alpha = object.alpha * (1 - object.pulse + Math.sin(at * object.speed * 3 + object.phase) * object.pulse);
            bandContext.globalAlpha = clamp(alpha, 0, 1);
            if (object.fillColor !== lastFill) bandContext.fillStyle = lastFill = object.fillColor;
            const x = object.x + motion + orbit, y = object.documentY * f + motion * .6;
            baked.drawPoint(bandContext, x, y, object.radius, 1);
            // Cluster bands are mostly transparent. Keep the exact device
            // pixel bounds (with antialiasing room) so compositing need not
            // blend the empty remainder of a full-width strip every frame.
            const reach = object.radius + 2;
            inkLeft = Math.min(inkLeft, Math.floor((x - reach) * pixelRatio));
            inkRight = Math.max(inkRight, Math.ceil((x + reach) * pixelRatio));
            inkTop = Math.min(inkTop, Math.floor((y - reach) * pixelRatio + shift - top));
            inkBottom = Math.max(inkBottom, Math.ceil((y + reach) * pixelRatio + shift - top));
        }
        held.inkLeft = Math.max(0, inkLeft); held.inkRight = Math.min(columns, inkRight);
        held.inkTop = Math.max(0, inkTop); held.inkBottom = Math.min(rows, inkBottom);
        held.bakedAt = time;
        return held;
    };
    // Whether a point at (x, y) on the screen, `reach` across, falls at all in
    // a patch cut out of the bands this frame. Those are drawn one by one,
    // bent as they are, and kept to the patches (see drawBakedPoints): a
    // point on a patch's edge shows its outside from the band and its inside
    // from here, and so is drawn exactly once.
    const bakedLive = (x, y, reach) => {
        for (let i = 0; i < bakedCutCount; i++) {
            const cut = bakedCuts[i];
            if (x + reach > cut.x0 && x - reach < cut.x1 && y + reach > cut.y0 && y - reach < cut.y1) return true;
        }
        return false;
    };
    // The points the tier loop found in the patches this frame, as it would
    // have drawn them, and the patches as rectangles that do not overlap, in
    // device pixels.
    const bakedPoints = [], bakedPointPool = [];
    const bakedPatches = [];
    let bakedPatchCount = 0;
    const drawBakedPoints = baked => {
        for (let r = 0; r < bakedPatchCount; r++) {
            const patch = bakedPatches[r];
            const x0 = patch.x0 / pixelRatio, y0 = patch.y0 / pixelRatio, x1 = patch.x1 / pixelRatio, y1 = patch.y1 / pixelRatio;
            context.save();
            context.setTransform(1, 0, 0, 1, 0, 0);
            context.beginPath();
            context.rect(patch.x0, patch.y0, patch.x1 - patch.x0, patch.y1 - patch.y0);
            context.clip();
            context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
            for (const point of bakedPoints) {
                const reach = point.radius * point.stretch * DUST_SIDE + 2;
                if (point.x + reach < x0 || point.x - reach > x1 || point.y + reach < y0 || point.y - reach > y1) continue;
                context.globalAlpha = point.alpha;
                context.fillStyle = point.color;
                baked.drawPoint(context, point.x, point.y, point.radius, point.stretch);
            }
            context.restore();
        }
        bakedPoints.length = 0;
    };
    const cutBaked = (x0, y0, x1, y1) => {
        if (x1 <= 0 || y1 <= 0 || x0 >= width || y0 >= height) return;
        const cut = bakedCuts[bakedCutCount] || (bakedCuts[bakedCutCount] = {});
        // Out to whole device pixels, where the copy is cut.
        cut.x0 = Math.floor(Math.max(0, x0) * pixelRatio) / pixelRatio;
        cut.y0 = Math.floor(Math.max(0, y0) * pixelRatio) / pixelRatio;
        cut.x1 = Math.ceil(Math.min(width, x1) * pixelRatio) / pixelRatio;
        cut.y1 = Math.ceil(Math.min(height, y1) * pixelRatio) / pixelRatio;
        bakedCutCount++;
    };
    // Copies a baked tier across for this frame and says whether it did; when
    // it did not, every point is drawn as it always was.
    const drawBakedTier = (baked, time, lightDisturbed) => {
        bakedCutCount = 0;
        bakedPatchCount = 0;
        if (touchWells.length) return false;
        const f = baked.tier.factor;
        // Where light is bending, with room for a point's drift and orbit
        // since its band was last drawn, and for how far it is bent. The
        // cursor bends light within 138px (disturbLight); a hole within 1.35
        // of its radius, by up to 9px, what lies deeper than it; a ripple
        // along a ring 30px deep.
        if (lightDisturbed) {
            for (let i = 0; i < pusherCount; i++) {
                const push = pushers[i];
                cutBaked(push.lx - 152, push.ly - 152, push.lx + 152, push.ly + 152);
            }
            for (const ripple of ripples) {
                if (!ripple.active) continue;
                const reach = ripple.radius + 44, cy = ripple.y - scrollPosition;
                cutBaked(ripple.x - reach, cy - reach, ripple.x + reach, cy + reach);
            }
        }
        if (width >= 700) for (const hole of projectedHoles) {
            if (f >= hole.parallaxFactor) continue;
            const reach = hole.radius * 1.35 + 24;
            cutBaked(hole.screenX - reach, hole.screenY - reach, hole.screenX + reach, hole.screenY + reach);
        }
        // How far down the screen the plane's first row sits, in device
        // pixels. Bands are copied to whole rows, so as not to be resampled,
        // and each was drawn with the part of a row the plane sat off by when
        // it was drawn; a band is put where that leaves its points nearest to
        // where they belong -- exactly there, once the page is at rest.
        const exact = (height / 2 - (scrollPosition + height / 2) * f) * pixelRatio;
        const shift = exact - Math.floor(exact);
        const settled = performance.now() - lastScrollAt > 200;
        const screenRows = canvas.height, screenColumns = canvas.width;
        const bandRows = BAKED_BAND * pixelRatio;
        const firstBand = Math.max(0, Math.floor((-exact - 4) / bandRows));
        const lastBand = Math.max(firstBand, Math.floor((screenRows - exact + 4) / bandRows));
        // Bands long gone from the window.
        if (baked.bands.size > lastBand - firstBand + 3) {
            for (const band of [...baked.bands.keys()]) if (band < firstBand - 1 || band > lastBand + 1) retireBakedBand(baked, band);
        }
        const stale = held => !held || held.top !== bakedBandTop(held.band)
            || held.canvas && held.canvas.width !== Math.ceil(width * pixelRatio);
        // The pieces of the screen outside every cut, in device pixels: the
        // screen split into slabs at each cut's top and bottom, and each slab
        // into the runs between the cuts that cross it.
        const edges = [0, screenRows];
        for (let i = 0; i < bakedCutCount; i++) {
            edges.push(Math.round(bakedCuts[i].y0 * pixelRatio), Math.round(bakedCuts[i].y1 * pixelRatio));
        }
        edges.sort((a, b) => a - b);
        const crossing = mid => {
            const spans = [];
            for (let i = 0; i < bakedCutCount; i++) {
                const cut = bakedCuts[i];
                if (mid >= cut.y0 && mid < cut.y1) spans.push(cut);
            }
            return spans.sort((a, b) => a.x0 - b.x0);
        };
        // The patches themselves, as the runs the cuts make across each slab,
        // run together where they overlap.
        for (let e = 0; e < edges.length - 1; e++) {
            const y0 = edges[e], y1 = edges[e + 1];
            if (y1 <= y0) continue;
            let run = null;
            for (const cut of crossing((y0 + y1) / 2 / pixelRatio)) {
                const cx0 = Math.round(cut.x0 * pixelRatio), cx1 = Math.round(cut.x1 * pixelRatio);
                if (run && cx0 <= run.x1) { run.x1 = Math.max(run.x1, cx1); continue; }
                run = bakedPatches[bakedPatchCount] || (bakedPatches[bakedPatchCount] = {});
                run.x0 = cx0; run.x1 = cx1; run.y0 = y0; run.y1 = y1;
                bakedPatchCount++;
            }
        }
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.globalAlpha = 1;
        // One band drawn a frame at most, beyond any the window needs this
        // frame, so the cost of keeping them moving is spread rather than
        // paid all at once.
        let drawn = false;
        for (let band = firstBand; band <= lastBand; band++) {
            let held = baked.bands.get(band);
            if (stale(held)) { held = bakeBand(baked, band, time, shift); drawn = true; }
            else if (!drawn && (time - held.bakedAt > baked.rebake
                || settled && held.canvas && Math.abs(exact - Math.round(exact - held.shift) - held.shift) > .15)) {
                held = bakeBand(baked, band, time, shift); drawn = true;
            }
            if (!held.canvas) continue;
            const bandTop = held.top + Math.round(exact - held.shift), bandBottom = bandTop + held.rows;
            const copy = (x, y, w, h) => {
                const right = Math.min(x + w, held.inkRight);
                const bottom = Math.min(y + h, bandTop + held.inkBottom);
                x = Math.max(x, held.inkLeft);
                y = Math.max(y, bandTop + held.inkTop);
                if (right > x && bottom > y) {
                    context.drawImage(held.canvas, x, y - bandTop, right - x, bottom - y,
                        x, y, right - x, bottom - y);
                }
            };
            // Slabs no cut crosses, run together and copied whole.
            let runTop = -1;
            for (let e = 0; e < edges.length - 1; e++) {
                const y0 = Math.max(edges[e], bandTop, 0), y1 = Math.min(edges[e + 1], bandBottom, screenRows);
                if (y1 <= y0) continue;
                const spans = crossing((y0 + y1) / 2 / pixelRatio);
                if (!spans.length) { if (runTop < 0) runTop = y0; continue; }
                if (runTop >= 0) { copy(0, runTop, screenColumns, y0 - runTop); runTop = -1; }
                // Runs across this slab between the cuts that cross it.
                let x = 0;
                for (const cut of spans) {
                    const cx0 = Math.round(cut.x0 * pixelRatio), cx1 = Math.round(cut.x1 * pixelRatio);
                    if (cx0 > x) copy(x, y0, cx0 - x, y1 - y0);
                    x = Math.max(x, cx1);
                }
                if (x < screenColumns) copy(x, y0, screenColumns - x, y1 - y0);
            }
            const runBottom = Math.min(bandBottom, screenRows);
            if (runTop >= 0 && runBottom > runTop) copy(0, runTop, screenColumns, runBottom - runTop);
        }
        // The band just past each edge of the window, drawn ahead of need
        // when this frame has drawn none, so a scroll arrives at a band that
        // is ready.
        if (!drawn) for (const band of [lastBand + 1, firstBand - 1]) {
            if (band >= 0 && stale(baked.bands.get(band))) { bakeBand(baked, band, time, shift); break; }
        }
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        return true;
    };

    const lowerBound = (objects, y) => {
        let lo = 0, hi = objects.length;
        while (lo < hi) {
            const middle = (lo + hi) >>> 1;
            if (objects[middle].documentY < y) lo = middle + 1;
            else hi = middle;
        }
        return lo;
    };
    const projectPosition = (x, documentY, factor, cameraX, cameraY) => ({
        x: x - cameraX * factor * factor * 10,
        y: (documentY - scrollPosition - height / 2) * factor + height / 2 - cameraY * factor * factor * 7
    });
    const prepareBlackHoles = (time, cameraX, cameraY) => {
        projectedHoles.length = 0;
        for (const hole of blackHoles) {
            const position = projectPosition(hole.x + Math.sin(time * .018 + hole.phase) * 3,
                hole.documentY, hole.parallaxFactor, cameraX, cameraY);
            if (position.y < -hole.radius * 2 || position.y > height + hole.radius * 2) continue;
            hole.screenX = position.x; hole.screenY = position.y;
            hole.disturbance = 0;
            for (let i = 0; i < pusherCount; i++) {
                const push = pushers[i];
                hole.disturbance = Math.max(hole.disturbance, push.gain
                    * Math.max(0, 1 - Math.hypot(push.lx - position.x, push.ly - position.y) / (hole.radius * 2.2)));
            }
            if (hole.clearance === undefined) {
                hole.clearance = clearanceAt(hole.x, hole.documentY, hole.radius * .8, protectedRects);
            }
            projectedHoles.push(hole);
        }
    };
    const capturePoint = (capture, progress, cameraX, cameraY) => {
        const hole = capture.hole;
        const center = projectPosition(hole.x + Math.sin(sceneTime * .018 + hole.phase) * 3,
            hole.documentY, hole.parallaxFactor, cameraX, cameraY);
        const angle = capture.angle + (progress * .35 + progress * progress * .65) * capture.turn;
        const radius = capture.radius * (1 - progress) ** 1.25;
        return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
    };
    const beginCapture = (hole, x, y, time, duration) => ({
        hole, started: time, duration, angle: Math.atan2(y - hole.screenY, x - hole.screenX),
        radius: Math.hypot(x - hole.screenX, y - hole.screenY),
        turn: (hole.angle < 0 ? -1 : 1) * TAU * 1.65
    });
    // `hole`: the black hole that threw these, if any -- they fly on its layer
    // while it has one (see drawHoleLayers).
    const emitDust = (x, y, count, color, speed = 65, vx = 0, vy = 0, hole = null) => {
        const limit = width < 700 ? 64 : particles.length;
        for (let i = 0; i < limit && count > 0; i++) {
            const particle = particles[i];
            if (particle.active) continue;
            const angle = Math.random() * TAU, velocity = speed * (.25 + Math.random());
            Object.assign(particle, { active: true, x, y: y + scrollPosition, vx: vx + Math.cos(angle) * velocity,
                vy: vy + Math.sin(angle) * velocity, life: 0, duration: 1 + Math.random() * 2.2,
                radius: .5 + Math.random() * 1.3, color: `rgb(${color})`, hole });
            count--;
        }
    };
    const addRipple = (x, y, strength = 1) => {
        const ripple = ripples.find(item => !item.active);
        if (ripple) Object.assign(ripple, { active: true, x, y: y + scrollPosition,
            started: sceneTime, strength, radius: 0 });
    };
    // Rebuilt once a frame rather than per body, so a thousand pieces of
    // scenery all read the same cursor and the same fingertips.
    const syncPushers = () => {
        pusherCount = 0;
        if (pointer.active && pusherCount < pushers.length) {
            const push = pushers[pusherCount++];
            push.x = pointer.sx;
            push.y = pointer.sy;
            push.lx = pointer.px; push.ly = pointer.py;
            push.vx = pointer.vx; push.vy = pointer.vy;
            // How fast this one is travelling is a fact about the cursor, not
            // about the star it is passing. It used to be worked out again for
            // every point of light in the sky -- a thousand square roots a
            // frame, all answering the same question.
            push.speed = Math.hypot(push.vx, push.vy);
            // The cursor smears and sparks the light it passes, but does not
            // drag bodies along behind it -- that stays a fingertip's job.
            push.carry = push.sag = push.sagReach = 0;
            push.gain = 1;
        }
        for (const well of touchWells) {
            if (well.depth <= .02 || pusherCount >= pushers.length) continue;
            const push = pushers[pusherCount++];
            push.x = push.lx = well.x; push.y = push.ly = well.y;
            push.vx = well.vx; push.vy = well.vy;
            push.speed = Math.hypot(push.vx, push.vy);
            // A finger pushes as hard as the cursor once its dent is set.
            push.gain = Math.min(1, well.depth / TOUCH_WELL_DEPTH);
            push.carry = .32;
            push.sag = well.depth;
            push.sagReach = well.reach * 1.15;
        }
    };
    const feedHole = (hole, x, y) => {
        hole.flare = 1;
        hole.busyAt = sceneTime;
        // Launch outside the horizon, otherwise gravity consumes every grain
        // on the same frame as the flare that created it.
        const count = width < 700 ? 9 : 22;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * TAU, dx = Math.cos(angle), dy = Math.sin(angle);
            emitDust(x + dx * hole.radius * .62, y + dy * hole.radius * .36,
                1, hole.color, 18, dx * 95, dy * 55, hole);
        }
    };
    const interactBody = (body, baseX, baseY, delta, time, cameraX, cameraY) => {
        // Offsets keep the seeded anchors and sorted culling intact. Only the
        // visible body moves; far-away scenery never enters the physics loop.
        const state = body.physics || (body.physics = {
            ox: 0, oy: 0, vx: 0, vy: 0, capture: null, respawnAt: 0, returnedAt: -10
        });
        state.x = baseX + state.ox; state.y = baseY + state.oy;
        state.scale = 1; state.alpha = 1;
        if (time < state.respawnAt) { state.alpha = 0; return state; }
        if (state.respawnAt) {
            state.ox = state.oy = state.vx = state.vy = 0;
            state.respawnAt = 0; state.returnedAt = time;
        }
        if (state.capture) {
            const progress = clamp((time - state.capture.started) / state.capture.duration, 0, 1);
            const p = capturePoint(state.capture, progress, cameraX, cameraY);
            state.x = p.x; state.y = p.y;
            // Falling in is motion something has to keep up with: the hole's
            // own layer if it is carrying this world (see drawHoleLayers),
            // otherwise the sky.
            const hole = state.capture.hole;
            hole.busyAt = time;
            if (!(hole.layer && liftable(hole, body.radius)) && openSky(state.x, state.y)) bodiesMoving = true;
            state.scale = 1 - progress * .94;
            state.alpha = 1 - smoothstep(clamp((progress - .42) / .58, 0, 1));
            if (progress >= 1) {
                state.capture = null; state.respawnAt = time + 14 + (Math.sin(body.phase) + 1) * 5;
            }
            return state;
        }
        const seconds = delta / 1000;
        let ax = -state.ox * .65, ay = -state.oy * .65;
        // Cursor and fingertips, same law. A gliding finger both shoves bodies
        // out of its way and drags them along in its wake; the sag underneath
        // it pulls them back down the slope, so a still finger gathers scenery
        // and a moving one sweeps it.
        for (let i = 0; i < pusherCount; i++) {
            const push = pushers[i];
            let dx = state.x - push.x, dy = state.y - push.y;
            let distance = Math.hypot(dx, dy);
            if (distance < .5) { dx = Math.cos(body.phase); dy = Math.sin(body.phase); distance = 1; }
            const reach = 155 + Math.min(105, body.radius * .62);
            if (distance < reach) {
                const influence = (1 - distance / reach) ** 2;
                const force = influence * 1280 * push.gain / (1 + body.radius / 150);
                ax += (dx / distance - dy / distance * .16) * force + push.vx * influence * push.carry;
                ay += (dy / distance + dx / distance * .16) * force + push.vy * influence * push.carry;
            }
            if (push.sag && distance < push.sagReach) {
                const slope = (1 - distance / push.sagReach) ** 2 * 380 * push.sag / (1 + body.radius / 190);
                ax += (-dx / distance + dy / distance * .24) * slope;
                ay += (-dy / distance - dx / distance * .24) * slope;
            }
        }
        let nearest = null, nearestRatio = Infinity;
        for (const hole of projectedHoles) {
            const dx = hole.screenX - state.x, dy = hole.screenY - state.y;
            const distance = Math.hypot(dx, dy);
            const ratio = distance / hole.radius;
            if (ratio < 1.8 && ratio < nearestRatio) { nearest = hole; nearestRatio = ratio; }
        }
        if (nearest && time - state.returnedAt > 3) {
            // Pulling a world in is feeding as much as swallowing it is.
            nearest.busyAt = time;
            const dx = nearest.screenX - state.x, dy = nearest.screenY - state.y;
            const distance = Math.max(1, Math.hypot(dx, dy));
            const strength = (1 - nearestRatio / 1.8) ** 2 * 520;
            ax += dx / distance * strength - dy / distance * strength * .14;
            ay += dy / distance * strength + dx / distance * strength * .14;
            if (nearestRatio < .82) {
                state.capture = beginCapture(nearest, state.x, state.y, time, 1.9 + body.radius / 100);
                return state;
            }
        }
        const damping = Math.exp(-2.2 * seconds);
        state.vx = (state.vx + ax * seconds) * damping;
        state.vy = (state.vy + ay * seconds) * damping;
        const speed = Math.hypot(state.vx, state.vy);
        if (speed > 250) { state.vx *= 250 / speed; state.vy *= 250 / speed; }
        // Ten pixels a second is two thirds of a pixel between frames at the
        // resting rate: below that a body springing back needs nothing faster.
        // A body being pulled into a hole that is feeding on a layer of its
        // own is drawn on that layer, which keeps up with it; see drawSky.
        state.near = nearest;
        if (speed > 10 && !(nearest && nearest.layer && liftable(nearest, body.radius))
            && openSky(state.x, state.y)) bodiesMoving = true;
        state.ox = clamp(state.ox + state.vx * seconds, -360, 360);
        state.oy = clamp(state.oy + state.vy * seconds, -360, 360);
        state.x = baseX + state.ox; state.y = baseY + state.oy;
        state.alpha = smoothstep(clamp((time - state.returnedAt) / 2.5, 0, 1));
        return state;
    };
    // The grid used to be a CSS background on its own element, which meant it
    // was the one part of the backdrop that could not bend -- a dead-straight
    // lattice sitting over a field that was visibly sagging. Drawing it here
    // puts it on the same sheet as everything else. It scrolls with the
    // document, so its horizontals are anchored in page space.
    const traceGridLine = (path, ax, ay, bx, by, span) => {
        // Straight through empty sheet; subdivided only where a dent actually
        // reaches the line. Subdividing every line everywhere would be a few
        // thousand points a frame for a lattice that is straight almost
        // everywhere.
        let start = 1, end = 0;
        for (const well of touchWells) {
            const along = span === 'y' ? well.y - ay : well.x - ax;
            const across = span === 'y' ? well.x - ax : well.y - ay;
            if (Math.abs(across) >= well.reach) continue;
            const half = Math.sqrt(well.reach * well.reach - across * across);
            const length = span === 'y' ? by - ay : bx - ax;
            start = Math.min(start, clamp((along - half) / length, 0, 1));
            end = Math.max(end, clamp((along + half) / length, 0, 1));
        }
        path.moveTo(ax, ay);
        if (start > end) { path.lineTo(bx, by); return; }
        const length = Math.hypot(bx - ax, by - ay);
        const steps = Math.max(2, Math.ceil(length * (end - start) / 11));
        path.lineTo(ax + (bx - ax) * start, ay + (by - ay) * start);
        for (let step = 1; step <= steps; step++) {
            const t = start + (end - start) * (step / steps);
            warped.x = ax + (bx - ax) * t;
            warped.y = ay + (by - ay) * t;
            warpPoint(warped, 1);
            path.lineTo(warped.x, warped.y);
        }
        path.lineTo(bx, by);
    };
    // Two densities, matching what the stylesheet drew before: a readable
    // major lattice and a much fainter minor one.
    const gridLayers = () => [
        [gridSpacing / 4, 'rgba(255,255,255,.0042)'],
        [gridSpacing, 'rgba(145,200,255,.0125)']
    ];
    // The lattice, stroked once and kept.
    //
    // It is two paths of a couple of hundred full-length lines, and a path
    // that size is more than the graphics library will draw on the GPU as it
    // stands: it rasterises a mask of the whole canvas on the processor
    // instead, and then uploads it. Measured on a 3x laptop screen, that was
    // fourteen milliseconds of processor time every frame the sky drew -- more
    // than everything else in the sky put together, thirty times a second,
    // for a lattice that is barely there and does not move. So it is stroked
    // into a sheet of its own, by the same paths at the same width, and the
    // sheet is laid on each frame as one image. Only a finger pressing into
    // the glass bends it, and only then is it traced and stroked live.
    //
    // The sheet is laid on the page's own background, painted in first, so a
    // frame starts by copying one opaque image rather than filling the
    // screen and then blending the lattice over it: one full-screen pass a
    // frame instead of two, to the same pixels.
    let gridSheet = null, gridSheetSignature = '';
    const gridSheetFor = () => {
        const signature = `${canvas.width}:${canvas.height}:${gridSpacing}:${pixelRatio}:${groundColor}`;
        if (gridSheet && gridSheetSignature === signature) return gridSheet;
        const sheet = gridSheet || document.createElement('canvas');
        sheet.width = canvas.width;
        sheet.height = canvas.height;
        const sheetContext = sheet.getContext('2d', { alpha: false });
        // Every pixel of it, the last part-covered column and row included.
        sheetContext.setTransform(1, 0, 0, 1, 0, 0);
        sheetContext.globalCompositeOperation = 'source-over';
        sheetContext.fillStyle = groundColor;
        sheetContext.fillRect(0, 0, sheet.width, sheet.height);
        sheetContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        sheetContext.globalCompositeOperation = 'lighter';
        sheetContext.lineWidth = 1;
        for (const [spacing, color] of gridLayers()) {
            const path = new Path2D();
            for (let x = 0; x <= width; x += spacing) { path.moveTo(x, 0); path.lineTo(x, height); }
            for (let y = 0; y <= height; y += spacing) { path.moveTo(0, y); path.lineTo(width, y); }
            sheetContext.strokeStyle = color;
            sheetContext.stroke(path);
        }
        gridSheet = sheet;
        gridSheetSignature = signature;
        return sheet;
    };
    // The page's background with the lattice on it, as the first thing in a
    // frame of the sky.
    const drawSkyGround = () => {
        if (!gridSpacing) {
            paintSkyGround();
            context.globalCompositeOperation = 'lighter';
            return;
        }
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.globalCompositeOperation = 'copy';
        context.globalAlpha = 1;
        context.drawImage(gridSheetFor(), 0, 0);
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        context.globalCompositeOperation = 'lighter';
        if (touchWells.length) {
            // Only the dents differ from the cached grid. Restore the ground
            // and stroke the original paths inside their union, avoiding a
            // viewport-sized path raster on every press/drag frame. Round the
            // clip out to device pixels so its edge cannot leave a seam.
            // Include the maximum displacement from every well: overlapping
            // wells and a fast drag can carry a line beyond a well's rim.
            // A traced segment spans at most 11px, plus stroke/AA coverage.
            let travel = 14;
            for (const well of touchWells) {
                travel += Math.abs(well.depth) * (well.reach * WELL_PULL * .93
                    + Math.max(Math.abs(well.vx), Math.abs(well.vy)) * .085);
            }
            context.save();
            context.setTransform(1, 0, 0, 1, 0, 0);
            context.beginPath();
            for (const well of touchWells) {
                const reach = well.reach + travel;
                const left = Math.max(0, Math.floor((well.x - reach) * pixelRatio));
                const top = Math.max(0, Math.floor((well.y - reach) * pixelRatio));
                const right = Math.min(canvas.width, Math.ceil((well.x + reach) * pixelRatio));
                const bottom = Math.min(canvas.height, Math.ceil((well.y + reach) * pixelRatio));
                if (right > left && bottom > top) context.rect(left, top, right - left, bottom - top);
            }
            context.clip();
            paintSkyGround();
            drawBackgroundGrid();
            context.restore();
        }
    };
    // The lattice alone, for a sheet a finger is pressing into: traced
    // through the dents and stroked live, over the ground already painted.
    const drawBackgroundGrid = () => {
        if (!gridSpacing) return;
        context.save();
        context.globalCompositeOperation = 'lighter';
        context.globalAlpha = 1;
        const wells = touchWells.filter(well => Math.abs(well.depth) > .012);
        // A finger is in the sheet: trace the lattice through the dents it
        // makes, fresh for this frame.
        for (const [spacing, color] of gridLayers()) {
            const path = new Path2D();
            // Both axes start at the viewport origin and step by a whole
            // module, so the lattice lands on the same pixels every frame
            // and cannot shimmer against its own 1px lines.
            for (let x = 0; x <= width; x += spacing) traceGridLine(path, x, 0, x, height, 'y');
            for (let y = 0; y <= height; y += spacing) traceGridLine(path, 0, y, width, y, 'x');
            context.lineWidth = 1;
            context.strokeStyle = color;
            context.stroke(path);
            // At rest the lattice is barely there, by design -- which would
            // also make the bend invisible, the one thing it is here to show.
            // So the sheet glows where it is stretched: the same path restroked
            // through the dent, lit by a gradient that dies at the rim, so the
            // brightening has no edge of its own. Reusing the path guarantees
            // the lit copy sits exactly on the faint one.
            for (const well of wells) {
                const strength = Math.min(1, Math.abs(well.depth));
                const lit = context.createRadialGradient(well.x, well.y, 0, well.x, well.y, well.reach);
                lit.addColorStop(0, `rgba(123, 168, 216, ${(strength * .3).toFixed(4)})`);
                lit.addColorStop(.45, `rgba(123, 168, 216, ${(strength * .17).toFixed(4)})`);
                lit.addColorStop(1, 'rgba(123, 168, 216, 0)');
                context.save();
                context.beginPath();
                context.arc(well.x, well.y, well.reach, 0, TAU);
                context.clip();
                context.strokeStyle = lit;
                context.stroke(path);
                context.restore();
            }
        }
        context.restore();
    };
    // The displacement alone is legible on a busy patch of sky and invisible
    // on an empty one. A faint rim -- brightest where the slope is steepest --
    // gives the depression an edge to read against in both cases, and the
    // rebound shows in it too: on release the ring inverts with the sheet.
    const drawTouchWells = () => {
        if (!touchWells.length || reducedMotion.matches) return;
        context.save();
        context.globalCompositeOperation = 'lighter';
        for (const well of touchWells) {
            const depth = Math.abs(well.depth);
            if (depth < .02) continue;
            // --blue, the section-label colour, so the light a touch gives off
            // belongs to the same palette as "OVERVIEW" rather than being a
            // second, unrelated blue.
            const rim = well.reach * (.58 + well.depth * .1);
            // The dent glows dimly from the bottom: brightest under the
            // fingertip, gone well before the rim.
            const core = context.createRadialGradient(well.x, well.y, 0, well.x, well.y, well.reach * .82);
            core.addColorStop(0, `rgba(123, 168, 216, ${(depth * .1).toFixed(4)})`);
            core.addColorStop(.42, `rgba(123, 168, 216, ${(depth * .042).toFixed(4)})`);
            core.addColorStop(1, 'rgba(123, 168, 216, 0)');
            context.fillStyle = core;
            context.beginPath();
            context.arc(well.x, well.y, well.reach * .82, 0, TAU);
            context.fill();
            // A broad, soft band along the slope rather than a drawn outline. A
            // crisp circle reads as an interface element sitting on top of the
            // scene; this has no edge anywhere, so it reads as the sheet
            // catching light where it bends most steeply.
            const gradient = context.createRadialGradient(well.x, well.y, rim * .2, well.x, well.y, rim * 1.5);
            gradient.addColorStop(0, 'rgba(123, 168, 216, 0)');
            gradient.addColorStop(.5, `rgba(123, 168, 216, ${(depth * .05).toFixed(4)})`);
            gradient.addColorStop(.74, `rgba(123, 168, 216, ${(depth * .028).toFixed(4)})`);
            gradient.addColorStop(1, 'rgba(123, 168, 216, 0)');
            context.fillStyle = gradient;
            context.beginPath();
            context.arc(well.x, well.y, rim * 1.5, 0, TAU);
            context.fill();
        }
        context.restore();
    };
    const disturbLight = (object, x, y, factor, time) => {
        warped.x = x; warped.y = y; warped.stretch = 1; warped.sink = 1;
        // Background light bends around a fingertip on the same terms as the
        // cursor, so the deep field responds to a glide too rather than only
        // the bodies in front of it.
        for (let i = 0; i < pusherCount; i++) {
            const push = pushers[i];
            const dx = push.lx - x, dy = push.ly - y, d2 = dx * dx + dy * dy;
            if (d2 >= 19000 || d2 <= 1) continue;
            const influence = (1 - d2 / 19000) ** 2 * push.gain;
            const speed = push.speed;
            warped.x += dx * influence * .1 + push.vx * influence * .006;
            warped.y += dy * influence * .1 + push.vy * influence * .006;
            warped.stretch += influence * Math.min(1.4, speed / 800);
            warped.sink += influence * .7;
            if (object.glint && speed > 850 && time > (object.sparkAt || 0)) {
                object.sparkAt = time + 1.3;
                emitDust(x, y, 2, object.color, 12, push.vx * .04, push.vy * .04);
            }
        }
        for (const ripple of ripples) {
            if (!ripple.active) continue;
            const dx = x - ripple.x, dy = y + scrollPosition - ripple.y;
            const distance = Math.max(1, Math.hypot(dx, dy));
            const push = Math.max(0, 1 - Math.abs(distance - ripple.radius) / 30) * 7 * ripple.strength;
            warped.x += dx / distance * push; warped.y += dy / distance * push;
        }
        return warped;
    };
    // One spark's step: its age, and the pull on it of the cursor, the black
    // holes and any ripple passing through. False once it has burnt out or
    // fallen in.
    const stepParticle = (particle, seconds) => {
        particle.life += seconds;
        if (particle.life > particle.duration) { particle.active = false; return false; }
        const sy = particle.y - scrollPosition;
        for (let i = 0; i < pusherCount; i++) {
            const push = pushers[i];
            const dx = push.lx - particle.x, dy = push.ly - sy, distance = Math.max(12, Math.hypot(dx, dy));
            if (distance >= 140) continue;
            const force = (1 - distance / 140) ** 2 * 90 * push.gain;
            particle.vx += (dx / distance * force + push.vx * .08) * seconds;
            particle.vy += (dy / distance * force + push.vy * .08) * seconds;
        }
        for (const hole of projectedHoles) {
            const dx = hole.screenX - particle.x, dy = hole.screenY - sy;
            const distance = Math.max(5, Math.hypot(dx, dy));
            if (distance < hole.radius * .26) { particle.active = false; return false; }
            if (distance < hole.radius * 2) {
                const force = 90 * (1 - distance / (hole.radius * 2));
                particle.vx += (dx - dy * .35) / distance * force * seconds;
                particle.vy += (dy + dx * .35) / distance * force * seconds;
            }
        }
        for (const ripple of ripples) {
            if (!ripple.active) continue;
            const dx = particle.x - ripple.x, dy = particle.y - ripple.y;
            const distance = Math.max(1, Math.hypot(dx, dy));
            const force = Math.max(0, 1 - Math.abs(distance - ripple.radius) / 28) * 230 * ripple.strength;
            particle.vx += dx / distance * force * seconds;
            particle.vy += dy / distance * force * seconds;
        }
        particle.x += particle.vx * seconds; particle.y += particle.vy * seconds;
        if (particle.hole) particle.hole.busyAt = sceneTime;
        return true;
    };
    const drawParticle = particle => {
        const sy = particle.y - scrollPosition;
        if (sy < navigationBottom || sy > height + 10) return;
        context.globalAlpha = (1 - particle.life / particle.duration) * .6
            * clearanceAt(particle.x, particle.y, 16, visibleRects);
        context.strokeStyle = particle.color; context.lineWidth = particle.radius;
        context.beginPath(); context.moveTo(particle.x, sy);
        context.lineTo(particle.x - particle.vx * .025, sy - particle.vy * .025); context.stroke();
    };
    const drawSimulation = (delta, time) => {
        const seconds = delta / 1000;
        for (const ripple of ripples) {
            if (!ripple.active) continue;
            const age = time - ripple.started;
            if (age > 1.8) { ripple.active = false; continue; }
            // A ring spreads at a hundred and twenty-five pixels a second.
            if (openSky(ripple.x, ripple.y - scrollPosition)) skyCrossing = true;
            ripple.radius = 12 + age * 125;
            context.globalAlpha = (1 - age / 1.8) ** 2 * .15 * ripple.strength;
            context.strokeStyle = '#aac9e5'; context.lineWidth = .7;
            // Small arcs respect content even when a ring crosses a card.
            for (let i = 0; i < 32; i++) {
                const angle = i / 32 * TAU, x = ripple.x + Math.cos(angle) * ripple.radius;
                const y = ripple.y - scrollPosition + Math.sin(angle) * ripple.radius;
                if (y < navigationBottom || clearanceAt(x, y + scrollPosition, 12, visibleRects) < .8) continue;
                context.beginPath(); context.arc(ripple.x, ripple.y - scrollPosition, ripple.radius, angle, angle + TAU / 33); context.stroke();
            }
        }
        for (const particle of particles) {
            if (!particle.active) continue;
            // A spark thrown by a hole that is feeding on a layer of its own
            // flies there, at that layer's pace -- see drawHoleLayers.
            if (particle.hole && particle.hole.layer) continue;
            if (!stepParticle(particle, seconds)) continue;
            // Sparks thrown off a meteor keep their own speed for a moment
            // after the meteor itself has gone out -- forty pixels a second, as
            // for anything else crossing the sky.
            if (particle.vx * particle.vx + particle.vy * particle.vy > 1600 && openSky(particle.x, particle.y - scrollPosition)) skyCrossing = true;
            drawParticle(particle);
        }
    };
    // One black hole: its disk, the knots travelling round it, and the flare
    // from whatever it last swallowed. Drawn into the sky, or into its own
    // layer while it is feeding (see drawHoleLayers) -- never both.
    const drawHole = (hole, delta) => {
        context.save();
        context.translate(hole.screenX, hole.screenY);
        context.rotate(hole.angle + Math.sin(sceneTime * .18 + hole.phase) * .025);
        context.scale(1 + hole.disturbance * .085, 1 - hole.disturbance * .04);
        // Source-over is essential: additive black cannot obscure a star.
        context.globalCompositeOperation = 'source-over';
        context.globalAlpha = .1 + hole.clearance * .9;
        context.fillStyle = '#000';
        context.beginPath(); context.arc(0, 0, hole.radius * .28, 0, TAU); context.fill();
        context.globalAlpha = .04 + hole.clearance * .86;
        const size = hole.radius * 2.6;
        context.drawImage(hole.sprite, -size / 2, -size / 2, size, size);
        context.globalCompositeOperation = 'lighter';
        // Travelling bright knots reveal rotation without spinning the disk plane.
        for (let i = 0; i < 5; i++) {
            const angle = sceneTime * (.32 + i * .017) + i * TAU / 5 + hole.phase;
            const r = hole.radius * (.46 + i * .055);
            const x = Math.cos(angle) * r, y = Math.sin(angle) * r * .27;
            context.globalAlpha = hole.clearance * (.3 + hole.disturbance * .2);
            context.drawImage(lightSprite(hole.color, 0), x - 6, y - 3, 12, 6);
        }
        if (hole.flare > .002) {
            context.globalAlpha = hole.flare * hole.clearance * .65;
            context.drawImage(lightSprite(hole.color, 2), -size * .65, -size * .25, size * 1.3, size * .5);
            // Faded by time rather than by frame -- the same half-second
            // fade the old thirty-frame loop gave it, at whatever pace the
            // hole is now drawn.
            hole.flare *= Math.exp(-delta / 540);
        }
        context.restore();
    };
    const drawBlackHoles = delta => {
        for (const hole of projectedHoles) if (!hole.layer) drawHole(hole, delta);
    };
    const drawOrbitingBodies = (delta, time, animated, cameraX, cameraY) => {
        for (const body of orbitingBodies) {
            const anchor = body.hole || body.region;
            if (animated) {
                body.angle += body.speed * delta / 1000;
                if (body.hole) {
                    body.orbitRadius -= delta * .00055;
                    if (body.orbitRadius < body.hole.radius * .25) body.orbitRadius = body.hole.radius * .94;
                }
            }
            const worldX = anchor.x + Math.cos(body.angle) * body.orbitRadius;
            const worldY = (anchor.documentY ?? anchor.y) + Math.sin(body.angle) * body.orbitRadius * .36;
            let p = projectPosition(worldX, worldY, body.hole ? anchor.parallaxFactor : .96, cameraX, cameraY);
            if (!body.hole && animated) p = interactBody(body, p.x, p.y, delta, time, cameraX, cameraY);
            if (p.y < -40 || p.y > height + 40) continue;
            const fade = body.hole ? smoothstep(clamp((body.orbitRadius / anchor.radius - .28) / .3, 0, 1))
                * smoothstep(clamp((.94 - body.orbitRadius / anchor.radius) / .1, 0, 1)) : 1;
            if (body.clearance === undefined) {
                body.clearance = clearanceAt(anchor.x, anchor.documentY ?? anchor.y, body.radius, protectedRects);
            }
            context.globalAlpha = (.035 + body.clearance * .38) * fade * (p.alpha ?? 1);
            const radius = body.radius * (p.scale ?? 1);
            context.drawImage(body.sprite, p.x - radius, p.y - radius, radius * 2, radius * 2);
        }
    };
    const drawPulsars = (time, cameraX, cameraY) => {
        for (const star of pulsars) {
            const p = projectPosition(star.x, star.documentY, star.factor, cameraX, cameraY);
            if (p.y < -40 || p.y > height + 40) continue;
            if (star.clearance === undefined) {
                star.clearance = clearanceAt(star.x, star.documentY, 35, protectedRects);
            }
            const alpha = (.3 + Math.sin(time * .42 + star.phase) * .12) * star.clearance;
            context.save();
            context.translate(p.x, p.y);
            context.rotate(time * .025 + star.phase);
            context.globalAlpha = alpha * .13;
            context.drawImage(star.sprite, -2, -32, 4, 64);
            context.globalAlpha = alpha;
            context.drawImage(star.sprite, -14, -14, 28, 28);
            context.restore();
        }
    };
    const eventPoint = (event, progress, cameraX, cameraY) => projectPosition(
        event.x + event.dx * progress,
        event.documentY + event.dy * progress + Math.sin(progress * Math.PI) * event.bend,
        event.factor, cameraX, cameraY
    );
    const tryCaptureEvent = (event, time, cameraX, cameraY, delta) => {
        if (event.capture || !['shootingStar', 'meteor', 'comet'].includes(event.type)) return;
        const progress = clamp((time - event.started) / event.duration, 0, 1);
        // Sweep the actual head segment, including between frames, so a fast
        // star cannot jump through a well. Both endpoints use today's camera.
        const p = eventPoint(event, Math.max(0, progress - delta / 1000 / event.duration), cameraX, cameraY);
        const q = eventPoint(event, progress, cameraX, cameraY);
        const vx = q.x - p.x, vy = q.y - p.y;
        const lengthSquared = vx * vx + vy * vy;
        let first = null, firstT = Infinity;
        for (const hole of projectedHoles) {
            const dx = p.x - hole.screenX, dy = p.y - hole.screenY;
            const reach = hole.radius * 1.12;
            let t = 0;
            if (dx * dx + dy * dy > reach * reach) {
                if (lengthSquared < .001) continue;
                const b = 2 * (dx * vx + dy * vy);
                const c = dx * dx + dy * dy - reach * reach;
                const discriminant = b * b - 4 * lengthSquared * c;
                if (discriminant < 0) continue;
                t = (-b - Math.sqrt(discriminant)) / (2 * lengthSquared);
                if (t < 0 || t > 1) continue;
            }
            if (t < firstT) { first = hole; firstT = t; }
        }
        if (first) event.capture = beginCapture(first, p.x + vx * firstT, p.y + vy * firstT,
            time, event.type === 'comet' ? 2.5 : 1.25);
    };
    const drawCapturedEvent = (event, time, cameraX, cameraY) => {
        const progress = clamp((time - event.capture.started) / event.capture.duration, 0, 1);
        const p = capturePoint(event.capture, progress, cameraX, cameraY);
        const alpha = event.alpha * smoothstep(clamp(progress / .08, 0, 1))
            * (1 - smoothstep(clamp((progress - .55) / .45, 0, 1)))
            * (.04 + .96 * clearanceAt(p.x, p.y + scrollPosition, 20, visibleRects));
        context.save();
        context.globalCompositeOperation = 'lighter';
        context.strokeStyle = `rgb(${event.color})`;
        context.lineWidth = event.type === 'meteor' ? 1.5 : .8;
        for (let i = 10; i > 0; i--) {
            const a = capturePoint(event.capture, Math.max(0, progress - i * .012), cameraX, cameraY);
            const b = capturePoint(event.capture, Math.max(0, progress - (i - 1) * .012), cameraX, cameraY);
            context.globalAlpha = alpha * (1 - i / 11);
            context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
        }
        context.globalAlpha = alpha;
        const radius = event.radius * (1 - progress * .95);
        context.drawImage(event.sprite, p.x - radius, p.y - radius, radius * 2, radius * 2);
        context.restore();
    };
    // Approach, descent, a stay on the surface, then liftoff and departure --
    // all measured along the one radial the site sits on. The anchor is the
    // world itself, so the lander rides its drift and parallax while it waits.
    // Two landers of opposing sides that come within sight of each other break
    // off and settle it first. Positions come from the previous frame, which is
    // a frame of latency nobody can see and saves a second projection pass.
    const LANDER_SIGHT = 320;
    const updateDuels = time => {
        for (const a of eventPool) {
            if (!a.active || a.type !== 'rocket' || a.duel || a.dead || a.sx === undefined) continue;
            for (const b of eventPool) {
                if (b === a || !b.active || b.type !== 'rocket' || b.duel || b.dead) continue;
                if (b.faction === a.faction || b.sx === undefined) continue;
                if (Math.hypot(a.sx - b.sx, a.sy - b.sy) > LANDER_SIGHT) continue;
                for (const [craft, foe] of [[a, b], [b, a]]) {
                    craft.duel = foe; craft.duelStart = time;
                    craft.fx = craft.sx; craft.fy = craft.sy;
                    craft.fvx = craft.fvy = 0;
                    craft.fireAt = randomRange(eventRandom, .25, 1.1);
                    craft.orbitDir = eventRandom() < .5 ? 1 : -1;
                }
                break;
            }
        }
    };
    const drawLander = (event, time, cameraX, cameraY, delta) => {
        const body = event.body;
        if (!body) { event.active = false; return; }
        const seconds = Math.min(delta / 1000, .05);
        const site = projectBody(body, time, cameraX, cameraY);
        // The world it came for has gone -- scrolled away, been eaten, or been
        // rebuilt underneath it. Nothing to land on, so the flight is over.
        if (!event.duel && !event.dead && (site.y < -260 || site.y > height + 260
            || (body.physics && (body.physics.capture || body.physics.respawnAt > time)))) {
            event.active = false; return;
        }
        const warm = event.faction === ALIEN ? '150,240,190' : '255,205,150';
        if (event.dead) {
            // A short bloom where it came apart, then the slot is free again.
            const age = time - event.dead;
            if (age > .9) { event.active = false; return; }
            context.save();
            context.globalCompositeOperation = 'lighter';
            context.globalAlpha = (1 - age / .9) ** 2 * .8;
            const r = 12 + age * 90;
            context.drawImage(lightSprite(warm, 2), event.sx - r, event.sy - r, r * 2, r * 2);
            context.restore();
            return;
        }
        let x, y, nose, thrust, alpha = 1, beacon = 0;
        if (event.duel) {
            const foe = event.duel;
            if (!foe.active || foe.dead || foe.duel !== event || time - event.duelStart > 14) {
                // Disengage: hand back to the landing arc, but blend out of the
                // free position so it does not snap onto the radial.
                event.duel = null;
                event.blendFrom = { x: event.sx, y: event.sy };
                event.blendAt = time;
                event.started = time - .26 * event.duration;
                event.puffed = false;
                return;
            }
            const dx = foe.fx - event.fx, dy = foe.fy - event.fy;
            const distance = Math.max(1, Math.hypot(dx, dy));
            // Hold a stand-off ring: pull hard when out of range, push apart
            // inside it, and only circle once the range is roughly right. The
            // orbit term has to fade with distance or the two spiral apart and
            // never trade a shot.
            const closing = clamp((distance - 130) / 130, -1, 1) * 90;
            const circling = 62 * Math.min(1, 170 / distance) * event.orbitDir;
            event.fvx += (dx / distance * closing - dy / distance * circling) * seconds;
            event.fvy += (dy / distance * closing + dx / distance * circling) * seconds;
            event.fvx += randomRange(eventRandom, -30, 30) * seconds;
            event.fvy += randomRange(eventRandom, -30, 30) * seconds;
            const speed = Math.hypot(event.fvx, event.fvy);
            if (speed > 105) { event.fvx *= 105 / speed; event.fvy *= 105 / speed; }
            event.fx += event.fvx * seconds; event.fy += event.fvy * seconds;
            event.fireAt -= seconds;
            if (event.fireAt <= 0 && distance < 260) {
                event.fireAt = randomRange(eventRandom, .5, 1.5);
                const bolt = event.bolts.find(item => item.life <= 0);
                if (bolt) {
                    const lead = distance / 320;
                    const aimX = foe.fx + foe.fvx * lead - event.fx;
                    const aimY = foe.fy + foe.fvy * lead - event.fy;
                    const aim = Math.max(1, Math.hypot(aimX, aimY));
                    bolt.x = event.fx; bolt.y = event.fy;
                    bolt.vx = aimX / aim * 320; bolt.vy = aimY / aim * 320;
                    bolt.life = .95;
                }
            }
            x = event.fx; y = event.fy;
            nose = Math.atan2(event.fvy, event.fvx);
            thrust = .5 + Math.min(.5, speed / 210);
            beacon = .35;
        } else {
            const progress = clamp((time - event.started) / event.duration, 0, 1);
            // Sink into the world as it arrives rather than parking a craft on
            // top of it: by touchdown it has faded out entirely, which at this
            // scale reads as a landing instead of a decal.
            const surface = site.radius * .34;
            const hover = site.radius * 1.5 + 46;
            let distance, facing;
            if (progress < .42) {
                const t = progress / .42;
                distance = event.entry + (hover - event.entry) * smoothstep(t);
                thrust = t > .55 ? (t - .55) / .45 * .85 : .12;
                facing = distance > hover + 2 ? 1 : 0;
            } else if (progress < .56) {
                // The descent proper: down onto the surface, shrinking and
                // dimming the whole way in.
                const t = (progress - .42) / .14;
                distance = hover + (surface - hover) * smoothstep(t);
                thrust = .6 + Math.sin(t * Math.PI) * .3;
                alpha = 1 - smoothstep(clamp((t - .45) / .55, 0, 1));
                facing = 0;
                if (t > .82 && !event.puffed) {
                    event.puffed = true;
                    emitDust(site.x + Math.cos(event.siteAngle) * site.radius * .6,
                        site.y + Math.sin(event.siteAngle) * site.radius * .6, 10, body.color, 24);
                }
            } else if (progress < .76) {
                // Down. Nothing to draw but the world it is sitting on.
                event.sx = site.x; event.sy = site.y;
                return;
            } else if (progress < .88) {
                const t = (progress - .76) / .12;
                distance = surface + (hover - surface) * smoothstep(t);
                thrust = 1;
                alpha = smoothstep(clamp(t / .5, 0, 1));
                facing = 0;
                if (event.puffed) {
                    event.puffed = false;
                    emitDust(site.x + Math.cos(event.siteAngle) * site.radius * .6,
                        site.y + Math.sin(event.siteAngle) * site.radius * .6, 14, warm, 54);
                }
            } else {
                const t = (progress - .88) / .12;
                distance = hover + (event.entry - hover) * t * t;
                thrust = .9;
                alpha = 1 - smoothstep(clamp((t - .5) / .5, 0, 1));
                facing = 1;
            }
            // Bend the radial slightly through the flight so it arcs in and out
            // rather than sliding up and down a rail.
            const angle = event.siteAngle + event.sweep * (1 - smoothstep(clamp(progress / .56, 0, 1)))
                + event.sweep * smoothstep(clamp((progress - .76) / .24, 0, 1));
            x = site.x + Math.cos(angle) * distance;
            y = site.y + Math.sin(angle) * distance;
            // Nose points away from the world while braking; on approach and
            // departure it points the way it is going.
            nose = angle + (facing ? Math.PI : 0);
            const settling = time - (event.blendAt || -10);
            if (settling < .9 && event.blendFrom) {
                const blend = smoothstep(settling / .9);
                x = event.blendFrom.x + (x - event.blendFrom.x) * blend;
                y = event.blendFrom.y + (y - event.blendFrom.y) * blend;
            }
            alpha *= smoothstep(clamp(progress / .06, 0, 1));
        }
        event.sx = x; event.sy = y;
        // Bolts live in screen space and only ever look for this craft's foe.
        for (const bolt of event.bolts) {
            if (bolt.life <= 0) continue;
            bolt.life -= seconds;
            bolt.x += bolt.vx * seconds; bolt.y += bolt.vy * seconds;
            const foe = event.duel;
            if (foe && foe.active && !foe.dead && Math.hypot(foe.fx - bolt.x, foe.fy - bolt.y) < 13) {
                bolt.life = 0; foe.hit = 1;
                if (--foe.hp <= 0) {
                    foe.dead = time; foe.duel = null; event.duel = null;
                    event.blendFrom = { x: event.sx, y: event.sy };
                    event.blendAt = time;
                    event.started = time - .26 * event.duration;
                    emitDust(foe.fx, foe.fy, 16,
                        foe.faction === ALIEN ? '150,240,190' : '255,205,150', 70);
                }
            }
            if (bolt.life <= 0) continue;
            context.save();
            context.globalCompositeOperation = 'lighter';
            context.globalAlpha = Math.min(1, bolt.life * 2.6);
            context.strokeStyle = event.faction === ALIEN ? '#7dffbe' : '#ffd9a0';
            context.lineWidth = 1.5;
            context.beginPath();
            context.moveTo(bolt.x, bolt.y);
            context.lineTo(bolt.x - bolt.vx * .035, bolt.y - bolt.vy * .035);
            context.stroke();
            context.restore();
        }
        if (x < -120 || x > width + 120 || y < -120 || y > height + 120) return;
        if (alpha < .01) return;
        const clearance = clearanceAt(x, y + scrollPosition, 26, visibleRects);
        drawCraft(event.design, x, y, nose, event.scale, thrust,
            alpha * (.1 + clearance * .9), beacon, time);
        if (event.hit > .01) {
            context.save();
            context.globalCompositeOperation = 'lighter';
            context.globalAlpha = event.hit * .9;
            context.drawImage(lightSprite('255,236,200', 1), x - 15, y - 15, 30, 30);
            context.restore();
            event.hit = Math.max(0, event.hit - seconds * 4);
        }
    };
    const drawDogfight = (event, time, cameraX, cameraY, delta) => {
        const progress = clamp((time - event.started) / event.duration, 0, 1);
        const anchor = projectPosition(event.x, event.documentY, event.factor, cameraX, cameraY);
        const seconds = Math.min(delta / 1000, .05);
        // Fade in, hold, fade out -- the fight is always already in progress.
        const envelope = smoothstep(clamp(progress / .12, 0, 1))
            * (1 - smoothstep(clamp((progress - .78) / .22, 0, 1)));
        const ships = event.ships, bolts = event.bolts;
        for (const ship of ships) {
            if (!ship.alive) { ship.wreck = Math.max(0, ship.wreck - seconds * .55); continue; }
            let target = null, nearest = Infinity;
            for (const other of ships) {
                if (!other.alive || other.faction === ship.faction) continue;
                const distance = Math.hypot(other.x - ship.x, other.y - ship.y);
                if (distance < nearest) { nearest = distance; target = other; }
            }
            if (target) {
                const dx = target.x - ship.x, dy = target.y - ship.y;
                const distance = Math.max(1, nearest);
                // Close to a stand-off ring and circle it, rather than closing
                // all the way in -- otherwise both fleets collapse to a point.
                // Circling fades with distance so stragglers rejoin the fight.
                const closing = clamp((distance - 78) / 78, -1, 1) * 74;
                const circling = 52 * Math.min(1, 110 / distance) * ship.orbit;
                ship.vx += (dx / distance * closing - dy / distance * circling) * seconds;
                ship.vy += (dy / distance * closing + dx / distance * circling) * seconds;
                ship.fireAt -= seconds;
                if (ship.fireAt <= 0 && distance < 210) {
                    ship.fireAt = randomRange(eventRandom, .55, 1.9);
                    const bolt = bolts.find(item => item.life <= 0);
                    if (bolt) {
                        // Lead the shot, so bolts converge on where the target
                        // is going rather than trailing behind it.
                        const speed = 300, lead = distance / speed;
                        const aimX = target.x + target.vx * lead - ship.x;
                        const aimY = target.y + target.vy * lead - ship.y;
                        const aim = Math.max(1, Math.hypot(aimX, aimY));
                        bolt.x = ship.x; bolt.y = ship.y;
                        bolt.vx = aimX / aim * speed; bolt.vy = aimY / aim * speed;
                        bolt.faction = ship.faction; bolt.life = .9;
                    }
                }
            }
            ship.vx += randomRange(eventRandom, -26, 26) * seconds;
            ship.vy += randomRange(eventRandom, -26, 26) * seconds;
            const speed = Math.hypot(ship.vx, ship.vy);
            if (speed > 95) { ship.vx *= 95 / speed; ship.vy *= 95 / speed; }
            ship.x += ship.vx * seconds; ship.y += ship.vy * seconds;
            if (speed > 4) ship.angle = Math.atan2(ship.vy, ship.vx);
            ship.flash = Math.max(0, (ship.flash || 0) - seconds * 4);
        }
        for (const bolt of bolts) {
            if (bolt.life <= 0) continue;
            bolt.life -= seconds;
            bolt.x += bolt.vx * seconds; bolt.y += bolt.vy * seconds;
            for (const ship of ships) {
                if (!ship.alive || ship.faction === bolt.faction) continue;
                if (Math.hypot(ship.x - bolt.x, ship.y - bolt.y) > 9) continue;
                bolt.life = 0; ship.flash = 1;
                if (--ship.hp <= 0) {
                    ship.alive = false; ship.wreck = 1;
                    emitDust(anchor.x + ship.x, anchor.y + ship.y, 12,
                        ship.faction === ALIEN ? '130,240,180' : '255,214,170', 58);
                }
                break;
            }
        }
        if (anchor.y < -220 || anchor.y > height + 220) return;
        const clearance = clearanceAt(anchor.x, anchor.y + scrollPosition, 110, visibleRects);
        const alpha = envelope * (.05 + clearance * .95);
        if (alpha < .01) return;
        context.save();
        for (const bolt of bolts) {
            if (bolt.life <= 0) continue;
            context.globalCompositeOperation = 'lighter';
            context.globalAlpha = alpha * Math.min(1, bolt.life * 2.6);
            context.strokeStyle = bolt.faction === ALIEN ? '#7dffbe' : '#ffd9a0';
            context.lineWidth = 1.4;
            context.beginPath();
            context.moveTo(anchor.x + bolt.x, anchor.y + bolt.y);
            context.lineTo(anchor.x + bolt.x - bolt.vx * .035, anchor.y + bolt.y - bolt.vy * .035);
            context.stroke();
        }
        for (const ship of ships) {
            const x = anchor.x + ship.x, y = anchor.y + ship.y;
            if (!ship.alive) {
                if (ship.wreck <= 0) continue;
                context.globalCompositeOperation = 'lighter';
                context.globalAlpha = alpha * ship.wreck * .5;
                context.drawImage(lightSprite(ship.faction === ALIEN ? '130,240,180' : '255,196,140', 2),
                    x - 26, y - 26, 52, 52);
                continue;
            }
            if (ship.faction === HUMAN) drawHumanShip(x, y, ship.angle, ship.size * 1.6, alpha);
            else if (ship.design === 1) drawAlienPod(x, y, ship.angle, ship.size * 1.5, .55, alpha, 0, time);
            else if (ship.design === 2) drawAlienDart(x, y, ship.angle, ship.size * 1.5, .55, alpha, 0, time);
            else drawAlienShip(x, y, ship.angle, ship.size * 1.6, alpha, time);
            if (ship.flash > .01) {
                context.globalCompositeOperation = 'lighter';
                context.globalAlpha = alpha * ship.flash;
                context.drawImage(lightSprite('255,236,200', 1), x - 14, y - 14, 28, 28);
            }
        }
        context.restore();
    };
    // ---- Shooting stars, on layers of their own ---------------------------
    //
    // A shooting star is the one thing in the sky that is both fast and
    // common: one is crossing about half the time, at up to three hundred
    // pixels a second, and it needs thirty frames a second to read as a streak
    // rather than a string of dots. Drawn into the sky, that was thirty frames
    // a second of the whole sky -- and of every sheet of glass on screen,
    // because a canvas that changes anywhere is a canvas the browser redraws
    // everywhere. On a 3x laptop screen, measured, a whole-sky frame cost the
    // same whether it moved one streak or all two thousand bodies.
    //
    // So each gets a small canvas of its own, just big enough for its head
    // and tail, carried along beneath it. The browser redraws only the patch
    // the streak is crossing, and the sky behind keeps its own slower pace. It
    // is drawn by exactly the code that drew it into the sky -- drawEventBody,
    // pointed at the layer -- so it is the same streak, placed on the page
    // instead of painted into the sky.
    //
    // Their paths are also steered off the glass (see chooseEventPath): a
    // streak behind a card makes the card frost itself again every frame,
    // which costs what a whole-sky frame costs, and under the frost it only
    // ever showed as a smudge.
    const STREAK_TYPES = new Set(['shootingStar']);
    const streakLayers = [];
    let lastLayerFrame = 0;
    // Everything a streak draws, around its head at `progress`: the tail back
    // along the path, the head and its glow, and the second trace a double
    // streak carries.
    const streakBox = (event, progress, box) => {
        const head = eventPoint(event, progress, 0, 0);
        const tail = eventPoint(event, progress - event.tail, 0, 0);
        let x0 = Math.min(head.x, tail.x), x1 = Math.max(head.x, tail.x);
        let y0 = Math.min(head.y, tail.y), y1 = Math.max(head.y, tail.y);
        if (event.variant === 'double') {
            const ex = head.x - 14 - event.dx * .1, ey = head.y + 9 - event.dy * event.factor * .1;
            x0 = Math.min(x0, head.x - 14, ex); x1 = Math.max(x1, head.x - 14, ex);
            y0 = Math.min(y0, head.y + 9, ey); y1 = Math.max(y1, head.y + 9, ey);
        }
        const pad = Math.max(event.radius || 0, event.variant === 'bright' ? 23 : 0) + 6;
        box.x0 = x0 - pad; box.y0 = y0 - pad; box.x1 = x1 + pad; box.y1 = y1 + pad;
        return box;
    };
    const scratchBox = { x0: 0, y0: 0, x1: 0, y1: 0 };
    const acquireStreak = event => {
        let layer = streakLayers.find(item => !item.event);
        if (!layer) {
            if (streakLayers.length >= 3) return;
            const element = document.createElement('canvas');
            element.className = 'galaxy-streak';
            element.setAttribute('aria-hidden', 'true');
            // Straight above the sky and under everything else on the page.
            (streakLayers.length ? streakLayers[streakLayers.length - 1].element : canvas).after(element);
            layer = { element, context: element.getContext('2d'), event: null, w: 0, h: 0, x: NaN, y: NaN };
            streakLayers.push(layer);
        }
        // Big enough for the streak at every point along its path, found by
        // walking it once.
        let w = 0, h = 0;
        for (let i = 0; i <= 16; i++) {
            streakBox(event, i / 16, scratchBox);
            w = Math.max(w, scratchBox.x1 - scratchBox.x0);
            h = Math.max(h, scratchBox.y1 - scratchBox.y0);
        }
        w = Math.ceil(w) + 2; h = Math.ceil(h) + 2;
        if (w > layer.w || h > layer.h) {
            layer.w = Math.max(w, layer.w); layer.h = Math.max(h, layer.h);
            layer.element.width = Math.ceil(layer.w * pixelRatio);
            layer.element.height = Math.ceil(layer.h * pixelRatio);
            layer.element.style.width = `${layer.w}px`;
            layer.element.style.height = `${layer.h}px`;
        }
        layer.event = event;
        event.layer = layer;
        layer.element.style.display = 'block';
    };
    const releaseStreak = layer => {
        if (layer.event) layer.event.layer = null;
        layer.event = null;
        layer.x = layer.y = NaN;
        layer.element.style.display = 'none';
    };
    // Every layer handed back, and forgotten at its old size: after a resize
    // or a change of quality the device ratio it was cut at may be stale.
    const resetStreaks = () => {
        for (const layer of streakLayers) {
            releaseStreak(layer);
            layer.w = layer.h = 0;
        }
    };
    const drawStreaks = (time, delta) => {
        // A streak on its own layer is not something the sky has to keep up
        // with; drawEventBody's say-so about that is for streaks in the sky.
        const crossing = skyCrossing;
        for (const layer of streakLayers) {
            const event = layer.event;
            if (!event) continue;
            // Black holes still catch shooting stars. A caught one is handed
            // back to the sky, which draws its fall.
            if (event.active) tryCaptureEvent(event, time, 0, 0, delta);
            if (!event.active || event.capture) { releaseStreak(layer); continue; }
            const progress = clamp((time - event.started) / event.duration, 0, 1);
            streakBox(event, progress, scratchBox);
            const x = Math.floor(scratchBox.x0), y = Math.floor(scratchBox.y0);
            if (x !== layer.x || y !== layer.y) {
                layer.element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
                layer.x = x; layer.y = y;
            }
            const layerContext = layer.context;
            layerContext.setTransform(1, 0, 0, 1, 0, 0);
            layerContext.clearRect(0, 0, layer.element.width, layer.element.height);
            layerContext.setTransform(pixelRatio, 0, 0, pixelRatio, -x * pixelRatio, -y * pixelRatio);
            context = layerContext;
            drawEventBody(event, time, 0, 0);
            finishSky(x, y, layer.w, layer.h, true);
            context = skyContext;
        }
        skyCrossing = crossing;
    };

    // A body's sprite, under whatever transform has already placed and turned
    // it. Bodies that carry dead margin hand over only the part of the sprite
    // that can still show (see trimSprite); a galaxy that handed its sheet back
    // while it was out of reach paints it again the first time it is drawn.
    const drawBodySprite = (object, radius) => {
        if (object.sprite.galaxy) restoreGalaxy(object.sprite);
        if (object.sw) {
            context.drawImage(object.sprite, object.sx, object.sy, object.sw, object.sh,
                radius * object.dx, radius * object.dy, radius * object.dw, radius * object.dh);
        } else {
            context.drawImage(object.sprite, -radius, -radius * object.stretch, radius * 2, radius * 2 * object.stretch);
        }
    };

    // ---- Black holes that are feeding, on layers of their own -------------
    //
    // A black hole in view is seldom idle. The worlds around it drift in and
    // are swallowed, a shooting star that strays too close spirals down, and
    // what falls in throws off a flare and a spray of sparks. All of it is
    // fast -- a swallowed world goes round a turn and a half in two seconds --
    // and all of it happens within a couple of hundred pixels of the hole.
    // Drawn into the sky, it held the whole sky at thirty frames a second for
    // as long as the hole was eating, which near a busy hole was always.
    //
    // So a hole feeding in open sky is lifted onto a small canvas of its own,
    // with everything it is swallowing and every spark it throws, and that
    // patch keeps thirty frames a second while the sky around it keeps its
    // resting pace. It is drawn by the same code in the same order -- the
    // sparks, then what it is swallowing, then the hole over all of it, its
    // horizon hiding what has gone in -- so it is the same hole, eating the
    // same way. Its disk was always laid over the sky rather than added to it,
    // so it looks no different from where it now sits.
    const holeLayers = [];
    // How big a feeding hole's layer has to be. A layer is redrawn and
    // recomposited in full every frame it draws, and any glass it overlaps is
    // frosted again with it, so it is cut to what is on it now: the hole's
    // own disk, every spark it has thrown, and each world it is pulling in or
    // has caught, measured where that world is -- not to the most any of them
    // could reach. It used to allow for the most: room for a spark's longest
    // flight whenever one was alive, and for the largest world anywhere in
    // the hole's pull. One of the great soft planets drifting near the hero's
    // hole held a layer of 1266 pixels square -- taller than the window, and
    // at 3x a bigger canvas than the whole sky -- redrawn thirty times a
    // second. Past HOLE_LAYER_MAX a layer costs more than the sky it spares,
    // so nothing is lifted onto one that could need more: the great planets
    // are left in the sky, and so are the greatest holes (see liftable and
    // manageHoleLayers). A spark that flies further is handed back to the sky.
    const HOLE_LAYER_MAX = 320;
    // Grown in whole steps, so sparks drifting outward grow it now and then
    // rather than every frame, with a little slack for how far anything on it
    // moves before it is measured again.
    const HOLE_STEP = 32, HOLE_SLACK = 12;
    const holeHalf = (hole, time) => {
        const hx = hole.screenX, hy = hole.screenY;
        let reach = hole.radius * 1.45;
        for (const particle of particles) {
            if (!particle.active || particle.hole !== hole) continue;
            // The spark and the short trail drawn behind it.
            reach = Math.max(reach, Math.hypot(particle.x - hx, particle.y - scrollPosition - hy) + 8);
        }
        for (const captive of hole.captives) {
            const capture = captive.object.physics && captive.object.physics.capture;
            if (capture) reach = Math.max(reach, capture.radius + captive.radius * 1.4 + 10);
        }
        for (const body of hole.approachers) {
            // Where drawHoleLayers will carry it to, at most.
            const ahead = Math.min(.25, Math.max(0, time - body.time));
            reach = Math.max(reach, Math.hypot(body.x + body.vx * ahead - hx, body.y + body.vy * ahead - hy)
                + body.radius * 1.4 + 10);
        }
        return Math.min(HOLE_LAYER_MAX, Math.ceil((reach + HOLE_SLACK) / HOLE_STEP) * HOLE_STEP);
    };
    // Whether a world of this size, anywhere in this hole's pull, fits on
    // its layer. The hole pulls from 1.8 of its radius out.
    const liftable = (hole, radius) => hole.radius * 1.8 + radius * 1.4 + 10 + HOLE_SLACK <= HOLE_LAYER_MAX;
    // Grown the moment it is too small, and cut back once it is well over
    // what it needs -- not on every small change, or it would be cutting a
    // fresh canvas every frame a spark flew outward.
    const sizeHoleLayer = (layer, half) => {
        if (half <= layer.half && half > layer.half * .7) return;
        layer.half = half;
        layer.element.width = Math.ceil(half * 2 * pixelRatio);
        layer.element.height = Math.ceil(half * 2 * pixelRatio);
        layer.element.style.width = layer.element.style.height = `${half * 2}px`;
    };
    const acquireHoleLayer = hole => {
        let layer = holeLayers.find(item => !item.hole);
        if (!layer) {
            if (holeLayers.length >= 2) return;
            const element = document.createElement('canvas');
            element.className = 'galaxy-streak';
            element.setAttribute('aria-hidden', 'true');
            // Over the sky and over any shooting star, as a hole always was.
            const last = holeLayers.length ? holeLayers[holeLayers.length - 1].element
                : streakLayers.length ? streakLayers[streakLayers.length - 1].element : canvas;
            last.after(element);
            layer = { element, context: element.getContext('2d'), hole: null, half: 0, x: NaN, y: NaN };
            holeLayers.push(layer);
        }
        sizeHoleLayer(layer, holeHalf(hole, sceneTime));
        layer.hole = hole;
        layer.fast = true;
        hole.layer = layer;
        layer.element.style.display = 'block';
    };
    const releaseHoleLayer = layer => {
        if (layer.hole) layer.hole.layer = null;
        layer.hole = null;
        layer.x = layer.y = NaN;
        layer.element.style.display = 'none';
    };
    const resetHoleLayers = () => {
        for (const layer of holeLayers) {
            releaseHoleLayer(layer);
            layer.half = 0;
        }
    };
    // Settled at the start of each sky frame, once the holes in view are
    // known: a hole that has stopped feeding, left the window or slid under
    // glass is handed back to the sky, which draws it in this same frame; one
    // that has started feeding in open sky is lifted off it, and its layer is
    // drawn in this same frame too. Either way it never shows twice, or not
    // at all.
    const manageHoleLayers = time => {
        const feeding = hole => time - (hole.busyAt ?? -Infinity) <= .8;
        for (const layer of holeLayers) {
            const hole = layer.hole;
            if (hole && (!projectedHoles.includes(hole) || !feeding(hole)
                || !openSky(hole.screenX, hole.screenY))) releaseHoleLayer(layer);
        }
        for (const hole of projectedHoles) {
            if (hole.captives) hole.captives.length = 0; else hole.captives = [];
            if (hole.approachers) hole.approachers.length = 0; else hole.approachers = [];
            // A hole too big for any layer to be worth it feeds in the sky.
            if (hole.radius * 1.45 + HOLE_SLACK > HOLE_LAYER_MAX) continue;
            if (!hole.layer && feeding(hole) && openSky(hole.screenX, hole.screenY)) acquireHoleLayer(hole);
        }
    };
    // A swallowed world, where its fall has got to by `time`: the sky handed
    // over its size and brightness, and the fall is worked out here.
    const drawCaptive = (captive, time, originX, originY) => {
        const object = captive.object;
        const capture = object.physics && object.physics.capture;
        if (!capture) return;
        const progress = clamp((time - capture.started) / capture.duration, 0, 1);
        const p = capturePoint(capture, progress, 0, 0);
        context.globalAlpha = clamp(captive.alpha * (1 - smoothstep(clamp((progress - .42) / .58, 0, 1))), 0, 1);
        const scaledCos = object.angleCos * pixelRatio, scaledSin = object.angleSin * pixelRatio;
        context.setTransform(scaledCos, scaledSin, -scaledSin, scaledCos,
            (p.x - originX) * pixelRatio, (p.y - originY) * pixelRatio);
        drawBodySprite(object, captive.radius * (1 - progress * .94));
    };
    const drawHoleLayers = (time, delta) => {
        const seconds = delta / 1000;
        for (const layer of holeLayers) {
            const hole = layer.hole;
            if (!hole) continue;
            sizeHoleLayer(layer, holeHalf(hole, time));
            const half = layer.half;
            const x = Math.floor(hole.screenX - half), y = Math.floor(hole.screenY - half);
            if (x !== layer.x || y !== layer.y) {
                layer.element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
                layer.x = x; layer.y = y;
            }
            const layerContext = layer.context;
            layerContext.setTransform(1, 0, 0, 1, 0, 0);
            layerContext.clearRect(0, 0, layer.element.width, layer.element.height);
            layerContext.setTransform(pixelRatio, 0, 0, pixelRatio, -x * pixelRatio, -y * pixelRatio);
            context = layerContext;
            context.globalCompositeOperation = 'lighter';
            // The sparks it threw. One that gets past the edge goes back to the
            // sky rather than being cut off by it.
            for (const particle of particles) {
                if (!particle.active || particle.hole !== hole) continue;
                if (!stepParticle(particle, seconds)) continue;
                const sy = particle.y - scrollPosition;
                if (particle.x < x + 6 || particle.x > x + half * 2 - 6 || sy < y + 6 || sy > y + half * 2 - 6) {
                    particle.hole = null;
                    continue;
                }
                drawParticle(particle);
            }
            // The worlds it is pulling in, carried on along the way they were
            // going when the sky last looked; then what it has caught.
            for (const body of hole.approachers) {
                const ahead = Math.min(.25, Math.max(0, time - body.time));
                const object = body.object;
                context.globalAlpha = clamp(body.alpha, 0, 1);
                const scaledCos = object.angleCos * pixelRatio, scaledSin = object.angleSin * pixelRatio;
                context.setTransform(scaledCos, scaledSin, -scaledSin, scaledCos,
                    (body.x + body.vx * ahead - x) * pixelRatio, (body.y + body.vy * ahead - y) * pixelRatio);
                drawBodySprite(object, body.radius);
            }
            for (const captive of hole.captives) drawCaptive(captive, time, x, y);
            context.setTransform(pixelRatio, 0, 0, pixelRatio, -x * pixelRatio, -y * pixelRatio);
            for (const event of eventPool) {
                if (!event.active || !event.capture || event.capture.hole !== hole) continue;
                hole.busyAt = time;
                drawCapturedEvent(event, time, 0, 0);
            }
            // And the hole over all of it, and the sky's shade over that.
            drawHole(hole, delta);
            finishSky(x, y, half * 2, half * 2, true);
            context = skyContext;
            // Whether anything on it moves fast enough to need the layer's
            // own pace: a world falling in, a spark, a caught star, a world
            // pulled faster than ten pixels a second. A world can sit near a
            // hole for as long as the page is open, held between its pull and
            // its spring home -- enough to keep the hole feeding and on its
            // layer, and nothing a frame of the sky's resting pace does not
            // keep up with (see interactBody). Then the layer is drawn with
            // the sky, and does not wake the page between.
            let fast = hole.captives.length > 0;
            if (!fast) for (const particle of particles) if (particle.active && particle.hole === hole) { fast = true; break; }
            if (!fast) for (const event of eventPool) if (event.active && event.capture && event.capture.hole === hole) { fast = true; break; }
            if (!fast) for (const body of hole.approachers) if (body.vx * body.vx + body.vy * body.vy > 100) { fast = true; break; }
            layer.fast = fast;
        }
    };

    // One event, drawn wherever `context` points. It is the main canvas for
    // everything but a shooting star that has a layer of its own, which is
    // drawn by exactly this code into its own small canvas -- see drawStreaks.
    const drawEventBody = (event, time, cameraX, cameraY) => {
        const progress = clamp((time - event.started) / event.duration, 0, 1);
        const stationary = stationaryEvent(event.type);
        const p = eventPoint(event, stationary ? 0 : progress, cameraX, cameraY);
        if (p.y < -150 || p.y > height + 150) return;
        const protection = stationary ? 85 : event.type === 'meteor' ? 50 : 20;
        const clearance = clearanceAt(p.x, p.y + scrollPosition, protection, visibleRects);
        const envelope = smoothstep(clamp(progress / (stationary ? .16 : .12), 0, 1))
            * (1 - smoothstep(clamp((progress - (stationary ? .2 : .72)) / (stationary ? .8 : .28), 0, 1)));
        const alpha = event.alpha * envelope * (.035 + clearance * .965);
        // Something is crossing the sky fast enough that the next frame has
        // to keep up with it: forty pixels a second is two a frame at the
        // resting rate, past which a streak starts to read as steps. A
        // shooting star crosses at nearly three hundred; a star sitting
        // still and pulsing, or a planet wandering in from the edge, does
        // not count -- see the pacing note above drawSky.
        if (!stationary && alpha > .02 && openSky(p.x, p.y)
            && Math.hypot(event.dx || 0, (event.dy || 0) * (event.factor || 1)) > 40 * event.duration) {
            skyCrossing = true;
        }
        context.save();
        context.globalCompositeOperation = 'lighter';
        if (['binaryStar', 'pulsar', 'cosmicFlare'].includes(event.type)) {
            context.globalAlpha = alpha;
            if (event.type === 'binaryStar') {
                for (let i = 0; i < 2; i++) {
                    const angle = time * .65 + i * Math.PI, r = 10 + i * 5;
                    const x = p.x + Math.cos(angle) * r, y = p.y + Math.sin(angle) * r * .5;
                    context.drawImage(event.sprite, x - 11, y - 11, 22, 22);
                }
            } else if (event.type === 'pulsar') {
                context.translate(p.x, p.y); context.rotate(time * .4);
                context.globalAlpha = alpha * (.3 + Math.sin(time * 4) ** 8 * .7);
                context.drawImage(event.sprite, -3, -58, 6, 116);
                context.drawImage(event.sprite, -14, -14, 28, 28);
            } else {
                const r = 10 + Math.sin(progress * Math.PI) ** 6 * 34;
                context.drawImage(event.sprite, p.x - r, p.y - r, r * 2, r * 2);
            }
        } else if (event.type === 'roguePlanet') {
            drawPlanet({ sprite: event.sprite, angle: .1 }, p.x, p.y, event.radius, alpha);
        } else if (event.type === 'satellite') {
            context.globalAlpha = alpha * (.4 + Math.sin(time * 2) ** 12 * .6);
            context.strokeStyle = '#b6bec8'; context.lineWidth = .6;
            context.strokeRect(p.x - 3, p.y - 1, 6, 2); context.fillStyle = '#dae0e6';
            context.fillRect(p.x - .6, p.y - 2, 1.2, 4);
        } else if (event.type === 'meteorShower') {
            for (let i = 0; i < 7; i++) {
                const t = (progress * 2.1 - i * .13);
                if (t < 0 || t > 1) continue;
                const q = eventPoint(event, t, cameraX, cameraY), offset = i * 11;
                context.globalAlpha = .3 * Math.sin(t * Math.PI) * clearanceAt(q.x, q.y + offset + scrollPosition, 18, visibleRects);
                context.strokeStyle = '#c0d4e6'; context.lineWidth = .55;
                context.beginPath(); context.moveTo(q.x, q.y + offset);
                context.lineTo(q.x - event.dx * .035, q.y + offset - event.dy * event.factor * .035); context.stroke();
            }
        } else if (stationary) {
            const radius = (event.type === 'supernova' ? 115 : 65) * (.55 + event.depth * .45);
            context.globalAlpha = alpha;
            context.drawImage(event.bloom, p.x - radius, p.y - radius, radius * 2, radius * 2);
            context.drawImage(event.sprite, p.x - 19, p.y - 19, 38, 38);
            if (event.type === 'supernova') {
                const flash = Math.exp(-(((progress - .18) / .055) ** 2));
                context.globalAlpha = alpha * (.25 + flash * .75);
                const core = 4 + flash * 42;
                context.drawImage(event.sprite, p.x - core, p.y - core, core * 2, core * 2);
                if (progress > .18) {
                    const shell = 8 + (progress - .18) * radius * 1.5;
                    context.globalAlpha = alpha * .38 * (1 - progress);
                    context.strokeStyle = `rgb(${event.color})`; context.lineWidth = 1.1;
                    context.beginPath(); context.arc(p.x, p.y, shell, 0, TAU); context.stroke();
                }
                if (progress > .19 && !event.burst) {
                    event.burst = true; emitDust(p.x, p.y, 26, event.color, 48); addRipple(p.x, p.y, .45);
                }
            }
            if (event.type === 'distantExplosion') {
                const ring = 4 + progress * radius * .55;
                context.globalAlpha = alpha * .19;
                context.strokeStyle = `rgb(${event.color})`;
                context.lineWidth = .65;
                context.beginPath(); context.arc(p.x, p.y, ring, 0, TAU); context.stroke();
            }
        } else {
            const comet = event.type === 'comet';
            const meteor = event.type === 'meteor';
            const segments = width < 700 ? 10 : 18;
            if (comet) {
                const tailLength = Math.hypot(event.dx, event.dy * event.factor) * event.tail;
                context.save();
                context.translate(p.x, p.y);
                context.rotate(Math.atan2(event.dy * event.factor, event.dx));
                context.globalAlpha = alpha;
                // Two soft tails: a narrow ion stream and a warmer, turbulent dust fan.
                context.drawImage(event.tailSprite, -tailLength, -18, tailLength, 36);
                for (let i = 0; i < 5; i++) {
                    context.globalAlpha = alpha * .18;
                    const offset = Math.sin(time * .7 + i * 1.7) * (3 + i * 2);
                    context.drawImage(event.tailSprite, -tailLength * (1 - i * .1), -20 + offset,
                        tailLength * (1 - i * .1), 48 + i * 3);
                }
                context.restore();
            } else for (let i = segments; i > 0; i--) {
                const behind = i / segments;
                const q = eventPoint(event, progress - event.tail * behind, cameraX, cameraY);
                const r = eventPoint(event, progress - event.tail * (i - 1) / segments, cameraX, cameraY);
                const pathClearance = clearanceAt(q.x, q.y + scrollPosition, protection, visibleRects);
                context.globalAlpha = alpha * (1 - behind) ** 1.7 * (.04 + pathClearance * .96);
                context.strokeStyle = `rgb(${event.color})`;
                context.lineWidth = (meteor ? 1.4 : .55) + event.depth * .8;
                context.lineCap = 'butt';
                context.beginPath(); context.moveTo(q.x, q.y); context.lineTo(r.x, r.y); context.stroke();
            }
            if (event.variant === 'double') {
                context.globalAlpha = alpha * .7; context.strokeStyle = `rgb(${event.color})`; context.lineWidth = .7;
                context.beginPath(); context.moveTo(p.x - 14, p.y + 9);
                context.lineTo(p.x - 14 - event.dx * .1, p.y + 9 - event.dy * event.factor * .1); context.stroke();
            }
            if (meteor && progress > .57 && !event.burst) {
                event.burst = true;
                emitDust(p.x, p.y, 16, event.color, 65, event.dx / event.duration * .35, event.dy * event.factor / event.duration * .35);
            }
            context.globalAlpha = alpha * 1.45 * (meteor && event.burst ? (1 - progress) : 1);
            context.drawImage(event.sprite, p.x - event.radius, p.y - event.radius, event.radius * 2, event.radius * 2);
            if (meteor || comet || event.variant === 'bright') {
                context.globalAlpha = alpha * .65;
                const glow = comet ? 48 : 23;
                context.drawImage(event.bloom, p.x - glow, p.y - glow, glow * 2, glow * 2);
            }
            if (meteor) for (let fragment = 0; fragment < (width < 700 ? 2 : 3); fragment++) {
                const q = eventPoint(event, progress - .035 * (fragment + 1), cameraX, cameraY);
                context.globalAlpha = alpha * .2;
                const offset = Math.sin(progress * 4 + fragment * 2) * (4 + progress * 9);
                context.drawImage(event.sprite, q.x - 3, q.y + offset - 3, 6, 6);
            }
        }
        context.restore();
    };
    const drawEvents = (time, cameraX, cameraY, delta) => {
        updateDuels(time);
        for (const event of eventPool) {
            if (!event.active) continue;
            if (event.type === 'rocket') {
                // A lander on its way down drifts at a dozen pixels a second,
                // which the resting rate carries without a visible step. One in
                // a fight -- circling at a hundred, firing bolts at three
                // hundred, or coming apart -- does not.
                if (event.duel || event.dead || event.bolts?.some(bolt => bolt.life > 0)) skyCrossing = true;
                drawLander(event, time, cameraX, cameraY, delta);
                continue;
            }
            if (event.type === 'dogfight') { skyCrossing = true; drawDogfight(event, time, cameraX, cameraY, delta); continue; }
            // A shooting star with a layer of its own is drawn there, at its own
            // pace, by drawStreaks -- never into the sky as well.
            if (event.layer) continue;
            tryCaptureEvent(event, time, cameraX, cameraY, delta);
            if (event.capture) {
                const hole = event.capture.hole;
                hole.busyAt = time;
                // A hole feeding on a layer of its own draws what it catches
                // there -- see drawHoleLayers.
                if (hole.layer) continue;
                if (projectedHoles.includes(hole) && openSky(hole.screenX, hole.screenY)) skyCrossing = true;
                drawCapturedEvent(event, time, cameraX, cameraY);
                continue;
            }
            drawEventBody(event, time, cameraX, cameraY);
        }
    };
    const drawStaticStarField = (cameraX, cameraY) => {
        if (reducedMotion.matches) return;
        const factor = tiers.stars.factor;
        const cameraOffsetX = cameraX * factor * factor * 10;
        const cameraOffsetY = cameraY * factor * factor * 7;
        // Which page a point on the screen shows, at this layer's depth. The
        // bands the window can reach are cut from that, once for the frame --
        // a dent's ring passes below re-blit the same tiles several times
        // over, and none of them should be deciding what to cut.
        const pageAt = screenY => (screenY - height / 2 + cameraOffsetY) / factor
            + height / 2 + scrollPosition;
        // Past each edge of the screen, because a band has to be cut before it
        // is wanted rather than as it arrives. A dent reaches much further
        // than that -- its rings are scaled toward the middle, so a ring shows
        // sky from up to three times its radius out -- but only a fingertip
        // makes one, so only a fingertip pays for the wider reach.
        const overscan = touchWells.length ? 520 : 200;
        const firstBand = Math.max(0, Math.floor(pageAt(-overscan) / staticStarTileHeight));
        const lastBand = Math.max(firstBand, Math.floor(pageAt(height + overscan) / staticStarTileHeight));
        const tiles = [];
        for (let band = firstBand; band <= lastBand; band++) {
            const tile = staticStarTile(band);
            if (tile) tiles.push(tile);
        }
        if (!tiles.length) return;
        // Bands the reader has left behind. One is held past each end, so a
        // scroll that rocks back and forth over a boundary is not recutting
        // the same band every other frame.
        if (staticStarTiles.size > tiles.length + 2) {
            for (const [band, tile] of [...staticStarTiles]) {
                if (band >= firstBand - 1 && band <= lastBand + 1) continue;
                staticStarTiles.delete(band);
                if (spareStarTiles.length < 3) spareStarTiles.push(tile.canvas);
            }
        }
        context.globalCompositeOperation = 'lighter';
        context.globalAlpha = 1;
        // minY/maxY cull in screen space. The full-field pass takes the
        // viewport; a ring pass takes only the band it can possibly draw into,
        // which keeps the warp from re-blitting tiles nowhere near the finger.
        const paintTiles = (minY = 0, maxY = height) => {
            for (const tile of tiles) {
                const top = (tile.start - scrollPosition - height / 2) * factor + height / 2 - cameraOffsetY;
                const scaledHeight = (tile.end - tile.start) * factor;
                if (top > maxY || top + scaledHeight < minY) continue;
                context.drawImage(tile.canvas, -cameraOffsetX, top, width, scaledHeight);
            }
        };
        const wells = touchWells.filter(well => Math.abs(well.depth) > .015);
        if (!wells.length) { paintTiles(); return; }

        // The deep field is thousands of pre-rasterized points, so it cannot be
        // displaced star by star. Paint it flat everywhere outside the dents...
        context.save();
        context.beginPath();
        context.rect(0, 0, width, height);
        for (const well of wells) {
            context.moveTo(well.x + well.reach, well.y);
            context.arc(well.x, well.y, well.reach, 0, TAU);
        }
        context.clip('evenodd');
        paintTiles();
        context.restore();

        // ...and inside each dent redraw the same tiles as concentric rings,
        // every ring scaled toward the centre by the sheet's displacement at
        // that radius. Seven bands is enough that the seams vanish in a field
        // of points, and it holds the whole warp to a few draws per finger.
        const rings = 7;
        for (const well of wells) {
            for (let ring = 0; ring < rings; ring++) {
                const outer = well.reach * (rings - ring) / rings;
                const inner = well.reach * (rings - ring - 1) / rings;
                const mid = (outer + inner) / 2;
                const pull = well.depth * wellProfile(mid / well.reach) * well.reach * WELL_PULL;
                const squeeze = clamp((mid - pull) / mid, .35, 1.6);
                // Under the scale, this band shows source content from a wider
                // radius than it occupies, so the cull has to cover where that
                // content comes from, not just where it lands.
                const span = well.reach / Math.min(squeeze, 1) + 2;
                context.save();
                context.beginPath();
                context.arc(well.x, well.y, outer, 0, TAU);
                context.moveTo(well.x + inner, well.y);
                context.arc(well.x, well.y, inner, 0, TAU);
                context.clip('evenodd');
                context.translate(well.x, well.y);
                context.scale(squeeze, squeeze);
                context.translate(-well.x, -well.y);
                paintTiles(well.y - span, well.y + span);
                context.restore();
            }
        }
    };
    // ---- Pacing -----------------------------------------------------------
    //
    // What a frame of this sky costs is not what it draws. Measured on a 3x
    // laptop screen: a frame that repaints nothing -- the canvas cleared and
    // left -- costs nine tenths of what a frame of two thousand bodies costs.
    // The canvas sits under the bar, the cards and the buttons, and a canvas
    // that changes anywhere is one the browser redraws everywhere: the whole
    // screen is composited again and every sheet of glass on it copies,
    // frosts and bends the sky behind it again. The drawing is cheap and the
    // frame is not, so frames are what is saved, and each rate below is set by
    // what the eye can actually follow.
    //
    //   aimed     a finger on the glass, the cursor bending the light, a page
    //             being scrolled -- sixty, or thirty on a machine that could
    //             not hold sixty (see applyRates).
    //   crossing  something crossing the sky under its own speed, in the sky
    //             itself: a meteor, a comet, the sparks off one, a ripple
    //             spreading, a lander in a fight, a pushed body springing
    //             back -- thirty, or twenty-four on a phone. Shooting stars
    //             are not among them: they have layers of their own and need
    //             nothing of the sky at all (see drawStreaks).
    //   rest      the sky's own drift. The fastest thing in it, a moon, covers
    //             six pixels a second, and the brightest star swings through
    //             its twinkle in a couple of seconds: a fraction of a pixel and
    //             a few levels of brightness between frames at fifteen. Where
    //             the window is mostly glass the frames cost twice as much, and
    //             most of the sky they draw is under frost, where no drift or
    //             twinkle survives -- so the rest rate comes down with the
    //             glass, fifteen over open sky and ten with the window covered.
    //
    // Between frames the loop sleeps on a timer. It used to ask for every
    // display frame and turn most of them down, and a page that wakes sixty
    // times a second to do nothing still keeps the machine from resting.
    //
    // The frames keep a beat: each rate is a whole number of display frames
    // at 60Hz (and so at 120Hz and 240Hz), and every frame is drawn as of
    // the time on its beat. A frame asked for from a timer is answered at
    // once, as the display frame already under way; one asked for from inside
    // a frame is answered with the next display frame. So there are two ways
    // to wake for a frame, and the page uses both.
    //
    //   steady  Anything fast on screen -- a shooting star, a feeding hole, a
    //           meteor, a cursor -- has to reach the screen on an even
    //           rhythm, or it stutters. The timer wakes a little early, is
    //           handed the frame under way, finds it not yet due and asks
    //           again from inside it, and is handed the due frame. That is
    //           one wake with nothing to draw for every frame drawn; measured,
    //           it is what keeps thirty frames a second arriving two display
    //           frames apart, every time.
    //   loose   With only the sky's own drift left -- nothing moving faster
    //           than a few pixels a second -- a frame that reaches the screen
    //           a display frame early does not show. The timer wakes just
    //           before the due frame and takes whichever of the two the
    //           browser hands back, and the wake that drew nothing is saved.
    //
    // The layers keep the sky's beat whenever they are drawn with it, so the
    // two go on drawing in the same frames rather than one display frame
    // apart: one frame of the whole screen instead of two.
    let lastTick = 0, wakeTimer = 0;
    const DISPLAY_FRAME = 1000 / 60;
    const STEADY = { lead: 12, early: 2 }, LOOSE = { lead: 3, early: DISPLAY_FRAME * 1.25 };
    let pace = STEADY;
    const onBeat = interval => Math.max(1, Math.round(interval / DISPLAY_FRAME)) * DISPLAY_FRAME;
    // Where the last frame of the sky, and of the layers over it, belonged.
    let skyBeat = 0, layerBeat = 0;
    const nextBeat = (beat, gap, timestamp) => {
        const due = beat + gap;
        return timestamp - due <= gap / 2 + 1 ? due : timestamp;
    };
    // Whether a body the cursor pushed, or one a black hole is swallowing, was
    // still visibly on the move in the last sky frame. Set by interactBody.
    let bodiesMoving = false;
    // The share of the window under glass, and the scroll it was measured at.
    let glassCoverage = 0, coverageScroll = NaN;
    const measureGlassCoverage = () => {
        coverageScroll = scrollPosition;
        const top = scrollPosition, bottom = scrollPosition + height;
        let covered = 0;
        for (const rect of glassRects) {
            const tall = Math.min(rect.bottom, bottom) - Math.max(rect.top, top);
            if (tall <= 0) continue;
            const wide = Math.min(rect.right, width) - Math.max(rect.left, 0);
            if (wide > 0) covered += wide * tall;
        }
        // The bar floats over the top of the window once the page has moved.
        if (document.body.classList.contains('has-scrolled')) covered += width * navigationBottom * .8;
        glassCoverage = clamp(covered / Math.max(1, width * height), 0, 1);
    };
    // A window the visitor has left for another -- the page still showing, the
    // work going on somewhere else -- rests at no more than ten frames a
    // second, and leaves the machine to what it is being used for. The
    // moment it is back in front, so is the full rate.
    let windowFocused = document.hasFocus();
    const restInterval = () => {
        const covered = clamp((glassCoverage - .1) / .3, 0, 1);
        const fps = restFps - covered * (restFps - restFpsCovered);
        return 1000 / (windowFocused ? fps : Math.min(fps, restFpsCovered));
    };
    const skyAimed = () => touchWells.length || (pointer.active && pointer.speed > 120)
        || performance.now() - lastScrollAt < 160;
    const skyInterval = () => skyAimed() ? aimedInterval
        : skyCrossing || bodiesMoving ? frameInterval : restInterval();
    // Sleep until `pace.lead` before `dueAt` (a time on the beat), then take
    // a frame. Anything that needs the sky sooner calls requestDraw, which
    // cuts the sleep short.
    const scheduleFrame = dueAt => {
        if (animationFrame || wakeTimer || sleeping || document.hidden || quality !== 'high') return;
        const wait = dueAt - pace.lead - performance.now();
        if (wait > 1) {
            wakeTimer = window.setTimeout(() => {
                wakeTimer = 0;
                if (!animationFrame) animationFrame = requestAnimationFrame(draw);
            }, wait);
        } else animationFrame = requestAnimationFrame(draw);
    };

    // The page's background, painted in under the sky instead of showing
    // through it, and the veil the stylesheet used to lay over the sky as an
    // element of its own. Measured in the layout pass.
    let groundColor = '#080808', veilAlpha = .8, veilPageHeight = 0;
    const paintSkyGround = () => {
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        context.globalCompositeOperation = 'source-over';
        context.globalAlpha = 1;
        context.fillStyle = groundColor;
        context.fillRect(0, 0, width, height);
    };
    // The shade laid over the finished sky: the canvas used to sit at 94%
    // over the page's background, so six per cent of that background goes
    // back over it; and the veil the stylesheet drew ran the length of the
    // page, not the window -- one shadow centred a little above the middle of
    // the page, one at its middle, both ellipses stretched to its farthest
    // corner, each clear to a point and darkening to its rim and beyond.
    //
    // All three were painted over the whole sky every frame, the two shadows
    // as radial gradients: three passes over every pixel of the sky, for a
    // shade that never changes and only slides as the page scrolls. They are
    // worked out once, for the length of the page, as one image of the shade
    // they make together, and each frame lays on the slice the window is
    // looking at: one pass. The shade is a slow curve across hundreds of
    // pixels, so the image holds it at one texel in SHADE_STEP and is smoothed
    // back up to the full size as it is laid on; what it gives is within a
    // level of the three passes it replaces.
    const SHADE_STEP = 8;
    let shadeSheet = null, shadeSignature = '';
    const shadeSheetFor = () => {
        const page = veilPageHeight || height;
        const signature = `${width}:${page}:${veilAlpha}:${groundColor}`;
        if (shadeSheet && shadeSignature === signature) return shadeSheet;
        const columns = Math.ceil(width / SHADE_STEP) + 1, rows = Math.ceil(page / SHADE_STEP) + 1;
        const sheet = shadeSheet || document.createElement('canvas');
        sheet.width = columns;
        sheet.height = rows;
        const sheetContext = sheet.getContext('2d');
        const image = sheetContext.createImageData(columns, rows);
        const data = image.data;
        // The ground's colour, as the fraction of full each channel is.
        sheetContext.fillStyle = groundColor;
        const ground = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(sheetContext.fillStyle);
        const [gr, gg, gb] = ground ? [1, 2, 3].map(i => parseInt(ground[i], 16) / 255) : [8 / 255, 8 / 255, 8 / 255];
        // Each shadow as the gradient drew it: clear out to `from` of the way
        // to its rim, darkening evenly from there to `alpha` at the rim.
        const shadow = (t, from, alpha) => veilAlpha * alpha * clamp((t - from) / (1 - from), 0, 1);
        const cx = width / 2, cy1 = page * .45, cy2 = page * .5;
        const rx1 = width * .5 * 1.5792, ry1 = page * .45 * 1.5792;
        const rx2 = width * .5 * Math.SQRT2, ry2 = page * .5 * Math.SQRT2;
        for (let row = 0; row < rows; row++) {
            const y = (row + .5) * SHADE_STEP;
            for (let column = 0; column < columns; column++) {
                const x = (column + .5) * SHADE_STEP;
                const a1 = shadow(Math.hypot((x - cx) / rx1, (y - cy1) / ry1), .25, .18);
                const a2 = shadow(Math.hypot((x - cx) / rx2, (y - cy2) / ry2), .42, .34);
                // The ground at six per cent, then each shadow over it: what
                // is left of the sky, and what the ground adds on top.
                const kept = (1 - a1) * (1 - a2);
                const alpha = 1 - .94 * kept;
                const i = (row * columns + column) * 4;
                // Unpremultiplied, as image data is: the ground's share over
                // the shade's own opacity.
                const tint = .06 * kept / alpha;
                data[i] = Math.round(gr * tint * 255);
                data[i + 1] = Math.round(gg * tint * 255);
                data[i + 2] = Math.round(gb * tint * 255);
                data[i + 3] = Math.round(alpha * 255);
            }
        }
        sheetContext.putImageData(image, 0, 0);
        shadeSheet = sheet;
        shadeSignature = signature;
        return sheet;
    };
    // Laid over the finished sky, and over each layer above it: a layer
    // passes (x, y, w, h), where it sits on the screen and how big it is, and
    // `atop`, which keeps the shade to what the layer has drawn. What a
    // shooting star or a feeding hole draws was under this shade when it was
    // drawn into the sky -- up to a fifth darker at the top and foot of the
    // page -- and has to be under it still on a layer of its own, or it comes
    // out brighter than it did. Darkening only the layer's own pixels, by the
    // same amount at the same place, gives exactly what the sky gave it; the
    // sky under the layer has had its shade already.
    const finishSky = (x = 0, y = 0, w = canvas.width / pixelRatio, h = canvas.height / pixelRatio, atop = false) => {
        context.setTransform(pixelRatio, 0, 0, pixelRatio, -x * pixelRatio, -y * pixelRatio);
        context.globalCompositeOperation = atop ? 'source-atop' : 'source-over';
        context.globalAlpha = 1;
        // The slice of the page's shade under (x, y, w, h), from the sheet, to
        // the canvas's last part-covered column and row.
        const left = Math.max(0, x), top = Math.max(0, y);
        const right = Math.min(canvas.width / pixelRatio, x + w), bottom = Math.min(canvas.height / pixelRatio, y + h);
        if (right > left && bottom > top) {
            context.drawImage(shadeSheetFor(),
                left / SHADE_STEP, (top + scrollPosition) / SHADE_STEP, (right - left) / SHADE_STEP, (bottom - top) / SHADE_STEP,
                left, top, right - left, bottom - top);
        }
        context.globalCompositeOperation = 'source-over';
    };

    const drawSky = (timestamp, time, animated) => {
        // What is crossing the sky, and whether any body is still moving, are
        // asked again from scratch: drawEvents, drawSimulation and
        // interactBody say so as this frame is drawn.
        skyCrossing = false;
        bodiesMoving = false;
        const delta = lastFrame ? Math.min(timestamp - lastFrame, 250) : 16;
        lastFrame = timestamp;
        if (scrollPosition !== coverageScroll) measureGlassCoverage();
        const ease = 1 - Math.exp(-delta / 280);
        // The camera is pinned. Leaning it toward the cursor slid every layer of
        // the field at once, which is what read as the sky teleporting whenever
        // the pointer crossed onto a card and it snapped back. What follows the
        // cursor now is a single smoothed point, and the only thing that reads it
        // is the push below: bodies near the cursor get shoved, and nothing else
        // in the scene knows the mouse exists.
        pointer.sx += (pointer.px - pointer.sx) * ease;
        pointer.sy += (pointer.py - pointer.sy) * ease;
        const cameraX = 0, cameraY = 0;
        if (animated) { updateTouchWells(delta); syncPushers(); } else pusherCount = 0;
        if (performance.now() - pointer.sampledAt > 45) {
            pointer.vx *= Math.exp(-delta / 85); pointer.vy *= Math.exp(-delta / 85);
            pointer.speed = Math.hypot(pointer.vx, pointer.vy);
        }
        // Whether anything is bending starlight at all this frame. With no
        // cursor on the sheet and no ripple still spreading, every star was
        // being walked through the bending routine to be told that nothing
        // was bending it -- which is the resting state of the page.
        let lightDisturbed = pusherCount > 0;
        if (!lightDisturbed) for (const ripple of ripples) if (ripple.active) { lightDisturbed = true; break; }
        drawSkyGround(); // Furthest back: the sheet everything else sits on.
        prepareBlackHoles(time, cameraX, cameraY);
        // Which feeding holes get layers of their own this frame, before
        // anything they are swallowing is drawn.
        if (animated) manageHoleLayers(time);

        // Neither the viewport's midline nor the camera's lean changes between
        // one star and the next, so they are settled once for the whole sky
        // rather than re-derived a couple of thousand times inside it.
        const halfHeight = height / 2;
        for (const tier of tierList) {
            const factor = animated ? tier.factor : 1;
            if (tier === tiers.stars) drawStaticStarField(cameraX, cameraY);
            // The dust and the cluster stars, copied from their bands but for
            // the patches where they are bending, whose points the loop below
            // draws; see drawBakedTier.
            const baked = animated && bakedTiers.find(item => item.tier === tier);
            const fromBands = !!baked && drawBakedTier(baked, time, lightDisturbed);
            // A complete band already contains every point in this tier.
            // With no live patches, there is no per-star work left to do.
            if (fromBands && !bakedCutCount) continue;
            let minY = scrollPosition + halfHeight - (halfHeight + tier.margin) / factor;
            let maxY = scrollPosition + halfHeight + (halfHeight + tier.margin) / factor;
            if (fromBands) {
                let top = height, bottom = 0;
                for (let i = 0; i < bakedCutCount; i++) {
                    top = Math.min(top, bakedCuts[i].y0);
                    bottom = Math.max(bottom, bakedCuts[i].y1);
                }
                minY = Math.max(minY, scrollPosition + halfHeight + (top - tier.liveReach - halfHeight) / factor);
                maxY = Math.min(maxY, scrollPosition + halfHeight + (bottom + tier.liveReach - halfHeight) / factor);
            }
            const cameraOffsetX = cameraX * factor * factor * 10;
            const cameraOffsetY = cameraY * factor * factor * 7;
            const objects = animated ? tier.liveObjects : tier.objects;
            // Every body on a tier shares one orbit clock; only its phase
            // differs. Taking the clock's sine and cosine here lets each body
            // turn its own phase with two multiplies instead of its own call.
            const orbitSin = animated ? Math.sin(time * .055) : 0;
            const orbitCos = animated ? Math.cos(time * .055) : 0;
            // Set only when it actually changes. Handing the canvas a colour
            // is a CSS string it has to parse; a run of stars cut from the
            // same palette entry can share the one it has already read.
            let lastFill = null;
            // Whether anything on this tier can be lensed at all is settled by
            // the tier's own depth and the sky's black holes, not by the star.
            const lensing = width >= 700 && animated && factor < .9 && projectedHoles.length > 0;
            for (let i = lowerBound(objects, minY); i < objects.length && objects[i].documentY < maxY; i++) {
                const object = objects[i];
                const baseY = (object.documentY - scrollPosition - halfHeight) * factor + halfHeight;
                // Most cached stars are nowhere near a disturbance. Reject
                // those before taking sines and projecting their motion.
                if (fromBands && !bakedLive(object.x, baseY, object.liveReach)) continue;
                // The seeded anchor stays fixed; a bounded spring offset carries
                // cursor impulses and gravity independently of camera parallax.
                const motion = animated ? Math.sin(time * object.speed + object.phase) * object.drift : 0;
                // Over half the sky was dealt no orbit at all, and multiplying
                // a sine by zero is still a sine taken.
                const orbit = animated && object.orbit
                    ? (orbitSin * object.phaseCos + orbitCos * object.phaseSin) * object.orbit : 0;
                let x = object.x + motion + orbit - cameraOffsetX;
                let y = baseY + motion * .6 - cameraOffsetY;
                if (fromBands && !bakedLive(x, y, object.radius * 3 + 2)) continue;
                const physics = animated && object.interactive
                    ? interactBody(object, x, y, delta, time, cameraX, cameraY) : null;
                if (physics) { x = physics.x; y = physics.y; }
                let lightBoost = 1;
                // Left alone, the routine returns the light exactly where it
                // found it, so skipping it when nothing is pushing leaves the
                // same star in the same place at the same brightness.
                if (animated && lightDisturbed && !object.haze && (tier.points || object.glint || tier === tiers.mediumStars)) {
                    disturbLight(object, x, y, factor, time);
                    x = warped.x; y = warped.y; lightBoost = warped.sink;
                }
                // Only background light bends. A few cheap local mass checks,
                // without touching page pixels or allocating per-star objects.
                let lensStretch = lightBoost > 1 ? warped.stretch : 1;
                if (lensing) for (const hole of projectedHoles) {
                    if (factor >= hole.parallaxFactor) continue;
                    const dx = x - hole.screenX, dy = y - hole.screenY;
                    const reach = hole.radius * 1.35;
                    const distanceSquared = dx * dx + dy * dy;
                    if (distanceSquared < reach * reach && distanceSquared > 1) {
                        const distance = Math.sqrt(distanceSquared);
                        const influence = (1 - distance / reach) ** 2;
                        const shift = Math.min(9, hole.radius * .055) * influence * (1 + (hole.disturbance || 0));
                        x += dx / distance * shift; y += dy / distance * shift;
                        lensStretch = 1 + influence * .45;
                    }
                }
                // Everything on the sheet slides toward the dent, and sinks
                // away from the viewer as it does -- smaller and dimmer at the
                // bottom of the well is what turns an inward slide into depth.
                let sink = 1;
                if (touchWells.length && animated) {
                    warped.x = x; warped.y = y;
                    warpPoint(warped, factor);
                    x = warped.x; y = warped.y;
                    sink = warped.sink;
                    lensStretch *= warped.stretch;
                }
                const scale = 1 + (factor > 1 ? clamp((height / 2 - y) / height, -.5, .5) * .09 : 0);
                const radius = object.radius * scale * (physics ? physics.scale : 1) * clamp(sink, .3, 1.3);
                if (x + radius < 0 || x - radius > width || y + radius < 0 || y - radius > height) continue;
                let alpha = object.alpha * lightBoost * (1 - object.pulse + Math.sin(time * object.speed * 3 + object.phase) * object.pulse);
                // Partial, not proportional: light falling into the well dims
                // but never blinks out, or the dent would read as a hole
                // punched through the field.
                if (sink !== 1) alpha *= clamp(.58 + .42 * sink, .2, 1.2);
                if (!tier.points) {
                    // Frozen at placement -- see finalizeTiers. A dim remnant
                    // remains behind the text an object was placed under, and it
                    // stays exactly that dim for the life of the visit.
                    const clearance = object.clearance ?? 1;
                    alpha *= object.haze ? .5 + clearance * .5 : .07 + clearance * .93;
                    alpha *= .1 + .9 * smoothstep(clamp((y - navigationBottom + radius * .1) / Math.max(24, radius * .5), 0, 1));
                    // Nothing here lifts with the cursor. A body near the pointer
                    // moves out of its way; it does not also light up.
                }
                // A body a feeding hole is pulling in, or has caught, is drawn
                // on that hole's layer, at the layer's pace -- see
                // drawHoleLayers. What it hands over is everything but the
                // motion itself: the layer carries a body that is being pulled
                // on along the way it is going, and works out where a caught
                // one has spiralled to, how small and how faint, each time it
                // draws.
                if (physics) {
                    const hole = physics.capture ? physics.capture.hole : physics.near;
                    if (hole && hole.layer && liftable(hole, object.radius)) {
                        if (physics.capture) hole.captives.push({ object, radius: radius / physics.scale, alpha });
                        else hole.approachers.push({ object, x, y, vx: physics.vx, vy: physics.vy, time, radius, alpha: alpha * physics.alpha });
                        continue;
                    }
                }
                if (physics) alpha *= physics.alpha;
                // A point in a patch cut out of its tier's bands, held to be
                // drawn inside the patch once the tier is done.
                if (fromBands) {
                    const held = bakedPoints.length;
                    const point = bakedPointPool[held] || (bakedPointPool[held] = {});
                    bakedPoints.push(point);
                    point.x = x; point.y = y; point.radius = radius; point.stretch = lensStretch;
                    point.alpha = clamp(alpha, 0, 1); point.color = object.fillColor;
                    continue;
                }
                context.globalAlpha = clamp(alpha, 0, 1);
                if (tier.points) {
                    if (object.fillColor !== lastFill) context.fillStyle = lastFill = object.fillColor;
                    if (tier === dustTier) {
                        // Dust is smaller than a pixel -- a fifth to three
                        // fifths of one on a 1.25x canvas -- and at that size
                        // a disc and a square light the same pixel by the
                        // same amount. It is drawn as the square. An ellipse
                        // is a path, and the graphics library takes a path
                        // one at a time on the processor; eight hundred of
                        // them was half of what a frame of the sky cost it,
                        // for a veil at three to fifteen per cent. A square
                        // is a rectangle, which it draws in one batch.
                        // DUST_SIDE is the side that gives back the light
                        // the rasteriser actually put into the disc: measured
                        // over 2400 motes, total light within a few per cent,
                        // and all but a few dozen pixels within 3/255.
                        const side = radius * DUST_SIDE;
                        context.fillRect(x - side * lensStretch / 2, y - side / 2, side * lensStretch, side);
                        continue;
                    }
                    context.beginPath();
                    // Stays an ellipse even when nothing is stretching it. An
                    // arc of equal radii is the same circle and a cheaper one
                    // to ask for, but Chromium does not rasterise the two the
                    // same: a third of the stars came out with different edge
                    // pixels, by up to a quarter of a channel. That is a
                    // different sky, which is not what was asked for.
                    context.ellipse(x, y, radius * lensStretch, radius, 0, 0, TAU);
                    context.fill();
                    if (object.glint && radius > .8) {
                        context.save();
                        context.globalAlpha *= .42;
                        context.strokeStyle = object.fillColor;
                        context.lineWidth = Math.max(.35, radius * .22);
                        context.beginPath();
                        context.moveTo(x - radius * 2.8, y);
                        context.lineTo(x + radius * 2.8, y);
                        context.moveTo(x, y - radius * 2.8);
                        context.lineTo(x, y + radius * 2.8);
                        context.stroke();
                        context.restore();
                    }
                } else {
                    // Only the transform changes for these sprites. Reset it
                    // without copying/restoring the entire canvas state.
                    // Scale, shift and turn are one matrix, so they are handed
                    // over as one. Asked for separately, the canvas multiplied
                    // the three together itself -- once per body per frame,
                    // taking the same sine and cosine each time. The angle's
                    // pair comes with the object now; see finalizeTiers.
                    const scaledCos = object.angleCos * pixelRatio;
                    const scaledSin = object.angleSin * pixelRatio;
                    context.setTransform(scaledCos, scaledSin, -scaledSin, scaledCos,
                        x * pixelRatio, y * pixelRatio);
                    // Bodies that carry dead margin hand over only the part of
                    // the sprite that can still show; see drawBodySprite.
                    drawBodySprite(object, radius);
                }
            }
            if (!tier.points) context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
            if (fromBands) drawBakedPoints(baked);
        }
        sweepGalaxies();
        drawOrbitingBodies(delta, time, animated, cameraX, cameraY);
        drawPulsars(time, cameraX, cameraY);
        if (animated) {
            updateEvents(time);
            drawEvents(time, cameraX, cameraY, delta);
            drawSimulation(delta, time);
        }
        drawBlackHoles(delta); // The dark horizon occludes captured bodies and trails.
        drawTouchWells();
        context.globalAlpha = 1;
        context.globalCompositeOperation = 'source-over';
        finishSky();
        // Where the navigation's glass floats over the sky, the sky bends --
        // in the browsers that cannot bend a live backdrop themselves. See
        // glass.js; in Chromium this returns without drawing anything.
        window.portfolioNavGlass?.paintBackdrop(context, pixelRatio);
    };
    const draw = timestamp => {
        animationFrame = 0;
        if (document.hidden || quality !== 'high') return;
        // Asked once and carried through the frame. Every `.matches` is a live
        // query put to the browser, and the tier loop consults this one twice
        // for every body in the sky -- close to two thousand questions a
        // frame, all with the same answer, and they cost more than the work
        // they guard.
        const animated = !reducedMotion.matches;
        if (animated) {
            for (const event of eventPool) {
                if (event.active && !event.layer && !event.capture && STREAK_TYPES.has(event.type)) acquireStreak(event);
            }
        }
        // Anything drawn on a layer of its own: a shooting star, a feeding hole.
        const layered = () => animated
            && (streakLayers.some(layer => layer.event) || holeLayers.some(layer => layer.hole));
        // Layers with something fast on them, which keep a pace of their own
        // between the sky's frames. A shooting star always is; a hole only
        // while it is swallowing or throwing sparks (see drawHoleLayers), and
        // otherwise its layer is drawn along with the sky.
        const layersQuick = () => animated
            && (streakLayers.some(layer => layer.event) || holeLayers.some(layer => layer.hole && layer.fast));
        // Due by the reckoning the wake was timed with; see the pacing note.
        const skyGap = onBeat(skyInterval()), layerGap = onBeat(frameInterval);
        const skyDue = !animated || !lastFrame || timestamp - skyBeat >= skyGap - pace.early;
        const layersDue = layersQuick() && timestamp - layerBeat >= layerGap - pace.early;
        if (skyDue || layersDue) {
            if (skyDue) skyBeat = lastFrame ? nextBeat(skyBeat, skyGap, timestamp) : timestamp;
            else layerBeat = nextBeat(layerBeat, layerGap, timestamp);
            // The frame's own time: the beat it was due on.
            const frameTime = skyDue ? skyBeat : layerBeat;
            // One clock for the sky and everything on layers over it, however
            // far apart they happen to draw.
            const step = lastTick ? clamp(frameTime - lastTick, 0, 250) : 16;
            lastTick = frameTime;
            if (animated) sceneTime += step * .001;
            const time = animated ? sceneTime : 0;
            if (skyDue) drawSky(frameTime, time, animated);
            // Asked again after the sky: it may have just lifted a hole onto a
            // layer or handed one back, and either has to show in this frame.
            if (layered()) {
                const since = lastLayerFrame ? clamp(frameTime - lastLayerFrame, 0, 250) : 16;
                drawStreaks(time, since);
                drawHoleLayers(time, since);
                lastLayerFrame = frameTime;
                layerBeat = frameTime;
            }
        }
        // Reduced motion draws a still sky once per request and stops there.
        if (!animated || sleeping) return;
        const quick = layersQuick();
        pace = quick || skyAimed() || skyCrossing || bodiesMoving ? STEADY : LOOSE;
        scheduleFrame(Math.min(skyBeat + onBeat(skyInterval()),
            quick ? layerBeat + onBeat(frameInterval) : Infinity));
    };
    // The loop, stopped: no display frame asked for and no timer set to ask.
    const stopLoop = () => {
        cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        clearTimeout(wakeTimer);
        wakeTimer = 0;
    };
    const requestDraw = () => {
        // Anything asking for a frame while the backdrop is not idle is asking
        // for the loop back, whether or not the observer has caught up yet.
        if (sleeping && !document.documentElement.classList.contains('effects-background-idle')) {
            sleeping = false; lastFrame = 0; lastTick = 0;
        }
        if (animationFrame || sleeping || document.hidden || quality !== 'high') return;
        // Now, rather than whenever the loop's timer would have woken it.
        if (wakeTimer) { clearTimeout(wakeTimer); wakeTimer = 0; }
        animationFrame = requestAnimationFrame(draw);
    };

    // DOM reads happen in a coalesced layout pass, never in draw(). Observe
    // content visibility and collection growth as well as window resizing.
    const refreshLayout = () => {
        if (layoutFrame) return;
        layoutFrame = requestAnimationFrame(() => {
            layoutFrame = 0;
            if (quality !== 'high') return;
            const nextWidth = window.innerWidth, nextHeight = window.innerHeight;
            const nextPageHeight = Math.max(document.documentElement.scrollHeight, nextHeight);
            const resize = nextWidth !== width || nextHeight !== height;
            width = nextWidth; height = nextHeight; pageHeight = nextPageHeight;
            // How often each kind of frame is drawn. See the pacing note in
            // draw(), and applyRates for what easing changes.
            applyRates();
            scrollPosition = window.scrollY;
            gridSpacing = (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) * 3;
            // Keep the animated canvas close to CSS-pixel resolution. The
            // background is intentionally soft, so 1.25x is visually enough
            // while avoiding a large fill-rate cost on laptop GPUs.
            const ratio = Math.min(window.devicePixelRatio || 1, quality === 'high' && width >= 700 ? 1.25 : 1);
            if (resize || ratio !== pixelRatio) {
                pixelRatio = ratio;
                canvas.width = Math.round(width * pixelRatio);
                canvas.height = Math.round(height * pixelRatio);
                canvas.style.width = `${width}px`;
                canvas.style.height = `${height}px`;
                context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
                // Layers over the sky were cut to the old size and ratio.
                resetStreaks();
                resetHoleLayers();
            }
            protectedRects = [];
            for (const element of document.querySelectorAll(protectedSelector)) {
                const rect = element.getBoundingClientRect();
                if (!rect.width || !rect.height || element.closest('[hidden]')) continue;
                const bounds = [];
                if (element.matches(textProtectionSelector)) {
                    // Protect the actual lines, not the empty remainder of a
                    // full-width heading or collection button. Only layout work.
                    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
                    const range = document.createRange();
                    while (walker.nextNode()) {
                        if (!walker.currentNode.textContent.trim()) continue;
                        range.selectNodeContents(walker.currentNode);
                        bounds.push(...range.getClientRects());
                    }
                } else bounds.push(rect);
                for (const bound of bounds) {
                    protectedRects.push({ left: bound.left - 8, right: bound.right + 8, top: bound.top + scrollPosition - 9, bottom: bound.bottom + scrollPosition + 9 });
                }
            }
            navigationBottom = document.querySelector('.navbar')?.getBoundingClientRect().bottom || 80;
            // The glass, in page coordinates. A ring is one sheet here rather
            // than sixteen: its cards turn, but what they cover does not.
            glassRects = [];
            for (const element of document.querySelectorAll(glassSelector)) {
                const rect = element.getBoundingClientRect();
                if (!rect.width || !rect.height) continue;
                glassRects.push({ left: rect.left, right: rect.right, top: rect.top + scrollPosition, bottom: rect.bottom + scrollPosition });
            }
            coverageScroll = NaN;
            // What the sky paints in place of the elements it replaced: the
            // page's own background under it, and the veil over it, at the
            // strength the stylesheet gave the veil for this window.
            groundColor = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#080808';
            veilAlpha = reducedMotion.matches ? .54 : width < 640 ? .58 : .8;
            veilPageHeight = document.body.offsetHeight;
            updateVisibleRects();
            // A rebuild reruns clearance-based placement against whatever text was
            // measured this pass, so the whole field visibly jumps. Page height
            // churns constantly while scrolling as content-visibility sections
            // resolve their real height, which was firing several rebuilds per
            // scroll. Only a width/quality change, or real growth past what has
            // already been built, justifies rerolling the scene.
            const signature = `${width}:${quality}`;
            if (signature !== layoutSignature) {
                layoutSignature = signature;
                builtPageHeight = Math.max(pageHeight * 1.6, pageHeight + 1500, builtPageHeight);
                buildScene();
            } else if (extendSceneTo(pageHeight + 1500)) {
                // The document outgrew the sky that had been laid down. Lay down
                // more of it under the new bottom -- never a rebuild, which would
                // rerun clearance-based placement against text that has just
                // moved and jump the whole field while the reader is watching.
                restackStaticStarField();
            }
            requestDraw();
        });
    };
    // Opening a collection inserts a screenful or two into the middle of the
    // document, and everything below it slides down. The sky does not move with
    // it, and that is deliberate: it is placed once in page coordinates and
    // stays exactly where the visit found it. Whatever the reader is looking at
    // when they press a row is the same field a moment later -- nothing slides,
    // nothing is inserted behind the panel, nothing is rerolled.
    //
    // What the panel actually needs is not new sky in the middle of the page.
    // The sky is already there: the scene is built well past the document's own
    // bottom, so the space a panel opens into is space that was already dressed.
    // All that is left to do is make sure the document has not outgrown what has
    // been laid down, and if it has, lay down more of it under the new bottom --
    // below the contact row and the footer, off the end of the page, where there
    // is nothing for the reader to see change.
    const growSceneForContent = () => {
        if (quality !== 'high') return;
        // Nothing to extend before the first build.
        if (!blackHoles.length && !regions.length) return;
        pageHeight = Math.max(document.documentElement.scrollHeight, height);
        // Reach past the new bottom by the margin a fresh build uses, so opening
        // the next collection usually finds its sky already waiting.
        extendSceneTo(pageHeight + 1500);
        // The baked bands are cut to the sky, not to the document, so a
        // taller document only means the list they are cut from has grown.
        restackStaticStarField();
        deferLayout();
        requestDraw();
    };
    document.addEventListener('portfolio:content-shifted', growSceneForContent);

    const deferLayout = () => {
        if (quality !== 'high') return;
        clearTimeout(layoutTimer);
        layoutTimer = window.setTimeout(refreshLayout, 120);
    };
    const setQuality = mode => {
        const changed = quality !== mode;
        quality = mode;
        pressedSpace = null; pointer.active = false;
        sleeping = false; clearTimeout(sleepTimer); sleepTimer = 0;
        touchWells.length = 0;
        lastScrollAt = 0;
        for (const particle of particles) particle.active = false;
        for (const ripple of ripples) ripple.active = false;
        if (changed) resetEvents();
        canvas.hidden = mode !== 'high';
        stopLoop();
        lastFrame = 0;
        if (mode === 'high') refreshLayout();
        else { resetStaticStarTiles(); resetStreaks(); resetHoleLayers(); }
    };
    // Radius of the depression. Kept in step with the reach used by the body
    // physics and the tile warp so all three describe the same dent.
    const wellReach = () => Math.min(160, Math.max(105, Math.min(width, height) * .30));
    // Rubber-sheet profile. Zero at the exact centre and at the rim, greatest
    // a third of the way out -- displacing the centre point itself would just
    // translate the scene, which reads as a smear rather than a depression.
    const wellProfile = u => u * (1 - u) * (1 - u) * 6.75;
    // Peak displacement as a fraction of the dent's radius. At .3 the profile
    // pulls a point almost exactly onto the centre, so the grid collapsed into
    // a singularity and lost the structure that shows the bend at all. This is
    // a fingertip in a sheet, not a black hole -- deep enough to funnel, shy of
    // closing up.
    const WELL_PULL = .22;
    // One shared amplitude softens the grid, light, body forces and rebound
    // together, so touch feels like a shallow dimple rather than a deep dent.
    // The sheet should acknowledge a finger, not lurch away from it.
    const TOUCH_WELL_DEPTH = .25;
    // One displacement function for every layer. The grid, the scenery and the
    // star tiles have to bend by the same amount at the same place or the
    // background stops reading as a single surface and becomes a stack of
    // things that happen to move together. `sink` and `stretch` come back on
    // the same object so callers can dim and smear with the same falloff.
    const warpPoint = (point, factor) => {
        point.sink = 1;
        point.stretch = 1;
        for (const well of touchWells) {
            const dx = point.x - well.x, dy = point.y - well.y;
            const reach = well.reach;
            const distanceSquared = dx * dx + dy * dy;
            if (distanceSquared >= reach * reach) continue;
            const distance = Math.sqrt(distanceSquared) || .001;
            const u = distance / reach;
            const rim = (1 - u) * (1 - u);
            // Nearer layers move further for the same dent, so the depression
            // has depth of its own rather than sliding as one flat picture.
            const pull = well.depth * wellProfile(u) * reach * WELL_PULL * (.55 + factor * .38);
            point.x -= dx / distance * pull;
            point.y -= dy / distance * pull;
            // The sheet shears in the direction the finger is going. This is
            // the part that reads as fabric being hauled, so it carries more
            // of the effect now than the static depression does.
            point.x += well.vx * well.depth * rim * .085;
            point.y += well.vy * well.depth * rim * .085;
            point.sink *= 1 - well.depth * rim * .34;
            point.stretch *= 1 + Math.abs(well.depth) * wellProfile(u) * .4;
        }
        return point;
    };
    const warped = { x: 0, y: 0, sink: 1, stretch: 1 };
    const findWell = identifier => touchWells.find(well => well.id === identifier);

    const touchStart = (identifier, x, y, target) => {
        if (quality !== 'high' || reducedMotion.matches || touchWells.length >= 5) return;
        // Measured where the press landed, not where it travels: a drag that
        // starts on open sheet keeps its dent even as it passes over a card.
        if (target !== undefined && !openSpaceAt(target, y)) return;
        const existing = findWell(identifier);
        if (existing) { existing.releasedAt = 0; existing.releaseDepth = 0; return; }
        touchWells.push({
            id: identifier, x, y, targetX: x, targetY: y, vx: 0, vy: 0,
            depth: 0, releasedAt: 0, releaseDepth: 0, reach: wellReach()
        });
        requestDraw();
    };
    const touchMove = (identifier, x, y) => {
        const well = findWell(identifier);
        if (!well) return;
        well.targetX = x; well.targetY = y;
        requestDraw();
    };
    const touchEnd = identifier => {
        const well = findWell(identifier);
        if (!well || well.releasedAt) return;
        well.releasedAt = sceneTime;
        well.releaseDepth = well.depth;
        requestDraw();
    };
    const updateTouchWells = delta => {
        if (!touchWells.length) return;
        const seconds = Math.min(delta / 1000, .05);
        for (let index = touchWells.length - 1; index >= 0; index--) {
            const well = touchWells[index];
            // The dimple trails the fingertip. That lag is what makes a drag
            // feel like pulling through a sheet instead of moving a cursor --
            // the fabric has to catch up to where the finger already is.
            const follow = 1 - Math.exp(-seconds / .045);
            const nextX = well.x + (well.targetX - well.x) * follow;
            const nextY = well.y + (well.targetY - well.y) * follow;
            well.vx = (nextX - well.x) / Math.max(seconds, .001);
            well.vy = (nextY - well.y) / Math.max(seconds, .001);
            well.x = nextX; well.y = nextY;
            if (!well.releasedAt) {
                // A resting finger leaves the shallow dimple. A finger that is
                // actually dragging presses harder, because a swipe should feel
                // like hauling the sheet rather than sliding over it.
                const speed = Math.hypot(well.vx, well.vy);
                const target = TOUCH_WELL_DEPTH * (1 + Math.min(1, speed / 900) * .9);
                well.depth += (target - well.depth) * (1 - Math.exp(-seconds / .075));
                continue;
            }
            // Release is elastic: the sheet overshoots past flat into a slight
            // bulge before settling. A plain fade-out reads as a circle
            // disappearing; the rebound is what makes it a surface under
            // tension that was being held down. Damped hard enough that it
            // settles on the first bounce rather than wobbling after the lift.
            const since = sceneTime - well.releasedAt;
            well.depth = well.releaseDepth * Math.exp(-since * 9) * Math.cos(since * 12.5);
            if (since > .12 && Math.abs(well.depth) < .012) touchWells.splice(index, 1);
        }
    };
    // The cursor does not reach the backdrop. It used to lean the whole field a
    // few pixels toward wherever the pointer was, shove nearby bodies along in
    // front of it, and lift the light on anything close -- and all three let go
    // the instant the pointer crossed onto a button or a card. So just reaching
    // for a collection row hauled the sky back to centre and dropped the light,
    // and moving off brought it back: the background lurching and brightening
    // in answer to the mouse. Nothing in front of the page moves what is behind
    // it now. The cursor dot and the page's own hover states are untouched --
    // this is only the field letting go of the pointer.
    const move = event => {
        if (quality !== 'high' || reducedMotion.matches || event.pointerType === 'touch') return;
        const now = event.timeStamp || performance.now(), elapsed = now - pointer.sampledAt;
        // Bodies are pushed by where the cursor is and how fast it is going, so a
        // repeated sample is not a zero-speed one -- it would erase a fresh throw.
        if (pointer.sampledAt && event.clientX === pointer.px && event.clientY === pointer.py) return;
        // The smoothed point eases toward the cursor over about a third of a
        // second, which is what keeps a body's shove weighty rather than jittery.
        // On the very first sample there is nothing to ease from: left at its
        // initial zero it would travel in from the top-left corner, dragging a
        // wave of displaced bodies diagonally across the whole sky. Start it
        // under the cursor instead.
        if (!pointer.sampledAt) { pointer.sx = event.clientX; pointer.sy = event.clientY; }
        if (pointer.sampledAt && elapsed > 0 && elapsed < 150) {
            const mix = 1 - Math.exp(-elapsed / 28);
            pointer.vx += (clamp((event.clientX - pointer.px) * 1000 / elapsed, -2400, 2400) - pointer.vx) * mix;
            pointer.vy += (clamp((event.clientY - pointer.py) * 1000 / elapsed, -2400, 2400) - pointer.vy) * mix;
        } else pointer.vx = pointer.vy = 0;
        pointer.px = event.clientX; pointer.py = event.clientY; pointer.sampledAt = now;
        pointer.speed = Math.hypot(pointer.vx, pointer.vy);
        // The same rule a press follows: the cursor reaches the sheet everywhere
        // except over a card, where the card owns the pointer. Crossing that line
        // only stops the push -- the bodies drift back on their own, and nothing
        // else in the field so much as flickers.
        const wasActive = pointer.active;
        pointer.active = openSpaceAt(event.target, event.clientY);
        // Only a cursor over open sky moves anything in it -- plus the one frame
        // after it leaves, which lets go of whatever it was pushing. A cursor
        // gliding over the cards used to hold the whole sky at sixty frames a
        // second, pushing nothing.
        if (pointer.active || wasActive) requestDraw();
    };
    // A mouse presses the same dimple into the sheet that a fingertip does, and
    // drags it, and lets it spring back. The cursor merely passing over the
    // field still does nothing at all -- this is a press, something the reader
    // chose to do, not the backdrop chasing the pointer around the page.
    // Scenery is never grabbed or thrown: a clean press that does not travel
    // also sends one ripple out from where it landed.
    const mouseWell = pointerId => `mouse-${pointerId}`;
    window.addEventListener('pointerdown', event => {
        if (quality !== 'high' || reducedMotion.matches || event.button !== 0 || !openSpace(event)) return;
        pressedSpace = { x: event.clientX, y: event.clientY, id: event.pointerId };
        suppressSpaceClick = false;
        if (event.pointerType === 'mouse') {
            touchStart(mouseWell(event.pointerId), event.clientX, event.clientY, event.target);
        }
    });
    window.addEventListener('pointermove', event => {
        if (!pressedSpace || pressedSpace.id !== event.pointerId) return;
        if (Math.hypot(event.clientX - pressedSpace.x, event.clientY - pressedSpace.y) > 9) suppressSpaceClick = true;
        if (event.pointerType === 'mouse') touchMove(mouseWell(event.pointerId), event.clientX, event.clientY);
    }, { passive: true });
    const endMousePress = event => {
        if (pressedSpace?.id !== event.pointerId) return;
        if (event.type === 'pointerup' && !suppressSpaceClick && openSpace(event)) {
            addRipple(event.clientX, event.clientY, event.pointerType === 'mouse' ? .5 : .2);
        }
        if (event.pointerType === 'mouse') touchEnd(mouseWell(event.pointerId));
        pressedSpace = null;
    };
    window.addEventListener('pointerup', endMousePress, { passive: true });
    window.addEventListener('pointercancel', endMousePress, { passive: true });
    window.addEventListener('blur', () => { pointer.active = false; pressedSpace = null; });
    const scroll = y => {
        if (quality !== 'high') return;
        // Only used to hold the higher frame rate while the parallax tiers are
        // actually moving. The lattice itself is viewport-locked and ignores it.
        lastScrollAt = performance.now();
        scrollPosition = y;
        updateVisibleRects();
        requestDraw(); // Reduced motion redraws only on user/layout changes.
        deferLayout();
    };
    // Not only when the cursor leaves the window: the backdrop also lets go
    // while the cursor is busy with something in front of it.
    const release = () => { pointer.active = false; };
    document.documentElement.addEventListener('pointerleave', release);
    window.addEventListener('resize', deferLayout, { passive: true });
    document.addEventListener('visibilitychange', () => {
        pointer.active = false; touchWells.length = 0;
        lastScrollAt = 0; lastTick = 0;
        stopLoop();
        lastFrame = 0;
        if (!document.hidden) refreshLayout();
    });
    window.addEventListener('focus', () => { windowFocused = true; requestDraw(); });
    window.addEventListener('blur', () => { windowFocused = false; });
    reducedMotion.addEventListener('change', () => {
        lastFrame = 0; pointer.active = false;
        touchWells.length = 0;
        for (const particle of particles) particle.active = false;
        for (const ripple of ripples) ripple.active = false;
        resetEvents(); requestDraw();
    });
    document.addEventListener('contentvisibilityautostatechange', deferLayout, true);
    document.addEventListener('transitionend', event => {
        if (event.target.matches('.section, .collection-panel')) deferLayout();
    });
    const observer = new ResizeObserver(deferLayout);
    observer.observe(document.body);
    document.querySelectorAll('main .section, .hero-section').forEach(section => observer.observe(section));
    document.fonts?.ready.then(refreshLayout);
    // Once the idle fade has taken the backdrop to opacity 0 there is nothing
    // left to look at, yet the scene would still be compositing a full scene's
    // worth of sprites -- which is the steady state of any page nobody is
    // touching. Park the loop while it is invisible, wake it the instant the
    // fade reverses.
    const syncIdleSleep = () => {
        clearTimeout(sleepTimer);
        sleepTimer = 0;
        // Never park while a finger is still holding a dent open, or the well
        // freezes mid-press and stays pressed into the field until something
        // else happens to wake the loop.
        if (touchWells.length) return;
        if (!document.documentElement.classList.contains('effects-background-idle')) {
            if (sleeping) { sleeping = false; lastFrame = 0; requestDraw(); }
            return;
        }
        // Let the opacity transition finish first, so the frame left on the
        // canvas is a fully faded one rather than a frozen mid-fade image.
        sleepTimer = window.setTimeout(() => {
            sleepTimer = 0;
            if (touchWells.length) return;
            sleeping = true;
            lastScrollAt = 0;
            stopLoop();
        }, 1600);
    };
    new MutationObserver(syncIdleSleep).observe(document.documentElement, { attributeFilter: ['class'] });
    syncIdleSleep();
    refreshLayout();
    // Run every rate a step lower from now on. Called by the page's frame
    // monitor when the machine cannot keep the full rates; see applyRates.
    const ease = () => {
        if (eased) return;
        eased = true;
        applyRates();
    };
    return { move, release, scroll, setQuality, refreshLayout, touchStart, touchMove, touchEnd, ease };
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
    + '.contact-links > .btn, .carousel-arrow';
const REACTIVE_CARD_SELECTOR = `${CARD_SURFACE_SELECTOR}, ${GLASS_BUTTON_SELECTOR}`;
const PRESSABLE_SELECTOR = '.project-card, .about-highlight-link, .btn, .link-btn, .carousel-arrow, .social-links a';
const CARD_TILT_DEGREES = 4;
const BUTTON_TILT_DEGREES = 12;

// Set by setupPointerReactiveSurfaces, and called by anything that moves a card
// out from under a cursor that has not itself moved -- every carousel step, and
// every scroll of the page itself. For a carousel a scroll event would have
// been the natural signal, but an element's scroll does not bubble, and a
// captured one never arrives either.
let retargetPointerSurfaces = () => {};
const PRESS_RIPPLE_MAX_SIZE = 460;

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
        ['--card-glow', '--card-glow-x', '--card-glow-y', '--card-tilt-x', '--card-tilt-y', '--lean-width']
            .forEach(property => activeCard.style.removeProperty(property));
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
        const interactive = target instanceof Element && target.closest('a, button, .project-card');
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
        container.scrollTo({
            left: currentIndex * distance,
            behavior: animate && !reducedMotion.matches ? 'smooth' : 'auto'
        });
        updateControls();
    };

    const updateLayout = () => {
        const useSlider = carouselConstraints.some(constraint => constraint.matches);
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
            container.scrollLeft = 0;
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
            currentIndex = Math.max(0, Math.min(Math.round(container.scrollLeft / distance), maxIndex));
            updateControls();
            retargetPointerSurfaces();
        });
    }, { passive: true });

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

function createProjectCard(project) {
    const card = document.createElement('article');
    card.className = 'project-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `View ${project.title} details`);
    const isCertificate = project.imagePresentation === 'certificate';
    // A card draws into roughly 440 CSS px, so most screens want the 900px
    // variant rather than the full-size file the modal uses.
    const cardSrcset = project.imageSrcset
        ? ` srcset="${project.imageSrcset}" sizes="${CARD_IMAGE_SIZES}"`
        : '';
    const cardMedia = project.image
        ? `<img src="${project.image}"${cardSrcset} alt="${escapeAttribute(describeImage(project))}" class="project-image${isCertificate ? ' is-certificate-thumbnail' : ''}" loading="lazy" decoding="async"${project.motionImage ? ` data-motion-src="${project.motionImage}" data-motion-alt="${escapeAttribute(describeImage(project, 'motion'))}" data-still-alt="${escapeAttribute(describeImage(project))}" data-still-srcset="${project.imageSrcset || ''}"` : ''}>`
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
        collectionProjects.forEach(project => gallery.appendChild(createProjectCard(project)));
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
        // measured here and the one the card really gets.
        if (need) document.documentElement.style.setProperty('--card-content-height', `${Math.ceil(need) + 6}px`);
    };
    let timer = 0;
    const schedule = () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(measure, 150);
    };
    refitProjectCards = measure;
    measure();
    document.fonts?.ready.then(schedule);
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

    const clearCardDepth = () => {
        cards.forEach(card => {
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
        const cardStates = cards.map(card => {
            const cardCenter = card.offsetLeft + card.offsetWidth / 2;
            const rawPosition = (cardCenter - carouselCenter) / metrics.distance;
            const position = settings.ring ? rawPosition : Math.max(-2.25, Math.min(2.25, rawPosition));
            return { card, position };
        });
        cardStates.forEach(state => {
            const { card, position } = state;
            const depth = Math.min(Math.abs(position), 1.65);
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
                const fadeStart = Math.max(0, visibleRingRadius - .05);
                const fadeEnd = visibleRingRadius + .75;
                const fadeProgress = Math.min(Math.max((rawAbsolutePosition - fadeStart) / (fadeEnd - fadeStart), 0), 1);
                const edgeFade = 1 - (fadeProgress * fadeProgress * (3 - 2 * fadeProgress));
                const circleOpacity = visibleOpacity * edgeFade;
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
            initialized = false;
            isAnimating = false;
            currentIndex = 0;
            currentPhysicalIndex = cloneCount;
            setInternalScrollPosition(0);
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
    carousel.addEventListener('wheel', event => {
        if (!isEnabled()) return;
        if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) || Math.abs(event.deltaX) < 8) return;
        event.preventDefault();
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
        const selectedPosition = Number.parseFloat(selectedCard.style.getPropertyValue('--carousel-position')) || 0;
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
    const modalCard = modal.querySelector('.modal-card');
    modal.scrollTop = 0;
    if (modalCard) modalCard.scrollTop = 0;
    const isCoursework = project.category === 'Coursework';
    document.getElementById('modal-title').textContent = project.title;
    document.getElementById('modal-category').textContent = project.category;
    const quickLink = document.getElementById('modal-quick-link');
    if (quickLink) {
        const quickLinkUrl = project.quickLink?.url;
        quickLink.hidden = !quickLinkUrl;
        quickLink.textContent = project.quickLink?.label || 'Full Project Breakdown';
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
    modal.classList.add('active'); modal.setAttribute('aria-hidden', 'false');
    document.dispatchEvent(new CustomEvent('portfolio:modal-open'));
}

function setupModal() {
    const modal = document.getElementById('project-modal');
    const modalCard = modal.querySelector('.modal-card');
    const close = () => {
        modal.querySelectorAll('iframe').forEach(video => {
            video.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'stopVideo', args: [] }), '*');
            video.src = 'about:blank';
            video.remove();
        });
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        modal.scrollTop = 0;
        if (modalCard) modalCard.scrollTop = 0;
        document.dispatchEvent(new CustomEvent('portfolio:modal-close'));
    };
    document.getElementById('modal-close').addEventListener('click', close);
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && modal.classList.contains('active')) close(); });
}
