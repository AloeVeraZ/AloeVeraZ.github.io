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
            '--project-card-height': 736,
            '--project-card-height-mobile': 672,
            '--project-image-height': 270,
            '--carousel-image-height': 270,
            '--ring-image-height': 270,
            '--ring-image-height-compact': 270,
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

    const wakeHighEffects = (activity = 'cursor') => {
        if (effectsMode !== 'high') return;
        document.documentElement.classList.remove('effects-background-idle', 'effects-background-click-fading');
        clearBackgroundIdleTimer();

        if (activity === 'click') {
            backgroundFadeTimer = window.setTimeout(() => {
                backgroundFadeTimer = 0;
                if (effectsMode === 'high' && !document.hidden) {
                    document.documentElement.classList.add('effects-background-click-fading');
                }
            }, 1000);
            backgroundIdleTimer = window.setTimeout(() => {
                backgroundIdleTimer = 0;
                if (effectsMode === 'high' && !document.hidden) {
                    document.documentElement.classList.remove('effects-background-click-fading');
                    document.documentElement.classList.add('effects-background-idle');
                }
            }, 4500);
            return;
        }

        if (activity === 'swipe-release') {
            backgroundIdleTimer = window.setTimeout(() => {
                backgroundIdleTimer = 0;
                if (effectsMode === 'high' && !document.hidden) {
                    document.documentElement.classList.add('effects-background-idle');
                }
            }, SWIPE_WAKE_RELEASE_DURATION);
            return;
        }

        backgroundIdleTimer = window.setTimeout(() => {
            backgroundIdleTimer = 0;
            if (effectsMode === 'high' && !document.hidden) {
                document.documentElement.classList.add('effects-background-idle');
            }
        }, 2750);
    };

    const stopHighEffectsIdleClock = () => {
        clearBackgroundIdleTimer();
        document.documentElement.classList.remove('effects-background-idle', 'effects-background-click-fading');
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
        if (useHighEffects) wakeHighEffects();
        else stopHighEffectsIdleClock();
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
                // The visual mode still works when storage is unavailable.
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
            if (effectsMode === 'high') document.documentElement.classList.add('effects-background-idle');
        } else {
            wakeHighEffects();
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
        if (effectsMode !== 'high') return;
        wakeHighEffects();
        latestPointerEvent = event;
        if (pointerFrame) return;
        pointerFrame = requestAnimationFrame(() => {
            const interfaceScale = Number.parseFloat(document.documentElement.dataset.viewportScale) || 1;
            const glowRadius = 140 * interfaceScale;
            cursor.move(latestPointerEvent);
            galaxy.move(latestPointerEvent);
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
            wakeHighEffects('swipe-release');
        }, { passive: true });
    });
    window.addEventListener('pointerdown', () => wakeHighEffects('click'), { passive: true });
    window.addEventListener('keydown', wakeHighEffects, { passive: true });
    window.addEventListener('wheel', () => {
        touchSwipeReleased = false;
        wakeHighEffects();
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
        if (!touchSwipeReleased) wakeHighEffects();
        if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScrollMotion);
    }, { passive: true });
    window.addEventListener('resize', updateScrollMotion, { passive: true });
    updateScrollMotion();
    const revealObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('in-view'); });
    }, { threshold: .12 });
    document.querySelectorAll('main .section').forEach(section => revealObserver.observe(section));
    document.getElementById('current-year').textContent = new Date().getFullYear();
    fetch('data.json?v=20260831-internship-certificates')
        .then(response => { if (!response.ok) throw new Error('Failed to load data.json'); return response.json(); })
        .then(data => {
            renderProfile(data.profile);
            renderSkills(data.skillCategories);
            renderFeaturedProjects(data.projects);
            renderProjectCollections(data.projectCollections, data.projects);
            setupModal();
            updateScrollMotion();
        })
        .catch(error => console.error('Error loading portfolio data:', error));
});

function setupGalaxyField(canvas, reducedMotion) {
    const context = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!context) return { move() {}, scroll() {}, setEnabled() {} };

    let width = window.innerWidth;
    let height = window.innerHeight;
    let stars = [];
    let constellationLinks = [];
    let meshNodes = [];
    let meshLinks = [];
    let constellationNodes = [];
    let nodeLinks = [];
    let animationFrame = 0;
    let enabled = true;
    let previousTime = performance.now();
    let lastDrawTime = 0;
    let previousScrollY = window.scrollY;
    let scrollPosition = window.scrollY;
    let targetScrollPosition = window.scrollY;
    let scrollEnergy = 0;
    const lowPowerDevice = (navigator.hardwareConcurrency || 4) <= 6
        || ('deviceMemory' in navigator && navigator.deviceMemory <= 8);
    let frameInterval = 1000 / (lowPowerDevice || width < 700 ? 24 : 30);
    const pointer = {
        x: width / 2,
        y: height / 2,
        targetX: width / 2,
        targetY: height / 2,
        rotateX: 0,
        rotateY: 0,
        targetRotateX: 0,
        targetRotateY: 0,
        velocityX: 0,
        velocityY: 0,
        active: false
    };
    const colors = ['123,168,216', '145,177,210', '178,211,239', '240,246,252', '157,143,190'];

    const makeStar = () => {
        const depth = .18 + Math.random() * .82;
        const x = Math.random() * width;
        const inGalaxyBand = Math.random() < .34;
        const bandY = height * (.2 + (x / Math.max(width, 1)) * .52);
        return {
            x,
            y: inGalaxyBand
                ? bandY + (Math.random() - .5) * height * .28
                : Math.random() * height,
            depth,
            radius: .25 + Math.random() * (depth > .75 ? 1.35 : .85),
            driftX: (Math.random() - .5) * .06,
            driftY: -.02 - Math.random() * .07,
            phase: Math.random() * Math.PI * 2,
            twinkleSpeed: .0009 + Math.random() * .0011,
            flare: depth > .78 && Math.random() < .09,
            color: colors[Math.floor(Math.random() * colors.length)]
        };
    };

    const buildConstellationLinks = () => {
        constellationLinks = [];
        const maximumLinks = width < 700 ? 8 : lowPowerDevice ? 12 : 18;
        const maximumDistanceSquared = Math.pow(width < 700 ? 145 : 190, 2);

        for (let firstIndex = 0; firstIndex < stars.length && constellationLinks.length < maximumLinks; firstIndex += 2) {
            let nearestIndex = -1;
            let nearestDistanceSquared = maximumDistanceSquared;
            for (let secondIndex = firstIndex + 1; secondIndex < stars.length; secondIndex += 1) {
                const dx = stars[firstIndex].x - stars[secondIndex].x;
                const dy = stars[firstIndex].y - stars[secondIndex].y;
                const distanceSquared = dx * dx + dy * dy;
                if (distanceSquared < nearestDistanceSquared) {
                    nearestDistanceSquared = distanceSquared;
                    nearestIndex = secondIndex;
                }
            }
            if (nearestIndex >= 0) constellationLinks.push([firstIndex, nearestIndex]);
        }
    };

    const buildVantaMesh = () => {
        const columns = width < 700 ? 3 : lowPowerDevice ? 4 : 5;
        const rows = width < 700 ? 4 : lowPowerDevice ? 4 : 5;
        meshNodes = [];
        meshLinks = [];

        for (let row = 0; row < rows; row += 1) {
            for (let column = 0; column < columns; column += 1) {
                meshNodes.push({
                    x: (column + .5 + (Math.random() - .5) * .28) / columns,
                    y: (row + .5 + (Math.random() - .5) * .26) / rows,
                    depth: .24 + Math.random() * .76,
                    phase: Math.random() * Math.PI * 2,
                    screenX: 0,
                    screenY: 0,
                    proximity: 0
                });
            }
        }

        const nodeIndex = (row, column) => row * columns + column;
        for (let row = 0; row < rows; row += 1) {
            for (let column = 0; column < columns; column += 1) {
                const current = nodeIndex(row, column);
                if (column + 1 < columns) meshLinks.push([current, nodeIndex(row, column + 1)]);
                if (row + 1 < rows) meshLinks.push([current, nodeIndex(row + 1, column)]);
                if (row + 1 < rows && column + 1 < columns && (row + column) % 2 === 0) {
                    meshLinks.push([current, nodeIndex(row + 1, column + 1)]);
                }
                if (row + 1 < rows && column > 0 && (row + column) % 3 === 0) {
                    meshLinks.push([current, nodeIndex(row + 1, column - 1)]);
                }
            }
        }
    };

    const buildConstellationNodes = () => {
        const nodeCount = width < 700 ? 4 : lowPowerDevice ? 5 : 7;
        const sizeScale = width < 700 ? .72 : 1;
        const anchors = [
            [.09, .17], [.48, .11], [.88, .2], [.23, .42], [.64, .38],
            [.47, .64], [.87, .61], [.13, .77], [.69, .86], [.36, .91]
        ];
        const planetColors = ['114,159,204', '132,151,188', '148,132,177', '109,174,184', '170,158,140'];

        constellationNodes = anchors.slice(0, nodeCount).map(([anchorX, anchorY], index) => {
            const isBlackHole = index === 2 || index === 7 || (index > 4 && Math.random() < .12);
            const radius = (isBlackHole ? 21 + Math.random() * 13 : 31 + Math.random() * 30) * sizeScale;
            const orbiterCount = lowPowerDevice ? 1 : (Math.random() < .7 ? 1 : 2);
            return {
                x: Math.min(.94, Math.max(.06, anchorX + (Math.random() - .5) * .055)),
                y: Math.min(.93, Math.max(.07, anchorY + (Math.random() - .5) * .05)),
                radius,
                type: isBlackHole ? 'black-hole' : 'planet',
                color: planetColors[Math.floor(Math.random() * planetColors.length)],
                phase: Math.random() * Math.PI * 2,
                scrollDepth: 1,
                ringTilt: .28 + Math.random() * .3,
                ringRotation: Math.random() * Math.PI,
                ringSpeed: (.000025 + Math.random() * .000035) * (index % 2 ? -1 : 1),
                ringBands: isBlackHole ? (lowPowerDevice ? 3 : 5) : (index % 3 === 0 ? 3 : 2),
                offsetX: 0,
                offsetY: 0,
                velocityX: 0,
                velocityY: 0,
                orbiters: Array.from({ length: orbiterCount }, (_, orbiterIndex) => ({
                    distance: 1.35 + orbiterIndex * .34 + Math.random() * .14,
                    phase: Math.random() * Math.PI * 2,
                    size: (isBlackHole ? 1.1 : 1.5) + Math.random() * (isBlackHole ? 1.3 : 1.8),
                    speed: (isBlackHole ? .00028 : .0001) * (orbiterIndex % 2 ? -1 : 1) * (.78 + Math.random() * .45)
                }))
            };
        });

        nodeLinks = [];
        const seenLinks = new Set();
        const maximumLinks = Math.round(nodeCount * 1.5);
        for (let firstIndex = 0; firstIndex < constellationNodes.length && nodeLinks.length < maximumLinks; firstIndex += 1) {
            const neighbors = constellationNodes
                .map((node, secondIndex) => {
                    const dx = constellationNodes[firstIndex].x - node.x;
                    const dy = constellationNodes[firstIndex].y - node.y;
                    return { secondIndex, distanceSquared: dx * dx + dy * dy };
                })
                .filter(({ secondIndex }) => secondIndex !== firstIndex)
                .sort((first, second) => first.distanceSquared - second.distanceSquared)
                .slice(0, 2);

            for (const { secondIndex } of neighbors) {
                const lowerIndex = Math.min(firstIndex, secondIndex);
                const upperIndex = Math.max(firstIndex, secondIndex);
                const key = `${lowerIndex}-${upperIndex}`;
                if (seenLinks.has(key)) continue;
                seenLinks.add(key);
                nodeLinks.push([lowerIndex, upperIndex]);
                if (nodeLinks.length >= maximumLinks) break;
            }
        }
    };

    const drawVantaMesh = time => {
        const verticalShift = scrollPosition;

        for (const node of meshNodes) {
            const wave = Math.sin(time * .00042 + node.phase) * (3 + node.depth * 7);
            let screenX = node.x * width + pointer.rotateY * node.depth * 3.4;
            let screenY = node.y * height - verticalShift + wave - pointer.rotateX * node.depth * 2.8;
            const span = height + 140;
            screenY = ((screenY + 70) % span + span) % span - 70;

            let proximity = 0;
            if (pointer.active) {
                const dx = screenX - pointer.x;
                const dy = screenY - pointer.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                proximity = Math.max(0, 1 - distance / 235);
                if (distance > 1 && proximity > 0) {
                    const deflection = proximity * proximity * (8 + node.depth * 13);
                    screenX += dx / distance * deflection;
                    screenY += dy / distance * deflection;
                }
            }

            node.screenX = screenX;
            node.screenY = screenY;
            node.proximity = proximity;
        }

        for (const [firstIndex, secondIndex] of meshLinks) {
            const first = meshNodes[firstIndex];
            const second = meshNodes[secondIndex];
            if (!first || !second) continue;
            const dx = second.screenX - first.screenX;
            const dy = second.screenY - first.screenY;
            const distanceSquared = dx * dx + dy * dy;
            const maximumLength = Math.max(width / 3.2, 245);
            if (distanceSquared > maximumLength * maximumLength) continue;
            const response = Math.max(first.proximity, second.proximity);
            const depth = (first.depth + second.depth) / 2;

            context.beginPath();
            context.strokeStyle = `rgba(104,157,209,${.014 + depth * .024 + response * .15})`;
            context.lineWidth = .32 + depth * .28 + response * .5;
            context.moveTo(first.screenX, first.screenY);
            context.lineTo(second.screenX, second.screenY);
            context.stroke();
        }

        for (const node of meshNodes) {
            const pointRadius = .45 + node.depth * .85 + node.proximity * .7;
            context.beginPath();
            context.fillStyle = `rgba(171,207,237,${.08 + node.depth * .13 + node.proximity * .32})`;
            context.arc(node.screenX, node.screenY, pointRadius, 0, Math.PI * 2);
            context.fill();
        }
    };

    const drawConstellations = time => {
        const maximumLinkLength = width < 700 ? 170 : 220;
        for (const [firstIndex, secondIndex] of constellationLinks) {
            const first = stars[firstIndex];
            const second = stars[secondIndex];
            if (!first || !second) continue;
            const firstX = first.x + pointer.rotateY * first.depth * 1.35;
            const firstY = first.y - pointer.rotateX * first.depth * 1.35;
            const secondX = second.x + pointer.rotateY * second.depth * 1.35;
            const secondY = second.y - pointer.rotateX * second.depth * 1.35;
            const linkX = secondX - firstX;
            const linkY = secondY - firstY;
            if (linkX * linkX + linkY * linkY > maximumLinkLength * maximumLinkLength) continue;

            let illumination = 0;
            if (pointer.active) {
                const midpointX = (firstX + secondX) / 2;
                const midpointY = (firstY + secondY) / 2;
                const dx = midpointX - pointer.x;
                const dy = midpointY - pointer.y;
                illumination = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / 210);
            }
            const shimmer = .78 + Math.sin(time * .0008 + first.phase) * .16;
            context.beginPath();
            context.strokeStyle = `rgba(123,168,216,${(.035 + illumination * .22) * shimmer})`;
            context.lineWidth = .4 + illumination * .8;
            context.moveTo(firstX, firstY);
            context.lineTo(secondX, secondY);
            context.stroke();
        }
    };

    const drawRingBands = (node, radius, time, alpha, frontHalf) => {
        const rotation = node.ringRotation + time * node.ringSpeed + Math.sin(time * .00019 + node.phase) * .08;
        context.save();
        context.rotate(rotation);
        context.scale(1, node.ringTilt);

        for (let bandIndex = 0; bandIndex < node.ringBands; bandIndex += 1) {
            const bandRadius = radius * (1.18 + bandIndex * .16);
            const isAccent = bandIndex === Math.floor(node.ringBands / 2);
            const color = isAccent ? '164,132,194' : node.color;
            const startAngle = frontHalf ? 0 : Math.PI;
            const endAngle = frontHalf ? Math.PI : Math.PI * 2;
            context.beginPath();
            context.strokeStyle = `rgba(${color},${alpha * (frontHalf ? .92 : .35) * (1 - bandIndex * .09)})`;
            context.lineWidth = (frontHalf ? 1.1 : .65) - bandIndex * .08;
            context.arc(0, 0, bandRadius, startAngle, endAngle);
            context.stroke();
        }
        context.restore();
    };

    const drawCircularConstellation = (time, delta) => {
        for (const node of constellationNodes) {
            const margin = node.radius * 2.8;
            const verticalSpan = height + margin * 2;
            const rawY = node.y * height - scrollPosition * node.scrollDepth;
            const baseX = node.x * width + pointer.rotateY * 2.2;
            const baseY = ((rawY + margin) % verticalSpan + verticalSpan) % verticalSpan - margin - pointer.rotateX * 2.2;

            if (pointer.active) {
                let dx = baseX + node.offsetX - pointer.x;
                let dy = baseY + node.offsetY - pointer.y;
                let distance = Math.sqrt(dx * dx + dy * dy);
                const influenceRadius = node.radius + 145;
                if (distance < influenceRadius) {
                    if (distance < 1) {
                        dx = Math.cos(node.phase);
                        dy = Math.sin(node.phase);
                        distance = 1;
                    }
                    const mass = .8 + node.radius / 58;
                    const force = (1 - distance / influenceRadius) * .38 * delta / mass;
                    node.velocityX += dx / distance * force;
                    node.velocityY += dy / distance * force;
                }
            }

            node.velocityX += -node.offsetX * .0065 * delta;
            node.velocityY += -node.offsetY * .0065 * delta;
            const damping = Math.pow(.88, delta);
            node.velocityX *= damping;
            node.velocityY *= damping;
            node.offsetX += node.velocityX * delta;
            node.offsetY += node.velocityY * delta;

            const offsetDistance = Math.sqrt(node.offsetX * node.offsetX + node.offsetY * node.offsetY);
            if (offsetDistance > 110) {
                const offsetScale = 110 / offsetDistance;
                node.offsetX *= offsetScale;
                node.offsetY *= offsetScale;
            }

            node.screenX = baseX + node.offsetX;
            node.screenY = baseY + node.offsetY;
        }

        for (const [firstIndex, secondIndex] of nodeLinks) {
            const first = constellationNodes[firstIndex];
            const second = constellationNodes[secondIndex];
            if (!first || !second) continue;
            const firstX = first.screenX;
            const firstY = first.screenY;
            const secondX = second.screenX;
            const secondY = second.screenY;
            const linkX = secondX - firstX;
            const linkY = secondY - firstY;
            const maximumLinkLength = Math.max(260, Math.min(width, height) * .72);
            if (linkX * linkX + linkY * linkY > maximumLinkLength * maximumLinkLength) continue;
            const midpointX = (firstX + secondX) / 2;
            const midpointY = (firstY + secondY) / 2;
            const dx = midpointX - pointer.x;
            const dy = midpointY - pointer.y;
            const proximity = pointer.active ? Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / 270) : 0;

            context.beginPath();
            context.strokeStyle = `rgba(123,168,216,${.032 + proximity * .2})`;
            context.lineWidth = .45 + proximity * .65;
            context.moveTo(firstX, firstY);
            context.lineTo(secondX, secondY);
            context.stroke();
        }

        for (const node of constellationNodes) {
            const x = node.screenX;
            const y = node.screenY;
            const pulse = .84 + Math.sin(time * .001 + node.phase) * .12;
            const alpha = .075 * pulse;
            const radius = node.radius;

            context.save();
            context.translate(x, y);
            drawRingBands(node, radius, time, alpha, false);

            if (node.type === 'black-hole') {
                context.fillStyle = 'rgba(1,2,5,.82)';
                context.beginPath();
                context.arc(0, 0, radius * .72, 0, Math.PI * 2);
                context.fill();

                context.beginPath();
                context.strokeStyle = `rgba(207,226,244,${alpha * .82})`;
                context.lineWidth = .65;
                context.arc(0, 0, radius * .76, 0, Math.PI * 2);
                context.stroke();
            } else {
                context.fillStyle = `rgba(${node.color},${alpha * .42})`;
                context.beginPath();
                context.arc(0, 0, radius, 0, Math.PI * 2);
                context.fill();

                context.fillStyle = 'rgba(4,7,11,.18)';
                context.beginPath();
                context.arc(radius * .22, radius * .08, radius * .92, 0, Math.PI * 2);
                context.fill();

                context.beginPath();
                context.strokeStyle = `rgba(${node.color},${alpha * 1.18})`;
                context.lineWidth = .75;
                context.arc(0, 0, radius, 0, Math.PI * 2);
                context.stroke();
                context.beginPath();
                context.strokeStyle = `rgba(210,229,245,${alpha * .38})`;
                context.lineWidth = .45;
                context.arc(0, 0, radius * .78, node.phase, node.phase + Math.PI * 1.15);
                context.stroke();
            }

            drawRingBands(node, radius, time, alpha, true);

            for (const orbiter of node.orbiters) {
                const orbitRadius = radius * orbiter.distance;
                const orbitAngle = time * orbiter.speed + orbiter.phase;
                const orbiterX = Math.cos(orbitAngle) * orbitRadius;
                const orbitTilt = .58 + node.ringTilt * .32;
                const orbiterY = Math.sin(orbitAngle) * orbitRadius * orbitTilt;

                context.beginPath();
                context.strokeStyle = `rgba(145,190,232,${alpha * (node.type === 'black-hole' ? .35 : .2)})`;
                context.lineWidth = .4;
                context.ellipse(0, 0, orbitRadius, orbitRadius * orbitTilt, 0, 0, Math.PI * 2);
                context.stroke();
                context.beginPath();
                context.fillStyle = `rgba(198,222,243,${alpha * 1.45})`;
                context.arc(orbiterX, orbiterY, orbiter.size, 0, Math.PI * 2);
                context.fill();
                context.beginPath();
                context.strokeStyle = `rgba(123,168,216,${alpha * .5})`;
                context.ellipse(0, 0, orbitRadius, orbitRadius * orbitTilt, 0, orbitAngle - .48, orbitAngle);
                context.stroke();
            }
            context.restore();
        }
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
        pointer.rotateX += (pointer.targetRotateX - pointer.rotateX) * .12;
        pointer.rotateY += (pointer.targetRotateY - pointer.rotateY) * .12;
        pointer.velocityX *= .8;
        pointer.velocityY *= .8;
        scrollPosition = targetScrollPosition;
        scrollEnergy *= .84;
        drawVantaMesh(time);
        drawConstellations(time);
        drawCircularConstellation(time, delta);

        for (const star of stars) {
            const oldY = star.y;
            const speed = .55 + star.depth * 1.2;
            star.x += star.driftX * speed * delta;
            star.y += (star.driftY * speed - scrollEnergy * star.depth * .006) * delta;

            let illumination = 0;
            if (pointer.active) {
                const dx = star.x - pointer.x;
                const dy = star.y - pointer.y;
                const distanceSquared = dx * dx + dy * dy;
                if (distanceSquared < 44100) {
                    illumination = Math.max(0, 1 - Math.sqrt(distanceSquared) / 210);
                }
                if (distanceSquared > 1 && distanceSquared < 19600) {
                    const distance = Math.sqrt(distanceSquared);
                    const force = (1 - distance / 140) * star.depth * .38 * delta;
                    star.x += dx / distance * force + pointer.velocityX * force * .018;
                    star.y += dy / distance * force + pointer.velocityY * force * .018;
                }
            }

            if (star.y < -8) star.y = height + 8;
            else if (star.y > height + 8) star.y = -8;
            if (star.x < -8) star.x = width + 8;
            else if (star.x > width + 8) star.x = -8;

            const alpha = Math.min(.92, (.1 + star.depth * .48) * (.64 + Math.sin(time * star.twinkleSpeed + star.phase) * .18) + illumination * .38);
            const drawX = star.x + pointer.rotateY * star.depth * 1.35;
            const drawY = star.y - pointer.rotateX * star.depth * 1.35;
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
        const maximumStars = width < 700 ? 28 : lowPowerDevice ? 36 : 56;
        const minimumStars = width < 700 ? 18 : lowPowerDevice ? 24 : 34;
        const starCount = Math.round(Math.min(maximumStars, Math.max(minimumStars, width * height / 27000)));
        stars = Array.from({ length: starCount }, makeStar);
        buildVantaMesh();
        buildConstellationLinks();
        buildConstellationNodes();
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
        pointer.targetRotateX = -((event.clientY / height) - .5) * 4;
        pointer.targetRotateY = ((event.clientX / width) - .5) * 5;
        pointer.active = true;
    };

    const scroll = scrollY => {
        if (!enabled) return;
        const scrollDelta = scrollY - previousScrollY;
        targetScrollPosition = scrollY;
        scrollPosition = scrollY;
        scrollEnergy = 0;
        for (const star of stars) {
            const verticalSpan = height + 16;
            star.y = ((star.y - scrollDelta + 8) % verticalSpan + verticalSpan) % verticalSpan - 8;
        }
        previousScrollY = scrollY;
    };

    document.documentElement.addEventListener('pointerleave', () => {
        pointer.active = false;
        pointer.targetRotateX = 0;
        pointer.targetRotateY = 0;
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
    return { move, scroll, setEnabled };
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
                (10 + (30 * easedRipple)) * interfaceScale,
                Math.max(1, interfaceScale),
                '145, 200, 255',
                .62 * fadeStrength,
                7 * interfaceScale
            );

            if (animationAge > 110) {
                const echoProgress = Math.min((animationAge - 110) / 620, 1);
                const easedEcho = 1 - ((1 - echoProgress) ** 3);
                drawRippleOutline(
                    trail,
                    (8 + (24 * easedEcho)) * interfaceScale,
                    Math.max(1, .7 * interfaceScale),
                    '168, 213, 255',
                    .3 * fadeStrength,
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

function buildTwoSentenceCardSummary(project) {
  if (project.cardSummary) return project.cardSummary;

    const lastSection = project.sections?.[project.sections.length - 1]?.body;
    const sources = [
        project.summary,
        project.programSummary,
        project.overview?.result,
        project.classRundown,
        project.details,
        lastSection
    ].filter(Boolean);
    const sentences = [];
    sources.forEach(source => {
        String(source).trim().split(/(?<=[.!?])\s+/).forEach(part => {
            const clean = part.trim();
            if (!clean) return;
            const sentence = /[.!?]$/.test(clean) ? clean : `${clean}.`;
            if (!sentences.some(existing => existing.toLowerCase() === sentence.toLowerCase())) sentences.push(sentence);
        });
    });
    if (sentences.length < 2) sentences.push('Open the project to see the complete design and build details.');
    return sentences.slice(0, 2).join(' ');
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
    const cardDescription = buildTwoSentenceCardSummary(project);
    card.innerHTML = `<div class="project-image-wrapper">${cardMedia}<span class="project-category-badge">${project.category}</span></div><div class="project-info"><h3 class="project-title">${project.title}</h3>${projectPeriod}<p class="project-summary">${cardDescription}</p><div class="project-tags">${project.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}</div><div class="project-action-links">${buildLinkButtons(project.links)}</div></div>`;
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
    const cloneCount = settings.finite ? 0 : Math.min(settings.ring ? 3 : 2, originalCards.length);
    const isEnabled = () => typeof settings.enabled !== 'function' || settings.enabled();
    if (settings.ring) carousel.style.setProperty('--ring-project-count', String(ringSlots));
    originalCards.forEach((card, index) => { card.dataset.carouselIndex = String(index); });
    const beforeClones = document.createDocumentFragment();
    const prepareClone = card => {
        const clone = card.cloneNode(true);
        clone.classList.add('carousel-clone');
        clone.setAttribute('aria-hidden', 'true');
        clone.setAttribute('tabindex', '-1');
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
    let autoplayTimer;
    let scrollAnimation;
    let snapTimer;
    let resizeFrame;
    let initialized = false;
    let isAnimating = false;
    let queuedSteps = 0;
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
    let recentCarouselClicks = [];
    let rapidClickStreak = 0;
    let lastCarouselClickAt = 0;
    let carouselSpeedMultiplier = 1;
    let burstResetTimer;
    let overdriveStopTimer;
    let overdriveActive = false;
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
        carousel.scrollTo({ left, behavior: 'auto' });
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
            return { card, position, logicalIndex: Number(card.dataset.carouselIndex) };
        });
        const ringRepresentatives = new Map();
        if (settings.ring) {
            cardStates.forEach(state => {
                const current = ringRepresentatives.get(state.logicalIndex);
                const closer = !current || Math.abs(state.position) < Math.abs(current.position) - .001;
                const equalButForward = current
                    && Math.abs(Math.abs(state.position) - Math.abs(current.position)) <= .001
                    && state.position >= 0
                    && current.position < 0;
                if (closer || equalButForward) ringRepresentatives.set(state.logicalIndex, state);
            });
        }
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
                const visiblePixels = carousel.clientWidth / 2
                    - (Math.abs(targetX) - metrics.cardWidth * ringScale / 2);
                const visibleOnRing = ringRepresentatives.get(state.logicalIndex) === state
                    && rawAbsolutePosition <= 3.05
                    && visiblePixels >= 28;
                const circleOpacity = visibleOnRing ? visibleOpacity : 0;
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
            queuedSteps = 0;
            currentIndex = 0;
            setInternalScrollPosition(0);
            clearCardDepth();
            updateIndicators();
            return;
        }
        const metrics = getMetrics();
        if (!metrics || metrics.distance <= 0) return;
        window.cancelAnimationFrame(scrollAnimation);
        if (!initialized) currentIndex = 0;
        setInternalScrollPosition(getTargetForPhysicalIndex(cloneCount + currentIndex));
        initialized = true;
        isAnimating = false;
        queuedSteps = 0;
        updateCardDepth();
        updateIndicators();
    };

    const syncIndexToNearestCard = () => {
        const physicalIndex = getNearestPhysicalIndex();
        currentIndex = settings.finite
            ? Math.max(0, Math.min(physicalIndex, originalCards.length - 1))
            : ((physicalIndex - cloneCount) % originalCards.length + originalCards.length) % originalCards.length;
        updateIndicators();
    };

    const stopAndCenterCurrentMotion = () => {
        window.cancelAnimationFrame(scrollAnimation);
        if (isAnimating) {
            isAnimating = false;
            queuedSteps = 0;
            syncIndexToNearestCard();
        }
        if (!getMetrics()) return;
        setInternalScrollPosition(getTargetForPhysicalIndex(cloneCount + currentIndex));
        updateCardDepth();
        updateIndicators();
    };

    const snapToNearestCard = () => {
        const metrics = getMetrics();
        if (!metrics) return;
        const physicalIndex = getNearestPhysicalIndex();
        currentIndex = settings.finite
            ? Math.max(0, Math.min(physicalIndex, originalCards.length - 1))
            : ((physicalIndex - cloneCount) % originalCards.length + originalCards.length) % originalCards.length;
        const resetIndex = !settings.finite && (physicalIndex < cloneCount || physicalIndex >= cloneCount + originalCards.length)
            ? cloneCount + currentIndex
            : null;
        updateIndicators();
        animateScroll(getTargetForPhysicalIndex(physicalIndex), () => {
            if (resetIndex !== null) {
                setInternalScrollPosition(getTargetForPhysicalIndex(resetIndex));
                updateCardDepth();
            }
        });
    };

    const animateScroll = (target, onComplete) => {
        window.cancelAnimationFrame(scrollAnimation);
        const start = carousel.scrollLeft;
        const change = target - start;
        const baseDuration = 470;
        let animationProgress = reducedMotion.matches ? 1 : 0;
        let lastFrameAt = performance.now();
        isAnimating = true;
        const frame = now => {
            if (!reducedMotion.matches) {
                const frameTime = Math.min(Math.max(now - lastFrameAt, 0), 64);
                animationProgress = Math.min(animationProgress + (frameTime * carouselSpeedMultiplier / baseDuration), 1);
                lastFrameAt = now;
            }
            const progress = animationProgress;
            const eased = 1 - Math.pow(1 - progress, 4);
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
        if (isAnimating) {
            queuedSteps += step;
            return;
        }
        const metrics = getMetrics();
        if (!metrics || metrics.lastIndex <= 0) return;
        const direction = Math.sign(step);
        const positionCount = originalCards.length;
        const nextIndex = settings.finite
            ? Math.max(0, Math.min(currentIndex + direction, metrics.lastIndex))
            : (currentIndex + direction + positionCount) % positionCount;
        if (settings.finite && nextIndex === currentIndex) {
            queuedSteps = 0;
            updateIndicators();
            return;
        }
        const wrappingBackward = currentIndex === 0 && direction < 0;
        const wrappingForward = currentIndex === metrics.lastIndex && direction > 0;
        let physicalIndex = cloneCount + nextIndex;
        let resetIndex = null;
        if (!settings.finite && wrappingBackward) {
            physicalIndex = cloneCount - 1;
            resetIndex = cloneCount + metrics.lastIndex;
        } else if (!settings.finite && wrappingForward) {
            physicalIndex = cloneCount + originalCards.length;
            resetIndex = cloneCount;
        }
        currentIndex = nextIndex;
        updateIndicators();
        animateScroll(getTargetForPhysicalIndex(physicalIndex), () => {
            if (resetIndex !== null) {
                setInternalScrollPosition(getTargetForPhysicalIndex(resetIndex));
                updateCardDepth();
            }
            if (queuedSteps !== 0) {
                const queuedDirection = Math.sign(queuedSteps);
                queuedSteps -= queuedDirection;
                move(queuedDirection);
            }
        });
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
    const returnToFirstProject = () => {
        const positionCount = originalCards.length;
        if (!positionCount) return;
        const forwardSteps = (positionCount - currentIndex) % positionCount;
        const backwardSteps = forwardSteps - positionCount;
        const stepsToFirst = Math.abs(forwardSteps) <= Math.abs(backwardSteps) ? forwardSteps : backwardSteps;
        queuedSteps = 0;
        if (stepsToFirst === 0) return;
        if (isAnimating) {
            queuedSteps = stepsToFirst;
            return;
        }
        const direction = Math.sign(stepsToFirst);
        queuedSteps = direction * Math.max(Math.abs(stepsToFirst) - 1, 0);
        move(direction);
    };
    const finishOverdrive = () => {
        if (!overdriveActive) return;
        window.clearTimeout(overdriveStopTimer);
        overdriveActive = false;
        carousel.dataset.carouselOverdrive = 'false';
        document.documentElement.classList.remove('carousel-overdrive');
        returnToFirstProject();
        pauseAfterInteraction(3000);
    };
    const scheduleOverdriveStop = () => {
        window.clearTimeout(overdriveStopTimer);
        overdriveStopTimer = window.setTimeout(finishOverdrive, 600);
    };
    const resetCarouselBurst = () => {
        window.clearTimeout(burstResetTimer);
        if (isAnimating || queuedSteps !== 0) {
            burstResetTimer = window.setTimeout(resetCarouselBurst, 250);
            return;
        }
        recentCarouselClicks = [];
        rapidClickStreak = 0;
        lastCarouselClickAt = 0;
        carouselSpeedMultiplier = 1;
        carousel.dataset.carouselSpeed = '1.00';
        carousel.dataset.carouselBurst = '0';
    };
    const registerCarouselClick = () => {
        const now = performance.now();
        recentCarouselClicks = recentCarouselClicks.filter(timestamp => now - timestamp <= 3000);
        recentCarouselClicks.push(now);
        rapidClickStreak = now - lastCarouselClickAt <= 500 ? rapidClickStreak + 1 : 1;
        lastCarouselClickAt = now;
        const burstCount = Math.max(recentCarouselClicks.length, rapidClickStreak);
        carouselSpeedMultiplier = burstCount <= 4
            ? 1
            : Math.min(3, 1 + ((burstCount - 4) / 8) * 2);
        carousel.dataset.carouselSpeed = carouselSpeedMultiplier.toFixed(2);
        carousel.dataset.carouselBurst = String(burstCount);
        window.clearTimeout(burstResetTimer);
        burstResetTimer = window.setTimeout(resetCarouselBurst, 3000);

        if (rapidClickStreak >= 15) {
            if (!overdriveActive) {
                overdriveActive = true;
                carousel.dataset.carouselOverdrive = 'true';
                if (!reducedMotion.matches) {
                    document.documentElement.classList.add('carousel-overdrive');
                }
            }
            scheduleOverdriveStop();
        }
    };
    previous.addEventListener('pointerdown', () => {
        pauseAfterInteraction();
    });
    next.addEventListener('pointerdown', () => {
        pauseAfterInteraction();
    });
    previous.addEventListener('click', () => {
        registerCarouselClick();
        move(-1, previous);
        pauseAfterInteraction();
    });
    next.addEventListener('click', () => {
        registerCarouselClick();
        move(1, next);
        pauseAfterInteraction();
    });
    const arrowControlGroup = previous?.parentElement;
    arrowControlGroup?.addEventListener('pointerleave', () => {
        if (overdriveActive) {
            finishOverdrive();
            return;
        }
        // Let the step already on screen finish, but discard the rest of a
        // normal click burst once the pointer leaves the arrow controls.
        queuedSteps = 0;
        pauseAfterInteraction(3000);
    }, { passive: true });
    indicators?.querySelectorAll('.carousel-indicator').forEach((indicator, targetIndex) => {
        indicator.addEventListener('click', () => {
            if (!isEnabled()) return;
            stopAndCenterCurrentMotion();
            if (targetIndex === currentIndex) return;
            queuedSteps = 0;
            const directStep = targetIndex - currentIndex;
            const forward = (directStep + originalCards.length) % originalCards.length;
            const backward = forward - originalCards.length;
            const shortestStep = settings.finite
                ? directStep
                : (Math.abs(forward) <= Math.abs(backward) ? forward : backward);
            queuedSteps = Math.sign(shortestStep) * Math.max(Math.abs(shortestStep) - 1, 0);
            move(Math.sign(shortestStep));
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
        queuedSteps = 0;
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
    overviewGrid.classList.toggle('is-class-rundown', isCoursework);
    const overviewItems = isCoursework
        ? [['What I Did', project.classRundown || project.summary]]
        : project.overview
        ? [['Why I Made It', project.overview.problem], ['What I Did', project.overview.method], ['How It Turned Out', project.overview.result]]
        : [];
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
