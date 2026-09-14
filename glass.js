/* Liquid glass: the floating navigation bar, and the cards and buttons below
   it. navbar.css and portfolio.css draw the layers; this decides how much of
   the effect the browser can show, and builds the displacement filters the
   Chromium path needs.

   The glass comes in two strengths:

     bar      the navigation. Thick, clear toward its top and bottom edges,
              and bent the most.
     surface  the About, Skills and project cards, the hero, social and
              contact buttons, and the carousel arrows. The same glass,
              thinner and frosted (portfolio.css): the sky shows through
              softly, bent at the edges.

   How much of it a browser can show is written to html[data-glass]:

     refract  High FX in Chromium browsers (Chrome, Edge, Brave, Opera, Arc,
              Samsung Internet). An SVG displacement filter runs on the live
              backdrop of the bar and of every card and button, so whatever is
              behind them -- text, photos, the sky -- bends toward their edges.
              The browser redraws it every frame, so it follows anything that
              moves: the archive ring turning, a card leaning toward the
              cursor, a slider being swiped.
     lens     High FX in Safari, Firefox, and every browser on iOS (all of
              them WebKit). None of those can run an SVG filter on a backdrop,
              so the bar frosts the page behind it instead and bends the sky --
              which this site paints itself -- on its own canvas: portfolio.js
              calls paintBackdrop() once a frame. Cards and buttons frost.
     frost    Low FX, everywhere, and for anyone whose system asks for less
              transparency or more contrast: the bar blurs lightly, cards and
              buttons frost, and nothing bends. (The stylesheets make all of
              it solid for the second group.) */
(() => {
    'use strict';

    const root = document.documentElement;
    const navbar = document.querySelector('.navbar');
    const bar = navbar && navbar.querySelector('.nav-content');

    // Chromium is recognised by engine, not by CSS.supports: Safari and Firefox
    // accept backdrop-filter: url(#...) as valid syntax and then apply no
    // displacement at all. userAgentData only exists in Chromium browsers, and
    // never on iOS, where every browser is WebKit underneath.
    const brands = (navigator.userAgentData && navigator.userAgentData.brands) || [];
    const canRefractBackdrop = brands.some(entry => /Chromium/i.test(entry.brand))
        && !!(window.CSS && CSS.supports && CSS.supports('backdrop-filter', 'url(#liquid-glass)'));
    // The stylesheets make the glass solid for these; nothing behind it needs
    // bending.
    const plainGlass = window.matchMedia
        ? window.matchMedia('(prefers-reduced-transparency: reduce), (prefers-contrast: more)')
        : null;

    // Every card and button made of the thinner glass, and the places they
    // are rendered into once the page's data has loaded -- whole sections,
    // because a slider's arrows are set down beside its cards rather than
    // among them.
    const SURFACES = [
        '.about-highlight', '.skill-group', '.project-card',
        '.hero-buttons > .btn', '.social-links > a', '.social-links > .resume-icon-unavailable',
        '.contact-links > .btn', '.carousel-arrow'
    ].join(', ');
    const SURFACE_ROOTS = ['.hero-buttons', '#hero-social', '#about', '#skills', '#projects',
        '#contact-links-container'];

    // The rim. bevel is how far in from the edge the glass curves; stretch is
    // the most it may magnify what is behind it, right at the edge; CURVE is
    // how that eases off toward the middle. (At 4.7x, the tails of g's and y's
    // crossing the bar's rim were drawn out far longer than the letters beside
    // them.) Every point samples from further in than the point just outside
    // it, so the glass never folds what is behind it into mirrored slices.
    // dispersion bends blue a trace further than red, as real glass does --
    // on the bar only: the thinner glass is frosted, and a fringe that fine
    // would not survive it. soften is the frost, in px -- none on the thinner
    // glass, which portfolio.css frosts with a blur of its own before this
    // filter bends what shows through. density is the map's resolution.
    const GLASS = {
        bar: { bevel: 26, stretch: 1.8, dispersion: .008, soften: 1, density: 2 },
        surface: { bevel: 18, stretch: 1.7, dispersion: 0, soften: 0, density: 1 }
    };
    const CURVE = 1.5;
    const LENS_BANDS = 12;     // slices per rim when the sky is bent on canvas

    const rimBevel = (kind, width, height) => Math.max(1, Math.min(GLASS[kind].bevel, Math.min(width, height) / 2 - 2));
    // The pull at the very edge that magnifies by exactly `stretch` there, in
    // the channel that bends furthest.
    const rimReach = (kind, bevel) => (1 - 1 / GLASS[kind].stretch) * bevel / CURVE / (1 + GLASS[kind].dispersion);

    let mode = '';
    let rect = null;           // the bar's box in viewport px, for the lens painter

    const menuOpen = () => !!navbar && navbar.hasAttribute('data-nav-open');
    const glassShowing = () => document.body.classList.contains('has-scrolled') || menuOpen();

    /* ---- refract: SVG filters over the live backdrop ---------------------- */
    const svgNS = 'http://www.w3.org/2000/svg';
    let svg = null;
    let filterCount = 0;
    const filters = new Map();     // size key -> { id, node, users }

    // The displacement map: neutral grey across the middle, and inside the rim
    // a pull toward the centre that grows toward the edge. Red carries the
    // horizontal pull and green the vertical, so the rim samples the backdrop
    // from further in -- magnified and bent, as through the curved edge of a
    // lens.
    const buildMap = (width, height, radius, bevel, density) => {
        const cw = Math.max(1, Math.round(width * density));
        const ch = Math.max(1, Math.round(height * density));
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const context = canvas.getContext('2d');
        const image = context.createImageData(cw, ch);
        const data = image.data;
        const halfW = width / 2, halfH = height / 2;
        const r = Math.min(radius, halfW, halfH);
        for (let py = 0; py < ch; py++) {
            const y = (py + .5) / density - halfH;
            const signY = y < 0 ? -1 : 1;
            const qy = Math.abs(y) - (halfH - r);
            for (let px = 0; px < cw; px++) {
                const x = (px + .5) / density - halfW;
                const signX = x < 0 ? -1 : 1;
                const qx = Math.abs(x) - (halfW - r);
                // Depth inside the rounded rectangle, and the outward normal.
                let depth, nx, ny;
                if (qx > 0 && qy > 0) {
                    const length = Math.hypot(qx, qy);
                    depth = r - length;
                    nx = signX * qx / length;
                    ny = signY * qy / length;
                } else if (qx > qy) {
                    depth = r - qx; nx = signX; ny = 0;
                } else {
                    depth = r - qy; nx = 0; ny = signY;
                }
                let dx = 0, dy = 0;
                if (depth >= 0 && depth < bevel) {
                    const pull = Math.pow(1 - depth / bevel, CURVE);
                    dx = -nx * pull;
                    dy = -ny * pull;
                }
                const i = (py * cw + px) * 4;
                data[i] = 128 + dx * 127;
                data[i + 1] = 128 + dy * 127;
                data[i + 2] = 128;
                data[i + 3] = 255;
            }
        }
        context.putImageData(image, 0, 0);
        return canvas.toDataURL('image/png');
    };

    const buildFilter = (id, kind, width, height, radius, density) => {
        const glass = GLASS[kind];
        const bevel = rimBevel(kind, width, height);
        // feDisplacementMap moves a pixel by scale * (channel - 0.5); the map
        // stores the pull as 128 +/- 127, so this scale turns a full pull into
        // exactly the rim's reach.
        const scale = rimReach(kind, bevel) * 255 / 127;
        // The frost, if any, is laid on before the bend.
        const input = glass.soften ? 'soft' : 'SourceGraphic';
        const frost = glass.soften
            ? `<feGaussianBlur in="SourceGraphic" stdDeviation="${glass.soften}" result="soft"/>`
            : '';
        const only =(r, g, b) => `${r} 0 0 0 0  0 ${g} 0 0 0  0 0 ${b} 0 0  0 0 0 1 0`;
        const pass = (name, strength, keep) => `
                <feDisplacementMap in="${input}" in2="map" scale="${(scale * strength).toFixed(2)}"
                    xChannelSelector="R" yChannelSelector="G" result="warp-${name}"/>
                <feColorMatrix in="warp-${name}" type="matrix" values="${keep}" result="${name}"/>`;
        // With dispersion: three displacements of the one map at slightly
        // different strengths, each kept to one colour channel and screened
        // back together. Without it, one.
        const bend = glass.dispersion
            ? `${pass('red', 1 - glass.dispersion, only(1, 0, 0))}
                ${pass('green', 1, only(0, 1, 0))}
                ${pass('blue', 1 + glass.dispersion, only(0, 0, 1))}
                <feBlend in="red" in2="green" mode="screen" result="red-green"/>
                <feBlend in="red-green" in2="blue" mode="screen"/>`
            : `<feDisplacementMap in="${input}" in2="map" scale="${scale.toFixed(2)}" xChannelSelector="R" yChannelSelector="G"/>`;
        const holder = document.createElementNS(svgNS, 'svg');
        holder.innerHTML = `
            <filter id="${id}" x="0" y="0" width="${width}" height="${height}" filterUnits="userSpaceOnUse"
                primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
                <feImage x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"
                    href="${buildMap(width, height, radius, bevel, density)}" result="map"/>
                ${frost}
                ${bend}
            </filter>`;
        return holder.firstElementChild;
    };

    // Everything the same size wears the same filter: the sixteen cards of an
    // archive ring share one.
    const acquireFilter = (key, kind, width, height, radius, density) => {
        let entry = filters.get(key);
        if (!entry) {
            if (!svg) {
                svg = document.createElementNS(svgNS, 'svg');
                svg.setAttribute('aria-hidden', 'true');
                svg.setAttribute('focusable', 'false');
                svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
                document.body.appendChild(svg);
            }
            const id = `liquid-glass-${++filterCount}`;
            entry = { id, node: buildFilter(id, kind, width, height, radius, density), users: 0 };
            svg.appendChild(entry.node);
            filters.set(key, entry);
        }
        entry.users += 1;
        return entry;
    };
    const releaseFilter = key => {
        const entry = filters.get(key);
        if (!entry || --entry.users > 0) return;
        entry.node.remove();
        filters.delete(key);
    };

    const worn = new Map();        // element -> the key of the filter it wears
    const kindOf = element => element === bar ? 'bar' : 'surface';
    const cornerRadius = (element, width, height) => {
        // The bar's glass is drawn by its ::before; everything else by itself.
        const raw = getComputedStyle(element, element === bar ? '::before' : null).borderTopLeftRadius;
        const radius = /%$/.test(raw) ? parseFloat(raw) / 100 * Math.min(width, height) : parseFloat(raw);
        return Math.min(radius || 0, width / 2, height / 2);
    };
    // Layout size, not the on-screen box: a card turned on the ring or leaning
    // toward the cursor is the same card, and keeps the same filter.
    const wear = element => {
        const width = element.offsetWidth, height = element.offsetHeight;
        if (!width || !height) return;
        const kind = kindOf(element);
        const radius = cornerRadius(element, width, height);
        const density = Math.min(GLASS[kind].density, window.devicePixelRatio || 1);
        const key = `${kind}:${width}x${height}:${radius.toFixed(1)}@${density}`;
        const previous = worn.get(element);
        if (key === previous) return;
        const entry = acquireFilter(key, kind, width, height, radius, density);
        if (previous) releaseFilter(previous);
        worn.set(element, key);
        element.style.setProperty('--glass-filter', `url(#${entry.id})`);
    };
    const shed = element => {
        const previous = worn.get(element);
        if (previous) releaseFilter(previous);
        worn.delete(element);
        element.style.removeProperty('--glass-filter');
    };

    // Sizes are left to settle before a filter is rebuilt, so a window being
    // dragged wider does not redraw maps on every frame of the drag.
    const tracked = new Set();
    const due = new Set();
    let dueTimer = 0;
    const forget = element => {
        shed(element);
        if (resizeWatch) resizeWatch.unobserve(element);
        tracked.delete(element);
        due.delete(element);
    };
    const flush = () => {
        dueTimer = 0;
        const batch = [...due];
        due.clear();
        for (const element of batch) {
            if (!element.isConnected) forget(element);
            // An open menu is frosted rather than bent (see navbar.css) and
            // changes height every frame while it opens.
            else if (mode === 'refract' && !(element === bar && menuOpen())) wear(element);
        }
    };
    const refit = element => {
        due.add(element);
        clearTimeout(dueTimer);
        dueTimer = window.setTimeout(flush, 150);
    };

    const measure = () => {
        if (!bar) return;
        const box = bar.getBoundingClientRect();
        rect = { x: box.left, y: box.top, w: box.width, h: box.height, r: cornerRadius(bar, box.width, box.height) };
    };

    const resizeWatch = 'ResizeObserver' in window
        ? new ResizeObserver(entries => {
            for (const entry of entries) {
                if (entry.target === bar) measure();
                refit(entry.target);
            }
        })
        : null;
    const track = element => {
        if (tracked.has(element)) return;
        tracked.add(element);
        // Observing reports the element's size straight away, which fits it.
        if (resizeWatch) resizeWatch.observe(element);
        else refit(element);
    };
    let scanTimer = 0;
    const scan = () => {
        scanTimer = 0;
        for (const element of tracked) if (!element.isConnected) forget(element);
        document.querySelectorAll(SURFACES).forEach(track);
    };
    const scheduleScan = () => {
        clearTimeout(scanTimer);
        scanTimer = window.setTimeout(scan, 120);
    };

    /* ---- lens: the sky bends under the bar on its own canvas -------------- */
    const buffer = document.createElement('canvas');
    const bufferContext = buffer.getContext('2d');

    // Called by the galaxy at the end of every frame, in canvas pixels. Each
    // rim is redrawn in thin slices, and each slice is stretched from a strip
    // a little further toward the middle -- the same pull, on the same curve,
    // that the SVG map gives the whole backdrop in Chromium, applied to the
    // one layer this page draws itself. The slices meet edge to edge, so the
    // bend is continuous rather than stepped.
    const paintBackdrop = (context, ratio) => {
        if (mode !== 'lens' || !rect || !glassShowing() || menuOpen()) return;
        const canvas = context.canvas;
        const x = Math.max(0, Math.round(rect.x * ratio));
        const y = Math.max(0, Math.round(rect.y * ratio));
        const w = Math.min(canvas.width - x, Math.round(rect.w * ratio));
        const h = Math.min(canvas.height - y, Math.round(rect.h * ratio));
        if (w <= 4 || h <= 4) return;
        if (buffer.width !== w || buffer.height !== h) {
            buffer.width = w;
            buffer.height = h;
        }
        bufferContext.clearRect(0, 0, w, h);
        bufferContext.drawImage(canvas, x, y, w, h, 0, 0, w, h);

        const bevelPx = rimBevel('bar', rect.w, rect.h);
        const bevel = Math.min(Math.round(bevelPx * ratio), Math.floor(h / 2));
        const reach = rimReach('bar', bevelPx) * ratio;
        const source = depth => depth + reach * Math.pow(1 - depth / bevel, CURVE);
        const middle = h - bevel * 2;
        const radius = Math.min(rect.r * ratio, w / 2, h / 2);
        const slice = (sx, sy, sw, sh, dx, dy, dw, dh) => {
            if (dw <= 0 || dh <= 0 || sw <= 0 || sh <= 0) return;
            context.clearRect(x + dx, y + dy, dw, dh);
            context.drawImage(buffer, sx, sy, sw, sh, x + dx, y + dy, dw, dh);
        };
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.globalAlpha = 1;
        context.globalCompositeOperation = 'source-over';
        context.imageSmoothingEnabled = true;
        context.beginPath();
        context.moveTo(x + radius, y);
        context.arcTo(x + w, y, x + w, y + h, radius);
        context.arcTo(x + w, y + h, x, y + h, radius);
        context.arcTo(x, y + h, x, y, radius);
        context.arcTo(x, y, x + w, y, radius);
        context.closePath();
        context.clip();
        for (let i = 0; i < LENS_BANDS; i++) {
            // Whole canvas pixels on the landing side, so neighbouring slices
            // share an edge exactly and leave no hairline seam between them.
            const d0 = Math.round(bevel * i / LENS_BANDS);
            const d1 = Math.round(bevel * (i + 1) / LENS_BANDS);
            if (d1 <= d0) continue;
            const s0 = source(d0), s1 = source(d1);
            slice(0, s0, w, s1 - s0, 0, d0, w, d1 - d0);                         // top
            slice(0, h - s1, w, s1 - s0, 0, h - d1, w, d1 - d0);                 // bottom
            if (middle > 0) {
                slice(s0, bevel, s1 - s0, middle, d0, bevel, d1 - d0, middle);           // left
                slice(w - s1, bevel, s1 - s0, middle, w - d1, bevel, d1 - d0, middle);   // right
            }
        }
        context.restore();
    };

    /* ---- mode ------------------------------------------------------------- */
    const pickMode = () => {
        // A testing hook: set window.__glassForce before this file runs.
        if (window.__glassForce) return window.__glassForce;
        if (root.dataset.effects !== 'high' || (plainGlass && plainGlass.matches)) return 'frost';
        return canRefractBackdrop ? 'refract' : 'lens';
    };
    const applyMode = () => {
        const next = pickMode();
        if (next !== mode) {
            mode = next;
            root.dataset.glass = mode;
            if (mode === 'refract') {
                // The bar at once, so it never shows a frame unbent; the rest
                // as their sizes are confirmed.
                if (bar && !menuOpen()) wear(bar);
                tracked.forEach(refit);
            } else {
                [...worn.keys()].forEach(shed);
            }
        }
        measure();
    };

    // A soft highlight tracks the cursor along the bar, the way light slides
    // across a curved surface as you move past it. Fine pointers only.
    if (navbar && bar) {
        let glintFrame = 0, glintX = 0;
        navbar.addEventListener('pointermove', event => {
            if (mode === 'frost' || event.pointerType !== 'mouse' || !rect) return;
            glintX = event.clientX;
            if (glintFrame) return;
            glintFrame = requestAnimationFrame(() => {
                glintFrame = 0;
                const across = Math.min(1, Math.max(0, (glintX - rect.x) / rect.w));
                bar.style.setProperty('--glass-glint', `${(across * 100).toFixed(1)}%`);
            });
        }, { passive: true });
        navbar.addEventListener('pointerleave', () => bar.style.removeProperty('--glass-glint'));
        // Closing the menu hands the bar back to the filter at its closed size.
        new MutationObserver(() => { measure(); refit(bar); })
            .observe(navbar, { attributes: true, attributeFilter: ['data-nav-open'] });
    }

    new MutationObserver(applyMode).observe(root, { attributes: true, attributeFilter: ['data-effects'] });
    if (plainGlass) {
        if (plainGlass.addEventListener) plainGlass.addEventListener('change', applyMode);
        else if (plainGlass.addListener) plainGlass.addListener(applyMode);
    }
    // Cards arrive after the page's data loads, and a collection renders its
    // cards when it is opened; each container is watched for them.
    for (const selector of SURFACE_ROOTS) {
        const container = document.querySelector(selector);
        if (container) new MutationObserver(scheduleScan).observe(container, { childList: true, subtree: true });
    }
    window.addEventListener('resize', measure, { passive: true });

    applyMode();
    if (bar) track(bar);
    scan();

    window.portfolioNavGlass = { paintBackdrop };
})();
