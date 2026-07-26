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
        gallery.className = 'category-projects projects-grid';
        collection.categories.forEach((category, categoryIndex) => {
            const matches = projects.filter(project => project.category === category);
            gallery.appendChild(createCategoryCard(category, matches, categoryIndex));
        });
        gallery.hidden = true;
        content.appendChild(gallery);
        const toggle = group.querySelector('.collection-toggle');
        toggle.addEventListener('click', () => { const opening = toggle.getAttribute('aria-expanded') !== 'true'; toggle.setAttribute('aria-expanded', String(opening)); content.hidden = !opening; gallery.hidden = !opening; });
        container.appendChild(group);
    });
}

function createCategoryCard(category, projects, index) {
    const project = projects[0];
    const images = ['assets/robotic_arm.jpg', 'assets/fsae_chassis.jpg', 'assets/wind_turbine.jpg'];
    const card = document.createElement('article');
    card.className = 'project-card category-card';
    card.innerHTML = `<div class="project-image-wrapper"><img src="${project ? project.image : images[index % images.length]}" alt="${category}" class="project-image"><span class="project-category-badge">${String(index + 1).padStart(2, '0')}</span></div><div class="project-info"><h3 class="project-title">${category}</h3><p class="project-summary">${projects.length ? `${projects.length} ${projects.length === 1 ? 'project' : 'projects'} to explore.` : 'Projects coming soon.'}</p><div class="project-action-links"><span class="link-btn">Explore <i class="fa-solid fa-arrow-up-right-from-square"></i></span></div></div>`;
    const open = () => openModal(project || { title: category, category: 'Project archive', summary: 'This section is ready for projects to be added.', details: 'Add projects in data.json with this category and they will appear here automatically.', tags: [], links: {}, image: images[index % images.length] });
    card.querySelector('.project-image-wrapper').addEventListener('click', open);
    card.querySelector('.project-title').addEventListener('click', open);
    return card;
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
