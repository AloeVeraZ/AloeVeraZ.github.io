document.addEventListener('DOMContentLoaded', () => {
    const ambientGlow = document.createElement('div');
    ambientGlow.className = 'ambient-glow';
    ambientGlow.setAttribute('aria-hidden', 'true');
    document.body.prepend(ambientGlow);
    const kineticField = document.createElement('div');
    kineticField.className = 'kinetic-field';
    kineticField.setAttribute('aria-hidden', 'true');
    kineticField.innerHTML = `
        <span class="project-motif motif-swerve" style="--x: 3vw; --y: 17vh; --size: 108px;" data-depth=".72" data-phase=".4"><i></i><i></i><i></i></span>
        <span class="project-motif motif-corexy" style="--x: 88vw; --y: 20vh; --size: 104px;" data-depth=".45" data-phase="1.8"><i></i></span>
        <span class="project-motif motif-delta" style="--x: 3vw; --y: 45vh; --size: 116px;" data-depth=".3" data-phase="3.1" data-rotate="false"><i></i><i></i><i></i></span>
        <span class="project-motif motif-cad" style="--x: 89vw; --y: 48vh; --size: 96px;" data-depth=".62" data-phase="4.4"></span>
        <span class="project-motif motif-keyboard" style="--x: 4vw; --y: 74vh; --size: 106px;" data-depth=".5" data-phase="5.7" data-rotate="false"></span>
        <span class="project-motif motif-balance" style="--x: 89vw; --y: 79vh; --size: 82px;" data-depth=".82" data-phase="2.5"><i></i></span>
        <span class="project-motif motif-layers" style="--x: 14vw; --y: 61vh; --size: 76px;" data-depth=".38" data-phase="6.8"><i></i><i></i><i></i><i></i><i></i></span>
        <span class="project-motif motif-crawler" style="--x: 80vw; --y: 38vh; --size: 66px;" data-depth=".56" data-phase="7.9"><i></i><i></i></span>`;
    ambientGlow.after(kineticField);
    const kineticObjects = [...kineticField.querySelectorAll('.project-motif')];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    window.addEventListener('pointermove', event => {
        document.documentElement.style.setProperty('--pointer-x', `${event.clientX}px`);
        document.documentElement.style.setProperty('--pointer-y', `${event.clientY}px`);
        const pointerX = (event.clientX / Math.max(window.innerWidth, 1)) - .5;
        const pointerY = (event.clientY / Math.max(window.innerHeight, 1)) - .5;
        document.documentElement.style.setProperty('--parallax-x', `${pointerX * 14}px`);
        document.documentElement.style.setProperty('--parallax-y', `${pointerY * 10}px`);
    });
    window.addEventListener('pointerdown', event => {
        if (event.button !== 0 || reducedMotion.matches) return;
        const collectionOpen = document.querySelector('.collection-toggle[aria-expanded="true"]');
        const modalOpen = document.getElementById('project-modal')?.classList.contains('active');
        const importantTarget = event.target.closest('a, button, .project-card, .about-highlight, .skill-group, .collection-content, .modal-overlay, .contact-links, .social-links, .hero-content, .section-header, .bio-text, .contact-desc');
        const blankSurface = event.target.matches('body, main, .section, .hero-section, .project-library');
        if (collectionOpen || modalOpen || importantTarget || !blankSurface) return;
        const ripple = document.createElement('span');
        ripple.className = 'click-ripple';
        ripple.style.left = `${event.clientX}px`;
        ripple.style.top = `${event.clientY}px`;
        ripple.setAttribute('aria-hidden', 'true');
        document.body.appendChild(ripple);
        ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
    });
    const updateScrollMotion = () => {
        const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
        const scrollProgress = window.scrollY / maxScroll;
        document.documentElement.style.setProperty('--scroll-progress', scrollProgress);
        document.documentElement.style.setProperty('--scroll-shift', `${Math.min(window.scrollY * 0.08, 70)}px`);
        document.documentElement.style.setProperty('--scroll-shift-reverse', `${Math.min(window.scrollY * -0.04, 35)}px`);
        kineticObjects.forEach(object => {
            const depth = Number.parseFloat(object.dataset.depth) || .5;
            const phase = Number.parseFloat(object.dataset.phase) || 0;
            const range = 12 + (depth * 24);
            const x = Math.sin((window.scrollY * .0032) + phase) * range;
            const y = Math.cos((window.scrollY * .0024) + phase) * range * .65;
            const rotation = object.dataset.rotate === 'false' ? 0 : (window.scrollY * depth * .035) + (phase * 8);
            object.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg)`;
        });
        document.body.classList.toggle('has-scrolled', window.scrollY > 18);
    };
    window.addEventListener('scroll', updateScrollMotion, { passive: true });
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
            renderFeaturedProjects(data.projects);
            renderProjectCollections(data.projectCollections, data.projects);
            setupModal();
        })
        .catch(error => console.error('Error loading portfolio data:', error));
});

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
