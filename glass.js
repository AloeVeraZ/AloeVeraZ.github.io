/* Liquid glass: the floating navigation bar, and the cards and buttons below
   it. navbar.css and portfolio.css draw the layers; this decides how much of
   the effect the browser can show, and builds the displacement filters the
   Chromium path needs.

   It is one glass, in one thickness. The navigation bar bends what is behind
   it exactly as the About, Skills and project cards, the hero, social and
   contact buttons and the carousel arrows do; the two names below -- bar and
   surface -- are left only because the bar can afford a finer map than
   ninety cards can. The layers above the bend are shared the same way
   (portfolio.css, navbar.css): the sky shows through softly, and in High FX
   bends toward the edges.

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
              transparency or more contrast: the bar, the cards and the
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
    // dispersion bends blue a trace further than red, as real glass does, and
    // soften is a frost of the filter's own, in px. Both are off: all of the
    // glass, the bar included, is frosted by its stylesheet before this filter
    // bends what shows through, and neither would survive that.
    //
    // bevel and stretch are the bar's, and now every surface's: a card that
    // bends what is behind it less than the bar does reads as a thinner
    // glass, which is the one thing the rim is there to say. rimBevel below
    // thins the bevel on anything too small to hold it, so a 44px button
    // still curves to its own size rather than to a card's.
    //
    // density is the map's resolution rather than the look of the bend: at 1
    // the map had one texel per pixel of the surface. It is a quarter of that
    // now, and the bar -- which used to carry a map twice as fine as the
    // cards -- a half.
    //
    // A map that sits in a backdrop filter is not handed to the browser once.
    // It is written out, pixels and all, into every frame the page produces,
    // for every sheet of glass on screen: at full resolution a row of cards
    // was a megabyte of map apiece, copied between processes thirty times a
    // second. On a 3x laptop screen that alone held the Projects section to
    // thirty stuttering frames a second and cost a full core, whether or not
    // anything behind the glass had moved. At a quarter of the resolution the
    // frames are smooth again and that cost is gone.
    //
    // The bend itself does not change. What the map bends is the sky after it
    // has been frosted, which has nothing fine left in it to resolve, and the
    // pull across the rim is a smooth curve that a quarter of the samples
    // still trace. Measured on a card and on the bar over a sharp grid: the
    // bend moves pixels by up to 53-66/255, and the coarser maps land within
    // 4/255 of the fine ones, on 0.01% of pixels.
    const GLASS = {
        bar: { bevel: 26, stretch: 1.8, dispersion: 0, soften: 0, density: .5 },
        surface: { bevel: 26, stretch: 1.8, dispersion: 0, soften: 0, density: .25 }
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
        // Lay the neutral grey down in one pass, a whole pixel at a time, and
        // let the rim write over the band it bends. Packing the pixel through
        // the byte view first keeps this right whichever way round the
        // machine stores a word.
        const pixels = new Uint32Array(data.buffer);
        data[0] = 128; data[1] = 128; data[2] = 128; data[3] = 255;
        pixels.fill(pixels[0]);
        // Neither |x| nor |y| changes along its own axis, so the distance to
        // each edge and the side it falls on are a column's and a row's
        // business, not a pixel's. Measuring them once per column and once per
        // row leaves the inner loop nothing to do but combine two numbers.
        const edgeX = new Float64Array(cw), sideX = new Float64Array(cw);
        const edgeY = new Float64Array(ch), sideY = new Float64Array(ch);
        for (let px = 0; px < cw; px++) {
            const x = (px + .5) / density - halfW;
            sideX[px] = x < 0 ? -1 : 1;
            edgeX[px] = Math.abs(x) - (halfW - r);
        }
        for (let py = 0; py < ch; py++) {
            const y = (py + .5) / density - halfH;
            sideY[py] = y < 0 ? -1 : 1;
            edgeY[py] = Math.abs(y) - (halfH - r);
        }
        // Further in than `bevel + r` from every edge, the depth can only come
        // out greater than the bevel, so the pull there is exactly zero and the
        // grey already laid down is the answer. Only the band around the rim is
        // worth walking -- on a tall card that is a fifth of its pixels.
        const bandX = Math.min(Math.ceil((bevel + r) * density), cw);
        const bandY = Math.min(Math.ceil((bevel + r) * density), ch);
        const bend = (px, py) => {
            const qx = edgeX[px], qy = edgeY[py];
            // Depth inside the rounded rectangle, and the outward normal.
            let depth, nx, ny;
            if (qx > 0 && qy > 0) {
                const length = Math.hypot(qx, qy);
                depth = r - length;
                nx = sideX[px] * qx / length;
                ny = sideY[py] * qy / length;
            } else if (qx > qy) {
                depth = r - qx; nx = sideX[px]; ny = 0;
            } else {
                depth = r - qy; nx = 0; ny = sideY[py];
            }
            if (depth < 0 || depth >= bevel) return;
            const pull = Math.pow(1 - depth / bevel, CURVE);
            const i = (py * cw + px) * 4;
            data[i] = 128 - nx * pull * 127;
            data[i + 1] = 128 - ny * pull * 127;
        };
        for (let py = 0; py < ch; py++) {
            if (py < bandY || py >= ch - bandY) {
                for (let px = 0; px < cw; px++) bend(px, py);
            } else {
                for (let px = 0; px < bandX; px++) bend(px, py);
                for (let px = Math.max(bandX, cw - bandX); px < cw; px++) bend(px, py);
            }
        }
        context.putImageData(image, 0, 0);
        return { canvas, cw, ch, bandX, bandY };
    };
    // A piece of a map, cut out on whole texels, as an image of its own.
    const cropMap = (map, x, y, w, h) => {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(map.canvas, x, y, w, h, 0, 0, w, h);
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
        const map = buildMap(width, height, radius, bevel, density);
        const { cw, ch, bandX, bandY } = map;
        const holder = document.createElementNS(svgNS, 'svg');
        // Only the rim bends. Everywhere further in than the band the map is
        // flat grey and the displacement moves nothing, yet the browser
        // filtered every pixel of the sheet, every frame the sky behind it
        // moved -- a full-size map drawn and a full-size displacement run, for
        // each sheet on screen, on a 3x screen well over a million pixels a
        // card. Measured on the Projects section at rest, the bend was a third
        // of all the drawing the graphics process did.
        //
        // So a sheet big enough to have a middle is bent in four strips, one
        // along each edge, each carrying its own piece of the same map, cut on
        // the same texels, and laid over the unbent frost. What the rim does is
        // unchanged to the pixel; the middle, which the map never moved, is
        // simply not filtered at all. Something too small to have a middle --
        // a round button, an icon -- is all rim, and is bent whole as before.
        if (!glass.dispersion && !glass.soften && cw > bandX * 2 && ch > bandY * 2) {
            const sx = width / cw, sy = height / ch;
            const strip = (name, x, y, w, h) => `
                <feImage x="${x * sx}" y="${y * sy}" width="${w * sx}" height="${h * sy}" preserveAspectRatio="none"
                    href="${cropMap(map, x, y, w, h)}" result="map-${name}"/>
                <feDisplacementMap x="${x * sx}" y="${y * sy}" width="${w * sx}" height="${h * sy}"
                    in="SourceGraphic" in2="map-${name}" scale="${scale.toFixed(2)}"
                    xChannelSelector="R" yChannelSelector="G" result="rim-${name}"/>`;
            holder.innerHTML = `
            <filter id="${id}" x="0" y="0" width="${width}" height="${height}" filterUnits="userSpaceOnUse"
                primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
                ${strip('left', 0, 0, bandX, ch)}
                ${strip('right', cw - bandX, 0, bandX, ch)}
                ${strip('top', bandX, 0, cw - bandX * 2, bandY)}
                ${strip('bottom', bandX, ch - bandY, cw - bandX * 2, bandY)}
                <feMerge>
                    <feMergeNode in="SourceGraphic"/>
                    <feMergeNode in="rim-left"/><feMergeNode in="rim-right"/>
                    <feMergeNode in="rim-top"/><feMergeNode in="rim-bottom"/>
                </feMerge>
            </filter>`;
            return holder.firstElementChild;
        }
        holder.innerHTML = `
            <filter id="${id}" x="0" y="0" width="${width}" height="${height}" filterUnits="userSpaceOnUse"
                primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
                <feImage x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"
                    href="${map.canvas.toDataURL('image/png')}" result="map"/>
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
    // A sheet of glass off the bottom of the page costs what one in front of
    // the reader costs: the browser keeps a copy of whatever is behind it and
    // filters that copy again every time the sky moves, which is every frame.
    // With every collection open there are ninety-odd sheets on this page and
    // at most a couple of dozen anyone can see, so the rest are switched off
    // -- the filter here, the frost in the stylesheets. What is kept is the
    // filter itself: it is shared by size and costs far more to build than to
    // hang, so a card scrolling back into view takes the same one again
    // instead of drawing a new map.
    const inView = new Set();
    const reflect = element => {
        const entry = filters.get(worn.get(element));
        if (entry && inView.has(element)) element.style.setProperty('--glass-filter', `url(#${entry.id})`);
        else element.style.removeProperty('--glass-filter');
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
        acquireFilter(key, kind, width, height, radius, density);
        if (previous) releaseFilter(previous);
        worn.set(element, key);
        reflect(element);
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
        dropFromView(element);
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
    // What decides whether a surface is on screen. A card on an archive ring
    // is watched through the ring rather than on its own: the ring clips its
    // cards at both ends, so a card waiting one place off the edge reads as
    // out of view right up until it slides in, and switching its glass on at
    // that moment is a pop the reader would catch. A ring is either in front
    // of them or it is not, and its cards go with it.
    //
    // That is still true of the ring as a whole, and it is why the ring is
    // what the viewport is asked about. But a ring holds up to sixteen cards
    // and shows three, and the thirteen parked round the back were each
    // holding a sheet of glass the browser copied the page behind and filtered
    // again every frame. So a card on a ring is asked a second question, of
    // the ring itself rather than of the window: is it anywhere near the part
    // of the ring that shows? Six hundred pixels past either end is a place
    // no reader can see and a card cannot reach in under a turn of the ring,
    // so the pop the anchor exists to prevent still cannot happen -- the glass
    // is always on long before the card arrives.
    const viewAnchor = element => element.closest('.project-carousel') || element;
    const anchored = new Map();    // anchor -> the surfaces watched through it
    const anchorOf = new Map();    // surface -> the anchor it is watched through
    const showing = new Map();     // anchor -> what the observer last said, if anything
    const onRing = new Map();      // a ring's surface -> whether it is near the part that shows
    const ringWatch = new Map();   // ring -> the observer that watches along it
    const ringMarks = new Map();   // ring -> the observer that watches it turn
    // Whether a project is open in front of the whole page -- see the
    // overlay watcher below.
    let covered = false;
    // Both answers, for one surface: the ring is in front of the reader, and
    // the card is somewhere they could be about to see, and the ring has not
    // turned it round the back. A card at no opacity is a sheet of glass with
    // nothing behind it to show: portfolio.js marks those as it turns the
    // ring, because it is the only thing that knows where a card has got to.
    const settle = element => {
        const seen = !covered
            && showing.get(anchorOf.get(element)) !== false
            && onRing.get(element) !== false
            && !element.hasAttribute('data-ring-hidden');
        if (seen) inView.add(element); else inView.delete(element);
        // The stylesheets drop the frost off-screen too, so a surface
        // nobody can see costs nothing in any of the three modes.
        element.classList.toggle('glass-offscreen', !seen);
        if (mode === 'refract') reflect(element);
    };
    const seeAnchor = (anchor, seen) => {
        showing.set(anchor, seen);
        for (const element of anchored.get(anchor) || []) settle(element);
    };
    const viewWatch = 'IntersectionObserver' in window
        ? new IntersectionObserver(entries => {
            for (const entry of entries) seeAnchor(entry.target, entry.isIntersecting);
        }, { rootMargin: '400px 600px' })
        : null;
    // One observer per ring, rooted on the ring, so what it reports is where
    // the card sits along the ring and not where the ring sits on the page.
    // A flat slider carries its cards off the side of its own box, which this
    // catches; a ring turns them away instead, which the mark above catches.
    const watchAlongRing = (ring, element) => {
        let watcher = ringWatch.get(ring);
        if (!watcher) {
            watcher = new IntersectionObserver(entries => {
                for (const entry of entries) {
                    onRing.set(entry.target, entry.isIntersecting);
                    settle(entry.target);
                }
            }, { root: ring, rootMargin: '200px 600px' });
            ringWatch.set(ring, watcher);
            // The ring marks its cards as it turns; each mark is one surface
            // putting its glass on or taking it off.
            const marks = new MutationObserver(entries => {
                for (const entry of entries) {
                    if (tracked.has(entry.target)) settle(entry.target);
                }
            });
            marks.observe(ring, { attributes: true, attributeFilter: ['data-ring-hidden'], subtree: true });
            ringMarks.set(ring, marks);
        }
        watcher.observe(element);
    };
    const watchView = element => {
        // The bar is fixed to the viewport: it is in view whenever it shows.
        if (element === bar || !viewWatch) { inView.add(element); return; }
        const anchor = viewAnchor(element);
        anchorOf.set(element, anchor);
        let group = anchored.get(anchor);
        if (!group) anchored.set(anchor, group = new Set());
        group.add(element);
        // In view until the observer has said otherwise about this ring,
        // which it does within a frame. A surface that turns out to be off
        // screen has carried its glass for one frame, where one guessed the
        // other way -- a collection opening in front of the reader -- would
        // be seen putting it on.
        if (!covered && showing.get(anchor) !== false) inView.add(element);
        else element.classList.add('glass-offscreen');
        if (group.size === 1) viewWatch.observe(anchor);
        if (anchor !== element) {
            watchAlongRing(anchor, element);
            // A card already round the back when the scan reaches it -- a
            // collection opening onto a ring mid-turn -- should not carry a
            // sheet of glass for the frame it takes the observer to say so.
            if (element.hasAttribute('data-ring-hidden')) settle(element);
        }
    };
    const dropFromView = element => {
        inView.delete(element);
        element.classList.remove('glass-offscreen');
        const anchor = anchorOf.get(element);
        anchorOf.delete(element);
        onRing.delete(element);
        const group = anchored.get(anchor);
        if (!group) return;
        const watcher = ringWatch.get(anchor);
        if (watcher) watcher.unobserve(element);
        group.delete(element);
        if (group.size) return;
        anchored.delete(anchor);
        showing.delete(anchor);
        if (watcher) { watcher.disconnect(); ringWatch.delete(anchor); }
        const marks = ringMarks.get(anchor);
        if (marks) { marks.disconnect(); ringMarks.delete(anchor); }
        if (viewWatch) viewWatch.unobserve(anchor);
    };
    const track = element => {
        if (tracked.has(element)) return;
        tracked.add(element);
        watchView(element);
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
        // A machine the page has found struggling (the frame monitor in
        // portfolio.js) keeps the frost and gives up the bend: the rim is a
        // third of what the glass costs to draw, and the frost is most of how
        // it looks.
        if (root.dataset.effectsPace === 'lighter') return 'frost';
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

    new MutationObserver(applyMode).observe(root, { attributes: true, attributeFilter: ['data-effects', 'data-effects-pace'] });
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
    // A project open in front of the page. Its overlay is ninety-four per cent
    // opaque, so every sheet of glass under it shows a twentieth of what it
    // frosts -- and was still copying, blurring and bending the sky behind it
    // on every frame the sky moved, for as long as the reader stayed in the
    // project. Under the overlay it comes off, and nobody can see it go.
    const overlay = document.getElementById('project-modal');
    if (overlay) {
        let coverTimer = 0;
        const recover = () => {
            for (const element of tracked) if (element !== bar && element.isConnected) settle(element);
        };
        new MutationObserver(() => {
            clearTimeout(coverTimer);
            if (overlay.classList.contains('active')) {
                // Only once the overlay has finished fading in (.2s in
                // portfolio.css): any sooner and a card's frost is seen going.
                if (!covered) coverTimer = window.setTimeout(() => { covered = true; recover(); }, 260);
            } else if (covered) {
                // Straight back, while the overlay is still fading out in front
                // of it, so the glass is whole before anything shows through.
                covered = false;
                recover();
            }
        }).observe(overlay, { attributes: true, attributeFilter: ['class'] });
    }

    applyMode();
    if (bar) track(bar);
    scan();

    window.portfolioNavGlass = { paintBackdrop };
})();
