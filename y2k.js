/* The eye: the whole backdrop of Low FX's hidden look.

   One great eye drawn in characters, as a terminal would show a picture: worked out a
   cell at a time on a very small canvas, then each character cell of the screen takes the
   character that inks it about as much as the eye is bright there, in the eye's colours.
   Double-pressing the eye tints its iris and lets it follow for ten seconds, narrowing toward
   the edge, and now and then it blinks. This is the one thing in Low's
   other look that runs, and it is built to ask almost nothing: everything that can
   be is worked out once, a frame looks up what it needs, only the cells that changed
   are drawn, and there are no frames at all unless the eye is actually moving. It
   does not run under an open project or in a hidden tab, and it holds still for
   anyone who prefers reduced motion. Not fetched until someone asks. */
(function () {
    'use strict';

    const BAYER = [
        0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
        3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21
    ];
    // Thirty frames a second while it moves: fewer read as choppy.
    const FRAME_MS = 33;
    // How far the ball can turn, in radians: a long way to the sides, less up and down.
    const MOST_YAW = .72, MOST_PITCH = .3;
    const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
    const smooth = (low, high, value) => {
        const t = clamp((value - low) / (high - low), 0, 1);
        return t * t * (3 - 2 * t);
    };

    let canvas = null, context = null, image = null, shown = false;
    // It is drawn in characters (portfolio.js, portfolioGlyphs). The eye is worked out a cell
    // at a time as before, into `level` (how bright, for which character) and a very small
    // picture of its colours (`tint`, never on the page); the characters are drawn from them
    // on the page's canvas, only where something changed, and coloured by laying the small
    // picture over them. Between movements a few of them change, a few times a second.
    let tint = null, tintContext = null, level = null, glyphs = null, ratio = 1;
    let buildPaintMs = 0;
    let glyphCols = 0, glyphRows = 0, glyphAt = null, glyphNoise = null, shimmerTimer = 0, lastBuildPaint = 0;
    // Twice as often, half as many at a time: the same work, flowing rather than ticking.
    const SHIMMER_MS = 110, SHIMMER_SHARE = .0075;
    let cols = 0, rows = 0, cell = 4, cx = 0, cy = 0, A = 0, upper = 0, lower = 0, irisR = 0, ball = 1, spriteSize = 0;
    let threshold = null, skinTone = null, whiteTone = null, tintR = null, tintG = null, tintB = null, edge = null, dimming = null, ballZ = null, ballShade = null;
    let irisTone = null, irisR8 = null, irisG8 = null, irisB8 = null;
    let open = 1, drawnOpen = -1, drawnX = 1e9, drawnY = 1e9;
    let yaw = 0, pitch = 0, wantYaw = 0, wantPitch = 0, lookX = 0, lookY = 0, mostYaw = MOST_YAW;
    let frame = 0, gapTimer = 0, lastDraw = 0, blinkAt = -1, blinkTimer = 0, roamTimer = 0, resizeTimer = 0, builtWidth = 0, builtHeight = 0;
    let underProject = false, reducedMotion = null;
    let followUntil = 0, followTimer = 0, lastPress = -1e9, shownAt = 0;
    const following = () => performance.now() < followUntil;
    let yawVelocity = 0, pitchVelocity = 0;
    let lastX = 0, lastY = 0;
    // Asleep until the page is pressed (portfolio.js calls rouse), it does not show at all.
    // Roused, it does what Medium's does (iris.js), worked out here cell by cell for the few
    // seconds it lasts: the lids come up on a plain ball, the skin draws back to leave just a
    // circle, and it builds itself: a wire skeleton, its pieces falling into place from where
    // they were laid out round it, the iris winding in, the skin closing over it into lids,
    // and the seams sealed. Then it blinks, starts out a little, and looks about.
    const ROUSE_MS = 2000, BIRTH_MS = 4500, SLEEP_DIM = '0', TAU = Math.PI * 2;
    const lift = age => age < 150 ? 0 : age < 420 ? .3 * smooth(150, 420, age) : age < 540 ? .3 - .18 * smooth(420, 540, age) : .12 + .88 * smooth(540, 980, age);
    const wedgeDue = Array.from({ length: 10 }, (_, w) => .18 + .3 * ((Math.sin(w * 91.7 + 7) * 43758.5453) % 1 + 1) % 1);
    const wedgeApart = new Float32Array(10), wedgeX = new Float32Array(10), wedgeY = new Float32Array(10);
    for (let w = 0; w < 10; w++) {
        const mid = (w + .5) / 10 * TAU - Math.PI;
        wedgeX[w] = Math.cos(mid);
        wedgeY[w] = Math.sin(mid);
    }
    let asleep = false, rouseAt = -1, irisIn = 1, drawnIris = 1, irisKey = null;

    const build = () => {
        const width = Math.max(320, document.documentElement.clientWidth), height = Math.max(320, window.innerHeight);
        builtWidth = document.documentElement.clientWidth;
        builtHeight = window.innerHeight;
        // From wide to tall with no jump on the way, and the same few cells at any size or shape.
        const tallness = smooth(.9, 1.4, height / width);
        const shaped = (wide, narrow) => wide + (narrow - wide) * tallness;
        cell = Math.max(3, Math.sqrt(width * height / 100000));
        cols = Math.ceil(width / cell);
        rows = Math.ceil(height / cell);
        cx = cols * shaped(.56, .5);
        cy = rows * shaped(.5, .44);
        // On a very wide monitor it stops short of being a slit.
        A = Math.min(cols * shaped(.62, .86), rows * 1.55);
        upper = rows * shaped(.44, .3);
        lower = rows * shaped(.38, .25);
        irisR = Math.min(rows * shaped(.36, .2), A * .52);
        // A little smaller than the opening is wide, so its round edge shows in the corners.
        ball = Math.max(A * .8, upper * 1.25, irisR * 2.1);
        // On a narrow screen it turns no further than keeps the iris in sight.
        mostYaw = Math.min(MOST_YAW, Math.asin(clamp((Math.min(cx, cols - cx) - irisR * .35) / ball, 0, 1)));
        const count = cols * rows;
        threshold = new Uint8Array(count);
        skinTone = new Uint8Array(count);
        whiteTone = new Uint8Array(count);
        tintR = new Uint8Array(count);
        tintG = new Uint8Array(count);
        tintB = new Uint8Array(count);
        dimming = new Float32Array(count);
        ballZ = new Float32Array(count);
        ballShade = new Float32Array(count);
        edge = new Float32Array(cols);
        for (let x = 0; x < cols; x++) {
            const u = clamp((x - cx) / A, -1, 1);
            edge[x] = Math.pow(1 - u * u, 1.08);
        }
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const i = y * cols + x;
                threshold[i] = (BAYER[(y & 7) * 8 + (x & 7)] + .5) * 4;
                // Quiet where the page's words run: down the left, across the top under
                // the bar, and on a tall screen all the way over.
                const dim = shaped(.24 + .76 * smooth(.14, .68, x / cols), .46) * (.3 + .7 * smooth(.05, .17, y / rows));
                dimming[i] = dim;
                const top = cy - upper * edge[x], foot = cy + lower * edge[x];
                // The ball under its light, from above and to the right, off the page's words: bright
                // where it faces that, turning away all round, and past its edge the dark.
                const nx = (x - cx) / ball, ny = (y - cy) / ball, reach = nx * nx + ny * ny;
                const z = reach < 1 ? Math.sqrt(1 - reach) : 0;
                const light = Math.max(0, nx * .26 + ny * -.34 + z * .9);
                ballZ[i] = z;
                ballShade[i] = clamp(.42 + .72 * light, 0, 1);
                whiteTone[i] = 255 * dim * (reach < 1 ? clamp(.05 + .6 * Math.pow(light, 1.5) + .6 * Math.pow(1 - z, 2.6), 0, 1) : .025);
                // The skin round it, and the lid when it comes down: a crease above,
                // a fold below, and the dark falling away beyond them.
                const crease = cy - (upper + rows * .085) * Math.pow(edge[x], .8);
                const fold = cy + (lower + rows * .07) * Math.pow(edge[x], .8);
                let tone = .05 + .2 * Math.exp(-Math.pow((y - top) / (rows * .16), 2)) + .16 * Math.exp(-Math.pow((y - foot) / (rows * .1), 2));
                tone += .46 * Math.exp(-Math.pow((y - crease) / (rows * .009 + .9), 2)) * Math.min(1, edge[x] * 2.6);
                tone += .24 * Math.exp(-Math.pow((y - fold) / (rows * .007 + .8), 2)) * Math.min(1, edge[x] * 2.6);
                skinTone[i] = 255 * dim * clamp(tone, 0, 1);
                // Lilac, going to hot pink high on the right and blue low on the left.
                const warm = smooth(.25, .95, x / cols) * smooth(.8, .1, y / rows);
                const cool = smooth(.7, .1, x / cols) * smooth(.3, 1, y / rows);
                tintR[i] = clamp(206 + warm * 49 - cool * 90, 0, 255);
                tintG[i] = clamp(190 - warm * 70 - cool * 20, 0, 255);
                tintB[i] = clamp(255 - warm * 14, 0, 255);
            }
        }
        // The iris, once, as it would look from straight on. A frame reads it through the ball.
        spriteSize = Math.ceil(irisR) * 2 + 1;
        const spriteCount = spriteSize * spriteSize;
        irisTone = new Int16Array(spriteCount).fill(-1);
        irisR8 = new Uint8Array(spriteCount);
        irisG8 = new Uint8Array(spriteCount);
        irisB8 = new Uint8Array(spriteCount);
        irisKey = new Uint8Array(spriteCount);
        const pupil = irisR * .36;
        const c = (spriteSize - 1) / 2;
        for (let y = 0; y < spriteSize; y++) {
            for (let x = 0; x < spriteSize; x++) {
                const dx = x - c, dy = y - c, d = Math.hypot(dx, dy);
                if (d > irisR) continue;
                const i = y * spriteSize + x, k = d / irisR, angle = Math.atan2(dy, dx);
                // Fibres running out from the pupil, a dark ring at the rim of the
                // iris, and a ring of light partway out.
                const fibre = .5 + .5 * Math.sin(angle * 34 + Math.sin(angle * 9) * 1.6);
                let tone = .2 + .62 * fibre * smooth(.3, .7, k) * smooth(1, .78, k) + .24 * Math.exp(-Math.pow((k - .48) / .07, 2));
                tone *= smooth(1, .9, k) * .9 + .1;
                let r = 188, g = 128, b = 255;
                if (k < .62) {
                    r = 255; g = 120 + k * 60; b = 214;
                }
                if (d < pupil) tone = 0;
                else tone = Math.max(tone, .14 * smooth(pupil * 1.3, pupil, d));
                irisTone[i] = 255 * clamp(tone, 0, 1);
                irisR8[i] = r;
                irisG8[i] = g;
                irisB8[i] = b;
                // When it winds in: from the rim to the middle, a little round the clock.
                irisKey[i] = 255 * ((1 - k) * .85 + (angle / (Math.PI * 2) + .5) * .15);
            }
        }
        tint.width = cols;
        tint.height = rows;
        image = tintContext.createImageData(cols, rows);
        level = new Uint8ClampedArray(cols * rows);
        // The characters want the screen's own pixels; the cheapest machines have no more
        // than one to a pixel anyway.
        ratio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        glyphs = window.portfolioGlyphs(Math.max(9, cell * 3) * ratio);
        // Its colours are laid over the characters cell by cell, hard, which is also cheapest.
        context.imageSmoothingEnabled = false;
        glyphCols = Math.ceil(canvas.width / glyphs.width);
        glyphRows = Math.ceil(canvas.height / glyphs.height);
        glyphAt = new Uint8Array(glyphCols * glyphRows);
        glyphNoise = new Float32Array(glyphCols * glyphRows);
        for (let k = 0; k < glyphNoise.length; k++) glyphNoise[k] = Math.random();
        drawnX = drawnY = 1e9;
        drawnOpen = -1;
    };

    // Only the cells inside the box given.
    const paint = (x0, y0, x1, y1) => {
        const data = image.data;
        const flushed = following();
        const yawS = Math.sin(yaw), yawC = Math.cos(yaw), pitchS = Math.sin(pitch), pitchC = Math.cos(pitch);
        // The window it reflects stays with the room, and only slides a little as the
        // bulge of the eye comes round under it.
        const shineX = cx + lookX * .28, shineY = cy + lookY * .28;
        const big = irisR * .09, small = irisR * .035;
        const half = (spriteSize - 1) / 2;
        const shade = rows * .06;
        const shownIris = irisIn * 255, glints = irisIn >= 1;
        for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
                const i = y * cols + x;
                const top = cy - open * upper * edge[x], foot = cy + open * lower * edge[x];
                let tone, r = tintR[i], g = tintG[i], b = tintB[i];
                if (y > top && y < foot) {
                    tone = whiteTone[i];
                    const z = ballZ[i];
                    if (z > 0) {
                        // The part of the ball that has turned to face this cell.
                        const nx = (x - cx) / ball, ny = (y - cy) / ball;
                        if (yawS * pitchC * nx + pitchS * ny + yawC * pitchC * z > 0) {
                            const sx = Math.round(half + (yawC * nx - yawS * z) * ball);
                            const sy = Math.round(half + (-yawS * pitchS * nx + pitchC * ny - yawC * pitchS * z) * ball);
                            if (sx >= 0 && sy >= 0 && sx < spriteSize && sy < spriteSize) {
                                const s = sy * spriteSize + sx;
                                if (irisTone[s] >= 0 && irisKey[s] <= shownIris) {
                                    tone = irisTone[s] * (.35 + .65 * dimming[i]) * ballShade[i];
                                    r = irisR8[s];
                                    g = irisG8[s];
                                    b = irisB8[s];
                                    if (flushed) {
                                        r = r * .45 + 255 * .55;
                                        g = g * .45 + 82 * .55;
                                        b = b * .45 + 143 * .55;
                                    }
                                }
                            }
                        }
                        const bigX = x - shineX - irisR * .3, bigY = y - shineY + irisR * .34;
                        const smallX = x - shineX + irisR * .24, smallY = y - shineY - irisR * .3;
                        if (!glints) {
                            // Nothing in it yet.
                        } else if (bigX * bigX + bigY * bigY < big * big) {
                            tone = 255;
                            r = g = b = 255;
                        } else if (smallX * smallX + smallY * smallY < small * small) {
                            tone = 204;
                            r = g = b = 255;
                        }
                    }
                    // The shadow the upper lid throws.
                    const under = (y - top) / shade;
                    if (under < 1) tone *= .2 + .8 * under;
                } else {
                    tone = skinTone[i];
                    // The wet line of each lid's edge.
                    const toTop = Math.abs(y - top), toFoot = Math.abs(y - foot);
                    if (edge[x] > .02 && (toTop < 1.3 || toFoot < .9)) tone = toTop < 1.3 ? 235 : 150;
                }
                const at = i * 4;
                data[at] = r;
                data[at + 1] = g;
                data[at + 2] = b;
                data[at + 3] = 255;
                level[i] = tone;
            }
        }
        tintContext.putImageData(image, 0, 0, x0, y0, x1 - x0, y1 - y0);
        drawGlyphs(x0, y0, x1, y1);
    };
    // The whole of it while it builds itself, as iris.js's shader has it: `born` how far built,
    // `blank` how much of the plain ball it opened on is left, `skin` how much of the skin it
    // slept under.
    const paintBuild = (born, blank, skin) => {
        const data = image.data;
        const wireIn = smooth(0, .2, born), wire = wireIn * (1 - smooth(.78, .96, born)), sealed = smooth(.86, .99, born);
        const skinIn = Math.max(smooth(.66, .92, born), skin), bare = (1 - skinIn) * (1 - blank);
        const lit = blank + (1 - blank) * (.15 + .85 * smooth(.12, .5, born));
        const shownIris = smooth(.55, .84, born) * 1.1 * 255, lines = 16 * wireIn;
        const fuseAt = 1.15 - sealed * 1.3, fuse = sealed * (1 - sealed) * 4;
        const skinFrom = 1 - skinIn * 1.15;
        const half = (spriteSize - 1) / 2, shade = rows * .06;
        for (let w = 0; w < 10; w++) wedgeApart[w] = (1 - smooth(wedgeDue[w], wedgeDue[w] + .16, born)) * (1 - blank);
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const i = y * cols + x, dim = dimming[i];
                const opening = 2.6 + (edge[x] - 2.6) * skinIn;
                const top = cy - open * upper * opening, foot = cy + open * lower * opening;
                let tone = 0, r = tintR[i], g = tintG[i], b = tintB[i];
                if (y > top && y < foot) {
                    const dx = x - cx, dy = y - cy;
                    const at = (Math.atan2(dy, dx) / TAU + .5) * 10, w = Math.min(9, at | 0), apart = wedgeApart[w];
                    // Each piece is set out from the middle along its own line, and comes in.
                    const px = dx - wedgeX[w] * apart * ball * .5, py = dy - wedgeY[w] * apart * ball * .5;
                    const sx = Math.round(cx + px), sy = Math.round(cy + py);
                    if (apart > 0 && px * wedgeX[w] + py * wedgeY[w] < 0) tone = 0;
                    else if (sx < 0 || sy < 0 || sx >= cols || sy >= rows || !(ballZ[sy * cols + sx] > 0)) tone = 6 * dim;
                    else {
                        const j = sy * cols + sx, z = ballZ[j];
                        tone = whiteTone[j];
                        const ix = Math.round(half + px), iy = Math.round(half + py);
                        if (ix >= 0 && iy >= 0 && ix < spriteSize && iy < spriteSize) {
                            const s = iy * spriteSize + ix;
                            if (irisTone[s] >= 0 && irisKey[s] <= shownIris) {
                                tone = irisTone[s] * (.35 + .65 * dim) * ballShade[j];
                                r = irisR8[s];
                                g = irisG8[s];
                                b = irisB8[s];
                            }
                        }
                        // Before the skin, the flesh of it, scanned in lines.
                        tone *= lit * (1 - .45 * bare * (y & 1 ? 1 : .5));
                        const rr = Math.hypot(px, py) / ball;
                        const part = at - (at | 0), seamAt = Math.min(part, 1 - part) * TAU / 10 * Math.hypot(dx, dy);
                        let cyan = 0;
                        if (wire > 0) {
                            // The wire skeleton, drawn in line by line.
                            const round = Math.atan2(py, px) / TAU + .5, away = Math.acos(z);
                            const lon = round * 16, lat = away * 2.9;
                            if ((lon <= lines && Math.abs(lon - Math.floor(lon) - .5) > .46) || (away / Math.PI * 9 <= lines && Math.abs(lat - Math.floor(lat) - .5) > .45)) cyan = wire * .95;
                        }
                        // A piece on its way in shows its cut edges lit; the seams stay open
                        // till the end, when a ring of light runs in over them.
                        const moving = apart * (1 - apart) * 4;
                        if (moving > 0 && (seamAt < 1.1 || rr > .95)) cyan = Math.max(cyan, moving * .9);
                        else if (blank < 1 && sealed < 1 && seamAt < .9) tone *= 1 - (1 - sealed) * (1 - blank) * .85;
                        if (cyan > 0 && cyan * 255 * dim > tone) {
                            tone = cyan * 255 * (.35 + .65 * dim);
                            r = 128;
                            g = 242;
                            b = 255;
                        }
                        if (fuse > 0) tone += Math.exp(-(((rr - fuseAt) / .07) ** 2)) * fuse * 217 * dim;
                    }
                    const under = (y - top) / shade;
                    if (under < 1) tone *= .2 + .8 * under;
                } else if (skinIn > 0) {
                    tone = skinTone[i];
                    const toTop = Math.abs(y - top), toFoot = Math.abs(y - foot);
                    if (edge[x] > .02 && (toTop < 1.3 || toFoot < .9)) tone = toTop < 1.3 ? 235 : 150;
                    // The skin comes in from the edges of the screen.
                    const fromEdge = Math.max(Math.abs(x / cols - .5), Math.abs(y / rows - .5)) * 2;
                    tone *= smooth(skinFrom, skinFrom + .12, fromEdge) * skinIn;
                }
                const o = i * 4;
                data[o] = r;
                data[o + 1] = g;
                data[o + 2] = b;
                data[o + 3] = 255;
                level[i] = tone;
            }
        }
        tintContext.putImageData(image, 0, 0);
        drawGlyphs(0, 0, cols, rows);
        drawnOpen = -1;
    };
    // The characters over the eye's cells x0..x1, y0..y1: each character cell reads the
    // brightest of the eye under it and takes the character that inks its cell about as much,
    // quieter where the page's words run, as the dither was; then the colours go over them.
    const drawGlyphs = (x0, y0, x1, y1) => {
        const scale = cell * ratio, gw = glyphs.width, gh = glyphs.height, steps = glyphs.count - 1;
        const gx0 = Math.max(0, Math.floor(x0 * scale / gw)), gx1 = Math.min(glyphCols, Math.ceil(x1 * scale / gw));
        const gy0 = Math.max(0, Math.floor(y0 * scale / gh)), gy1 = Math.min(glyphRows, Math.ceil(y1 * scale / gh));
        if (gx1 <= gx0 || gy1 <= gy0) return;
        context.clearRect(gx0 * gw, gy0 * gh, (gx1 - gx0) * gw, (gy1 - gy0) * gh);
        for (let gy = gy0; gy < gy1; gy++) {
            const ya = Math.min(rows - 1, ((gy + .25) * gh / scale) | 0), yb = Math.min(rows - 1, ((gy + .75) * gh / scale) | 0);
            for (let gx = gx0; gx < gx1; gx++) {
                const xa = Math.min(cols - 1, ((gx + .25) * gw / scale) | 0), xb = Math.min(cols - 1, ((gx + .75) * gw / scale) | 0);
                const lit = Math.max(level[ya * cols + xa], level[ya * cols + xb], level[yb * cols + xa], level[yb * cols + xb]) / 255;
                const k = gy * glyphCols + gx;
                if (lit <= .035) {
                    glyphAt[k] = 0;
                    continue;
                }
                const index = Math.max(1, Math.min(steps, Math.floor(lit * steps + glyphNoise[k])));
                glyphAt[k] = index;
                context.globalAlpha = Math.min(1, (.38 + .62 * dimming[yb * cols + xb]) * (.8 + .4 * lit));
                context.drawImage(glyphs.image, index * gw, 0, gw, gh, gx * gw, gy * gh, gw, gh);
            }
        }
        colour(gx0 * gw, gy0 * gh, (gx1 - gx0) * gw, (gy1 - gy0) * gh);
    };
    // The eye's colours laid over what is drawn in the box, keeping its shapes.
    const colour = (x, y, w, h) => {
        const scale = cell * ratio;
        context.globalAlpha = 1;
        context.globalCompositeOperation = 'source-atop';
        context.drawImage(tint, x / scale, y / scale, w / scale, h / scale, x, y, w, h);
        context.globalCompositeOperation = 'source-over';
    };
    // A few characters step to the one either side of them, a few times a second, so it
    // never quite holds still; only those cells are drawn again.
    const shimmer = () => {
        clearTimeout(shimmerTimer);
        shimmerTimer = 0;
        if (!shown || asleep || rouseAt >= 0 || reducedMotion.matches) return;
        shimmerTimer = window.setTimeout(() => {
            shimmerTimer = 0;
            if (!shown || frame || gapTimer || underProject || document.hidden) return;
            const gw = glyphs.width, gh = glyphs.height, steps = glyphs.count - 1;
            const tries = Math.ceil(glyphAt.length * SHIMMER_SHARE);
            for (let n = 0; n < tries; n++) {
                const k = (Math.random() * glyphAt.length) | 0, was = glyphAt[k];
                if (!was) continue;
                const index = Math.max(1, Math.min(steps, was + (Math.random() < .5 ? -1 : 1)));
                if (index === was) continue;
                glyphAt[k] = index;
                const x = (k % glyphCols) * gw, y = ((k / glyphCols) | 0) * gh;
                context.clearRect(x, y, gw, gh);
                context.globalAlpha = .9;
                context.drawImage(glyphs.image, index * gw, 0, gw, gh, x, y, gw, gh);
                colour(x, y, gw, gh);
            }
            shimmer();
        }, SHIMMER_MS);
    };
    const whole = () => {
        paint(0, 0, cols, rows);
        drawnX = lookX;
        drawnY = lookY;
        drawnOpen = open;
        drawnIris = irisIn;
    };
    // Wherever the iris was and now is, or the whole opening if a lid has moved.
    const paintChanges = () => {
        if (open !== drawnOpen) {
            const reach = Math.max(open, drawnOpen < 0 ? 1 : drawnOpen);
            const y0 = Math.floor(cy - reach * upper - 3), y1 = Math.ceil(cy + reach * lower + 3);
            const x0 = Math.floor(cx - A), x1 = Math.ceil(cx + A);
            paint(clamp(x0, 0, cols), clamp(y0, 0, rows), clamp(x1, 0, cols), clamp(y1, 0, rows));
        } else {
            // The iris, a shade wider than from straight on at some angles, and the window
            // it reflects, which can be out on the white by now.
            const half = irisR * 1.06 + 3, shine = irisR * .46;
            const lowX = Math.min(lookX, drawnX), highX = Math.max(lookX, drawnX), lowY = Math.min(lookY, drawnY), highY = Math.max(lookY, drawnY);
            const x0 = Math.floor(cx + Math.min(lowX - half, lowX * .28 - shine)), x1 = Math.ceil(cx + Math.max(highX + half, highX * .28 + shine));
            const y0 = Math.floor(cy + Math.min(lowY - half, lowY * .28 - shine)), y1 = Math.ceil(cy + Math.max(highY + half, highY * .28 + shine));
            paint(clamp(x0, 0, cols), clamp(y0, 0, rows), clamp(x1, 0, cols), clamp(y1, 0, rows));
        }
        drawnX = lookX;
        drawnY = lookY;
        drawnOpen = open;
        drawnIris = irisIn;
    };

    // There are frames only while something is moving, one every FRAME_MS; between them it
    // waits on a timer rather than being woken at every refresh of the screen for nothing.
    const step = now => {
        frame = 0;
        if (!shown || underProject || document.hidden) return;
        const early = FRAME_MS - (now - lastDraw);
        if (lastDraw && early > 4) {
            gapTimer = window.setTimeout(() => {
                gapTimer = 0;
                frame = requestAnimationFrame(step);
            }, early);
            return;
        }
        const dt = lastDraw ? Math.min(.1, (now - lastDraw) / 1000) : .04;
        lastDraw = now;
        // Critically damped turns ease into each glance and carry momentum
        // through a new target without snapping or depending on frame rate.
        const rate = following() ? 15 : 12;
        const decay = Math.exp(-rate * dt);
        const yawOffset = yaw - wantYaw, pitchOffset = pitch - wantPitch;
        const yawStep = (yawVelocity + rate * yawOffset) * dt;
        const pitchStep = (pitchVelocity + rate * pitchOffset) * dt;
        yaw = wantYaw + (yawOffset + yawStep) * decay;
        pitch = wantPitch + (pitchOffset + pitchStep) * decay;
        yawVelocity = (yawVelocity - rate * yawStep) * decay;
        pitchVelocity = (pitchVelocity - rate * pitchStep) * decay;
        lookX = ball * Math.sin(yaw) * Math.cos(pitch);
        lookY = ball * Math.sin(pitch);
        let moving = Math.abs(yawVelocity) > .6 / ball || Math.abs(pitchVelocity) > .6 / ball || Math.abs(wantYaw - yaw) > .4 / ball || Math.abs(wantPitch - pitch) > .4 / ball;
        if (blinkAt >= 0) {
            const age = now - blinkAt;
            if (age < 110) open = 1 - .96 * (age / 110);
            else if (age < 150) open = .04;
            else if (age < 340) open = .04 + .96 * ((age - 150) / 190);
            else {
                open = 1;
                blinkAt = -1;
            }
            moving = true;
        }
        if (rouseAt >= 0) {
            const age = now - rouseAt;
            if (age < ROUSE_MS + BIRTH_MS) {
                open = age < ROUSE_MS ? lift(age) : 1;
                // Every character on the screen drawn again, thirty times a second, so the
                // build flows as it does at the other levels.
                // A slow machine takes longer over each, and then it waits that much longer
                // between them, so it never holds the page up.
                if (now - lastBuildPaint >= Math.max(30, buildPaintMs * 2.5)) {
                    lastBuildPaint = now;
                    const started = performance.now();
                    paintBuild(clamp((age - ROUSE_MS) / BIRTH_MS, 0, 1), 1 - smooth(0, 450, age - ROUSE_MS), 1 - smooth(1050, 1750, age));
                    buildPaintMs = buildPaintMs * .7 + (performance.now() - started) * .3;
                }
                frame = requestAnimationFrame(step);
                return;
            }
            // Whole: it blinks and starts out a little, and from here it is the eye it always was.
            rouseAt = -1;
            open = 1;
            whole();
            blinkAt = now;
            shownAt = now - 700;
            scheduleBlink();
            scheduleRoam();
            canvas.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.07)', offset: .25 }, { transform: 'scale(1)' }], { duration: 560, easing: 'cubic-bezier(.2, .9, .3, 1)' });
            moving = true;
        }
        if (open !== drawnOpen || irisIn !== drawnIris || Math.round(lookX) !== Math.round(drawnX) || Math.round(lookY) !== Math.round(drawnY)) paintChanges();
        if (moving) frame = requestAnimationFrame(step);
        else {
            lastDraw = 0;
            shimmer();
        }
    };
    const wake = () => {
        if (!frame && !gapTimer && shown && !underProject && !document.hidden) frame = requestAnimationFrame(step);
    };
    const aim = (x, y) => {
        // Turned until the pupil is on the cursor, as far as a ball can turn. A cursor moving
        // where the ball is already turned as far as it goes asks for nothing.
        const yawTo = clamp(Math.asin(clamp((x / cell - cx) / ball, -1, 1)), -mostYaw, mostYaw);
        const pitchTo = clamp(Math.asin(clamp((y / cell - cy) / ball, -1, 1)), -MOST_PITCH, MOST_PITCH);
        if (yawTo === wantYaw && pitchTo === wantPitch) return;
        wantYaw = yawTo;
        wantPitch = pitchTo;
        wake();
    };
    const scheduleBlink = () => {
        clearTimeout(blinkTimer);
        blinkTimer = window.setTimeout(() => {
            if (shown && !underProject && !document.hidden && !reducedMotion.matches) {
                blinkAt = performance.now();
                wake();
            }
            scheduleBlink();
        }, 2600 + Math.random() * 4600);
    };
    // At rest it looks about for itself, regardless of cursor movement.
    const scheduleRoam = () => {
        clearTimeout(roamTimer);
        const glance = restingEyeGaze(wantYaw, wantPitch, mostYaw, MOST_PITCH);
        roamTimer = window.setTimeout(() => {
            if (shown && !following() && !underProject && !document.hidden && !reducedMotion.matches) {
                wantYaw = glance.yaw;
                wantPitch = glance.pitch;
                wake();
            }
            scheduleRoam();
        }, Math.max(900, glance.delay));
    };
    const onPointerMove = event => {
        if (event.pointerType && event.pointerType !== 'mouse') return;
        lastX = event.clientX;
        lastY = event.clientY;
        if (following()) aim(lastX, lastY);
    };
    const ANSWERS = 'a, button, input, select, textarea, label, .project-card, .about-highlight, .skill-group, .navbar, .modal-overlay, .collection-toggle';
    const onPointerDown = event => {
        lastX = event.clientX;
        lastY = event.clientY;
        const x = lastX / cell - cx, y = lastY / cell - cy;
        const onEye = (x / A) ** 2 + (y / (y < 0 ? upper : lower)) ** 2 <= 1;
        if (event.button || event.target.closest?.(ANSWERS) || !onEye || underProject) {
            lastPress = -1e9;
            return;
        }
        const now = performance.now();
        if (now - shownAt < 700) return;
        if (now - lastPress < 500) {
            followUntil = now + 10000;
            lastPress = -1e9;
            canvas.dataset.following = '';
            clearTimeout(followTimer);
            aim(lastX, lastY);
            whole();
            followTimer = window.setTimeout(() => {
                delete canvas.dataset.following;
                whole();
                aim(cx * cell, cy * cell);
            }, 10000);
        } else lastPress = now;
    };
    const onVisibility = () => { if (!document.hidden) wake(); };
    const onModalOpen = () => { underProject = true; };
    const onModalClose = () => {
        underProject = false;
        wake();
    };
    const onResize = () => {
        clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
            if (!shown) return;
            // A phone's address bar coming and going is not a new screen.
            if (document.documentElement.clientWidth === builtWidth && Math.abs(window.innerHeight - builtHeight) < builtHeight * .16) return;
            build();
            // Turned as it was, measured on the new screen, and aimed again where it looked.
            lookX = ball * Math.sin(yaw) * Math.cos(pitch);
            lookY = ball * Math.sin(pitch);
            whole();
            if (following()) aim(lastX, lastY);
        }, 260);
    };

    window.portfolioY2k = {
        prepare: () => Promise.resolve(),
        // `sleeping`: as the page first has it, shut and dim until rouse().
        show({ sleeping = false } = {}) {
            reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
            if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.className = 'y2k-eye';
                canvas.setAttribute('aria-hidden', 'true');
                context = canvas.getContext('2d');
                tint = document.createElement('canvas');
                tintContext = tint.getContext('2d');
                document.querySelector('.background-grid')?.after(canvas);
            }
            yawVelocity = pitchVelocity = 0;
            shown = true;
            shownAt = performance.now();
            followUntil = 0;
            lastPress = -1e9;
            delete canvas.dataset.following;
            asleep = sleeping && !reducedMotion.matches;
            rouseAt = -1;
            open = asleep ? 0 : 1;
            irisIn = 1;
            if (asleep) {
                shownAt = Infinity;
                canvas.dataset.asleep = '';
            } else delete canvas.dataset.asleep;
            canvas.style.opacity = asleep ? SLEEP_DIM : '';
            yaw = pitch = wantYaw = wantPitch = lookX = lookY = 0;
            // Brought in while a project is open (the frame monitor stepping the level), it
            // waits behind it like everything else.
            underProject = !!document.querySelector('.modal-overlay.active');
            build();
            whole();
            window.addEventListener('resize', onResize, { passive: true });
            document.addEventListener('visibilitychange', onVisibility);
            document.addEventListener('portfolio:modal-open', onModalOpen);
            document.addEventListener('portfolio:modal-close', onModalClose);
            if (!reducedMotion.matches) {
                window.addEventListener('pointermove', onPointerMove, { passive: true });
                window.addEventListener('pointerdown', onPointerDown, { passive: true });
                if (!asleep) {
                    scheduleBlink();
                    scheduleRoam();
                }
            }
        },
        // The page was pressed while it slept.
        rouse() {
            if (!shown || !asleep) return;
            asleep = false;
            delete canvas.dataset.asleep;
            rouseAt = performance.now();
            canvas.style.opacity = '';
            canvas.animate?.([{ opacity: SLEEP_DIM }, { opacity: 1 }], { duration: 700, easing: 'ease-out' });
            wake();
        },
        release() {
            shown = false;
            underProject = false;
            asleep = false;
            rouseAt = -1;
            irisIn = 1;
            if (frame) cancelAnimationFrame(frame);
            frame = 0;
            clearTimeout(gapTimer);
            gapTimer = 0;
            blinkAt = -1;
            clearTimeout(blinkTimer);
            clearTimeout(roamTimer);
            clearTimeout(followTimer);
            followUntil = 0;
            clearTimeout(resizeTimer);
            window.removeEventListener('resize', onResize);
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('visibilitychange', onVisibility);
            document.removeEventListener('portfolio:modal-open', onModalOpen);
            document.removeEventListener('portfolio:modal-close', onModalClose);
            clearTimeout(shimmerTimer);
            shimmerTimer = 0;
            canvas?.remove();
            canvas = null;
            context = null;
            image = null;
            tint = tintContext = level = glyphAt = glyphNoise = null;
            threshold = skinTone = whiteTone = tintR = tintG = tintB = edge = dimming = ballZ = ballShade = irisTone = irisR8 = irisG8 = irisB8 = irisKey = null;
        }
    };
})();
