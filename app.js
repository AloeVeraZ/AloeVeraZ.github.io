document.addEventListener('DOMContentLoaded', () => {
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
    card.innerHTML = `<div class="project-image-wrapper"><img src="${project.image}" alt="${project.title}" class="project-image" onerror="this.style.display='none'"><span class="project-category-badge">${project.category}</span></div><div class="project-info"><h3 class="project-title">${project.title}</h3><p class="project-summary">${project.summary}</p><div class="project-tags">${project.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}</div><div class="project-action-links">${buildLinkButtons(project.links)}</div></div>`;
    card.querySelector('.project-image-wrapper').addEventListener('click', () => openModal(project));
    card.querySelector('.project-title').addEventListener('click', () => openModal(project));
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
    let paused = false;
    let dragging = false;
    let startX = 0;
    let startScroll = 0;
    const move = direction => carousel.scrollBy({ left: direction * Math.min(320, carousel.clientWidth * 0.8), behavior: 'smooth' });
    controls.querySelector('.carousel-prev').addEventListener('click', () => move(-1));
    controls.querySelector('.carousel-next').addEventListener('click', () => move(1));
    carousel.addEventListener('mouseenter', () => paused = true);
    carousel.addEventListener('mouseleave', () => { paused = false; dragging = false; });
    carousel.addEventListener('pointerdown', event => { dragging = true; paused = true; startX = event.clientX; startScroll = carousel.scrollLeft; carousel.setPointerCapture(event.pointerId); });
    carousel.addEventListener('pointermove', event => { if (dragging) carousel.scrollLeft = startScroll - (event.clientX - startX); });
    carousel.addEventListener('pointerup', () => { dragging = false; paused = false; });
    carousel.addEventListener('wheel', event => { if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) { event.preventDefault(); carousel.scrollLeft += event.deltaY; } }, { passive: false });
    const drift = () => { if (!paused && !carousel.closest('[hidden]') && carousel.scrollWidth > carousel.clientWidth) { carousel.scrollLeft += 0.22; if (carousel.scrollLeft >= carousel.scrollWidth - carousel.clientWidth - 1) carousel.scrollLeft = 0; } requestAnimationFrame(drift); };
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
    document.getElementById('modal-details').textContent = project.details || '';
    document.getElementById('modal-tags').innerHTML = project.tags.map(tag => `<span class="tag">${tag}</span>`).join('');
    document.getElementById('modal-links').innerHTML = buildLinkButtons(project.links);
    const image = document.getElementById('modal-image'); image.src = project.image; image.alt = project.title;
    modal.classList.add('active'); modal.setAttribute('aria-hidden', 'false');
}

function setupModal() {
    const modal = document.getElementById('project-modal');
    const close = () => { modal.classList.remove('active'); modal.setAttribute('aria-hidden', 'true'); };
    document.getElementById('modal-close').addEventListener('click', close);
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && modal.classList.contains('active')) close(); });
}
