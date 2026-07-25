document.addEventListener('DOMContentLoaded', () => {
    // Set current year in footer
    document.getElementById('current-year').textContent = new Date().getFullYear();

    // Fetch and render data
    fetch('data.json')
        .then(response => response.json())
        .then(data => {
            renderProfile(data.profile);
            renderSkills(data.skills);
            renderProjects(data.projects);
        })
        .catch(error => {
            console.error('Error loading portfolio data:', error);
            document.getElementById('hero-title').textContent = "Error loading data. Please check data.json.";
        });
});

function renderProfile(profile) {
    // Nav and Footer
    document.getElementById('nav-name').textContent = profile.name;
    document.getElementById('footer-name').textContent = profile.name;

    // Hero
    document.getElementById('hero-name').textContent = profile.name;
    document.getElementById('hero-title').textContent = profile.title;
    
    // Social Links
    const socialContainer = document.getElementById('hero-social');
    if (profile.github) {
        socialContainer.innerHTML += `<a href="${profile.github}" target="_blank" title="GitHub"><i class="fa-brands fa-github"></i></a>`;
    }
    if (profile.linkedin) {
        socialContainer.innerHTML += `<a href="${profile.linkedin}" target="_blank" title="LinkedIn"><i class="fa-brands fa-linkedin"></i></a>`;
    }
    if (profile.email) {
        socialContainer.innerHTML += `<a href="mailto:${profile.email}" title="Email"><i class="fa-solid fa-envelope"></i></a>`;
    }

    // About
    document.getElementById('about-bio').textContent = profile.bio;

    // Contact
    document.getElementById('contact-email').href = `mailto:${profile.email}`;
}

function renderSkills(skills) {
    const container = document.getElementById('skills-container');
    skills.forEach(skill => {
        const div = document.createElement('div');
        div.className = 'skill-card';
        div.textContent = skill;
        container.appendChild(div);
    });
}

function renderProjects(projects) {
    const container = document.getElementById('projects-container');
    projects.forEach(project => {
        const card = document.createElement('div');
        card.className = 'project-card';
        
        // Tags HTML
        const tagsHtml = project.tags.map(tag => `<span class="tag">${tag}</span>`).join('');
        
        card.innerHTML = `
            <div class="project-image-container">
                <img src="${project.image}" alt="${project.title}" class="project-image" onerror="this.src='https://via.placeholder.com/600x400?text=Image+Not+Found'">
            </div>
            <div class="project-info">
                <h3 class="project-title">${project.title}</h3>
                <p class="project-desc">${project.description}</p>
                <div class="project-tags">
                    ${tagsHtml}
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}
