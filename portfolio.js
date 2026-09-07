// How long the background stays awake after a finger leaves the glass, so the
// dent's rebound plays out before the idle fade starts.
const SWIPE_WAKE_RELEASE_DURATION = 500;

document.addEventListener('DOMContentLoaded', () => {
    const updateViewportScale = () => {
        const browserFrameWidth = window.outerWidth || window.screen?.availWidth || window.innerWidth;
        const measuredScale = browserFrameWidth > 0 ? window.innerWidth / browserFrameWidth : 1;
        const layoutScale = measuredScale > 1.08
            ? Math.min(Math.max(measuredScale, 1), 4)
            : 1;
        document.documentElement.style.fontSize = `${(16 * layoutScale).toFixed(2)}px`;
        document.documentElement.style.setProperty('--viewport-layout-scale', layoutScale.toFixed(3));
        const scalableDimensions = {
            '--site-max-width': 1440,
            '--nav-max-width': 1440,
            '--hero-content-max-width': 1080,
            '--project-stage-max-width': 2400,
            '--carousel-card-min-width': 300,
            '--carousel-card-max-width': 440,
            '--project-card-height': 680,
            '--project-card-height-mobile': 650,
            '--project-image-height': 240,
            '--carousel-image-height': 240,
            '--ring-image-height': 240,
            '--ring-image-height-compact': 220,
            '--ring-height-min': 520,
            '--ring-height-max': 560,
            '--modal-max-width': 820,
            '--modal-max-height': 860
        };
        // Gutters and rhythm are rem, and the root font-size is already scaled
        // above, so they carry the same factor without a second px override.

        Object.entries(scalableDimensions).forEach(([property, pixels]) => {
            document.documentElement.style.setProperty(property, `${(pixels * layoutScale).toFixed(2)}px`);
        });
        document.documentElement.dataset.viewportScale = layoutScale.toFixed(3);
    };
    updateViewportScale();
    window.addEventListener('resize', updateViewportScale, { passive: true });
    window.visualViewport?.addEventListener('resize', updateViewportScale, { passive: true });

    const backgroundGrid = document.createElement('div');
    backgroundGrid.className = 'background-grid';
    backgroundGrid.setAttribute('aria-hidden', 'true');
    const galaxyField = document.createElement('canvas');
    galaxyField.className = 'galaxy-field';
    galaxyField.setAttribute('aria-hidden', 'true');
    const galaxyNebula = document.createElement('div');
    galaxyNebula.className = 'galaxy-nebula';
    galaxyNebula.setAttribute('aria-hidden', 'true');
    const ambientGlow = document.createElement('div');
    ambientGlow.className = 'ambient-glow';
    ambientGlow.setAttribute('aria-hidden', 'true');
    document.body.prepend(backgroundGrid);
    backgroundGrid.after(galaxyField);
    galaxyField.after(galaxyNebula);
    galaxyNebula.after(ambientGlow);
    const pageScrollProgress = document.createElement('div');
    pageScrollProgress.className = 'page-scroll-progress';
    pageScrollProgress.setAttribute('aria-hidden', 'true');
    pageScrollProgress.innerHTML = '<span class="page-scroll-track"><i class="page-scroll-fill"></i></span>';
    ambientGlow.after(pageScrollProgress);
    const cursorDot = document.createElement('span');
    cursorDot.className = 'cursor-dot';
    cursorDot.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cursorDot);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const galaxy = setupGalaxyField(galaxyField, reducedMotion);
    const cursor = setupCursorEffects(cursorDot, reducedMotion);
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
    // The automatic downgrade is a safety net for hardware that genuinely
    // cannot keep up -- not for the ordinary hitches every machine produces
    // (first paint, font swap, a GC pause, the compositor waking up). All of
    // the numbers below are deliberately conservative: a window only counts as
    // slow when the page is visibly bad, and it takes several of those in a row
    // before Low FX takes over.
    const PERFORMANCE_WINDOW_MS = 5000;
    const PERFORMANCE_WARMUP_MS = 8000;
    const PERFORMANCE_RESUME_DELAY_MS = 2000;
    const SLOW_WINDOWS_BEFORE_DOWNGRADE = 3;
    const MIN_ACCEPTABLE_FPS = 24;
    let performanceMonitorFrame = 0;
    let performanceMonitorStartedAt = 0;
    let performanceMonitorLastFrame = 0;
    const performanceMonitorFrameTimes = [];
    let performanceSamplingResumesAt = 0;
    let consecutiveSlowWindows = 0;
    let automaticDowngradeComplete = false;
    let backgroundIdleTimer = 0;
    let backgroundFadeTimer = 0;
    let activeTouchCount = 0;

    const clearBackgroundIdleTimer = () => {
        if (backgroundIdleTimer) window.clearTimeout(backgroundIdleTimer);
        if (backgroundFadeTimer) window.clearTimeout(backgroundFadeTimer);
        backgroundIdleTimer = 0;
        backgroundFadeTimer = 0;
    };

    // Long enough that a normal reading pause or a gap between scroll flicks
    // does not trigger a whole fade-out/fade-in cycle. At 900ms the background
    // visibly flashed any time the cursor rested for a moment.
    const BACKGROUND_IDLE_DELAY = 2600;
    const wakeEffectsBackground = (activity = 'cursor') => {
        const root = document.documentElement;
        // Touching classList on every pointermove churns style + observers for
        // no reason; only clear the state when it is actually set.
        if (root.classList.contains('effects-background-idle') || root.classList.contains('effects-background-click-fading')) {
            root.classList.remove('effects-background-idle', 'effects-background-click-fading');
        }
        clearBackgroundIdleTimer();

        // A finger resting on the glass is still an interaction. Without this,
        // holding one still for a few seconds ran the idle fade and took the
        // dent with it while the finger was still pressing it.
        if (activeTouchCount > 0) return;

        if (activity === 'click') {
            backgroundFadeTimer = window.setTimeout(() => {
                backgroundFadeTimer = 0;
                if (!document.hidden) {
                    document.documentElement.classList.add('effects-background-click-fading');
                }
            }, 1000);
            backgroundIdleTimer = window.setTimeout(() => {
                backgroundIdleTimer = 0;
                if (!document.hidden) {
                    document.documentElement.classList.remove('effects-background-click-fading');
                    document.documentElement.classList.add('effects-background-idle');
                }
            }, 4500);
            return;
        }

        if (activity === 'swipe-release') {
            backgroundIdleTimer = window.setTimeout(() => {
                backgroundIdleTimer = 0;
                if (!document.hidden) {
                    document.documentElement.classList.add('effects-background-idle');
                }
            }, SWIPE_WAKE_RELEASE_DURATION);
            return;
        }

        backgroundIdleTimer = window.setTimeout(() => {
            backgroundIdleTimer = 0;
            if (!document.hidden) {
                document.documentElement.classList.add('effects-background-idle');
            }
        }, BACKGROUND_IDLE_DELAY);
    };

    document.documentElement.dataset.effectsHardware = `${logicalCores}-threads-${deviceMemory || 'unknown'}gb`;

    const resetPerformanceWindow = timestamp => {
        performanceMonitorStartedAt = timestamp;
        performanceMonitorLastFrame = timestamp;
        performanceMonitorFrameTimes.length = 0;
    };

    // Pause sampling for a moment after anything that stalls rAF by itself:
    // page load, tab switches, window resizes. The catch-up frames afterwards
    // look exactly like jank but say nothing about how the page really runs.
    const deferPerformanceSampling = (delay, timestamp = performance.now()) => {
        consecutiveSlowWindows = 0;
        performanceSamplingResumesAt = Math.max(performanceSamplingResumesAt, timestamp + delay);
        resetPerformanceWindow(timestamp);
    };

    const medianFrameTime = samples => {
        const sorted = [...samples].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)] || 16.7;
    };

    const monitorPerformance = timestamp => {
        performanceMonitorFrame = requestAnimationFrame(monitorPerformance);
        // An unfocused window still reports visibilityState 'visible', but the
        // browser suspends rAF for it. Sampling then measures the suspension,
        // not our rendering cost.
        if (effectsMode !== 'high'
            || document.hidden
            || !document.hasFocus()
            || automaticDowngradeComplete
            // High FX the visitor picked themselves is theirs to reverse.
            || effectsReason === 'manual'
            || timestamp < performanceSamplingResumesAt) {
            resetPerformanceWindow(timestamp);
            return;
        }

        if (!performanceMonitorStartedAt) resetPerformanceWindow(timestamp);
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

        const windowLength = timestamp - performanceMonitorStartedAt;
        if (windowLength < PERFORMANCE_WINDOW_MS) return;

        const frames = performanceMonitorFrameTimes.length;
        // The median frame time is this display's real cadence: 16.7ms at 60Hz,
        // 6.9ms at 144Hz, 33ms on a battery-saver panel capped at 30fps that is
        // still perfectly smooth. Measuring hitches against that instead of an
        // assumed 60Hz is what stops healthy-but-throttled machines from being
        // called slow -- the old fixed 45ms/160ms limits flagged them
        // constantly, which is why High FX kept switching itself off.
        const displayFrameTime = medianFrameTime(performanceMonitorFrameTimes);
        const longFrameLimit = Math.max(displayFrameTime * 3, 60);
        const severeFrameLimit = Math.max(displayFrameTime * 10, 260);
        let longFrames = 0;
        let severeFrames = 0;
        for (const sample of performanceMonitorFrameTimes) {
            if (sample > longFrameLimit) longFrames += 1;
            if (sample > severeFrameLimit) severeFrames += 1;
        }
        const averageFps = frames / (windowLength / 1000);
        const longFrameRatio = longFrames / Math.max(frames, 1);
        // Either the page is slow outright, or it stutters through a third of
        // the window, or it locks up several times inside five seconds.
        const slowWindow = averageFps < MIN_ACCEPTABLE_FPS
            || longFrameRatio > .35
            || severeFrames >= 5;
        consecutiveSlowWindows = slowWindow ? consecutiveSlowWindows + 1 : 0;
        resetPerformanceWindow(timestamp);

        if (consecutiveSlowWindows >= SLOW_WINDOWS_BEFORE_DOWNGRADE) {
            automaticDowngradeComplete = true;
            applyEffectsMode('low', false, 'lag');
        }
    };

    const applyEffectsMode = (mode, remember = false, reason = 'manual') => {
        effectsMode = mode;
        effectsReason = reason;
        const useHighEffects = mode === 'high';
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
    performanceMonitorFrame = requestAnimationFrame(timestamp => {
        deferPerformanceSampling(PERFORMANCE_WARMUP_MS, timestamp);
        performanceMonitorFrame = requestAnimationFrame(monitorPerformance);
    });

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
            const interfaceScale = Number.parseFloat(document.documentElement.dataset.viewportScale) || 1;
            const glowRadius = 140 * interfaceScale;
            cursor.move(latestPointerEvent);
            galaxy.move(latestPointerEvent);
            ambientGlow.classList.add('is-active');
            ambientGlow.style.transform = `translate3d(${latestPointerEvent.clientX - glowRadius}px, ${latestPointerEvent.clientY - glowRadius}px, 0)`;
            // Cancels the element's own translate, so the lattice inside the
            // lens is pinned to the viewport: the light moves, the grid does not.
            ambientGlow.style.setProperty('--grid-offset-x', `${glowRadius - latestPointerEvent.clientX}px`);
            ambientGlow.style.setProperty('--grid-offset-y', `${glowRadius - latestPointerEvent.clientY}px`);
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
        activeTouchCount = event.touches.length;
        wakeEffectsBackground();
        if (effectsMode !== 'high') return;
        Array.from(event.changedTouches).forEach(touch => {
            galaxy.touchStart(touch.identifier, touch.clientX, touch.clientY);
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
            activeTouchCount = event.touches.length;
            Array.from(event.changedTouches).forEach(touch => galaxy.touchEnd(touch.identifier));
            if (event.touches.length || !highEffectsTouchSwipeActive) return;
            highEffectsTouchSwipeActive = false;
            touchSwipeReleased = true;
            ambientGlow.classList.remove('is-active');
            wakeEffectsBackground('swipe-release');
        }, { passive: true });
    });
    // A stylus is a fingertip with a finer point: same dent, same rebound.
    window.addEventListener('pointerdown', event => {
        wakeEffectsBackground('click');
        if (effectsMode === 'high' && event.pointerType === 'pen') {
            galaxy.touchStart(`pen-${event.pointerId}`, event.clientX, event.clientY);
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
    document.documentElement.addEventListener('pointerleave', () => ambientGlow.classList.remove('is-active'));
    window.addEventListener('keydown', wakeEffectsBackground, { passive: true });
    window.addEventListener('wheel', () => {
        touchSwipeReleased = false;
        wakeEffectsBackground();
    }, { passive: true });
    const pageScrollFill = pageScrollProgress.querySelector('.page-scroll-fill');
    let scrollFrame = 0;
    const updateScrollMotion = () => {
        const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
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
    window.addEventListener('resize', updateScrollMotion, { passive: true });
    updateScrollMotion();
    const revealObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('in-view'); });
    }, { threshold: .12 });
    document.querySelectorAll('main .section').forEach(section => revealObserver.observe(section));
    document.getElementById('current-year').textContent = new Date().getFullYear();
    fetch('portfolio-data.json?v=20260901-kiwi-clarity')
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
        .catch(error => console.error('Error loading portfolio data:', error));
});

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
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return { move() {}, scroll() {}, setQuality() {}, refreshLayout() {}, touchStart() {}, touchMove() {}, touchEnd() {} };

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
    let width = 0, height = 0, pixelRatio = 1;
    let pageHeight = 0, scrollPosition = window.scrollY;
    let quality = 'low', frameInterval = 1000 / 18;
    let animationFrame = 0, layoutFrame = 0, layoutTimer = 0;
    let sleeping = false, sleepTimer = 0;
    let lastFrame = 0, sceneTime = 0;
    let protectedRects = [], visibleRects = [], regions = [], orbitingBodies = [], blackHoles = [], pulsars = [], layoutSignature = '';
    let builtPageHeight = 0;
    const projectedHoles = [];
    let navigationBottom = 80;
    const spriteCache = new Map();
    // The deep-field layer contains thousands of tiny, non-interactive stars.
    // Rasterize those once per scene segment and composite the tiles each
    // frame. The larger bodies and bright stars remain live so High FX keeps
    // its motion, parallax, and interaction quality.
    const staticStarTileHeight = 680;
    let staticStarTiles = [];
    // 3rem, matching the lattice the stylesheet used to paint. Measured in the
    // layout pass so a root font-size change carries through.
    let gridSpacing = 48;
    let gridPaths = [], gridPathSignature = '';
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
    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0, active: false,
        px: 0, py: 0, vx: 0, vy: 0, sampledAt: 0, speed: 0 };
    const particles = Array.from({ length: 160 }, () => ({ active: false }));
    const ripples = Array.from({ length: 5 }, () => ({ active: false }));
    let pressedSpace = null, suppressSpaceClick = false;
    const interactionSelector = 'a, button, input, textarea, select, summary, [role="button"], '
        + '[contenteditable], .project-card, .project-carousel, .navbar, .modal, .modal-overlay';
    const openSpace = event => !document.querySelector('.modal-overlay.active')
        && !event.target.closest(interactionSelector)
        && event.clientY > navigationBottom + 8
        && clearanceAt(event.clientX, event.clientY + scrollPosition, 12, visibleRects) > .8;
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
        x: 0, y: 0, lx: 0, ly: 0, vx: 0, vy: 0, gain: 0, carry: 0, sag: 0, sagReach: 0
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
        spriteCache.set(key, sprite);
        return sprite;
    };

    // Irregular elliptical concentrations of unresolved lights, with offset
    // knots and dark lanes. These are procedural cached sprites, not textures.
    const galaxySprite = (rng, color) => {
        // Elliptical, elongated, irregular, edge-on, compact core, diffuse cloud.
        const family = Math.floor(rng() * 6);
        const flatten = [ .62, .3, .8, .09, .48, .95 ][family];
        const sprite = createSprite(320);
        const ctx = sprite.getContext('2d');
        ctx.globalCompositeOperation = 'lighter';
        const haze = lightSprite(color, 2);
        ctx.drawImage(haze, 4, 160 - 150 * flatten, 312, 300 * flatten);
        if (family === 4 || family === 0) {
            ctx.globalAlpha = family === 4 ? .6 : .22;
            ctx.drawImage(lightSprite(color, 1), 95, 160 - 65 * flatten, 130, 130 * flatten);
        }
        for (let knot = 0; knot < (family === 2 || family === 5 ? 8 : 3); knot++) {
            const x = 55 + rng() * 200;
            const y = 160 + (rng() - .5) * 100 * flatten + Math.sin(x * .027) * 15 * flatten;
            ctx.globalAlpha = .22 + rng() * .35;
            ctx.drawImage(haze, x - 58, y - 55 * flatten, 116, 110 * flatten);
        }
        for (let i = 0; i < 130; i++) {
            const u = (rng() + rng() + rng() - 1.5) / 1.5;
            const x = 160 + u * 145;
            const y = 160 + (rng() + rng() - 1) * (1 - Math.abs(u)) * 100 * flatten + Math.sin(u * 5) * 12 * flatten;
            const r = .18 + rng() ** 3 * 1.1;
            ctx.globalAlpha = .06 + rng() ** 2 * .5;
            ctx.fillStyle = `rgb(${color})`;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, TAU);
            ctx.fill();
        }
        return sprite;
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
    const protectedSelector = '.hero-badge, .hero-name, .hero-tagline, .social-links a, '
        + '.resume-icon-unavailable, .hero-buttons .btn, .section-label, .section-title, '
        + '.section-subtitle, .bio-text, .about-highlight, .skill-group, .project-card, '
        + '.library-heading, .collection-index, .collection-copy strong, .collection-copy small, '
        + '.collection-toggle > i, .carousel-controls, .carousel-indicators, '
        + '.contact-desc, .contact-links .btn, footer';
    const textProtectionSelector = '.hero-name, .hero-tagline, .section-title, .section-subtitle, '
        + '.bio-text, .library-heading, .collection-copy strong, .collection-copy small, .contact-desc';
    const updateVisibleRects = () => {
        visibleRects = protectedRects.filter(rect => rect.bottom > scrollPosition - 180 && rect.top < scrollPosition + height + 180);
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

    const buildScene = () => {
        for (const tier of tierList) tier.objects = [];
        regions = [];
        const mobile = width < 700;
        const density = mobile ? .68 : 1;
        const segmentHeight = 680;
        // Build past the current page so the height churn that content-visibility
        // causes while scrolling never crosses the rebuild threshold.
        const sceneHeight = Math.max(builtPageHeight, pageHeight);
        const segments = Math.ceil(sceneHeight / segmentHeight);
        // Each segment has its own seed: expanding a collection adds scenery
        // below without rerolling the entire universe above it.
        for (let segment = 0; segment < segments; segment++) {
            const rng = createSeededRandom(seedFor(0xC0FFEE, segment));
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
                y: segment * segmentHeight + randomRange(rng, 170, 480),
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
            if (segment === 0 && !mobile) {
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
                const position = clustered ? around(rng, group) : { x: rng() * width, y: (segment + rng()) * segmentHeight };
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
                add('galaxies', makeObject(rng, group.x, group.y, group.radius * (type === 2 ? 1.1 : .75), group.color, {
                    sprite: galaxySprite(rng, group.color), alpha: type === 2 ? .8 : .5, drift: 2, stretch: .65 + rng() * .3, haze: true
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
                    add('tinyDistant', makeObject(rng, p.x, p.y, 7 + rng() * 12, microColor, {
                        sprite: galaxySprite(rng, microColor), alpha: .08 + rng() * .16,
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
            add('galaxies', makeObject(rng, midfield.x, midfield.y, midfield.radius * .8, midfield.color, {
                sprite: galaxySprite(rng, midfield.color), alpha: .32, drift: 2,
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
                add('tinyDistant', makeObject(rng, p.x, p.y, 6 + rng() * 11, microColor, {
                    sprite: galaxySprite(rng, microColor), alpha: .07 + rng() * .13,
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
                const gapY = segment * segmentHeight
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
                    add('tinyDistant', makeObject(rng, p.x, p.y, 4 + rng() * 9, color, {
                        sprite: rng() < .5 ? galaxySprite(rng, color) : lightSprite(color, 0),
                        alpha: .07 + rng() * .18, stretch: .35 + rng() * .5,
                        angle: rng() * TAU, drift: .35, haze: true
                    }));
                }
            }
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
        for (const tier of tierList) {
            tier.objects.sort((a, b) => a.documentY - b.documentY);
            tier.margin = tier.objects.reduce((max, item) => Math.max(max, item.radius * 1.3 + 28), 20);
            if (tier.objects.some(item => item.interactive)) tier.margin += 360;
            // Keep the full list for reduced motion, which draws the points
            // directly. Animated frames only visit stars not already in tiles.
            tier.liveObjects = tier === tiers.stars
                ? tier.objects.filter(object => !object.staticField) : tier.objects;
            for (const object of tier.objects) {
                object.fillColor = `rgb(${object.color})`;
                // Rockets have to find a world and follow it while it parallaxes,
                // which means each body has to know its own depth.
                object.factor = tier.factor;
            }
        }
        pressedSpace = null;
        // Anything holding a reference into the old scene is now pointing at a
        // world that no longer exists.
        for (const event of eventPool) if (event.body) { event.active = false; event.body = null; }
        buildStaticStarTiles();
    };

    const buildStaticStarTiles = () => {
        staticStarTiles = [];
        const stars = tiers.stars.objects.filter(object => object.staticField);
        if (!stars.length || !width || !pageHeight) return;

        let starIndex = 0;
        for (let start = 0; start < pageHeight; start += staticStarTileHeight) {
            const end = Math.min(start + staticStarTileHeight, pageHeight);
            const tile = document.createElement('canvas');
            tile.width = Math.max(1, Math.ceil(width));
            tile.height = Math.max(1, Math.ceil(end - start));
            const tileContext = tile.getContext('2d', { alpha: true });
            if (!tileContext) continue;

            tileContext.globalCompositeOperation = 'lighter';
            while (starIndex < stars.length && stars[starIndex].documentY < start) starIndex++;
            for (; starIndex < stars.length && stars[starIndex].documentY < end; starIndex++) {
                const object = stars[starIndex];
                // Keep each star in exactly one tile. Duplicating stars at a
                // tile edge would make those few pixels visibly brighter.
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
            staticStarTiles.push({ canvas: tile, start, end });
        }
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
            hole.clearance = clearanceAt(position.x, position.y + scrollPosition, hole.radius * .8, visibleRects);
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
    const emitDust = (x, y, count, color, speed = 65, vx = 0, vy = 0) => {
        const limit = width < 700 ? 64 : particles.length;
        for (let i = 0; i < limit && count > 0; i++) {
            const particle = particles[i];
            if (particle.active) continue;
            const angle = Math.random() * TAU, velocity = speed * (.25 + Math.random());
            Object.assign(particle, { active: true, x, y: y + scrollPosition, vx: vx + Math.cos(angle) * velocity,
                vy: vy + Math.sin(angle) * velocity, life: 0, duration: 1 + Math.random() * 2.2,
                radius: .5 + Math.random() * 1.3, color: `rgb(${color})` });
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
            push.x = (pointer.x + 1) * width / 2;
            push.y = (pointer.y + 1) * height / 2;
            push.lx = pointer.px; push.ly = pointer.py;
            push.vx = pointer.vx; push.vy = pointer.vy;
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
            // A finger pushes as hard as the cursor once its dent is set.
            push.gain = Math.min(1, well.depth / TOUCH_WELL_DEPTH);
            push.carry = .32;
            push.sag = well.depth;
            push.sagReach = well.reach * 1.15;
        }
    };
    const feedHole = (hole, x, y) => {
        hole.flare = 1;
        // Launch outside the horizon, otherwise gravity consumes every grain
        // on the same frame as the flare that created it.
        const count = width < 700 ? 9 : 22;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * TAU, dx = Math.cos(angle), dy = Math.sin(angle);
            emitDust(x + dx * hole.radius * .62, y + dy * hole.radius * .36,
                1, hole.color, 18, dx * 95, dy * 55);
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
    const drawBackgroundGrid = () => {
        if (!gridSpacing) return;
        context.save();
        context.globalCompositeOperation = 'lighter';
        context.globalAlpha = 1;
        const wells = touchWells.filter(well => Math.abs(well.depth) > .012);
        // With no dents the lattice is fixed geometry: it only changes on a
        // resize. Reuse the path; touch frames retrace it through the wells.
        const signature = `${width}:${height}:${gridSpacing}`;
        if (touchWells.length || signature !== gridPathSignature) gridPaths = [];
        gridPathSignature = touchWells.length ? '' : signature;
        // Two densities, matching what the stylesheet drew before: a readable
        // major lattice and a much fainter minor one.
        for (const [spacing, color] of [
            [gridSpacing / 4, 'rgba(255,255,255,.0042)'],
            [gridSpacing, 'rgba(145,200,255,.0125)']
        ]) {
            const pathIndex = spacing === gridSpacing ? 1 : 0;
            let path = gridPaths[pathIndex];
            if (!path) {
                path = new Path2D();
                // Both axes start at the viewport origin and step by a whole
                // module, so the lattice lands on the same pixels every frame
                // and cannot shimmer against its own 1px lines.
                for (let x = 0; x <= width; x += spacing) traceGridLine(path, x, 0, x, height, 'y');
                for (let y = 0; y <= height; y += spacing) traceGridLine(path, 0, y, width, y, 'x');
                gridPaths[pathIndex] = path;
            }
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
            const speed = Math.hypot(push.vx, push.vy);
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
    const drawSimulation = (delta, time) => {
        const seconds = delta / 1000;
        for (const ripple of ripples) {
            if (!ripple.active) continue;
            const age = time - ripple.started;
            if (age > 1.8) { ripple.active = false; continue; }
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
            particle.life += seconds;
            if (particle.life > particle.duration) { particle.active = false; continue; }
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
                if (distance < hole.radius * .26) { particle.active = false; break; }
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
            if (!particle.active || sy < navigationBottom || sy > height + 10) continue;
            context.globalAlpha = (1 - particle.life / particle.duration) * .6
                * clearanceAt(particle.x, particle.y, 16, visibleRects);
            context.strokeStyle = particle.color; context.lineWidth = particle.radius;
            context.beginPath(); context.moveTo(particle.x, particle.y - scrollPosition);
            context.lineTo(particle.x - particle.vx * .025, particle.y - scrollPosition - particle.vy * .025); context.stroke();
        }
    };
    const drawBlackHoles = () => {
        for (const hole of projectedHoles) {
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
                hole.flare *= .94;
            }
            context.restore();
        }
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
            context.globalAlpha = (.035 + clearanceAt(p.x, p.y + scrollPosition, body.radius, visibleRects) * .38) * fade * (p.alpha ?? 1);
            const radius = body.radius * (p.scale ?? 1);
            context.drawImage(body.sprite, p.x - radius, p.y - radius, radius * 2, radius * 2);
        }
    };
    const drawPulsars = (time, cameraX, cameraY) => {
        for (const star of pulsars) {
            const p = projectPosition(star.x, star.documentY, star.factor, cameraX, cameraY);
            if (p.y < -40 || p.y > height + 40) continue;
            const alpha = (.3 + Math.sin(time * .42 + star.phase) * .12)
                * clearanceAt(p.x, p.y + scrollPosition, 35, visibleRects);
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
    const drawEvents = (time, cameraX, cameraY, delta) => {
        updateDuels(time);
        for (const event of eventPool) {
            if (!event.active) continue;
            if (event.type === 'rocket') { drawLander(event, time, cameraX, cameraY, delta); continue; }
            if (event.type === 'dogfight') { drawDogfight(event, time, cameraX, cameraY, delta); continue; }
            tryCaptureEvent(event, time, cameraX, cameraY, delta);
            if (event.capture) { drawCapturedEvent(event, time, cameraX, cameraY); continue; }
            const progress = clamp((time - event.started) / event.duration, 0, 1);
            const stationary = stationaryEvent(event.type);
            const p = eventPoint(event, stationary ? 0 : progress, cameraX, cameraY);
            if (p.y < -150 || p.y > height + 150) continue;
            const protection = stationary ? 85 : event.type === 'meteor' ? 50 : 20;
            const clearance = clearanceAt(p.x, p.y + scrollPosition, protection, visibleRects);
            const envelope = smoothstep(clamp(progress / (stationary ? .16 : .12), 0, 1))
                * (1 - smoothstep(clamp((progress - (stationary ? .2 : .72)) / (stationary ? .8 : .28), 0, 1)));
            const alpha = event.alpha * envelope * (.035 + clearance * .965);
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
        }
    };
    const drawStaticStarField = (cameraX, cameraY) => {
        if (reducedMotion.matches || !staticStarTiles.length) return;
        const factor = tiers.stars.factor;
        const cameraOffsetX = cameraX * factor * factor * 10;
        const cameraOffsetY = cameraY * factor * factor * 7;
        context.globalCompositeOperation = 'lighter';
        context.globalAlpha = 1;
        // minY/maxY cull in screen space. The full-field pass takes the
        // viewport; a ring pass takes only the band it can possibly draw into,
        // which keeps the warp from re-blitting tiles nowhere near the finger.
        const paintTiles = (minY = 0, maxY = height) => {
            for (const tile of staticStarTiles) {
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
    const draw = timestamp => {
        animationFrame = 0;
        if (document.hidden || quality !== 'high') return;
        const animated = !reducedMotion.matches;
        // The ambient scene is paced down to 24-30fps because nothing on it is
        // being aimed at. A finger on the glass is, and the dent has to track
        // it: hold the higher rate for as long as one is down.
        const interval = touchWells.length || pointer.speed > 120
            || performance.now() - lastScrollAt < 160
            ? Math.min(frameInterval, 1000 / 60) : frameInterval;
        if (animated && timestamp - lastFrame < interval - 1) {
            animationFrame = requestAnimationFrame(draw);
            return;
        }
        const delta = lastFrame ? Math.min(timestamp - lastFrame, 80) : 16;
        lastFrame = timestamp;
        if (animated) sceneTime += delta * .001;
        const time = reducedMotion.matches ? 0 : sceneTime;
        const ease = 1 - Math.exp(-delta / 280);
        pointer.x += ((animated && pointer.active ? pointer.targetX : 0) - pointer.x) * ease;
        pointer.y += ((animated && pointer.active ? pointer.targetY : 0) - pointer.y) * ease;
        const cameraX = animated ? pointer.x : 0;
        const cameraY = animated ? pointer.y : 0;
        if (animated) { updateTouchWells(delta); syncPushers(); } else pusherCount = 0;
        if (performance.now() - pointer.sampledAt > 45) {
            pointer.vx *= Math.exp(-delta / 85); pointer.vy *= Math.exp(-delta / 85);
            pointer.speed = Math.hypot(pointer.vx, pointer.vy);
        }
        context.clearRect(0, 0, width, height);
        context.globalCompositeOperation = 'lighter';
        drawBackgroundGrid(); // Furthest back: the sheet everything else sits on.
        prepareBlackHoles(time, cameraX, cameraY);

        for (const tier of tierList) {
            const factor = reducedMotion.matches ? 1 : tier.factor;
            if (tier === tiers.stars) drawStaticStarField(cameraX, cameraY);
            const minY = scrollPosition + height / 2 - (height / 2 + tier.margin) / factor;
            const maxY = scrollPosition + height / 2 + (height / 2 + tier.margin) / factor;
            const objects = animated ? tier.liveObjects : tier.objects;
            for (let i = lowerBound(objects, minY); i < objects.length && objects[i].documentY < maxY; i++) {
                const object = objects[i];
                // The seeded anchor stays fixed; a bounded spring offset carries
                // cursor impulses and gravity independently of camera parallax.
                const motion = animated ? Math.sin(time * object.speed + object.phase) * object.drift : 0;
                const orbit = animated ? Math.sin(time * .055 + object.phase) * object.orbit : 0;
                let x = object.x + motion + orbit - cameraX * factor * factor * 10;
                let y = (object.documentY - scrollPosition - height / 2) * factor + height / 2
                    + motion * .6 - cameraY * factor * factor * 7;
                const physics = animated && object.interactive
                    ? interactBody(object, x, y, delta, time, cameraX, cameraY) : null;
                if (physics) { x = physics.x; y = physics.y; }
                let lightBoost = 1;
                if (animated && !object.haze && (tier.points || object.glint || tier === tiers.mediumStars)) {
                    disturbLight(object, x, y, factor, time);
                    x = warped.x; y = warped.y; lightBoost = warped.sink;
                }
                // Only background light bends. A few cheap local mass checks,
                // without touching page pixels or allocating per-star objects.
                let lensStretch = lightBoost > 1 ? warped.stretch : 1;
                if (width >= 700 && !reducedMotion.matches && factor < .9) for (const hole of projectedHoles) {
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
                if (touchWells.length && !reducedMotion.matches) {
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
                if (physics) alpha *= physics.alpha;
                // Partial, not proportional: light falling into the well dims
                // but never blinks out, or the dent would read as a hole
                // punched through the field.
                if (sink !== 1) alpha *= clamp(.58 + .42 * sink, .2, 1.2);
                if (!tier.points) {
                    const clearance = clearanceAt(x, y + scrollPosition, Math.max(10, radius * .46), visibleRects);
                    // A dim remnant remains behind text; hotter objects emerge
                    // continuously as parallax carries them into negative space.
                    alpha *= object.haze ? .5 + clearance * .5 : .07 + clearance * .93;
                    alpha *= .1 + .9 * smoothstep(clamp((y - navigationBottom + radius * .1) / Math.max(24, radius * .5), 0, 1));
                    if (animated && pointer.active && !object.haze && factor > .7) {
                        const dx = x - (pointer.x + 1) * width / 2;
                        const dy = y - (pointer.y + 1) * height / 2;
                        alpha *= 1 + Math.max(0, 1 - (dx * dx + dy * dy) / 50000) * .075;
                    }
                }
                context.globalAlpha = clamp(alpha, 0, 1);
                if (tier.points) {
                    context.fillStyle = object.fillColor;
                    context.beginPath();
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
                    // without copying/restoring the entire canvas state. Keep
                    // the original transform operations for identical rounding.
                    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
                    context.translate(x, y);
                    context.rotate(object.angle);
                    context.drawImage(object.sprite, -radius, -radius * object.stretch, radius * 2, radius * 2 * object.stretch);
                }
            }
            if (!tier.points) context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        }
        drawOrbitingBodies(delta, time, animated, cameraX, cameraY);
        drawPulsars(time, cameraX, cameraY);
        if (animated) {
            updateEvents(time);
            drawEvents(time, cameraX, cameraY, delta);
            drawSimulation(delta, time);
        }
        drawBlackHoles(); // The dark horizon occludes captured bodies and trails.
        drawTouchWells();
        context.globalAlpha = 1;
        context.globalCompositeOperation = 'source-over';
        if (animated && !sleeping) animationFrame = requestAnimationFrame(draw);
    };
    const requestDraw = () => {
        // Anything asking for a frame while the backdrop is not idle is asking
        // for the loop back, whether or not the observer has caught up yet.
        if (sleeping && !document.documentElement.classList.contains('effects-background-idle')) {
            sleeping = false; lastFrame = 0;
        }
        if (!animationFrame && !sleeping && !document.hidden && quality === 'high') animationFrame = requestAnimationFrame(draw);
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
            frameInterval = 1000 / (width < 700 ? 24 : 30);
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
            updateVisibleRects();
            // A rebuild reruns clearance-based placement against whatever text was
            // measured this pass, so the whole field visibly jumps. Page height
            // churns constantly while scrolling as content-visibility sections
            // resolve their real height, which was firing several rebuilds per
            // scroll. Only a width/quality change, or real growth past what has
            // already been built, justifies rerolling the scene.
            const signature = `${width}:${quality}`;
            if (signature !== layoutSignature || pageHeight > builtPageHeight * 1.12) {
                layoutSignature = signature;
                builtPageHeight = Math.max(pageHeight * 1.6, pageHeight + 1500, builtPageHeight);
                buildScene();
            } else if (!staticStarTiles.length) {
                // Low FX releases the tiles. Restore them when High FX returns
                // without rerolling the unchanged scene or losing faint stars.
                buildStaticStarTiles();
            }
            requestDraw();
        });
    };
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
        cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        lastFrame = 0;
        if (mode === 'high') refreshLayout();
        else staticStarTiles = [];
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

    const touchStart = (identifier, x, y) => {
        if (quality !== 'high' || reducedMotion.matches || touchWells.length >= 5) return;
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
    const move = event => {
        if (quality !== 'high' || reducedMotion.matches || event.pointerType === 'touch') return;
        const now = event.timeStamp || performance.now(), elapsed = now - pointer.sampledAt;
        // pointerup and a queued pointermove can report the same position.
        // They are not zero-speed samples: adding them erases a fresh throw.
        if (pointer.sampledAt && event.clientX === pointer.px && event.clientY === pointer.py) {
            pointer.active = true;
            return;
        }
        if (pointer.sampledAt && elapsed > 0 && elapsed < 150) {
            const mix = 1 - Math.exp(-elapsed / 28);
            pointer.vx += (clamp((event.clientX - pointer.px) * 1000 / elapsed, -2400, 2400) - pointer.vx) * mix;
            pointer.vy += (clamp((event.clientY - pointer.py) * 1000 / elapsed, -2400, 2400) - pointer.vy) * mix;
        } else pointer.vx = pointer.vy = 0;
        pointer.px = event.clientX; pointer.py = event.clientY; pointer.sampledAt = now;
        pointer.speed = Math.hypot(pointer.vx, pointer.vy);
        pointer.targetX = clamp(event.clientX / width * 2 - 1, -1, 1);
        pointer.targetY = clamp(event.clientY / height * 2 - 1, -1, 1);
        pointer.active = true;
        requestDraw();
    };
    // Scenery is never grabbed or thrown: a press on open sheet only records
    // where it landed, so a clean click can send one ripple across the field.
    window.addEventListener('pointerdown', event => {
        if (quality !== 'high' || reducedMotion.matches || event.button !== 0 || !openSpace(event)) return;
        pressedSpace = { x: event.clientX, y: event.clientY, id: event.pointerId };
        suppressSpaceClick = false;
    });
    window.addEventListener('pointermove', event => {
        if (pressedSpace && Math.hypot(event.clientX - pressedSpace.x, event.clientY - pressedSpace.y) > 9) suppressSpaceClick = true;
    }, { passive: true });
    window.addEventListener('pointerup', event => {
        if (pressedSpace?.id === event.pointerId && !suppressSpaceClick && openSpace(event)) {
            addRipple(event.clientX, event.clientY, event.pointerType === 'mouse' ? .5 : .2);
        }
        pressedSpace = null;
    }, { passive: true });
    window.addEventListener('pointercancel', () => { pressedSpace = null; }, { passive: true });
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
    document.documentElement.addEventListener('pointerleave', () => { pointer.active = false; });
    window.addEventListener('resize', deferLayout, { passive: true });
    document.addEventListener('visibilitychange', () => {
        pointer.active = false; touchWells.length = 0;
        lastScrollAt = 0;
        cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        lastFrame = 0;
        if (!document.hidden) refreshLayout();
    });
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
            cancelAnimationFrame(animationFrame);
            animationFrame = 0;
        }, 1600);
    };
    new MutationObserver(syncIdleSleep).observe(document.documentElement, { attributeFilter: ['class'] });
    syncIdleSleep();
    refreshLayout();
    return { move, scroll, setQuality, refreshLayout, touchStart, touchMove, touchEnd };
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

        if (event.target !== lastTarget) {
            lastTarget = event.target;
            const interactive = event.target instanceof Element && event.target.closest('a, button, .project-card');
            cursorDot.classList.toggle('is-interactive', Boolean(interactive));
        }

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

function setupInteractiveTilt(reducedMotion) {
    if (reducedMotion.matches || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    document.querySelectorAll('.about-highlight, .skill-group').forEach(card => {
        let bounds;
        let tiltFrame = 0;
        let pointerX = 0;
        let pointerY = 0;
        card.classList.add('tilt-card');
        card.addEventListener('pointerenter', () => {
            bounds = card.getBoundingClientRect();
            card.style.willChange = 'transform';
        });
        card.addEventListener('pointermove', event => {
            pointerX = event.clientX;
            pointerY = event.clientY;
            if (tiltFrame) return;
            tiltFrame = requestAnimationFrame(() => {
                const horizontal = (pointerX - bounds.left) / bounds.width - .5;
                const vertical = (pointerY - bounds.top) / bounds.height - .5;
                card.style.setProperty('--tilt-x', `${(-vertical * 6).toFixed(2)}deg`);
                card.style.setProperty('--tilt-y', `${(horizontal * 6).toFixed(2)}deg`);
                tiltFrame = 0;
            });
        }, { passive: true });
        card.addEventListener('pointerleave', () => {
            cancelAnimationFrame(tiltFrame);
            tiltFrame = 0;
            card.style.setProperty('--tilt-x', '0deg');
            card.style.setProperty('--tilt-y', '0deg');
            card.style.willChange = '';
        });
    });
}

function renderProfile(profile) {
    ['nav-name', 'footer-name', 'hero-name'].forEach(id => document.getElementById(id).textContent = profile.name);
    document.getElementById('hero-tagline').textContent = profile.tagline || profile.title;
    document.getElementById('about-bio').textContent = profile.bio;
    const highlights = document.getElementById('about-highlights');
    if (highlights) {
        highlights.innerHTML = (profile.aboutHighlights || []).map(highlight => {
            const roles = (highlight.roles || []).map(role => `<div class="about-highlight-role"><h4>${role.title}</h4><p>${[role.position, role.period].filter(Boolean).join(' • ')}</p></div>`).join('');
            const content = `<span class="about-highlight-label">${highlight.label}</span><h3>${highlight.title}</h3><p>${highlight.body}</p>${roles}${highlight.subline ? `<p class="about-highlight-subline">${highlight.subline}</p>` : ''}${highlight.cta ? `<span class="about-highlight-cta">${highlight.cta} <i class="fa-solid fa-arrow-down"></i></span>` : ''}`;
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
        return `<a href="${url}"${externalAttributes}${classAttribute} title="${label}" aria-label="${label}"><i class="${icon}"></i>${className ? ` ${buttonLabel || label}` : ''}</a>`;
    };
    document.getElementById('hero-social').innerHTML = links.map(link => renderProfileLink(link)).join('');
    const resumeButton = profile.resume
        ? `<a href="${profile.resume}" target="_blank" rel="noopener" class="btn secondary-btn"><i class="fa-solid fa-file-arrow-down"></i> Resume</a>`
        : `<span class="btn secondary-btn resume-unavailable" aria-disabled="true" title="Add a résumé PDF to activate this button"><i class="fa-solid fa-file-arrow-down"></i> Resume</span>`;
    const resumeIcon = profile.resume
        ? `<a href="${profile.resume}" target="_blank" rel="noopener" title="Resume"><i class="fa-solid fa-file-arrow-down"></i></a>`
        : `<span class="resume-icon-unavailable" aria-disabled="true" title="Add a résumé PDF to activate this button"><i class="fa-solid fa-file-arrow-down"></i></span>`;
    document.getElementById('hero-social').innerHTML += resumeIcon;
    document.getElementById('contact-links-container').innerHTML = resumeButton + links.map(link => renderProfileLink(link, 'btn secondary-btn')).join('');
}

function renderSkills(categories) {
    document.getElementById('skills-container').innerHTML = categories.map(cat => `<div class="skill-group"><h3 class="skill-group-title">${cat.name}</h3><div class="skill-tags">${cat.skills.map(skill => `<span class="tag">${skill}</span>`).join('')}</div></div>`).join('');
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
    controls.innerHTML = `<span>Browse featured projects</span><div><button class="carousel-arrow carousel-prev" aria-label="Previous featured project"><i class="fa-solid fa-arrow-left"></i></button><button class="carousel-arrow carousel-next" aria-label="Next featured project"><i class="fa-solid fa-arrow-right"></i></button></div>`;
    container.before(controls);
    const initialize = setupCarousel(container, controls, {
        autoplay: false,
        finite: true,
        indicators: true,
        enabled: () => container.classList.contains('is-compact-carousel')
    });
    // Featured projects step with the rest of the page rather than on a width
    // of their own: three-up, two-up, then the one-up carousel at exactly the
    // breakpoint where every other grid on the page has also collapsed to one
    // column. Measuring this container instead used to put the page in a band
    // where About was still three-up and Projects was already a carousel.
    const singleColumn = window.matchMedia('(max-width: 800px)');
    const updateLayout = () => {
        const useCarousel = singleColumn.matches;
        container.classList.toggle('project-carousel', useCarousel);
        container.classList.toggle('is-compact-carousel', useCarousel);
        controls.classList.toggle('is-active', useCarousel);
        initialize();
    };
    singleColumn.addEventListener('change', updateLayout);
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
    const cardMedia = project.image
        ? `<img src="${project.image}" alt="${project.title}" class="project-image${isCertificate ? ' is-certificate-thumbnail' : ''}" loading="lazy" decoding="async"${project.motionImage ? ` data-motion-src="${project.motionImage}"` : ''}>`
        : `<div class="media-placeholder card-media-placeholder"><i class="fa-solid fa-film"></i><span>Preview coming soon</span></div>`;
    const projectPeriod = project.period
        ? `<div class="project-period"><i class="fa-regular fa-calendar"></i>${project.period}</div>`
        : '';
    const cardDescription = buildProjectCardSummary(project);
    card.innerHTML = `<div class="project-image-wrapper">${cardMedia}<span class="project-category-badge">${project.category}</span></div><div class="project-info"><div class="project-heading"><h3 class="project-title">${project.title}</h3>${projectPeriod}</div><div class="project-copy"><p class="project-summary">${cardDescription}</p></div><div class="project-tags">${project.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}</div><div class="project-action-links">${buildLinkButtons(project.links)}</div></div>`;
    const motionImage = card.querySelector('[data-motion-src]');
    if (motionImage && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        card.addEventListener('pointerenter', () => {
            motionImage.src = motionImage.dataset.motionSrc;
            motionImage.classList.add('is-motion-active');
        }, { passive: true });
        card.addEventListener('pointerleave', () => {
            motionImage.src = project.image;
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
        group.innerHTML = `<button class="collection-toggle" aria-expanded="false"><span class="collection-index">0${index + 1}</span><span class="collection-copy"><strong>${collection.name}</strong><small>${collection.description}</small></span><i class="fa-solid fa-arrow-down"></i></button><div class="collection-content" hidden></div>`;
        const content = group.querySelector('.collection-content');
        const gallery = document.createElement('div');
        const collectionProjects = projects
            .filter(project => collection.categories.includes(project.category)
                || project.additionalCategories?.some(category => collection.categories.includes(category)))
            .sort((first, second) => (first.collectionOrder ?? Number.MAX_SAFE_INTEGER) - (second.collectionOrder ?? Number.MAX_SAFE_INTEGER));
        const useCarousel = collection.carousel !== false && collectionProjects.length > 3;
        gallery.className = useCarousel ? 'project-carousel circular-project-carousel' : 'project-grid compact-project-grid';
        collectionProjects.forEach(project => gallery.appendChild(createProjectCard(project)));
        content.appendChild(gallery);
        let initializeCarousel = () => {};
        if (useCarousel) {
            const controls = document.createElement('div');
            controls.className = 'carousel-controls';
            controls.innerHTML = `<div><button class="carousel-arrow carousel-prev" aria-label="Previous project"><i class="fa-solid fa-arrow-left"></i></button><button class="carousel-arrow carousel-next" aria-label="Next project"><i class="fa-solid fa-arrow-right"></i></button></div>`;
            content.prepend(controls);
            initializeCarousel = setupCarousel(gallery, controls, { autoplay: true, ring: true });
        }
        const toggle = group.querySelector('.collection-toggle');
        toggle.addEventListener('click', () => {
            const opening = toggle.getAttribute('aria-expanded') !== 'true';
            toggle.setAttribute('aria-expanded', String(opening));
            content.hidden = !opening;
            if (opening) window.requestAnimationFrame(initializeCarousel);
        });
        container.appendChild(group);
    });
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
                card.style.pointerEvents = visibleOnRing
                    && Math.abs(position) < 1.25
                    ? 'auto'
                    : 'none';
            } else {
                card.style.zIndex = String(10 - Math.round(depth * 3));
                card.style.pointerEvents = Math.abs(position) < 1.25 ? 'auto' : 'none';
            }
            card.classList.toggle('is-carousel-active', depth < .18);
        });
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
        const direction = Math.sign(step);
        const positionCount = originalCards.length;

        if (isAnimating) {
            window.cancelAnimationFrame(scrollAnimation);
            isAnimating = false;
        }
        if (!settings.finite
            && (currentPhysicalIndex < cloneCount
                || currentPhysicalIndex >= cloneCount + originalCards.length)) {
            currentPhysicalIndex = cloneCount + currentIndex;
            setInternalScrollPosition(getTargetForPhysicalIndex(currentPhysicalIndex));
            updateCardDepth();
        }

        const nextIndex = settings.finite
            ? Math.max(0, Math.min(currentIndex + direction, metrics.lastIndex))
            : (currentIndex + direction + positionCount) % positionCount;
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
        stopAndCenterCurrentMotion();
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
            if (dragDirection === 'horizontal') carousel.setPointerCapture?.(event.pointerId);
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
        if (dragDirection === 'horizontal' && Math.abs(horizontalDistance) >= 36) {
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
        if (Math.abs(selectedPosition) < .55) return;
        if (Math.abs(selectedPosition) >= 1.25) return;
        event.preventDefault();
        event.stopPropagation();
        const logicalIndex = Number(selectedCard.dataset.carouselIndex);
        stopAndCenterCurrentMotion();
        move(Math.sign(selectedPosition));
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
            return `<a href="${url}" target="_blank" rel="noopener" class="link-btn ${cls}"><i class="${icon}"></i> ${linkLabel}</a>`;
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
    const overviewItems = project.overview
        ? isCoursework
            ? [
                ['What I Needed to Learn', project.overview.problem],
                ['What I Worked On', project.overview.method],
                ['What I Took From It', project.overview.result]
            ]
            : [
                ['Why I Made It', project.overview.problem],
                ['What I Did', project.overview.method],
                ['How It Turned Out', project.overview.result]
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
            ? `<iframe src="${project.featureVideo.src}" title="${project.featureVideo.label || `${project.title} video`}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`
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
        ? `<img src="${leadMedia}" alt="${project.title}" decoding="async"${project.motionImage ? ' class="is-motion-media"' : ''}>`
        : `<div class="media-placeholder"><i class="fa-solid fa-film"></i><span>Pictures coming soon</span><small>I have not added pictures for this project yet.</small></div>`;
    const media = document.getElementById('modal-media');
    media.innerHTML = (project.media || []).map(item => item.type === 'video' && item.src
        ? `<figure class="modal-media-item modal-video"><iframe src="${item.src}" title="${item.label}" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe><figcaption>${item.label}</figcaption></figure>`
        : item.src
        ? `<figure class="modal-media-item${item.type === 'gif' ? ' is-motion-media' : ''}${item.fit === 'contain' ? ' media-contain' : ''}"><img src="${item.src}" alt="${item.alt || item.label}" loading="lazy" decoding="async"><figcaption>${item.label}</figcaption></figure>`
        : `<div class="modal-media-item media-placeholder"><i class="fa-solid ${item.type === 'gif' ? 'fa-film' : 'fa-image'}"></i><span>${item.label}</span><small>${item.hint || 'Media placeholder'}</small></div>`
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
