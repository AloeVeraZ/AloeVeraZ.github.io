document.addEventListener('DOMContentLoaded', () => {
    const galaxyCanvas = document.createElement('canvas');
    galaxyCanvas.className = 'galaxy-field';
    galaxyCanvas.setAttribute('aria-hidden', 'true');
    const ambientGlow = document.createElement('div');
    ambientGlow.className = 'ambient-glow';
    ambientGlow.setAttribute('aria-hidden', 'true');
    document.body.prepend(galaxyCanvas);
    galaxyCanvas.after(ambientGlow);
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
    const galaxy = setupGalaxyField(galaxyCanvas, reducedMotion);
    const cursor = setupCursorEffects(cursorDot, reducedMotion);
    let pointerEffectFrame = 0;
    let targetGlowX = window.innerWidth / 2;
    let targetGlowY = window.innerHeight * .2;
    let currentGlowX = targetGlowX;
    let currentGlowY = targetGlowY;

    const animatePointerEffect = () => {
        const followSpeed = reducedMotion.matches ? 1 : .14;
        currentGlowX += (targetGlowX - currentGlowX) * followSpeed;
        currentGlowY += (targetGlowY - currentGlowY) * followSpeed;
        ambientGlow.style.setProperty('--glow-x', `${currentGlowX}px`);
        ambientGlow.style.setProperty('--glow-y', `${currentGlowY}px`);
        ambientGlow.style.transform = `translate3d(${currentGlowX - 210}px, ${currentGlowY - 210}px, 0)`;

        const remainingDistance = Math.abs(targetGlowX - currentGlowX) + Math.abs(targetGlowY - currentGlowY);
        if (remainingDistance > .35) {
            pointerEffectFrame = requestAnimationFrame(animatePointerEffect);
        } else {
            currentGlowX = targetGlowX;
            currentGlowY = targetGlowY;
            pointerEffectFrame = 0;
        }
    };

    window.addEventListener('pointermove', event => {
        targetGlowX = event.clientX;
        targetGlowY = event.clientY;
        cursor.move(event);
        galaxy.move(event);
        if (!pointerEffectFrame) pointerEffectFrame = requestAnimationFrame(animatePointerEffect);
    }, { passive: true });

    const pageScrollFill = pageScrollProgress.querySelector('.page-scroll-fill');
    let scrollFrame = 0;
    const updateScrollMotion = () => {
        const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
        const progress = Math.min(Math.max(window.scrollY / maxScroll, 0), 1);
        pageScrollFill.style.transform = `scaleY(${progress})`;

        document.body.classList.toggle('has-scrolled', window.scrollY > 18);
        scrollFrame = 0;
    };
    window.addEventListener('scroll', () => {
        if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScrollMotion);
    }, { passive: true });
    window.addEventListener('resize', updateScrollMotion, { passive: true });
    updateScrollMotion();
    const revealObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('in-view'); });
    }, { threshold: .12 });
    document.querySelectorAll('main .section').forEach(section => revealObserver.observe(section));
    document.getElementById('current-year').textContent = new Date().getFullYear();
    fetch('data.json')
        .then(response => { if (!response.ok) throw new Error('Failed to load data.json'); return response.json(); })
        .then(data => {
            renderProfile(data.profile);
            renderSkills(data.skillCategories);
            setupInteractiveTilt(reducedMotion);
            renderFeaturedProjects(data.projects);
            renderProjectCollections(data.projectCollections, data.projects);
            setupModal();
            updateScrollMotion();
        })
        .catch(error => console.error('Error loading portfolio data:', error));
});

function setupGalaxyField(canvas, reducedMotion) {
    const context = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!context) return { move() {} };

    let width = window.innerWidth;
    let height = window.innerHeight;
    let stars = [];
    let animationFrame = 0;
    let previousTime = performance.now();
    let lastDrawTime = 0;
    let previousScrollY = window.scrollY;
    let scrollEnergy = 0;
    let frameInterval = width < 700 ? 1000 / 24 : 1000 / 30;
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
    const colors = ['123,168,216', '178,211,239', '240,246,252'];

    const makeStar = () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        depth: .18 + Math.random() * .82,
        radius: .3 + Math.random(),
        driftX: (Math.random() - .5) * .06,
        driftY: -.02 - Math.random() * .07,
        phase: Math.random() * Math.PI * 2,
        color: colors[Math.floor(Math.random() * colors.length)]
    });

    const draw = (time, force = false) => {
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
        canvas.style.transform = `perspective(850px) rotateX(${pointer.rotateX.toFixed(2)}deg) rotateY(${pointer.rotateY.toFixed(2)}deg) scale(1.07)`;
        scrollEnergy *= .84;

        for (const star of stars) {
            const oldY = star.y;
            const speed = .55 + star.depth * 1.2;
            star.x += star.driftX * speed * delta;
            star.y += (star.driftY * speed - scrollEnergy * star.depth * .006) * delta;

            if (pointer.active) {
                const dx = star.x - pointer.x;
                const dy = star.y - pointer.y;
                const distanceSquared = dx * dx + dy * dy;
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

            const alpha = (.12 + star.depth * .5) * (.62 + Math.sin(time * .0014 + star.phase) * .2);
            const drawX = star.x + pointer.rotateY * star.depth * 1.35;
            const drawY = star.y - pointer.rotateX * star.depth * 1.35;
            context.beginPath();
            context.fillStyle = `rgba(${star.color},${alpha})`;
            context.arc(drawX, drawY, star.radius * (.65 + star.depth), 0, Math.PI * 2);
            context.fill();

            if (Math.abs(scrollEnergy) > 3 && star.depth > .68) {
                context.beginPath();
                context.strokeStyle = `rgba(${star.color},${Math.min(alpha * .28, .14)})`;
                context.lineWidth = .5;
                context.moveTo(drawX, drawY);
                context.lineTo(drawX, oldY + scrollEnergy * star.depth * .55);
                context.stroke();
            }
        }

        if (!reducedMotion.matches && !document.hidden) animationFrame = requestAnimationFrame(draw);
    };

    const resize = () => {
        width = window.innerWidth;
        height = window.innerHeight;
        frameInterval = width < 700 ? 1000 / 24 : 1000 / 30;
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        const starCount = Math.round(Math.min(76, Math.max(width < 700 ? 34 : 48, width * height / 22000)));
        stars = Array.from({ length: starCount }, makeStar);
        if (reducedMotion.matches) draw(performance.now(), true);
    };

    const start = () => {
        cancelAnimationFrame(animationFrame);
        previousTime = performance.now();
        lastDrawTime = 0;
        if (reducedMotion.matches) draw(previousTime, true);
        else if (!document.hidden) animationFrame = requestAnimationFrame(draw);
    };

    const move = event => {
        pointer.velocityX = Math.max(-28, Math.min(28, event.clientX - pointer.targetX));
        pointer.velocityY = Math.max(-28, Math.min(28, event.clientY - pointer.targetY));
        pointer.targetX = event.clientX;
        pointer.targetY = event.clientY;
        pointer.targetRotateX = -((event.clientY / height) - .5) * 4;
        pointer.targetRotateY = ((event.clientX / width) - .5) * 5;
        pointer.active = true;
    };

    document.documentElement.addEventListener('pointerleave', () => {
        pointer.active = false;
        pointer.targetRotateX = 0;
        pointer.targetRotateY = 0;
    });
    window.addEventListener('scroll', () => {
        const nextScrollY = window.scrollY;
        scrollEnergy = Math.max(-15, Math.min(15, scrollEnergy + (nextScrollY - previousScrollY) * .1));
        previousScrollY = nextScrollY;
    }, { passive: true });
    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', start);
    reducedMotion.addEventListener('change', start);
    resize();
    start();
    return { move };
}

function setupCursorEffects(cursorDot, reducedMotion) {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return { move() {} };

    document.documentElement.classList.add('enhanced-pointer');
    let previousX = window.innerWidth / 2;
    let previousY = window.innerHeight / 2;
    let hasMoved = false;
    let lastSparkAt = 0;
    let lastTarget = null;

    const move = event => {
        const movementX = event.clientX - previousX;
        const movementY = event.clientY - previousY;
        const movementSpeed = hasMoved ? Math.hypot(movementX, movementY) : 0;
        previousX = event.clientX;
        previousY = event.clientY;
        hasMoved = true;
        cursorDot.style.transform = `translate3d(${previousX}px, ${previousY}px, 0) translate(-50%, -50%)`;
        cursorDot.classList.add('is-visible');

        if (event.target !== lastTarget) {
            lastTarget = event.target;
            const interactive = event.target instanceof Element && event.target.closest('a, button, .project-card');
            cursorDot.classList.toggle('is-interactive', Boolean(interactive));
        }

        const now = performance.now();
        if (!reducedMotion.matches && movementSpeed > 4 && now - lastSparkAt > 90) {
            const reverseAngle = Math.atan2(movementY, movementX) + Math.PI;
            for (let index = 0; index < 2; index += 1) {
                const spark = document.createElement('span');
                const angle = reverseAngle + (Math.random() - .5) * 1.5;
                const distance = 10 + Math.random() * 15;
                spark.className = 'cursor-spark';
                spark.style.left = `${previousX}px`;
                spark.style.top = `${previousY}px`;
                spark.style.setProperty('--spark-x', `${Math.cos(angle) * distance}px`);
                spark.style.setProperty('--spark-y', `${Math.sin(angle) * distance}px`);
                spark.style.setProperty('--spark-size', `${1.5 + Math.random() * 1.5}px`);
                spark.setAttribute('aria-hidden', 'true');
                document.body.appendChild(spark);
                spark.addEventListener('animationend', () => spark.remove(), { once: true });
            }
            lastSparkAt = now;
        }
    };

    window.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        cursorDot.classList.add('is-pressed');
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
    return { move };
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
        highlights.innerHTML = (profile.aboutHighlights || []).map(highlight => `<article class="about-highlight"><span>${highlight.label}</span><h3>${highlight.title}</h3><p>${highlight.body}</p></article>`).join('');
    }
    const links = [
        [profile.github, 'fa-brands fa-github', 'GitHub'], [profile.linkedin, 'fa-brands fa-linkedin', 'LinkedIn'],
        [profile.grabcad, 'fa-solid fa-cube', 'GrabCAD'], [profile.email && `mailto:${profile.email}`, 'fa-solid fa-envelope', 'Email']
    ].filter(([url]) => url && !url.startsWith('UPDATE'));
    document.getElementById('hero-social').innerHTML = links.map(([url, icon, label]) => `<a href="${url}" target="_blank" rel="noopener" title="${label}"><i class="${icon}"></i></a>`).join('');
    const resumeButton = profile.resume
        ? `<a href="${profile.resume}" target="_blank" rel="noopener" class="btn secondary-btn"><i class="fa-solid fa-file-arrow-down"></i> Resume</a>`
        : `<span class="btn secondary-btn resume-unavailable" aria-disabled="true" title="Add a résumé PDF to activate this button"><i class="fa-solid fa-file-arrow-down"></i> Resume</span>`;
    const resumeIcon = profile.resume
        ? `<a href="${profile.resume}" target="_blank" rel="noopener" title="Resume"><i class="fa-solid fa-file-arrow-down"></i></a>`
        : `<span class="resume-icon-unavailable" aria-disabled="true" title="Add a résumé PDF to activate this button"><i class="fa-solid fa-file-arrow-down"></i></span>`;
    document.getElementById('hero-social').innerHTML += resumeIcon;
    document.getElementById('contact-links-container').innerHTML = resumeButton + links.map(([url, icon, label]) => `<a href="${url}" target="_blank" rel="noopener" class="btn secondary-btn"><i class="${icon}"></i> ${label}</a>`).join('');
}

function renderSkills(categories) {
    document.getElementById('skills-container').innerHTML = categories.map(cat => `<div class="skill-group"><h3 class="skill-group-title">${cat.name}</h3><div class="skill-tags">${cat.skills.map(skill => `<span class="tag">${skill}</span>`).join('')}</div></div>`).join('');
}

function renderFeaturedProjects(projects) {
    const container = document.getElementById('featured-projects-container');
    container.innerHTML = '';
    projects.filter(project => project.featured).slice(0, 3).forEach(project => container.appendChild(createProjectCard(project)));
}

function createProjectCard(project) {
    const card = document.createElement('article');
    card.className = 'project-card';
    const cardMedia = project.image
        ? `<img src="${project.image}" alt="${project.title}" class="project-image" loading="lazy" decoding="async"${project.motionImage ? ` data-motion-src="${project.motionImage}"` : ''}>`
        : `<div class="media-placeholder card-media-placeholder"><i class="fa-solid fa-film"></i><span>Add front GIF</span></div>`;
    card.innerHTML = `<div class="project-image-wrapper">${cardMedia}<span class="project-category-badge">${project.category}</span></div><div class="project-info"><h3 class="project-title">${project.title}</h3><p class="project-summary">${project.summary}</p><div class="project-tags">${project.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}</div><div class="project-action-links">${buildLinkButtons(project.links)}</div></div>`;
    const motionImage = card.querySelector('[data-motion-src]');
    if (motionImage && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        card.addEventListener('pointerenter', () => { motionImage.src = motionImage.dataset.motionSrc; }, { passive: true });
        card.addEventListener('pointerleave', () => { motionImage.src = project.image; }, { passive: true });
    }
    card.addEventListener('click', event => { if (!event.target.closest('a')) openModal(project); });
    return card;
}

function renderProjectCollections(collections, projects) {
    const container = document.getElementById('project-collections');
    container.innerHTML = '';
    collections.forEach((collection, index) => {
        const group = document.createElement('section');
        group.className = 'project-collection';
        group.innerHTML = `<button class="collection-toggle" aria-expanded="false"><span class="collection-index">0${index + 1}</span><span class="collection-copy"><strong>${collection.name}</strong><small>${collection.description}</small></span><i class="fa-solid fa-arrow-down"></i></button><div class="collection-content" hidden></div>`;
        const content = group.querySelector('.collection-content');
        const gallery = document.createElement('div');
        const collectionProjects = projects
            .filter(project => collection.categories.includes(project.category))
            .sort((first, second) => (first.collectionOrder ?? Number.MAX_SAFE_INTEGER) - (second.collectionOrder ?? Number.MAX_SAFE_INTEGER));
        const useCarousel = collection.name === 'Personal Projects' && collectionProjects.length > 3;
        gallery.className = useCarousel ? 'project-carousel' : 'project-grid compact-project-grid';
        collectionProjects.forEach(project => gallery.appendChild(createProjectCard(project)));
        content.appendChild(gallery);
        let initializeCarousel = () => {};
        if (useCarousel) {
            const controls = document.createElement('div');
            controls.className = 'carousel-controls';
            controls.innerHTML = '<span>Browse with the arrows, swipe, or watch the projects advance</span><div><button class="carousel-arrow carousel-prev" aria-label="Previous projects"><i class="fa-solid fa-arrow-left"></i></button><button class="carousel-arrow carousel-next" aria-label="Next projects"><i class="fa-solid fa-arrow-right"></i></button></div>';
            content.prepend(controls);
            initializeCarousel = setupCarousel(gallery, controls, true);
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

function setupCarousel(carousel, controls, autoplay = false) {
    const originalCards = [...carousel.querySelectorAll('.project-card')];
    const cloneCount = Math.min(3, originalCards.length);
    const beforeClones = document.createDocumentFragment();
    originalCards.slice(-cloneCount).forEach(card => {
        const clone = card.cloneNode(true);
        clone.classList.add('carousel-clone');
        clone.setAttribute('aria-hidden', 'true');
        beforeClones.appendChild(clone);
    });
    carousel.prepend(beforeClones);
    originalCards.slice(0, cloneCount).forEach(card => {
        const clone = card.cloneNode(true);
        clone.classList.add('carousel-clone');
        clone.setAttribute('aria-hidden', 'true');
        carousel.appendChild(clone);
    });
    let currentIndex = 0;
    let autoplayTimer;
    let scrollAnimation;
    let initialized = false;
    let isAnimating = false;
    let controlsHovered = false;
    let controlsFocused = false;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchLastX = 0;
    let touchDirection = null;
    let suppressSwipeClick = false;
    const autoplayEnabled = autoplay && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const getMetrics = () => {
        const card = originalCards[0];
        if (!card) return null;
        const gap = Number.parseFloat(getComputedStyle(carousel).gap) || 0;
        const distance = card.getBoundingClientRect().width + gap;
        const visibleCount = Math.max(Math.round(carousel.clientWidth / distance), 1);
        const lastIndex = Math.max(originalCards.length - visibleCount, 0);
        return { distance, lastIndex };
    };
    const initialize = () => {
        const metrics = getMetrics();
        if (!metrics || metrics.distance <= 0) return;
        window.cancelAnimationFrame(scrollAnimation);
        carousel.scrollTo({ left: cloneCount * metrics.distance, behavior: 'auto' });
        currentIndex = 0;
        initialized = true;
        isAnimating = false;
    };
    const animateScroll = (target, onComplete) => {
        window.cancelAnimationFrame(scrollAnimation);
        const start = carousel.scrollLeft;
        const change = target - start;
        const duration = 520;
        const startedAt = performance.now();
        isAnimating = true;
        const frame = now => {
            const progress = Math.min((now - startedAt) / duration, 1);
            const eased = progress < .5
                ? 4 * Math.pow(progress, 3)
                : 1 - Math.pow(-2 * progress + 2, 3) / 2;
            carousel.scrollTo({ left: start + (change * eased), behavior: 'auto' });
            if (progress < 1) {
                scrollAnimation = window.requestAnimationFrame(frame);
            } else {
                onComplete?.();
                isAnimating = false;
            }
        };
        scrollAnimation = window.requestAnimationFrame(frame);
    };
    const move = (step, button) => {
        if (!initialized) initialize();
        if (isAnimating) return;
        const metrics = getMetrics();
        if (!metrics || metrics.lastIndex <= 0) return;
        const positionCount = metrics.lastIndex + 1;
        const nextIndex = (currentIndex + step + positionCount) % positionCount;
        const wrappingBackward = currentIndex === 0 && step < 0;
        const wrappingForward = currentIndex === metrics.lastIndex && step > 0;
        let physicalIndex = cloneCount + nextIndex;
        let resetIndex = null;
        if (wrappingBackward) {
            physicalIndex = 0;
            resetIndex = cloneCount + metrics.lastIndex;
        } else if (wrappingForward) {
            physicalIndex = cloneCount + originalCards.length;
            resetIndex = cloneCount;
        }
        currentIndex = nextIndex;
        animateScroll(physicalIndex * metrics.distance, () => {
            if (resetIndex !== null) {
                carousel.scrollTo({ left: resetIndex * metrics.distance, behavior: 'auto' });
            }
        });
        if (button) {
            controls.querySelectorAll('.carousel-arrow').forEach(arrow => arrow.classList.remove('is-nudging'));
            void button.offsetWidth;
            button.classList.add('is-nudging');
        }
    };
    const previous = controls.querySelector('.carousel-prev');
    const next = controls.querySelector('.carousel-next');
    const scheduleAutoplay = () => {
        window.clearTimeout(autoplayTimer);
        if (!autoplayEnabled || controlsHovered || controlsFocused) return;
        autoplayTimer = window.setTimeout(() => {
            if (!document.hidden && !carousel.closest('[hidden]')) move(1);
            scheduleAutoplay();
        }, 5000);
    };
    const arrowControls = controls.querySelector('div');
    const cancelAutoplay = () => {
        window.clearTimeout(autoplayTimer);
    };
    arrowControls.addEventListener('pointerenter', () => {
        controlsHovered = true;
        cancelAutoplay();
    });
    arrowControls.addEventListener('pointerleave', () => {
        controlsHovered = false;
        scheduleAutoplay();
    });
    arrowControls.addEventListener('focusin', () => {
        controlsFocused = true;
        cancelAutoplay();
    });
    arrowControls.addEventListener('focusout', () => {
        controlsFocused = false;
        scheduleAutoplay();
    });
    previous.addEventListener('pointerdown', cancelAutoplay);
    next.addEventListener('pointerdown', cancelAutoplay);
    previous.addEventListener('click', () => {
        move(-1, previous);
        scheduleAutoplay();
    });
    next.addEventListener('click', () => {
        move(1, next);
        scheduleAutoplay();
    });
    carousel.addEventListener('touchstart', event => {
        if (event.touches.length !== 1) return;
        const touch = event.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchLastX = touch.clientX;
        touchDirection = null;
        cancelAutoplay();
    }, { passive: true });
    carousel.addEventListener('touchmove', event => {
        if (event.touches.length !== 1) return;
        const touch = event.touches[0];
        const horizontalDistance = touch.clientX - touchStartX;
        const verticalDistance = touch.clientY - touchStartY;
        touchLastX = touch.clientX;
        if (!touchDirection && Math.hypot(horizontalDistance, verticalDistance) > 9) {
            touchDirection = Math.abs(horizontalDistance) > Math.abs(verticalDistance) * 1.15
                ? 'horizontal'
                : 'vertical';
        }
        if (touchDirection === 'horizontal') event.preventDefault();
    }, { passive: false });
    const finishSwipe = () => {
        const horizontalDistance = touchLastX - touchStartX;
        if (touchDirection === 'horizontal' && Math.abs(horizontalDistance) >= 42) {
            suppressSwipeClick = true;
            move(horizontalDistance < 0 ? 1 : -1);
            window.setTimeout(() => { suppressSwipeClick = false; }, 420);
        }
        touchDirection = null;
        scheduleAutoplay();
    };
    carousel.addEventListener('touchend', finishSwipe, { passive: true });
    carousel.addEventListener('touchcancel', finishSwipe, { passive: true });
    carousel.addEventListener('click', event => {
        if (!suppressSwipeClick) return;
        event.preventDefault();
        event.stopPropagation();
    }, true);
    scheduleAutoplay();
    return initialize;
}

function buildLinkButtons(links = {}) {
    const map = [['github', 'fa-brands fa-github', 'Code', 'link-btn-github'], ['grabcad', 'fa-solid fa-cube', 'CAD', 'link-btn-grabcad'], ['video', 'fa-solid fa-play', 'Video', ''], ['projectUrl', 'fa-solid fa-arrow-up-right-from-square', 'View', '']];
    return map.filter(([key]) => links[key]).map(([key, icon, label, cls]) => `<a href="${links[key]}" target="_blank" rel="noopener" class="link-btn ${cls}"><i class="${icon}"></i> ${label}</a>`).join('');
}

function openModal(project) {
    const modal = document.getElementById('project-modal');
    document.getElementById('modal-title').textContent = project.title;
    document.getElementById('modal-category').textContent = project.category;
    document.getElementById('modal-summary').textContent = project.summary;
    const details = document.getElementById('modal-details');
    details.innerHTML = project.sections
        ? project.sections.map(section => `<section class="modal-detail-section"><h4>${section.heading}</h4><p>${section.body}</p></section>`).join('')
        : `<p>${project.details || ''}</p>`;
    document.getElementById('modal-tags').innerHTML = project.tags.map(tag => `<span class="tag">${tag}</span>`).join('');
    document.getElementById('modal-links').innerHTML = buildLinkButtons(project.links);
    const image = document.getElementById('modal-image');
    image.innerHTML = project.image
        ? `<img src="${project.image}" alt="${project.title}" decoding="async">`
        : `<div class="media-placeholder"><i class="fa-solid fa-film"></i><span>Front GIF placeholder</span><small>Add your GIF at the project card when it is ready.</small></div>`;
    const media = document.getElementById('modal-media');
    media.innerHTML = (project.media || []).map(item => item.type === 'video' && item.src
        ? `<figure class="modal-media-item modal-video"><iframe src="${item.src}" title="${item.label}" loading="lazy" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe><figcaption>${item.label}</figcaption></figure>`
        : item.src
        ? `<figure class="modal-media-item"><img src="${item.src}" alt="${item.alt || item.label}" loading="lazy" decoding="async"><figcaption>${item.label}</figcaption></figure>`
        : `<div class="modal-media-item media-placeholder"><i class="fa-solid ${item.type === 'gif' ? 'fa-film' : 'fa-image'}"></i><span>${item.label}</span><small>${item.hint || 'Media placeholder'}</small></div>`
    ).join('');
    modal.classList.add('active'); modal.setAttribute('aria-hidden', 'false');
}

function setupModal() {
    const modal = document.getElementById('project-modal');
    const close = () => {
        modal.querySelectorAll('iframe').forEach(video => {
            video.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'stopVideo', args: [] }), '*');
            video.src = 'about:blank';
            video.remove();
        });
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
    };
    document.getElementById('modal-close').addEventListener('click', close);
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && modal.classList.contains('active')) close(); });
}
