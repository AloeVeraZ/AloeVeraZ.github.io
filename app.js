document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('current-year').textContent = new Date().getFullYear();

    fetch('data.json')
        .then(response => {
            if (!response.ok) throw new Error('Failed to load data.json');
            return response.json();
        })
        .then(data => {
            renderProfile(data.profile);
            renderSkills(data.skillCategories);
            renderFilters(data.projectCategories);
            renderProjects(data.projects);
            setupModal(data.projects);
        })
        .catch(error => {
            console.error('Error loading portfolio data:', error);
            document.getElementById('hero-name').textContent = 'Error loading data';
            document.getElementById('hero-tagline').textContent = 'Check the browser console and make sure data.json exists.';
        });
});

/* ── Profile ── */
function renderProfile(profile) {
    document.getElementById('nav-name').textContent = profile.name;
    document.getElementById('footer-name').textContent = profile.name;
    document.getElementById('hero-name').textContent = profile.name;
    document.getElementById('hero-tagline').textContent = profile.tagline || profile.title;
    document.getElementById('about-bio').textContent = profile.bio;

    // Social icons in hero
    const social = document.getElementById('hero-social');
    social.innerHTML = '';
    if (profile.github) social.innerHTML += `<a href="${profile.github}" target="_blank" rel="noopener" title="GitHub"><i class="fa-brands fa-github"></i></a>`;
    if (profile.linkedin) social.innerHTML += `<a href="${profile.linkedin}" target="_blank" rel="noopener" title="LinkedIn"><i class="fa-brands fa-linkedin"></i></a>`;
    if (profile.grabcad) social.innerHTML += `<a href="${profile.grabcad}" target="_blank" rel="noopener" title="GrabCAD"><i class="fa-solid fa-cube"></i></a>`;
    if (profile.email) social.innerHTML += `<a href="mailto:${profile.email}" title="Email"><i class="fa-solid fa-envelope"></i></a>`;

    // Contact section links
    const contactContainer = document.getElementById('contact-links-container');
    contactContainer.innerHTML = '';
    if (profile.email) contactContainer.innerHTML += `<a href="mailto:${profile.email}" class="btn secondary-btn"><i class="fa-solid fa-envelope"></i> Email</a>`;
    if (profile.github) contactContainer.innerHTML += `<a href="${profile.github}" target="_blank" rel="noopener" class="btn secondary-btn"><i class="fa-brands fa-github"></i> GitHub</a>`;
    if (profile.linkedin) contactContainer.innerHTML += `<a href="${profile.linkedin}" target="_blank" rel="noopener" class="btn secondary-btn"><i class="fa-brands fa-linkedin"></i> LinkedIn</a>`;
    if (profile.grabcad) contactContainer.innerHTML += `<a href="${profile.grabcad}" target="_blank" rel="noopener" class="btn secondary-btn"><i class="fa-solid fa-cube"></i> GrabCAD</a>`;
}

/* ── Skills (grouped by category) ── */
function renderSkills(categories) {
    const container = document.getElementById('skills-container');
    container.innerHTML = '';
    categories.forEach(cat => {
        const group = document.createElement('div');
        group.className = 'skill-group';
        group.innerHTML = `
            <h3 class="skill-group-title">${cat.name}</h3>
            <div class="skill-tags">
                ${cat.skills.map(s => `<span class="tag">${s}</span>`).join('')}
            </div>`;
        container.appendChild(group);
    });
}

/* ── Category Filters ── */
function renderFilters(categories) {
    const container = document.getElementById('category-filters');
    container.innerHTML = '';
    categories.forEach((cat, i) => {
        const btn = document.createElement('button');
        btn.className = 'filter-btn' + (i === 0 ? ' active' : '');
        btn.textContent = cat;
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterProjects(cat);
        });
        container.appendChild(btn);
    });
}

function filterProjects(category) {
    const cards = document.querySelectorAll('.project-card');
    cards.forEach(card => {
        if (category === 'All' || card.dataset.category === category) {
            card.style.display = '';
        } else {
            card.style.display = 'none';
        }
    });
}

/* ── Projects ── */
function renderProjects(projects) {
    const container = document.getElementById('projects-container');
    container.innerHTML = '';

    projects.forEach(project => {
        const card = document.createElement('div');
        card.className = 'project-card';
        card.dataset.category = project.category;
        card.dataset.id = project.id;

        const tagsHtml = project.tags.map(t => `<span class="tag">${t}</span>`).join('');
        const linksHtml = buildLinkButtons(project.links);

        card.innerHTML = `
            <div class="project-image-wrapper">
                <img src="${project.image}" alt="${project.title}" class="project-image"
                     onerror="this.style.display='none'">
                <span class="project-category-badge">${project.category}</span>
            </div>
            <div class="project-info">
                <h3 class="project-title">${project.title}</h3>
                <p class="project-summary">${project.summary}</p>
                <div class="project-tags">${tagsHtml}</div>
                <div class="project-action-links">${linksHtml}</div>
            </div>`;

        // Clicking the card image / title opens the modal
        card.querySelector('.project-image-wrapper').addEventListener('click', () => openModal(project));
        card.querySelector('.project-title').style.cursor = 'pointer';
        card.querySelector('.project-title').addEventListener('click', () => openModal(project));

        container.appendChild(card);
    });
}

/* ── Link Buttons (GitHub, GrabCAD, Video, External) ── */
function buildLinkButtons(links) {
    if (!links) return '';
    let html = '';
    if (links.github) html += `<a href="${links.github}" target="_blank" rel="noopener" class="link-btn link-btn-github"><i class="fa-brands fa-github"></i> Code</a>`;
    if (links.grabcad) html += `<a href="${links.grabcad}" target="_blank" rel="noopener" class="link-btn link-btn-grabcad"><i class="fa-solid fa-cube"></i> CAD</a>`;
    if (links.video) html += `<a href="${links.video}" target="_blank" rel="noopener" class="link-btn"><i class="fa-solid fa-play"></i> Video</a>`;
    if (links.projectUrl) html += `<a href="${links.projectUrl}" target="_blank" rel="noopener" class="link-btn"><i class="fa-solid fa-arrow-up-right-from-square"></i> View</a>`;
    return html;
}

/* ── Modal ── */
function openModal(project) {
    const modal = document.getElementById('project-modal');
    document.getElementById('modal-title').textContent = project.title;
    document.getElementById('modal-category').textContent = project.category;
    document.getElementById('modal-summary').textContent = project.summary;
    document.getElementById('modal-details').textContent = project.details || '';
    document.getElementById('modal-tags').innerHTML = project.tags.map(t => `<span class="tag">${t}</span>`).join('');
    document.getElementById('modal-links').innerHTML = buildLinkButtons(project.links);

    const img = document.getElementById('modal-image');
    img.src = project.image;
    img.alt = project.title;

    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
}

function setupModal() {
    const modal = document.getElementById('project-modal');
    const closeBtn = document.getElementById('modal-close');

    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
        }
    });
}
