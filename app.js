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
    setupGalaxyField(galaxyCanvas, reducedMotion);
    setupCursorDot(cursorDot, reducedMotion);
    const updateScrollMotion = () => {
        const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
        const progress = Math.min(Math.max(window.scrollY / maxScroll, 0), 1);
        document.documentElement.style.setProperty('--page-scroll-progress', progress);
        document.body.classList.toggle('has-scrolled', window.scrollY > 18);
    };
    window.addEventListener('scroll', updateScrollMotion, { passive: true });
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
    const context = canvas.getContext('2d');
    if (!context) return;

    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let stars = [];
    let animationFrame = 0;
    let previousTime = performance.now();
    let previousScrollY = window.scrollY;
    let scrollEnergy = 0;
    const pointer = {
        x: innerWidth / 2,
        y: innerHeight / 2,
        targetX: innerWidth / 2,
        targetY: innerHeight / 2,
        rotateX: 0,
        rotateY: 0,
        targetRotateX: 0,
        targetRotateY: 0,
        active: false
    };
    const colors = ['123,168,216', '178,211,239', '240,246,252'];

    const makeStar = () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        depth: .18 + Math.random() * .82,
        radius: .25 + Math.random() * 1.25,
        driftX: (Math.random() - .5) * .055,
        driftY: -.018 - Math.random() * .07,
        phase: Math.random() * Math.PI * 2,
        color: colors[Math.floor(Math.random() * colors.length)]
    });

    const draw = time => {
        const delta = Math.min((time - previousTime) / 16.67, 2);
        previousTime = time;
        context.clearRect(0, 0, width, height);

        pointer.x += (pointer.targetX - pointer.x) * .075;
        pointer.y += (pointer.targetY - pointer.y) * .075;
        pointer.rotateX += (pointer.targetRotateX - pointer.rotateX) * .065;
        pointer.rotateY += (pointer.targetRotateY - pointer.rotateY) * .065;
        canvas.style.transform = `perspective(850px) rotateX(${pointer.rotateX.toFixed(2)}deg) rotateY(${pointer.rotateY.toFixed(2)}deg) scale(1.15)`;
        scrollEnergy *= .91;

        stars.forEach(star => {
            const oldX = star.x;
            const oldY = star.y;
            const speed = .55 + star.depth * 1.2;
            star.x += star.driftX * speed * delta;
            star.y += (star.driftY * speed - scrollEnergy * star.depth * .006) * delta;

            if (pointer.active) {
                const dx = star.x - pointer.x;
                const dy = star.y - pointer.y;
                const distance = Math.hypot(dx, dy);
                if (distance > 0 && distance < 155) {
                    const force = (1 - distance / 155) * star.depth * .42 * delta;
                    star.x += dx / distance * force;
                    star.y += dy / distance * force;
                }
            }

            if (star.y < -8) star.y = height + 8;
            if (star.y > height + 8) star.y = -8;
            if (star.x < -8) star.x = width + 8;
            if (star.x > width + 8) star.x = -8;

            const pulse = .6 + Math.sin(time * .0014 + star.phase) * .22;
            const alpha = (.12 + star.depth * .5) * pulse;
            const depthShiftX = pointer.rotateY * star.depth * 1.7;
            const depthShiftY = -pointer.rotateX * star.depth * 1.7;
            const drawX = star.x + depthShiftX;
            const drawY = star.y + depthShiftY;
            context.beginPath();
            context.fillStyle = `rgba(${star.color},${alpha})`;
            context.arc(drawX, drawY, star.radius * (.65 + star.depth), 0, Math.PI * 2);
            context.fill();

            if (Math.abs(scrollEnergy) > 2.5 && star.depth > .62) {
                context.beginPath();
                context.strokeStyle = `rgba(${star.color},${Math.min(alpha * .32, .16)})`;
                context.lineWidth = Math.max(.35, star.radius * .35);
                context.moveTo(drawX, drawY);
                context.lineTo(oldX, oldY + scrollEnergy * star.depth * .65);
                context.stroke();
            }
        });

        if (!reducedMotion.matches && !document.hidden) {
            animationFrame = requestAnimationFrame(draw);
        }
    };

    const resize = () => {
        width = window.innerWidth;
        height = window.innerHeight;
        pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(width * pixelRatio);
        canvas.height = Math.round(height * pixelRatio);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        const starCount = Math.round(Math.min(150, Math.max(width < 700 ? 52 : 80, width * height / 10500)));
        stars = Array.from({ length: starCount }, makeStar);
        if (reducedMotion.matches) draw(performance.now());
    };

    const start = () => {
        cancelAnimationFrame(animationFrame);
        previousTime = performance.now();
        if (reducedMotion.matches) draw(previousTime);
        else animationFrame = requestAnimationFrame(draw);
    };

    window.addEventListener('pointermove', event => {
        pointer.targetX = event.clientX;
        pointer.targetY = event.clientY;
        pointer.targetRotateX = -((event.clientY / height) - .5) * 9;
        pointer.targetRotateY = ((event.clientX / width) - .5) * 11;
        pointer.active = true;
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => {
        pointer.active = false;
        pointer.targetRotateX = 0;
        pointer.targetRotateY = 0;
    });
    window.addEventListener('scroll', () => {
        const nextScrollY = window.scrollY;
        scrollEnergy = Math.max(-18, Math.min(18, scrollEnergy + (nextScrollY - previousScrollY) * .12));
        previousScrollY = nextScrollY;
    }, { passive: true });
    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', start);
    reducedMotion.addEventListener('change', start);
    resize();
    start();
}

function setupCursorDot(cursorDot, reducedMotion) {
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    if (!finePointer.matches) return;

    document.documentElement.classList.add('custom-cursor-enabled');
    let targetX = innerWidth / 2;
    let targetY = innerHeight / 2;
    let currentX = targetX;
    let currentY = targetY;
    let cursorFrame = 0;

    const positionDot = () => {
        const followSpeed = reducedMotion.matches ? 1 : .36;
        currentX += (targetX - currentX) * followSpeed;
        currentY += (targetY - currentY) * followSpeed;
        cursorDot.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) translate(-50%, -50%)`;
        document.documentElement.style.setProperty('--pointer-x', `${currentX}px`);
        document.documentElement.style.setProperty('--pointer-y', `${currentY}px`);
        cursorFrame = requestAnimationFrame(positionDot);
    };

    window.addEventListener('pointermove', event => {
        targetX = event.clientX;
        targetY = event.clientY;
        cursorDot.classList.add('is-visible');
        const interactive = event.target instanceof Element && event.target.closest('a, button, .project-card');
        cursorDot.classList.toggle('is-interactive', Boolean(interactive));
    }, { passive: true });
    window.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        cursorDot.classList.add('is-pressed');
        if (reducedMotion.matches) return;
        const ripple = document.createElement('span');
        ripple.className = 'cursor-ripple';
        ripple.style.left = `${currentX}px`;
        ripple.style.top = `${currentY}px`;
        ripple.setAttribute('aria-hidden', 'true');
        document.body.appendChild(ripple);
        ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
    });
    window.addEventListener('pointerup', () => cursorDot.classList.remove('is-pressed'));
    window.addEventListener('blur', () => cursorDot.classList.remove('is-visible', 'is-pressed'));
    document.documentElement.addEventListener('pointerleave', () => cursorDot.classList.remove('is-visible', 'is-pressed'));
    cursorFrame = requestAnimationFrame(positionDot);
}

function setupInteractiveTilt(reducedMotion) {
    if (reducedMotion.matches || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    document.querySelectorAll('.about-highlight, .skill-group').forEach(card => {
        if (card.dataset.tiltReady) return;
        card.dataset.tiltReady = 'true';
        card.classList.add('tilt-card');

        card.addEventListener('pointermove', event => {
            const bounds = card.getBoundingClientRect();
            const horizontal = (event.clientX - bounds.left) / bounds.width - .5;
            const vertical = (event.clientY - bounds.top) / bounds.height - .5;
            card.style.setProperty('--tilt-x', `${(-vertical * 7).toFixed(2)}deg`);
            card.style.setProperty('--tilt-y', `${(horizontal * 7).toFixed(2)}deg`);
        });
        card.addEventListener('pointerleave', () => {
            card.style.setProperty('--tilt-x', '0deg');
            card.style.setProperty('--tilt-y', '0deg');
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
        ? `<img src="${project.image}" alt="${project.title}" class="project-image">`
        : `<div class="media-placeholder card-media-placeholder"><i class="fa-solid fa-film"></i><span>Add front GIF</span></div>`;
    card.innerHTML = `<div class="project-image-wrapper">${cardMedia}<span class="project-category-badge">${project.category}</span></div><div class="project-info"><h3 class="project-title">${project.title}</h3><p class="project-summary">${project.summary}</p><div class="project-tags">${project.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}</div><div class="project-action-links">${buildLinkButtons(project.links)}</div></div>`;
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
            controls.innerHTML = '<span>Browse with the arrows or watch the projects advance</span><div><button class="carousel-arrow carousel-prev" aria-label="Previous projects"><i class="fa-solid fa-arrow-left"></i></button><button class="carousel-arrow carousel-next" aria-label="Next projects"><i class="fa-solid fa-arrow-right"></i></button></div>';
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
        ? `<img src="${project.image}" alt="${project.title}">`
        : `<div class="media-placeholder"><i class="fa-solid fa-film"></i><span>Front GIF placeholder</span><small>Add your GIF at the project card when it is ready.</small></div>`;
    const media = document.getElementById('modal-media');
    media.innerHTML = (project.media || []).map(item => item.type === 'video' && item.src
        ? `<figure class="modal-media-item modal-video"><iframe src="${item.src}" title="${item.label}" loading="eager" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe><figcaption>${item.label}</figcaption></figure>`
        : item.src
        ? `<figure class="modal-media-item"><img src="${item.src}" alt="${item.alt || item.label}"><figcaption>${item.label}</figcaption></figure>`
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
