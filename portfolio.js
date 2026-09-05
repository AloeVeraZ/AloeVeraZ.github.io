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
            '--modal-max-height': 860,
            '--project-grid-gap': 20,
            '--collection-grid-gap': 16,
            '--carousel-gap-min': 16,
            '--carousel-gap-max': 24
        };
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
    const swipeWakeCanvas = document.createElement('canvas');
    swipeWakeCanvas.className = 'swipe-wake';
    swipeWakeCanvas.setAttribute('aria-hidden', 'true');
    const ambientGlow = document.createElement('div');
    ambientGlow.className = 'ambient-glow';
    ambientGlow.setAttribute('aria-hidden', 'true');
    document.body.prepend(backgroundGrid);
    backgroundGrid.after(galaxyField);
    galaxyField.after(galaxyNebula);
    galaxyNebula.after(swipeWakeCanvas);
    swipeWakeCanvas.after(ambientGlow);
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
    const swipeWake = setupSwipeWake(swipeWakeCanvas, reducedMotion);
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
    let performanceMonitorFrame = 0;
    let performanceMonitorStartedAt = 0;
    let performanceMonitorLastFrame = 0;
    let performanceMonitorFrames = 0;
    let performanceMonitorLongFrames = 0;
    let performanceMonitorSevereFrames = 0;
    let consecutiveSlowWindows = 0;
    let automaticDowngradeComplete = false;
    let backgroundIdleTimer = 0;
    let backgroundFadeTimer = 0;

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
        performanceMonitorFrames = 0;
        performanceMonitorLongFrames = 0;
        performanceMonitorSevereFrames = 0;
    };

    const monitorPerformance = timestamp => {
        performanceMonitorFrame = requestAnimationFrame(monitorPerformance);
        // An unfocused window still reports visibilityState 'visible', but the
        // browser suspends rAF for it. Sampling then measures the suspension,
        // not our rendering cost.
        if (effectsMode !== 'high' || document.hidden || !document.hasFocus() || automaticDowngradeComplete) {
            resetPerformanceWindow(timestamp);
            return;
        }

        if (!performanceMonitorStartedAt) resetPerformanceWindow(timestamp);
        const frameTime = timestamp - performanceMonitorLastFrame;
        performanceMonitorLastFrame = timestamp;
        // A multi-second gap is the browser suspending rAF (backgrounded, power
        // saving, another app hogging the GPU), not this page rendering slowly.
        // Counting it as jank would retire High FX for the rest of the session.
        if (frameTime > 500) { resetPerformanceWindow(timestamp); return; }
        performanceMonitorFrames += 1;
        if (frameTime > 45) performanceMonitorLongFrames += 1;
        if (frameTime > 160) performanceMonitorSevereFrames += 1;

        const windowLength = timestamp - performanceMonitorStartedAt;
        if (windowLength < 3000) return;

        const averageFps = performanceMonitorFrames / (windowLength / 1000);
        const longFrameRatio = performanceMonitorLongFrames / Math.max(performanceMonitorFrames, 1);
        const slowWindow = averageFps < 30
            || longFrameRatio > .18
            || performanceMonitorSevereFrames >= 2;
        consecutiveSlowWindows = slowWindow ? consecutiveSlowWindows + 1 : 0;
        resetPerformanceWindow(timestamp);

        if (consecutiveSlowWindows >= 2) {
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
        swipeWake.setEnabled(useHighEffects);
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
        consecutiveSlowWindows = 0;
        automaticDowngradeComplete = false;
        resetPerformanceWindow(performance.now());
        applyEffectsMode(effectsMode === 'high' ? 'low' : 'high', true, 'manual');
    });
    document.addEventListener('visibilitychange', () => {
        consecutiveSlowWindows = 0;
        resetPerformanceWindow(performance.now());
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
        consecutiveSlowWindows = 0;
        resetPerformanceWindow(performance.now());
    });
    applyEffectsMode(effectsMode, false, effectsReason);
    performanceMonitorFrame = requestAnimationFrame(timestamp => {
        resetPerformanceWindow(timestamp);
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
            ambientGlow.style.setProperty('--grid-offset-x', `${glowRadius - latestPointerEvent.clientX}px`);
            ambientGlow.style.setProperty('--grid-offset-y', `${glowRadius - latestPointerEvent.clientY - window.scrollY}px`);
            pointerFrame = 0;
        });
    };
    window.addEventListener('pointermove', queueHighEffectsMovement, { passive: true });
    window.addEventListener('touchstart', () => {
        highEffectsTouchSwipeActive = false;
        touchSwipeReleased = false;
    }, { passive: true });
    window.addEventListener('touchmove', event => {
        const touch = event.touches[0] || event.changedTouches[0];
        if (!touch) return;
        if (effectsMode === 'high') highEffectsTouchSwipeActive = true;
        queueHighEffectsMovement({
            clientX: touch.clientX,
            clientY: touch.clientY,
            pointerType: 'touch',
            target: event.target
        });
    }, { passive: true });
    ['touchend', 'touchcancel'].forEach(eventName => {
        window.addEventListener(eventName, event => {
            if (event.touches.length || !highEffectsTouchSwipeActive) return;
            highEffectsTouchSwipeActive = false;
            touchSwipeReleased = true;
            ambientGlow.classList.remove('is-active');
            wakeEffectsBackground('swipe-release');
        }, { passive: true });
    });
    window.addEventListener('pointerdown', () => wakeEffectsBackground('click'), { passive: true });
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
        if (effectsMode === 'high' && latestPointerEvent) {
            const interfaceScale = Number.parseFloat(document.documentElement.dataset.viewportScale) || 1;
            ambientGlow.style.setProperty('--grid-offset-y', `${(140 * interfaceScale) - latestPointerEvent.clientY - window.scrollY}px`);
        }
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
    if (!context) return { move() {}, scroll() {}, setQuality() {}, refreshLayout() {} };

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
    // Fixed for this visit, so scrolling/resizing never rerolls the rare anchor.
    const hasGiantLandmark = Math.random() < .08;
    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0, active: false };
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
        const rng = createSeededRandom(0xB1AC4A);
        const mobile = width < 700;
        // Spread the extra wells across the document, alternating open gutters.
        const slots = [
            { x: width * .91, y: height * .62, radius: mobile ? 62 : 110, factor: .88 },
            { x: width * .09, y: pageHeight * .72, radius: mobile ? 24 : 38, factor: .48 }
        ];
        for (let i = 0; i < (mobile ? 2 : 3); i++) slots.push({
            x: width * (i % 2 ? .88 : .12), y: pageHeight * [.31, .54, .9][i],
            radius: mobile ? 45 + i * 5 : [72, 88, 60][i], factor: .82 + i * .07
        });
        if (!mobile && hasGiantLandmark) slots.push({
            x: width + 95, y: pageHeight * .9, radius: 270, factor: 1.12
        });
        for (const [index, slot] of slots.entries()) {
            const position = slot.radius > 200 ? slot : pickOpenPosition(rng, slot.x, slot.y, slot.radius, 120);
            const hole = {
                x: position.x, documentY: position.y, radius: slot.radius,
                parallaxFactor: slot.factor, angle: randomRange(rng, -.45, .45),
                phase: rng() * TAU, color: index ? '190,215,239' : '239,218,187',
                sprite: blackHoleSprite(index ? '190,215,239' : '239,218,187', index % 2)
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
                    { interactive: true, alpha: .72, sprite: lightSprite(hole.color, 1), drift: 2 }
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
        for (let index = 0; index < regions.length; index += mobile ? 6 : 4) {
            const region = regions[index];
            orbitingBodies.push({
                region, radius: randomRange(rng, 8, 20), angle: rng() * TAU,
                orbitRadius: randomRange(rng, 28, 80), speed: randomRange(rng, .022, .048),
                phase: rng() * TAU, sprite: lightSprite(region.color, 1)
            });
        }
        for (let i = 0; i < (mobile ? 1 : 2); i++) {
            const pos = pickOpenPosition(rng, width * (i ? .88 : .14), pageHeight * (i ? .86 : .38), 35);
            pulsars.push({ x: pos.x, documentY: pos.y, phase: rng() * TAU,
                factor: .55, sprite: lightSprite('206,225,248', 0) });
        }
    };

    // One scheduler, driven by active scene time. Tab hiding, Low FX and
    // reduced motion pause time; no timers, catch-up storms, or page-length rate.
    const eventDefinitions = {
        // Shooting stars are the one common rare event: roughly 3x the prior
        // cadence while remaining High FX-only and limited to one at a time.
        shootingStar: { minCooldown: 1.7, maxCooldown: 4, probability: 1, maxSimultaneous: 1, cost: 1, high: true, low: false },
        meteor: { minCooldown: 70, maxCooldown: 145, probability: .68, maxSimultaneous: 1, cost: 2, high: true, low: false },
        comet: { minCooldown: 180, maxCooldown: 340, probability: .55, maxSimultaneous: 1, cost: 2, high: true, low: false },
        supernova: { minCooldown: 130, maxCooldown: 260, probability: .6, maxSimultaneous: 1, cost: 2, high: true, low: false },
        distantExplosion: { minCooldown: 105, maxCooldown: 220, probability: .58, maxSimultaneous: 1, cost: 1, high: true, low: false }
    };
    const eventPool = Array.from({ length: 3 }, () => ({ active: false }));
    const eventDue = {};
    let nextEventWindow = 0;
    const eventRandom = Math.random;
    const cooldown = definition => randomRange(eventRandom, definition.minCooldown, definition.maxCooldown) * (width > 0 && width < 700 ? 1.6 : 1);
    const resetEvents = () => {
        for (const event of eventPool) event.active = false;
        for (const [type, definition] of Object.entries(eventDefinitions)) eventDue[type] = sceneTime + cooldown(definition);
        nextEventWindow = sceneTime + 4;
    };
    // Select an entire trajectory against cached protected rectangles. Coordinates
    // are inverted through the depth projection so events begin in this viewport.
    const chooseEventPath = (type, factor) => {
        const stationary = type === 'supernova' || type === 'distantExplosion';
        let best = null, bestScore = -1;
        for (let attempt = 0; attempt < 24; attempt++) {
            const fromLeft = eventRandom() < .5;
            const x = randomRange(eventRandom, .06, .94) * width;
            const y = randomRange(eventRandom, navigationBottom + 45, height - 40);
            const dx = stationary ? 0 : (fromLeft ? 1 : -1) * Math.min(width * .72, randomRange(eventRandom, 200, 650)) * factor;
            const dy = stationary ? 0 : dx * randomRange(eventRandom, -.65, .65);
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
        return bestScore < .55 && type !== 'shootingStar' ? null : best;
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
        const depth = eventRandom();
        const factor = .45 + depth * .6;
        const path = chooseEventPath(type, factor);
        if (!path) return false;
        const color = ['220,235,255', '246,231,208', '194,218,241'][Math.floor(eventRandom() * 3)];
        const duration = type === 'shootingStar' ? randomRange(eventRandom, .65, 1.5) - depth * .22
            : type === 'meteor' ? randomRange(eventRandom, 1.6, 2.6)
            : type === 'comet' ? randomRange(eventRandom, 18, 28)
            : type === 'supernova' ? randomRange(eventRandom, 6, 9) : randomRange(eventRandom, 5, 8);
        Object.assign(event, path, {
            active: true, type, factor, color, duration, started: sceneTime,
            capture: null,
            depth, bend: randomRange(eventRandom, -12, 12),
            radius: type === 'meteor' ? 9 + depth * 6 : 4 + depth * 5,
            alpha: type === 'meteor' ? .38 : type === 'comet' ? .34 : type === 'supernova' ? .8 : type === 'distantExplosion' ? .6 : .3 + depth * .18,
            tail: type === 'comet' ? .65 : randomRange(eventRandom, .1, .22),
            sprite: lightSprite(color, 0), bloom: lightSprite(color, 2),
            tailSprite: type === 'comet' ? cometTailSprite(color) : null
        });
        return true;
    };
    const updateEvents = time => {
        for (const event of eventPool) if (event.active && (event.capture
            ? time - event.capture.started >= event.capture.duration
            : time - event.started >= event.duration)) event.active = false;
        for (const [type, definition] of Object.entries(eventDefinitions)) {
            if (eventDue[type] === undefined) eventDue[type] = time + cooldown(definition);
            if (time < eventDue[type] || time < nextEventWindow || !definition[quality]) continue;
            const active = eventPool.filter(event => event.active);
            const cost = active.reduce((total, event) => total + eventDefinitions[event.type].cost, 0);
            if (active.length >= (width < 700 ? 1 : 2) || cost + definition.cost > (width < 700 ? 2 : 3)
                || active.filter(event => event.type === type).length >= definition.maxSimultaneous) continue;
            eventDue[type] = time + cooldown(definition);
            if (eventRandom() > definition.probability || !spawnEvent(type)) continue;
            nextEventWindow = time + randomRange(eventRandom, 2.5, 5);
        }
    };

    const buildScene = () => {
        for (const tier of Object.values(tiers)) tier.objects = [];
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
            const rng = createSeededRandom(0xC0FFEE ^ Math.imul(segment + 1, 2654435761));
            const type = Math.floor(rng() * 4); // luminous system, binary, cloud, loose association
            const side = rng() < .5;
            const centerMass = rng() < .24;
            const region = {
                x: width * (centerMass ? randomRange(rng, .36, .64)
                    : (side ? randomRange(rng, .015, .23) : randomRange(rng, .73, .985))),
                y: segment * segmentHeight + randomRange(rng, 170, 480),
                radius: Math.min(width * .45, randomRange(rng, 220, 380)),
                flatten: randomRange(rng, .45, .95),
                color: chooseColor(rng), type
            };
            regions.push(region);
            const companion = { ...region, x: width - region.x, y: region.y + randomRange(rng, -220, 240), radius: region.radius * .65 };
            regions.push(companion);

            // Give the hero's open right side its own system, above the title's
            // baseline, instead of pushing every light below the large heading.
            if (segment === 0 && !mobile) {
                region.x = width * .90;
                region.y = height * .35;
                region.radius = width * .15;
            }

            // An even baseline under uneven systems, with many nearly invisible
            // points. No page-height cap that thins out expanded collections.
            // Deep-field stars are deliberately tiny and numerous in High FX,
            // like a telescope exposure: density rises while individual alpha
            // and radius stay restrained.
            const count = Math.round((width * segmentHeight / 500) * density * (mobile ? .72 : 1));
            for (let i = 0; i < count; i++) {
                const clustered = rng() < .48;
                const group = rng() < .73 ? region : companion;
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
            for (let i = 0; i < Math.round(125 * density); i++) {
                const position = around(rng, rng() < .6 ? region : companion, 1.4);
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
        }
        // A few much bigger crops sell scale. Their hot center stays close to
        // the edge and their atmospheric envelope extends far beyond it.
        const rng = createSeededRandom(0x4A551);
        const anchorCount = 1;
        for (let i = 0; i < anchorCount; i++) {
            const radius = randomRange(rng, 270, 430) * (mobile ? .56 : 1);
            const left = i % 2 !== 0;
            const offset = radius * randomRange(rng, .015, .075);
            const color = colors[[2, 1, 4, 3, 2][i]];
            add('massivePlanets', makeObject(rng, left ? -offset : width + offset,
                i === 0 ? height * .39 : sceneHeight * ([.065, .27, .49, .73, .94][i]), radius, color, {
                    alpha: .22, sprite: lightSprite(color, 2), drift: 2, pulse: .025, orbit: 0,
                    interactive: true
                }));
        }
        buildMotionSystems();
        // Compact, multi-core star clusters share one depth, so their haze and
        // individual lights stay together as the page moves.
        for (let i = 0; i < Math.min(7, Math.ceil(sceneHeight / 1100)); i++) {
            const clusterRng = createSeededRandom(0x57A2C ^ Math.imul(i + 1, 2654435761));
            const radius = randomRange(clusterRng, 60, 105) * (mobile ? .65 : 1);
            const clusterColumn = [ .18, .5, .82 ][i % 3];
            const p = pickOpenPosition(clusterRng, width * clusterColumn,
                500 + i * 1050, radius, 180);
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
        for (const tier of Object.values(tiers)) {
            tier.objects.sort((a, b) => a.documentY - b.documentY);
            tier.margin = tier.objects.reduce((max, item) => Math.max(max, item.radius * 1.3 + 28), 20);
            if (tier.objects.some(item => item.interactive)) tier.margin += 360;
        }
        buildStaticStarTiles();
    };

    const buildStaticStarTiles = () => {
        staticStarTiles = [];
        const stars = tiers.stars.objects.filter(object => object.staticField);
        if (!stars.length || !width || !pageHeight) return;

        for (let start = 0; start < pageHeight; start += staticStarTileHeight) {
            const end = Math.min(start + staticStarTileHeight, pageHeight);
            const tile = document.createElement('canvas');
            tile.width = Math.max(1, Math.ceil(width));
            tile.height = Math.max(1, Math.ceil(end - start));
            const tileContext = tile.getContext('2d', { alpha: true });
            if (!tileContext) continue;

            tileContext.globalCompositeOperation = 'lighter';
            for (const object of stars) {
                // Keep each star in exactly one tile. Duplicating stars at a
                // tile edge would make those few pixels visibly brighter.
                if (object.documentY < start || object.documentY >= end) continue;
                tileContext.globalAlpha = object.alpha;
                tileContext.fillStyle = `rgb(${object.color})`;
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
            hole.clearance = clearanceAt(position.x, position.y + scrollPosition, hole.radius * .8, visibleRects);
            projectedHoles.push(hole);
        }
    };
    const capturePoint = (capture, progress, cameraX, cameraY) => {
        const hole = capture.hole;
        const center = projectPosition(hole.x + Math.sin(sceneTime * .018 + hole.phase) * 3,
            hole.documentY, hole.parallaxFactor, cameraX, cameraY);
        const angle = capture.angle + progress * capture.turn;
        const radius = capture.radius * (1 - progress) ** 1.25;
        return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
    };
    const beginCapture = (hole, x, y, time, duration) => ({
        hole, started: time, duration, angle: Math.atan2(y - hole.screenY, x - hole.screenX),
        radius: Math.hypot(x - hole.screenX, y - hole.screenY),
        turn: hole.angle < 0 ? -2.4 : 2.4
    });
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
        if (pointer.active) {
            // Use the eased cursor position here too. Physics driven by the
            // raw pointer target can alternate force direction between frames
            // when the mouse moves quickly, which reads as flashing bodies.
            let dx = state.x - (pointer.x + 1) * width / 2;
            let dy = state.y - (pointer.y + 1) * height / 2;
            let distance = Math.hypot(dx, dy);
            if (distance < .5) { dx = Math.cos(body.phase); dy = Math.sin(body.phase); distance = 1; }
            const reach = 155 + Math.min(105, body.radius * .62);
            if (distance < reach) {
                const force = (1 - distance / reach) ** 2 * 1280 / (1 + body.radius / 150);
                ax += (dx / distance - dy / distance * .16) * force;
                ay += (dy / distance + dx / distance * .16) * force;
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
    const drawBlackHoles = () => {
        for (const hole of projectedHoles) {
            context.save();
            context.translate(hole.screenX, hole.screenY);
            context.rotate(hole.angle);
            // Source-over is essential: additive black cannot obscure a star.
            context.globalCompositeOperation = 'source-over';
            context.globalAlpha = 1;
            context.fillStyle = '#000';
            context.beginPath(); context.arc(0, 0, hole.radius * .28, 0, TAU); context.fill();
            context.globalAlpha = .25 + hole.clearance * .65;
            const size = hole.radius * 2.6;
            context.drawImage(hole.sprite, -size / 2, -size / 2, size, size);
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
    const drawEvents = (time, cameraX, cameraY, delta) => {
        for (const event of eventPool) {
            if (!event.active) continue;
            tryCaptureEvent(event, time, cameraX, cameraY, delta);
            if (event.capture) { drawCapturedEvent(event, time, cameraX, cameraY); continue; }
            const progress = clamp((time - event.started) / event.duration, 0, 1);
            const stationary = event.type === 'supernova' || event.type === 'distantExplosion';
            const p = eventPoint(event, stationary ? 0 : progress, cameraX, cameraY);
            if (p.y < -150 || p.y > height + 150) continue;
            const protection = stationary ? 85 : event.type === 'meteor' ? 50 : 20;
            const clearance = clearanceAt(p.x, p.y + scrollPosition, protection, visibleRects);
            const envelope = smoothstep(clamp(progress / (stationary ? .16 : .12), 0, 1))
                * (1 - smoothstep(clamp((progress - (stationary ? .2 : .72)) / (stationary ? .8 : .28), 0, 1)));
            const alpha = event.alpha * envelope * (.035 + clearance * .965);
            context.save();
            context.globalCompositeOperation = 'lighter';
            if (stationary) {
                const radius = (event.type === 'supernova' ? 115 : 65) * (.55 + event.depth * .45);
                context.globalAlpha = alpha;
                context.drawImage(event.bloom, p.x - radius, p.y - radius, radius * 2, radius * 2);
                context.drawImage(event.sprite, p.x - 19, p.y - 19, 38, 38);
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
                    context.drawImage(event.tailSprite, -tailLength, -28, tailLength, 56);
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
                context.globalAlpha = alpha * 1.45;
                context.drawImage(event.sprite, p.x - event.radius, p.y - event.radius, event.radius * 2, event.radius * 2);
                if (meteor || comet) {
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
        for (const tile of staticStarTiles) {
            const top = (tile.start - scrollPosition - height / 2) * factor + height / 2 - cameraOffsetY;
            const scaledHeight = (tile.end - tile.start) * factor;
            if (top > height || top + scaledHeight < 0) continue;
            context.drawImage(tile.canvas, -cameraOffsetX, top, width, scaledHeight);
        }
    };
    const draw = timestamp => {
        animationFrame = 0;
        if (document.hidden || quality !== 'high') return;
        const animated = !reducedMotion.matches;
        if (animated && timestamp - lastFrame < frameInterval - 1) {
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
        context.clearRect(0, 0, width, height);
        context.globalCompositeOperation = 'lighter';
        prepareBlackHoles(time, cameraX, cameraY);

        for (const tier of Object.values(tiers)) {
            const factor = reducedMotion.matches ? 1 : tier.factor;
            if (tier === tiers.stars) drawStaticStarField(cameraX, cameraY);
            const minY = scrollPosition + height / 2 - (height / 2 + tier.margin) / factor;
            const maxY = scrollPosition + height / 2 + (height / 2 + tier.margin) / factor;
            const objects = tier.objects;
            for (let i = lowerBound(objects, minY); i < objects.length && objects[i].documentY < maxY; i++) {
                const object = objects[i];
                if (tier === tiers.stars && object.staticField && !reducedMotion.matches) continue;
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
                // Only background light bends. A few cheap local mass checks,
                // without touching page pixels or allocating per-star objects.
                let lensStretch = 1;
                if (width >= 700 && !reducedMotion.matches && factor < .9) for (const hole of projectedHoles) {
                    if (factor >= hole.parallaxFactor) continue;
                    const dx = x - hole.screenX, dy = y - hole.screenY;
                    const reach = hole.radius * 1.35;
                    const distanceSquared = dx * dx + dy * dy;
                    if (distanceSquared < reach * reach && distanceSquared > 1) {
                        const distance = Math.sqrt(distanceSquared);
                        const influence = (1 - distance / reach) ** 2;
                        const shift = Math.min(5, hole.radius * .035) * influence;
                        x += dx / distance * shift; y += dy / distance * shift;
                        lensStretch = 1 + influence * .45;
                    }
                }
                const scale = 1 + (factor > 1 ? clamp((height / 2 - y) / height, -.5, .5) * .09 : 0);
                const radius = object.radius * scale * (physics ? physics.scale : 1);
                if (x + radius < 0 || x - radius > width || y + radius < 0 || y - radius > height) continue;
                let alpha = object.alpha * (1 - object.pulse + Math.sin(time * object.speed * 3 + object.phase) * object.pulse);
                if (physics) alpha *= physics.alpha;
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
                    context.fillStyle = `rgb(${object.color})`;
                    context.beginPath();
                    context.ellipse(x, y, radius * lensStretch, radius, 0, 0, TAU);
                    context.fill();
                    if (object.glint && radius > .8) {
                        context.save();
                        context.globalAlpha *= .42;
                        context.strokeStyle = `rgb(${object.color})`;
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
                    context.save();
                    context.translate(x, y);
                    context.rotate(object.angle);
                    context.drawImage(object.sprite, -radius, -radius * object.stretch, radius * 2, radius * 2 * object.stretch);
                    context.restore();
                }
            }
        }
        drawOrbitingBodies(delta, time, animated, cameraX, cameraY);
        drawPulsars(time, cameraX, cameraY);
        if (animated) {
            updateEvents(time);
            drawEvents(time, cameraX, cameraY, delta);
        }
        drawBlackHoles(); // The dark horizon occludes captured bodies and trails.
        context.globalAlpha = 1;
        context.globalCompositeOperation = 'source-over';
        if (animated && !sleeping) animationFrame = requestAnimationFrame(draw);
    };
    const requestDraw = () => {
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
        if (changed) resetEvents();
        canvas.hidden = mode !== 'high';
        cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        lastFrame = 0;
        if (mode === 'high') refreshLayout();
        else staticStarTiles = [];
    };
    const move = event => {
        if (quality !== 'high' || reducedMotion.matches || event.pointerType === 'touch') return;
        pointer.targetX = clamp(event.clientX / width * 2 - 1, -1, 1);
        pointer.targetY = clamp(event.clientY / height * 2 - 1, -1, 1);
        pointer.active = true;
        requestDraw();
    };
    const scroll = y => {
        if (quality !== 'high') return;
        scrollPosition = y;
        updateVisibleRects();
        requestDraw(); // Reduced motion redraws only on user/layout changes.
        deferLayout();
    };
    document.documentElement.addEventListener('pointerleave', () => { pointer.active = false; });
    window.addEventListener('resize', deferLayout, { passive: true });
    document.addEventListener('visibilitychange', () => {
        cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        lastFrame = 0;
        if (!document.hidden) refreshLayout();
    });
    reducedMotion.addEventListener('change', () => { lastFrame = 0; resetEvents(); requestDraw(); });
    document.addEventListener('contentvisibilityautostatechange', deferLayout, true);
    document.addEventListener('transitionend', event => {
        if (event.target.matches('.section, .collection-panel')) deferLayout();
    });
    const observer = new ResizeObserver(deferLayout);
    observer.observe(document.body);
    document.querySelectorAll('main .section, .hero-section').forEach(section => observer.observe(section));
    document.fonts?.ready.then(refreshLayout);
    // Once the idle fade has taken the canvas to opacity 0 there is nothing to
    // look at, yet the scene was still compositing a full 30fps of sprites --
    // which is the steady state on any page nobody is actively touching. Park
    // the loop while it is invisible and restart it the instant it wakes.
    const syncIdleSleep = () => {
        clearTimeout(sleepTimer);
        sleepTimer = 0;
        if (!document.documentElement.classList.contains('effects-background-idle')) {
            if (sleeping) { sleeping = false; lastFrame = 0; requestDraw(); }
            return;
        }
        // Let the opacity transition finish first, so the frame left on the
        // canvas is a fully faded one and not a frozen mid-fade image.
        sleepTimer = window.setTimeout(() => {
            sleepTimer = 0;
            sleeping = true;
            cancelAnimationFrame(animationFrame);
            animationFrame = 0;
        }, 900);
    };
    new MutationObserver(syncIdleSleep).observe(document.documentElement, { attributeFilter: ['class'] });
    syncIdleSleep();
    refreshLayout();
    return { move, scroll, setQuality, refreshLayout };
}


function setupSwipeWake(canvas, reducedMotion) {
    // No desynchronized flag: the low-latency path presents this canvas outside
    // the normal compositing sync, which shows up as flicker/tearing against the
    // page behind it. It only exists to cut stylus latency, which we do not need.
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return { setEnabled() {} };

    const trailLifetime = SWIPE_WAKE_RELEASE_DURATION;
    const activeTouches = new Map();
    const activePointers = new Map();
    let trails = [];
    let enabled = false;
    let animationFrame = 0;
    let width = 0;
    let height = 0;
    let pixelRatio = 1;

    const resize = () => {
        width = window.innerWidth;
        height = window.innerHeight;
        pixelRatio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
        canvas.width = Math.round(width * pixelRatio);
        canvas.height = Math.round(height * pixelRatio);
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };

    const clear = () => {
        if (animationFrame) cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        trails = [];
        activeTouches.clear();
        activePointers.clear();
        context.clearRect(0, 0, width, height);
        canvas.classList.remove('is-active');
    };

    const traceTrail = trail => {
        const points = trail.points;
        if (points.length < 2) return;
        context.beginPath();
        context.moveTo(points[0].x, points[0].y);
        for (let index = 1; index < points.length; index += 1) {
            context.lineTo(points[index].x, points[index].y);
        }
    };

    const drawRippleOutline = (trail, lineWidth, edgeWidth, color, opacity, shadowBlur) => {
        context.save();
        // Additive blending so the trail glows into the starfield behind it
        // instead of painting an opaque ribbon over it -- it should read as
        // a light overlay, not a separate layer hiding the background.
        context.globalCompositeOperation = 'lighter';
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.strokeStyle = `rgba(${color}, ${opacity.toFixed(3)})`;
        context.lineWidth = lineWidth;
        context.shadowColor = `rgba(${color}, ${(opacity * .82).toFixed(3)})`;
        context.shadowBlur = shadowBlur;
        traceTrail(trail);
        context.stroke();

        context.globalCompositeOperation = 'destination-out';
        context.strokeStyle = '#000';
        context.lineWidth = Math.max(lineWidth - (edgeWidth * 2), 0);
        context.lineCap = 'round';
        context.shadowBlur = 0;
        traceTrail(trail);
        context.stroke();
        context.restore();
    };

    const draw = timestamp => {
        animationFrame = 0;
        context.clearRect(0, 0, width, height);
        trails = trails.filter(trail => !trail.endedAt || timestamp - trail.endedAt < trailLifetime);

        const interfaceScale = Number.parseFloat(document.documentElement.dataset.viewportScale) || 1;
        trails.forEach(trail => {
            if (trail.points.length < 2) return;
            const elapsed = trail.endedAt ? Math.max(timestamp - trail.endedAt, 0) : 0;
            const fadeStrength = !trail.endedAt
                ? 1
                : elapsed <= 250
                    ? 1 - (.25 * (elapsed / 250))
                    : Math.max(.75 * (1 - ((elapsed - 250) / 250)), 0);
            const animationAge = Math.max(timestamp - trail.startedAt, 0);
            const rippleProgress = Math.min(animationAge / 650, 1);
            const easedRipple = 1 - ((1 - rippleProgress) ** 3);

            drawRippleOutline(
                trail,
                (8 + (22 * easedRipple)) * interfaceScale,
                Math.max(1, interfaceScale),
                '145, 200, 255',
                .42 * fadeStrength,
                7 * interfaceScale
            );

            if (animationAge > 110) {
                const echoProgress = Math.min((animationAge - 110) / 620, 1);
                const easedEcho = 1 - ((1 - echoProgress) ** 3);
                drawRippleOutline(
                    trail,
                    (6 + (16 * easedEcho)) * interfaceScale,
                    Math.max(1, .7 * interfaceScale),
                    '168, 213, 255',
                    .2 * fadeStrength,
                    4 * interfaceScale
                );
            }

        });

        if (trails.length) {
            canvas.classList.add('is-active');
            animationFrame = requestAnimationFrame(draw);
        } else {
            canvas.classList.remove('is-active');
        }
    };

    const ensureAnimation = () => {
        if (!animationFrame) animationFrame = requestAnimationFrame(draw);
    };

    const beginTrail = (identifier, x, y, collection) => {
        if (!enabled || reducedMotion.matches) return;
        const startedAt = performance.now();
        const trail = {
            points: [{ x, y }],
            endedAt: 0,
            startedAt
        };
        trails.push(trail);
        collection.set(identifier, trail);
    };

    const extendTrail = (identifier, x, y, collection) => {
        if (!enabled || reducedMotion.matches) return;
        const trail = collection.get(identifier);
        if (!trail) return;
        const previous = trail.points[trail.points.length - 1];
        const distance = Math.hypot(x - previous.x, y - previous.y);
        const interfaceScale = Number.parseFloat(document.documentElement.dataset.viewportScale) || 1;
        if (distance < 3 * interfaceScale) return;
        trail.points.push({ x, y });
        if (trail.points.length > 240) trail.points.splice(0, trail.points.length - 240);
        ensureAnimation();
    };

    const endTrail = (identifier, collection) => {
        const trail = collection.get(identifier);
        if (!trail) return;
        collection.delete(identifier);
        if (trail.points.length < 2) {
            trails = trails.filter(candidate => candidate !== trail);
            return;
        }
        trail.endedAt = performance.now();
        ensureAnimation();
    };

    window.addEventListener('touchstart', event => {
        Array.from(event.changedTouches).forEach(touch => {
            beginTrail(touch.identifier, touch.clientX, touch.clientY, activeTouches);
        });
    }, { passive: true });
    window.addEventListener('touchmove', event => {
        Array.from(event.changedTouches).forEach(touch => {
            extendTrail(touch.identifier, touch.clientX, touch.clientY, activeTouches);
        });
    }, { passive: true });
    ['touchend', 'touchcancel'].forEach(eventName => {
        window.addEventListener(eventName, event => {
            Array.from(event.changedTouches).forEach(touch => endTrail(touch.identifier, activeTouches));
        }, { passive: true });
    });

    window.addEventListener('pointerdown', event => {
        if (event.pointerType !== 'pen') return;
        beginTrail(event.pointerId, event.clientX, event.clientY, activePointers);
    }, { passive: true });
    window.addEventListener('pointermove', event => {
        if (event.pointerType !== 'pen') return;
        extendTrail(event.pointerId, event.clientX, event.clientY, activePointers);
    }, { passive: true });
    ['pointerup', 'pointercancel'].forEach(eventName => {
        window.addEventListener(eventName, event => endTrail(event.pointerId, activePointers), { passive: true });
    });
    window.addEventListener('resize', resize, { passive: true });
    resize();

    return {
        setEnabled(nextEnabled) {
            enabled = Boolean(nextEnabled);
            canvas.dataset.enabled = String(enabled);
            if (!enabled) clear();
        }
    };
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
    const featuredGridMinimumWidth = 940;
    const updateLayout = () => {
        const useCarousel = container.clientWidth < featuredGridMinimumWidth;
        container.classList.toggle('project-carousel', useCarousel);
        container.classList.toggle('is-compact-carousel', useCarousel);
        controls.classList.toggle('is-active', useCarousel);
        initialize();
    };
    const layoutObserver = new ResizeObserver(() => window.requestAnimationFrame(updateLayout));
    layoutObserver.observe(container);
    window.requestAnimationFrame(updateLayout);
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
