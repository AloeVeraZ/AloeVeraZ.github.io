document.addEventListener('DOMContentLoaded', () => {
    const ambientGlow = document.createElement('div');
    ambientGlow.className = 'ambient-glow';
    ambientGlow.setAttribute('aria-hidden', 'true');
    document.body.prepend(ambientGlow);
    window.addEventListener('pointermove', event => {
        document.documentElement.style.setProperty('--pointer-x', `${event.clientX}px`);
        document.documentElement.style.setProperty('--pointer-y', `${event.clientY}px`);
    });
    const updateScrollMotion = () => {
        const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
        document.documentElement.style.setProperty('--scroll-progress', window.scrollY / maxScroll);
        document.documentElement.style.setProperty('--scroll-shift', `${Math.min(window.scrollY * 0.08, 70)}px`);
        document.documentElement.style.setProperty('--scroll-shift-reverse', `${Math.min(window.scrollY * -0.04, 35)}px`);
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
    const links = [
        [profile.github, 'fa-brands fa-github', 'GitHub'], [profile.linkedin, 'fa-brands fa-linkedin', 'LinkedIn'],
        [profile.grabcad, 'fa-solid fa-cube', 'GrabCAD'], [profile.email && `mailto:${profile.email}`, 'fa-solid fa-envelope', 'Email']
    ].filter(([url]) => url && !url.startsWith('UPDATE'));
    document.getElementById('hero-social').innerHTML = links.map(([url, icon, label]) => `<a href="${url}" target="_blank" rel="noopener" title="${label}"><i class="${icon}"></i></a>`).join('');
    document.getElementById('contact-links-container').innerHTML = links.map(([url, icon, label]) => `<a href="${url}" target="_blank" rel="noopener" class="btn secondary-btn"><i class="${icon}"></i> ${label}</a>`).join('');
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
        const collectionProjects = collection.categories.flatMap(category => projects.filter(project => project.category === category));
        const useCarousel = collectionProjects.length > 3;
        gallery.className = useCarousel ? 'project-carousel' : 'project-grid compact-project-grid';
        collection.categories.forEach(category => projects.filter(project => project.category === category).forEach(project => gallery.appendChild(createProjectCard(project))));
        content.appendChild(gallery);
        if (useCarousel) {
            const controls = document.createElement('div');
            controls.className = 'carousel-controls';
            controls.innerHTML = '<span>Drag, scroll, or use the arrows</span><div><button class="carousel-arrow carousel-prev" aria-label="Previous projects"><i class="fa-solid fa-arrow-left"></i></button><button class="carousel-arrow carousel-next" aria-label="Next projects"><i class="fa-solid fa-arrow-right"></i></button></div>';
            content.prepend(controls);
            setupCarousel(gallery, controls);
        }
        const toggle = group.querySelector('.collection-toggle');
        toggle.addEventListener('click', () => { const opening = toggle.getAttribute('aria-expanded') !== 'true'; toggle.setAttribute('aria-expanded', String(opening)); content.hidden = !opening; });
        container.appendChild(group);
    });
}

function setupCarousel(carousel, controls) {
    let direction = 1;
    const move = step => {
        const card = carousel.querySelector('.project-card');
        if (!card) return;
        const gap = Number.parseFloat(getComputedStyle(carousel).gap) || 0;
        const distance = card.getBoundingClientRect().width + gap;
        const maxScroll = carousel.scrollWidth - carousel.clientWidth;
        let target = carousel.scrollLeft + (step * distance);
        if (target > maxScroll - 2) target = 0;
        if (target < 2) target = maxScroll;
        carousel.scrollTo({ left: target, behavior: 'smooth' });
        controls.classList.remove('carousel-nudge');
        void controls.offsetWidth;
        controls.classList.add('carousel-nudge');
    };
    controls.querySelector('.carousel-prev').addEventListener('click', () => move(-1));
    controls.querySelector('.carousel-next').addEventListener('click', () => move(1));
    const drift = () => {
        const maxScroll = carousel.scrollWidth - carousel.clientWidth;
        if (!carousel.closest('[hidden]') && maxScroll > 0) {
            carousel.scrollLeft += 0.22 * direction;
            if (carousel.scrollLeft >= maxScroll - 1) direction = -1;
            if (carousel.scrollLeft <= 1) direction = 1;
        }
        requestAnimationFrame(drift);
    };
    requestAnimationFrame(drift);
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
    const close = () => { modal.classList.remove('active'); modal.setAttribute('aria-hidden', 'true'); };
    document.getElementById('modal-close').addEventListener('click', close);
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && modal.classList.contains('active')) close(); });
}
