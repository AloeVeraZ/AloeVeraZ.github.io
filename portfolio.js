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
    const performanceStorageKey = 'portfolio-effects-override-v2';
    let savedEffectsMode = '';
    try {
        savedEffectsMode = localStorage.getItem(performanceStorageKey) || '';
    } catch (error) {
        savedEffectsMode = '';
    }
    const logicalCores = navigator.hardwareConcurrency || 4;
    const deviceMemory = navigator.deviceMemory || 0;
    const dataSaverEnabled = Boolean(navigator.connection?.saveData);
    const meetsHighEffectsBaseline = logicalCores >= 8
        && (!deviceMemory || deviceMemory >= 8)
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

    const wakeEffectsBackground = (activity = 'cursor') => {
        document.documentElement.classList.remove('effects-background-idle', 'effects-background-click-fading');
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
        }, 900);
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
        if (effectsMode !== 'high' || document.hidden || automaticDowngradeComplete) {
            resetPerformanceWindow(timestamp);
            return;
        }

        if (!performanceMonitorStartedAt) resetPerformanceWindow(timestamp);
        const frameTime = timestamp - performanceMonitorLastFrame;
        performanceMonitorLastFrame = timestamp;
        performanceMonitorFrames += 1;
        if (frameTime > 45) performanceMonitorLongFrames += 1;
        if (frameTime > 160) performanceMonitorSevereFrames += 1;

        const windowLength = timestamp - performanceMonitorStartedAt;
        if (windowLength < 3000) return;

        const averageFps = performanceMonitorFrames / (windowLength / 1000);
        const longFrameRatio = performanceMonitorLongFrames / Math.max(performanceMonitorFrames, 1);
        const slowWindow = averageFps < 42
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
        galaxy.setEnabled(useHighEffects);
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
    const context = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!context) return { move() {}, scroll() {}, setEnabled() {}, refreshLayout() {} };

    let width = window.innerWidth;
    let height = window.innerHeight;
    let stars = [];
    let dust = [];
    let mediumStars = [];
    let starClusterCenters = [];
    let galaxies = [];
    let tinyDistant = [];
    let smallPlanets = [];
    let mediumPlanets = [];
    let largePlanets = [];
    let massivePlanets = [];
    let animationFrame = 0;
    let enabled = true;
    let previousTime = performance.now();
    let lastDrawTime = 0;
    let scrollPosition = window.scrollY;
    let targetScrollPosition = window.scrollY;
    let pageHeight = Math.max(document.documentElement.scrollHeight, height);
    let scrollEnergy = 0;
    const lowPowerDevice = (navigator.hardwareConcurrency || 4) <= 6
        || ('deviceMemory' in navigator && navigator.deviceMemory <= 8);
    let frameInterval = 1000 / (lowPowerDevice || width < 700 ? 24 : 30);
    const pointer = {
        x: width / 2,
        y: height / 2,
        targetX: width / 2,
        targetY: height / 2,
        velocityX: 0,
        velocityY: 0,
        active: false
    };
    const colors = ['222,240,255', '157,205,243', '245,184,124', '247,247,255', '133,167,208', '255,214,170', '196,178,255', '227,138,112'];

    // Parallax helper: scales an object's distance from the vertical center
    // of the viewport by its tier's factor. >1 travels further per scroll
    // pixel (feels close/fast), <1 travels less (feels distant/slow) -- while
    // every object still passes through the viewport once at its assigned
    // document position, so nothing fails to appear or double-appears.
    const applyParallax = (baseScreenY, factor) => (baseScreenY - height / 2) * factor + height / 2;

    // --- Star clusters: instead of one diagonal "galaxy band", scatter a
    // handful of seeded cluster centers down the page so star density reads
    // as organic clumps-and-quiet-regions rather than a uniform scatter.
    const buildStarClusterCenters = () => {
        const rng = createSeededRandom(0xC0FFEE ^ Math.round(pageHeight));
        const count = Math.max(4, Math.round(pageHeight / 850));
        starClusterCenters = Array.from({ length: count }, () => ({
            x: rng() * width,
            y: rng() * pageHeight,
            radius: 110 + rng() * 220
        }));
    };

    // Small-tier stars: size and brightness are rolled independently so the
    // field mixes tiny-dim, tiny-bright, small-dim and small-bright points
    // rather than always pairing "bigger" with "brighter".
    const makeStar = () => {
        const depth = .18 + Math.random() * .82;
        const sizeSeed = Math.random();
        const brightnessSeed = Math.random();
        let x;
        let documentY;
        if (starClusterCenters.length && Math.random() < .4) {
            const cluster = starClusterCenters[Math.floor(Math.random() * starClusterCenters.length)];
            const angle = Math.random() * Math.PI * 2;
            const dist = (Math.random() * .5 + Math.random() * .5) * cluster.radius;
            x = cluster.x + Math.cos(angle) * dist;
            documentY = cluster.y + Math.sin(angle) * dist;
        } else {
            x = Math.random() * width;
            documentY = Math.random() * pageHeight;
        }
        return {
            x: Math.min(width + 20, Math.max(-20, x)),
            documentY: Math.min(pageHeight, Math.max(0, documentY)),
            depth,
            radius: .16 + sizeSeed * 1.1,
            brightness: brightnessSeed,
            driftX: (Math.random() - .5) * .06,
            driftY: -.02 - Math.random() * .07,
            phase: Math.random() * Math.PI * 2,
            twinkleSpeed: .0009 + Math.random() * .0011,
            flare: brightnessSeed > .8 && Math.random() < .3,
            color: colors[Math.floor(Math.random() * colors.length)]
        };
    };

    const makeDust = () => ({
        x: Math.random() * width,
        documentY: Math.random() * pageHeight,
        depth: .2 + Math.random() * .8,
        radius: .12 + Math.random() * .52,
        phase: Math.random() * Math.PI * 2,
        twinkleSpeed: .001 + Math.random() * .0022,
        color: colors[Math.floor(Math.random() * colors.length)]
    });

    // Medium tier (stars, not planets): sparse, prominent bright points with
    // a large soft-edged white core, a faint color rim, and a wide soft halo
    // -- always visible, unlike the small stars. They drift magnetically
    // toward a nearby cursor, which is intentionally kept only on this tier.
    const makeMediumStar = () => ({
        x: Math.random() * width,
        documentY: Math.random() * pageHeight,
        depth: .3 + Math.random() * .7,
        radius: 1.7 + Math.random() * 2.9,
        brightness: .62 + Math.random() * .38,
        driftY: -.01 - Math.random() * .03,
        phase: Math.random() * Math.PI * 2,
        twinkleSpeed: .00035 + Math.random() * .0006,
        offsetX: 0,
        offsetY: 0,
        velocityX: 0,
        velocityY: 0,
        color: colors[Math.floor(Math.random() * colors.length)]
    });

    // --- Distant galaxies: abstract elongated smudges of light, never a
    // literal spiral graphic. A handful of fixed tiny star-points are baked
    // in at build time so each reads as an unresolved cluster, not a blob.
    const galaxyColors = ['150,170,230', '190,160,220', '210,150,150', '160,200,220', '230,210,180'];
    const makeGalaxy = (rng, x, documentY) => {
        const galaxyWidth = 110 + rng() * 170;
        const spotCount = 7 + Math.floor(rng() * 8);
        const spots = Array.from({ length: spotCount }, () => ({
            ox: (rng() - .5) * galaxyWidth * .85,
            oy: (rng() - .5) * galaxyWidth * .32,
            r: .5 + rng() * 1.1,
            a: .1 + rng() * .22
        }));
        return {
            x,
            documentY,
            angle: rng() * Math.PI,
            width: galaxyWidth,
            height: galaxyWidth * (.24 + rng() * .16),
            color: galaxyColors[Math.floor(rng() * galaxyColors.length)],
            alpha: .05 + rng() * .05,
            phase: rng() * Math.PI * 2,
            parallaxFactor: .18 + rng() * .14,
            spots
        };
    };

    const buildGalaxies = () => {
        const rng = createSeededRandom(0x6A1A5E ^ Math.round(pageHeight));
        const maximum = width < 700 ? 5 : lowPowerDevice ? 7 : 9;
        const minimum = width < 700 ? 3 : lowPowerDevice ? 5 : 6;
        const count = Math.round(Math.min(maximum, Math.max(minimum, pageHeight / 700)));
        galaxies = Array.from({ length: count }, () => makeGalaxy(rng, rng() * width, rng() * pageHeight));
    };

    // --- Extremely distant celestial objects: cheap soft glow points that
    // exist purely to sell scale. No sphere shading, no texture.
    const distantColors = ['196,214,255', '255,214,170', '196,178,255', '210,225,255', '255,196,170'];
    const buildTinyDistant = () => {
        const rng = createSeededRandom(0x517A5E ^ Math.round(pageHeight));
        const maximum = width < 700 ? 26 : lowPowerDevice ? 45 : 70;
        const minimum = width < 700 ? 16 : lowPowerDevice ? 28 : 40;
        const count = Math.round(Math.min(maximum, Math.max(minimum, pageHeight / 90)));
        tinyDistant = Array.from({ length: count }, () => ({
            x: rng() * width,
            documentY: rng() * pageHeight,
            radius: 1.4 + rng() * 2.6,
            brightness: .35 + rng() * .5,
            phase: rng() * Math.PI * 2,
            twinkleSpeed: .0002 + rng() * .0004,
            parallaxFactor: .5 + rng() * .2,
            color: distantColors[Math.floor(rng() * distantColors.length)]
        }));
    };

    // --- Planet instance factory shared by the small/medium/large/massive
    // tiers. Same visual language as the reference field: a bright white
    // center with a colored halo/rim around it, just at bigger sizes -- not
    // a shaded sphere.
    const makePlanetInstance = (rng, x, documentY, radius, parallaxFactor, color) => ({
        x,
        documentY,
        radius,
        parallaxFactor,
        color: color || colors[Math.floor(rng() * colors.length)],
        phase: rng() * Math.PI * 2,
        pulseSpeed: .00005 + rng() * .00007,
        alpha: .58 + rng() * .38,
        driftY: -(.0015 + rng() * .004),
        dim: false
    });

    // Every element that carries visible text (or is a clickable control),
    // so planets can never land on top of something readable. The project
    // modal is deliberately excluded -- it's a fixed-position overlay, so its
    // rect is viewport-relative even when "closed" (opacity:0, not
    // display:none); treating it as document-relative would produce a bogus
    // protected zone that follows the current scroll position.
    const largePlanetProtectedSelector = '.hero-badge, .hero-name, .hero-tagline, '
        + '.social-links a, .resume-icon-unavailable, .hero-buttons .btn, '
        + '.section-header, .section-label, .section-title, .section-subtitle, '
        + '.bio-text, .about-highlight, .skill-group, .tag, '
        + '.project-card, .project-title, .project-summary, .project-period, .project-category-badge, '
        + '.project-library, .library-heading, .collection-toggle, .collection-copy, '
        + '.contact-desc, .contact-links .btn, footer';

    const collectProtectedRects = () => {
        const rects = [];
        document.querySelectorAll(largePlanetProtectedSelector).forEach(el => {
            const rect = el.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            rects.push({
                left: rect.left,
                right: rect.right,
                top: rect.top + window.scrollY,
                bottom: rect.bottom + window.scrollY
            });
        });
        return rects;
    };

    // Shared placement loop: pick seeded candidates (optionally biased toward
    // a cluster center for a natural-looking clump), reject any that would
    // land on top of real content (buffer scaled to the visible glow, not
    // just the solid core), and build planet instances from what remains.
    // On layouts with no side gutter (e.g. a narrow single-column viewport),
    // a full-strength clearance can be impossible to satisfy everywhere for
    // every requested slot -- clearance relaxes once as a second pass, but
    // never drops to zero: it is never acceptable for a planet to sit on top
    // of text, so a tier is allowed to come up short of its target count
    // rather than risk covering content.
    const placePlanets = (rng, options) => {
        const {
            count, minRadius, maxRadius, parallaxFactor,
            clearanceScale, topExclusion = 0, clusterChance = 0, protectedRects = null,
            minSeparation = 0
        } = options;
        const clusterCenters = clusterChance > 0
            ? Array.from({ length: Math.max(2, Math.round(count / 4)) }, () => ({
                x: rng() * width,
                y: topExclusion + rng() * Math.max(1, pageHeight - topExclusion)
            }))
            : [];
        const rollCandidate = () => {
            const radius = minRadius + rng() * (maxRadius - minRadius);
            let x;
            let documentY;
            if (clusterCenters.length && rng() < clusterChance) {
                const center = clusterCenters[Math.floor(rng() * clusterCenters.length)];
                const angle = rng() * Math.PI * 2;
                const dist = rng() * 220;
                x = center.x + Math.cos(angle) * dist;
                documentY = center.y + Math.sin(angle) * dist * .6;
            } else {
                x = rng() * width;
                documentY = topExclusion + rng() * Math.max(1, pageHeight - topExclusion);
            }
            x = Math.min(width - radius * .2, Math.max(radius * .2, x));
            documentY = Math.min(pageHeight - radius * .1, Math.max(topExclusion + radius * .1, documentY));
            return { radius, x, documentY };
        };
        const results = [];
        const clearancePasses = protectedRects ? [clearanceScale, Math.max(.6, clearanceScale * .65)] : [0];
        for (const passScale of clearancePasses) {
            if (results.length >= count) break;
            let attempts = 0;
            const maxAttempts = (count - results.length) * 80;
            while (results.length < count && attempts < maxAttempts) {
                attempts += 1;
                const candidate = rollCandidate();
                if (passScale > 0) {
                    const clearance = candidate.radius * passScale;
                    const overlaps = protectedRects.some(rect => (
                        candidate.x + clearance > rect.left
                        && candidate.x - clearance < rect.right
                        && candidate.documentY + clearance > rect.top
                        && candidate.documentY - clearance < rect.bottom
                    ));
                    if (overlaps) continue;
                }
                // Keeps prominent tiers from piling into one overlapping
                // "disc" -- small/medium tiers can still cluster (that reads
                // as a star cluster), but large/massive need real gaps.
                if (minSeparation > 0) {
                    const tooClose = results.some(other => {
                        const dx = candidate.x - other.x;
                        const dy = candidate.documentY - other.documentY;
                        const minDist = (candidate.radius + other.radius) * minSeparation;
                        return dx * dx + dy * dy < minDist * minDist;
                    });
                    if (tooClose) continue;
                }
                const instance = makePlanetInstance(rng, candidate.x, candidate.documentY, candidate.radius, parallaxFactor);
                if (rng() < .16) instance.dim = true;
                results.push(instance);
            }
        }
        return results;
    };

    // Large planets: prominent but not massive, kept clear of real content.
    const buildLargePlanets = () => {
        const rng = createSeededRandom(0x1A46E ^ Math.round(pageHeight));
        const maximum = width < 700 ? 6 : lowPowerDevice ? 9 : 12;
        const minimum = width < 700 ? 4 : lowPowerDevice ? 6 : 7;
        const count = Math.round(Math.min(maximum, Math.max(minimum, pageHeight / 340)));
        largePlanets = placePlanets(rng, {
            count, minRadius: 34, maxRadius: 62, parallaxFactor: 1.22,
            clearanceScale: 1.5, topExclusion: 150, clusterChance: 0, minSeparation: 2.1,
            protectedRects: collectProtectedRects()
        });
    };

    // Medium planets: a distinct tier from the bright "medium star" points
    // above -- these are the main mid-ground depth layer.
    const buildMediumPlanets = () => {
        const rng = createSeededRandom(0x2CE55 ^ Math.round(pageHeight));
        const maximum = width < 700 ? 9 : lowPowerDevice ? 14 : 20;
        const minimum = width < 700 ? 6 : lowPowerDevice ? 9 : 12;
        const count = Math.round(Math.min(maximum, Math.max(minimum, pageHeight / 220)));
        mediumPlanets = placePlanets(rng, {
            count, minRadius: 12, maxRadius: 24, parallaxFactor: 1,
            clearanceScale: 1.3, topExclusion: 90, clusterChance: .3, minSeparation: 1.5,
            protectedRects: collectProtectedRects()
        });
    };

    // Small planets: numerous, mostly free to scatter (too small to threaten
    // legibility), some deliberately dim so they half-blend into the starfield.
    const buildSmallPlanets = () => {
        const rng = createSeededRandom(0x3D166 ^ Math.round(pageHeight));
        const maximum = width < 700 ? 16 : lowPowerDevice ? 26 : 40;
        const minimum = width < 700 ? 10 : lowPowerDevice ? 16 : 22;
        const count = Math.round(Math.min(maximum, Math.max(minimum, pageHeight / 120)));
        smallPlanets = placePlanets(rng, {
            count, minRadius: 4, maxRadius: 11, parallaxFactor: .85,
            clearanceScale: 1.2, topExclusion: 0, clusterChance: .3, minSeparation: 1.1,
            protectedRects: collectProtectedRects()
        });
    };

    // Massive foreground planets: curated anchors (not fully random) spread
    // across the whole page length, each pushed off a screen edge so only a
    // crop of the sphere shows -- this is what sells "enormous".
    const massiveAnchors = [
        { side: 'left', frac: .02, color: '245,184,124' },
        { side: 'right', frac: .24, color: '133,167,208' },
        { side: 'left', frac: .5, color: '157,205,243' },
        { side: 'right', frac: .74, color: '196,178,255' },
        { side: 'left', frac: .95, color: '255,214,170' }
    ];
    const buildMassivePlanets = () => {
        const rng = createSeededRandom(0x4A551);
        const sizeScale = width < 700 ? .55 : lowPowerDevice ? .75 : 1;
        massivePlanets = massiveAnchors.map(anchor => {
            const radius = (72 + rng() * 46) * sizeScale;
            const occlusion = radius * (rng() * .55 - .05);
            const x = anchor.side === 'left' ? occlusion : width - occlusion;
            const documentY = Math.max(radius * .3, Math.min(pageHeight - radius * .3, pageHeight * anchor.frac));
            return makePlanetInstance(rng, x, documentY, radius, 1.55, anchor.color);
        });
    };

    // --- Rendering ---------------------------------------------------------

    // Matches how the reference field renders its points of light: one
    // continuous bloom -- a solid white core that decays smoothly through the
    // tint to nothing -- drawn additively so overlapping glows brighten each
    // other like real light instead of stacking up as translucent discs.
    // No ring, no outline, no second pass: any hard edge anywhere in here is
    // what made the big ones read as flat discs with rings around them.
    const drawPlanet = (planet, screenX, screenY, time) => {
        const { radius, color } = planet;
        const alpha = planet.dim ? planet.alpha * .45 : planet.alpha;
        const pulse = .88 + Math.sin(time * planet.pulseSpeed + planet.phase) * .12;
        const intensity = Math.min(1, alpha * pulse);

        context.save();
        context.translate(screenX, screenY);
        context.globalCompositeOperation = 'lighter';

        const bloom = context.createRadialGradient(0, 0, 0, 0, 0, radius);
        bloom.addColorStop(0, `rgba(255,255,255,${intensity.toFixed(3)})`);
        bloom.addColorStop(.05, `rgba(255,255,255,${(intensity * .97).toFixed(3)})`);
        bloom.addColorStop(.1, `rgba(255,255,255,${(intensity * .86).toFixed(3)})`);
        bloom.addColorStop(.16, `rgba(${color},${(intensity * .66).toFixed(3)})`);
        bloom.addColorStop(.25, `rgba(${color},${(intensity * .4).toFixed(3)})`);
        bloom.addColorStop(.38, `rgba(${color},${(intensity * .19).toFixed(3)})`);
        bloom.addColorStop(.56, `rgba(${color},${(intensity * .075).toFixed(3)})`);
        bloom.addColorStop(.78, `rgba(${color},${(intensity * .022).toFixed(3)})`);
        bloom.addColorStop(1, `rgba(${color},0)`);
        context.fillStyle = bloom;
        context.beginPath();
        context.arc(0, 0, radius, 0, Math.PI * 2);
        context.fill();

        context.restore();
    };

    const syncPageHeight = () => {
        const nextPageHeight = Math.max(document.documentElement.scrollHeight, height);
        if (nextPageHeight === pageHeight) return;
        const scale = nextPageHeight / Math.max(pageHeight, 1);
        stars.forEach(star => { star.documentY *= scale; });
        dust.forEach(mote => { mote.documentY *= scale; });
        mediumStars.forEach(star => { star.documentY *= scale; });
        galaxies.forEach(obj => { obj.documentY *= scale; });
        tinyDistant.forEach(obj => { obj.documentY *= scale; });
        smallPlanets.forEach(obj => { obj.documentY *= scale; });
        mediumPlanets.forEach(obj => { obj.documentY *= scale; });
        largePlanets.forEach(obj => { obj.documentY *= scale; });
        massivePlanets.forEach(obj => { obj.documentY *= scale; });
        pageHeight = nextPageHeight;
    };

    const draw = (time, force = false) => {
        if (!enabled) return;
        if (!force && time - lastDrawTime < frameInterval) {
            animationFrame = requestAnimationFrame(draw);
            return;
        }

        const delta = Math.min((time - previousTime) / 16.67, 2);
        previousTime = time;
        lastDrawTime = time;
        context.clearRect(0, 0, width, height);
        pointer.x += (pointer.targetX - pointer.x) * .16;
        pointer.y += (pointer.targetY - pointer.y) * .16;
        pointer.velocityX *= .8;
        pointer.velocityY *= .8;
        scrollPosition = targetScrollPosition;
        scrollEnergy *= .84;
        syncPageHeight();

        // LAYER: distant galaxies -- almost stationary, barely noticed.
        for (const galaxy of galaxies) {
            const baseY = galaxy.documentY - scrollPosition;
            const drawY = applyParallax(baseY, galaxy.parallaxFactor);
            if (drawY < -galaxy.width || drawY > height + galaxy.width) continue;
            const pulse = .85 + Math.sin(time * .00004 + galaxy.phase) * .15;
            context.save();
            context.translate(galaxy.x, drawY);
            context.rotate(galaxy.angle);
            context.save();
            context.scale(1, galaxy.height / galaxy.width);
            const smudge = context.createRadialGradient(0, 0, 0, 0, 0, galaxy.width / 2);
            smudge.addColorStop(0, `rgba(${galaxy.color},${(galaxy.alpha * pulse).toFixed(3)})`);
            smudge.addColorStop(.55, `rgba(${galaxy.color},${(galaxy.alpha * .45 * pulse).toFixed(3)})`);
            smudge.addColorStop(1, 'rgba(0,0,0,0)');
            context.fillStyle = smudge;
            context.beginPath();
            context.arc(0, 0, galaxy.width / 2, 0, Math.PI * 2);
            context.fill();
            context.restore();
            for (const spot of galaxy.spots) {
                context.beginPath();
                context.fillStyle = `rgba(${galaxy.color},${spot.a})`;
                context.arc(spot.ox, spot.oy, spot.r, 0, Math.PI * 2);
                context.fill();
            }
            context.restore();
        }

        // LAYER: tiny distant objects -- pure scale cues, cheapest to draw.
        for (const obj of tinyDistant) {
            const baseY = obj.documentY - scrollPosition;
            const drawY = applyParallax(baseY, obj.parallaxFactor);
            if (drawY < -20 || drawY > height + 20) continue;
            const twinkle = .75 + Math.sin(time * obj.twinkleSpeed + obj.phase) * .25;
            const alpha = obj.brightness * twinkle;
            const glow = context.createRadialGradient(obj.x, drawY, 0, obj.x, drawY, obj.radius * 4.5);
            glow.addColorStop(0, `rgba(${obj.color},${(alpha * .5).toFixed(3)})`);
            glow.addColorStop(1, 'rgba(0,0,0,0)');
            context.fillStyle = glow;
            context.beginPath();
            context.arc(obj.x, drawY, obj.radius * 4.5, 0, Math.PI * 2);
            context.fill();
            context.beginPath();
            context.fillStyle = `rgba(${obj.color},${alpha.toFixed(3)})`;
            context.arc(obj.x, drawY, obj.radius, 0, Math.PI * 2);
            context.fill();
        }

        // LAYER: small planets.
        for (const planet of smallPlanets) {
            const baseY = planet.documentY - scrollPosition;
            const drawY = applyParallax(baseY, planet.parallaxFactor);
            if (drawY < -planet.radius * 4 || drawY > height + planet.radius * 4) continue;
            planet.documentY += planet.driftY * delta;
            drawPlanet(planet, planet.x, drawY, time);
        }

        for (const star of stars) {
            const oldY = star.documentY - scrollPosition;
            const speed = .55 + star.depth * 1.2;
            star.x += star.driftX * speed * delta;
            star.documentY += (star.driftY * speed - scrollEnergy * star.depth * .006) * delta;

            let illumination = 0;
            if (pointer.active) {
                const dx = star.x - pointer.x;
                const dy = (star.documentY - scrollPosition) - pointer.y;
                const distanceSquared = dx * dx + dy * dy;
                if (distanceSquared < 44100) {
                    illumination = Math.max(0, 1 - Math.sqrt(distanceSquared) / 250);
                }
                if (distanceSquared > 1 && distanceSquared < 57600) {
                    const distance = Math.sqrt(distanceSquared);
                    const response = (1 - distance / 240) ** 2;
                    const force = response * star.depth * .72 * delta;
                    const swirl = response * .24 * delta;
                    star.x += dx / distance * force - dy / distance * swirl + pointer.velocityX * force * .018;
                    star.documentY += dy / distance * force + dx / distance * swirl + pointer.velocityY * force * .018;
                }
            }

            if (star.documentY < -8) star.documentY = pageHeight + 8;
            else if (star.documentY > pageHeight + 8) star.documentY = -8;
            if (star.x < -8) star.x = width + 8;
            else if (star.x > width + 8) star.x = -8;

            const alpha = Math.min(.94, (.035 + star.brightness * .62) * (.72 + Math.sin(time * star.twinkleSpeed + star.phase) * .16) + illumination * .72);
            const drawX = star.x;
            const drawY = star.documentY - scrollPosition;

            if (star.brightness > .4 && (illumination > .04 || star.flare)) {
                const glowRadius = star.radius * (4.5 + illumination * 14);
                const glow = context.createRadialGradient(drawX, drawY, 0, drawX, drawY, glowRadius);
                glow.addColorStop(0, `rgba(${star.color},${Math.min(.2, .035 + illumination * .16)})`);
                glow.addColorStop(.34, `rgba(${star.color},${Math.min(.08, illumination * .06)})`);
                glow.addColorStop(1, 'rgba(0,0,0,0)');
                context.fillStyle = glow;
                context.beginPath();
                context.arc(drawX, drawY, glowRadius, 0, Math.PI * 2);
                context.fill();
            }

            context.beginPath();
            context.fillStyle = `rgba(${star.color},${alpha})`;
            context.arc(drawX, drawY, star.radius * (.65 + star.depth) * (1 + illumination * .65), 0, Math.PI * 2);
            context.fill();

            if (illumination > .28 && star.depth > .48) {
                context.beginPath();
                context.strokeStyle = `rgba(${star.color},${illumination * .2})`;
                context.lineWidth = .45;
                context.arc(drawX, drawY, 3 + illumination * 5, 0, Math.PI * 2);
                context.stroke();
            }

            if (star.flare && alpha > .32) {
                const flareSize = 2.5 + star.depth * 2.5;
                context.beginPath();
                context.strokeStyle = `rgba(${star.color},${alpha * .28})`;
                context.lineWidth = .45;
                context.moveTo(drawX - flareSize, drawY);
                context.lineTo(drawX + flareSize, drawY);
                context.moveTo(drawX, drawY - flareSize);
                context.lineTo(drawX, drawY + flareSize);
                context.stroke();
            }

            if (Math.abs(scrollEnergy) > 3 && star.depth > .68) {
                context.beginPath();
                context.strokeStyle = `rgba(${star.color},${Math.min(alpha * .28, .14)})`;
                context.lineWidth = .5;
                context.moveTo(drawX, drawY);
                context.lineTo(drawX, oldY + scrollEnergy * star.depth * .55);
                context.stroke();
            }
        }

        for (const mote of dust) {
            const baseY = mote.documentY - scrollPosition;
            if (baseY < -3 || baseY > height + 3) continue;
            let drawX = mote.x;
            let drawY = baseY;
            let illumination = 0;
            if (pointer.active) {
                const dx = drawX - pointer.x;
                const dy = drawY - pointer.y;
                const distance = Math.hypot(dx, dy);
                if (distance < 190) {
                    const response = (1 - distance / 190) ** 2;
                    illumination = response;
                    if (distance > 1) {
                        drawX += dx / distance * response * 8;
                        drawY += dy / distance * response * 8;
                    }
                }
            }
            const alpha = Math.min(.76, (.018 + mote.depth * .11) * (.72 + Math.sin(time * mote.twinkleSpeed + mote.phase) * .22) + illumination * .42);
            if (illumination > .08 && mote.depth > .4) {
                const glowRadius = mote.radius * (4 + illumination * 9);
                const glow = context.createRadialGradient(drawX, drawY, 0, drawX, drawY, glowRadius);
                glow.addColorStop(0, `rgba(${mote.color},${Math.min(.16, .02 + illumination * .1)})`);
                glow.addColorStop(1, 'rgba(0,0,0,0)');
                context.fillStyle = glow;
                context.beginPath();
                context.arc(drawX, drawY, glowRadius, 0, Math.PI * 2);
                context.fill();
            }
            context.beginPath();
            context.fillStyle = `rgba(${mote.color},${alpha})`;
            context.arc(drawX, drawY, mote.radius * (1 + illumination * .6), 0, Math.PI * 2);
            context.fill();
        }

        // LAYER: medium planets.
        for (const planet of mediumPlanets) {
            const baseY = planet.documentY - scrollPosition;
            const drawY = applyParallax(baseY, planet.parallaxFactor);
            if (drawY < -planet.radius * 4 || drawY > height + planet.radius * 4) continue;
            planet.documentY += planet.driftY * delta;
            drawPlanet(planet, planet.x, drawY, time);
        }

        for (const bright of mediumStars) {
            const baseY = bright.documentY - scrollPosition;
            if (baseY < -80 || baseY > height + 80) continue;
            bright.documentY += bright.driftY * (.55 + bright.depth) * delta;

            let illumination = 0;
            if (pointer.active) {
                const dx = (bright.x + bright.offsetX) - pointer.x;
                const dy = (baseY + bright.offsetY) - pointer.y;
                const distanceSquared = dx * dx + dy * dy;
                if (distanceSquared > 1 && distanceSquared < 152100) {
                    const distance = Math.sqrt(distanceSquared);
                    illumination = Math.max(0, 1 - distance / 390);
                    const response = illumination ** 2;
                    const pull = response * .85 * delta;
                    bright.velocityX += -dx / distance * pull;
                    bright.velocityY += -dy / distance * pull;
                }
            }
            const damping = Math.pow(.9, delta);
            bright.velocityX *= damping;
            bright.velocityY *= damping;
            bright.offsetX += bright.velocityX * delta;
            bright.offsetY += bright.velocityY * delta;
            const offsetDistance = Math.hypot(bright.offsetX, bright.offsetY);
            if (offsetDistance > 30) {
                const offsetScale = 30 / offsetDistance;
                bright.offsetX *= offsetScale;
                bright.offsetY *= offsetScale;
            }

            const drawX = bright.x + bright.offsetX;
            const drawY = baseY + bright.offsetY;
            const twinkle = .8 + Math.sin(time * bright.twinkleSpeed + bright.phase) * .2;
            const alpha = Math.min(1, bright.brightness * twinkle + illumination * .45);
            const radius = bright.radius * (1 + illumination * .4);

            context.save();
            context.translate(drawX, drawY);

            const haloRadius = radius * (7.5 + illumination * 3);
            const halo = context.createRadialGradient(0, 0, 0, 0, 0, haloRadius);
            halo.addColorStop(0, `rgba(${bright.color},${alpha * .34})`);
            halo.addColorStop(.4, `rgba(${bright.color},${alpha * .12})`);
            halo.addColorStop(1, 'rgba(0,0,0,0)');
            context.fillStyle = halo;
            context.beginPath();
            context.arc(0, 0, haloRadius, 0, Math.PI * 2);
            context.fill();

            const coreRadius = radius * 1.15;
            const core = context.createRadialGradient(0, 0, 0, 0, 0, coreRadius);
            core.addColorStop(0, `rgba(255,255,255,${Math.min(1, alpha * 1.05)})`);
            core.addColorStop(.62, `rgba(255,255,255,${alpha * .88})`);
            core.addColorStop(.88, `rgba(${bright.color},${alpha * .55})`);
            core.addColorStop(1, `rgba(${bright.color},0)`);
            context.fillStyle = core;
            context.beginPath();
            context.arc(0, 0, coreRadius, 0, Math.PI * 2);
            context.fill();

            context.beginPath();
            context.strokeStyle = `rgba(${bright.color},${alpha * .5})`;
            context.lineWidth = Math.max(.5, radius * .1);
            context.arc(0, 0, coreRadius * .92, 0, Math.PI * 2);
            context.stroke();

            context.restore();
        }

        // LAYER: large planets.
        for (const planet of largePlanets) {
            const baseY = planet.documentY - scrollPosition;
            const drawY = applyParallax(baseY, planet.parallaxFactor);
            if (drawY < -planet.radius * 4 || drawY > height + planet.radius * 4) continue;
            planet.documentY += planet.driftY * delta;
            drawPlanet(planet, planet.x, drawY, time);
        }

        // LAYER: massive foreground planets -- drawn last so they read as
        // closest to the camera.
        for (const planet of massivePlanets) {
            const baseY = planet.documentY - scrollPosition;
            const drawY = applyParallax(baseY, planet.parallaxFactor);
            if (drawY < -planet.radius * 2.2 || drawY > height + planet.radius * 2.2) continue;
            planet.documentY += planet.driftY * delta * .4;
            drawPlanet(planet, planet.x, drawY, time);
        }

        if (enabled && !reducedMotion.matches && !document.hidden) animationFrame = requestAnimationFrame(draw);
    };

    const resize = () => {
        width = window.innerWidth;
        height = window.innerHeight;
        frameInterval = 1000 / (lowPowerDevice || width < 700 ? 24 : 30);
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        pageHeight = Math.max(document.documentElement.scrollHeight, height);
        const pageRatio = Math.min(Math.max(pageHeight / Math.max(height, 1), 1), 4);
        const maximumStars = width < 700 ? 680 : lowPowerDevice ? 1300 : 2200;
        const minimumStars = width < 700 ? 300 : lowPowerDevice ? 520 : 680;
        const starCount = Math.round(Math.min(maximumStars, Math.max(minimumStars, (width * height / 2700) * pageRatio)));
        const maximumDust = width < 700 ? 230 : lowPowerDevice ? 360 : 500;
        const minimumDust = width < 700 ? 130 : lowPowerDevice ? 200 : 260;
        const dustCount = Math.round(Math.min(maximumDust, Math.max(minimumDust, pageHeight / 22)));
        const maximumMediumStars = width < 700 ? 16 : lowPowerDevice ? 26 : 38;
        const minimumMediumStars = width < 700 ? 7 : lowPowerDevice ? 11 : 15;
        const mediumStarCount = Math.round(Math.min(maximumMediumStars, Math.max(minimumMediumStars, pageHeight / 150)));
        buildStarClusterCenters();
        stars = Array.from({ length: starCount }, makeStar);
        dust = Array.from({ length: dustCount }, makeDust);
        mediumStars = Array.from({ length: mediumStarCount }, makeMediumStar);
        buildGalaxies();
        buildTinyDistant();
        buildSmallPlanets();
        buildMediumPlanets();
        buildLargePlanets();
        buildMassivePlanets();
        if (reducedMotion.matches) draw(performance.now(), true);
    };

    const start = () => {
        cancelAnimationFrame(animationFrame);
        if (!enabled) return;
        previousTime = performance.now();
        lastDrawTime = 0;
        if (reducedMotion.matches) draw(previousTime, true);
        else if (!document.hidden) animationFrame = requestAnimationFrame(draw);
    };

    const move = event => {
        if (!enabled) return;
        pointer.velocityX = Math.max(-28, Math.min(28, event.clientX - pointer.targetX));
        pointer.velocityY = Math.max(-28, Math.min(28, event.clientY - pointer.targetY));
        pointer.targetX = event.clientX;
        pointer.targetY = event.clientY;
        pointer.active = true;
    };

    const scroll = scrollY => {
        if (!enabled) return;
        targetScrollPosition = scrollY;
        scrollPosition = scrollY;
        scrollEnergy = 0;
    };

    document.documentElement.addEventListener('pointerleave', () => {
        pointer.active = false;
    });
    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', start);
    reducedMotion.addEventListener('change', start);
    resize();
    start();
    const setEnabled = nextEnabled => {
        enabled = nextEnabled;
        canvas.hidden = !enabled;
        cancelAnimationFrame(animationFrame);
        if (enabled) {
            resize();
            start();
        }
    };
    // Rebuild only the placement that depends on real DOM layout (large and
    // medium planets check against rendered content); everything else is
    // already positioned from page-length alone.
    const refreshLayout = () => {
        buildLargePlanets();
        buildMediumPlanets();
    };
    return { move, scroll, setEnabled, refreshLayout };
}

function setupSwipeWake(canvas, reducedMotion) {
    const context = canvas.getContext('2d', { alpha: true, desynchronized: true });
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
