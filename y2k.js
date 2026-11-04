/* The eye: the whole backdrop of Low FX's hidden look.

   One great eye in hard dither, the kind of picture a dialog box showed at the turn
   of the century, drawn on a very small canvas and blown up with its pixels showing.
   It is a ball that turns to follow the cursor, the iris narrowing as it comes round to
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
    const FRAME_MS = 60;
    // How far the ball can turn, in radians: a long way to the sides, less up and down.
    const MOST_YAW = .72, MOST_PITCH = .3;
    const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
    const smooth = (low, high, value) => {
        const t = clamp((value - low) / (high - low), 0, 1);
        return t * t * (3 - 2 * t);
    };

    let canvas = null, context = null, image = null, shown = false;
    let cols = 0, rows = 0, cell = 4, cx = 0, cy = 0, A = 0, upper = 0, lower = 0, irisR = 0, ball = 1, spriteSize = 0;
    let threshold = null, skinTone = null, whiteTone = null, tintR = null, tintG = null, tintB = null, edge = null, dimming = null, ballZ = null, ballShade = null;
    let irisTone = null, irisR8 = null, irisG8 = null, irisB8 = null;
    let open = 1, drawnOpen = -1, drawnX = 1e9, drawnY = 1e9;
    let yaw = 0, pitch = 0, wantYaw = 0, wantPitch = 0, lookX = 0, lookY = 0, mostYaw = MOST_YAW;
    let frame = 0, gapTimer = 0, lastDraw = 0, blinkAt = -1, blinkTimer = 0, roamTimer = 0, resizeTimer = 0, builtWidth = 0, builtHeight = 0;
    let underProject = false, pointerSeen = false, reducedMotion = null;
    let lastX = 0, lastY = 0;

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
            }
        }
        canvas.width = cols;
        canvas.height = rows;
        image = context.createImageData(cols, rows);
        drawnX = drawnY = 1e9;
        drawnOpen = -1;
    };

    // Only the cells inside the box given.
    const paint = (x0, y0, x1, y1) => {
        const data = image.data;
        const yawS = Math.sin(yaw), yawC = Math.cos(yaw), pitchS = Math.sin(pitch), pitchC = Math.cos(pitch);
        // The window it reflects stays with the room, and only slides a little as the
        // bulge of the eye comes round under it.
        const shineX = cx + lookX * .28, shineY = cy + lookY * .28;
        const big = irisR * .09, small = irisR * .035;
        const half = (spriteSize - 1) / 2;
        const shade = rows * .06;
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
                                if (irisTone[s] >= 0) {
                                    tone = irisTone[s] * (.35 + .65 * dimming[i]) * ballShade[i];
                                    r = irisR8[s];
                                    g = irisG8[s];
                                    b = irisB8[s];
                                }
                            }
                        }
                        const bigX = x - shineX - irisR * .3, bigY = y - shineY + irisR * .34;
                        const smallX = x - shineX + irisR * .24, smallY = y - shineY - irisR * .3;
                        if (bigX * bigX + bigY * bigY < big * big) {
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
                if (tone > threshold[i]) {
                    data[at] = r;
                    data[at + 1] = g;
                    data[at + 2] = b;
                    data[at + 3] = 96 + 159 * dimming[i];
                } else data[at + 3] = 0;
            }
        }
        context.putImageData(image, 0, 0, x0, y0, x1 - x0, y1 - y0);
    };
    const whole = () => {
        paint(0, 0, cols, rows);
        drawnX = lookX;
        drawnY = lookY;
        drawnOpen = open;
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
        const pull = Math.min(1, dt * 9);
        yaw += (wantYaw - yaw) * pull;
        pitch += (wantPitch - pitch) * pull;
        lookX = ball * Math.sin(yaw) * Math.cos(pitch);
        lookY = ball * Math.sin(pitch);
        let moving = Math.abs(wantYaw - yaw) > .4 / ball || Math.abs(wantPitch - pitch) > .4 / ball;
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
        if (open !== drawnOpen || Math.round(lookX) !== Math.round(drawnX) || Math.round(lookY) !== Math.round(drawnY)) paintChanges();
        if (moving) frame = requestAnimationFrame(step);
        else lastDraw = 0;
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
    // A screen with no cursor on it: the eye looks about for itself. Once there is one, it
    // looks at that from then on.
    const scheduleRoam = () => {
        clearTimeout(roamTimer);
        if (pointerSeen) return;
        roamTimer = window.setTimeout(() => {
            if (shown && !pointerSeen && !underProject && !document.hidden && !reducedMotion.matches) {
                aim(Math.random() * cols * cell, Math.random() * rows * cell);
            }
            scheduleRoam();
        }, 2200 + Math.random() * 3800);
    };
    // On Low nothing plays on the way in. It is simply there, already looking at the
    // hand on the slider, and from then on at the cursor.
    // Or at the cursor, wherever it is now (portfolio.js keeps it).
    const lookAtSlider = () => {
        const slider = document.querySelector('.fx-slider')?.getBoundingClientRect();
        const cursor = window.portfolioPointer?.mouse && window.portfolioPointer;
        lastX = cursor ? cursor.x : slider?.width ? slider.left + slider.width / 2 : window.innerWidth * .8;
        lastY = cursor ? cursor.y : slider?.width ? slider.top + slider.height / 2 : 40;
        if (cursor) pointerSeen = true;
        aim(lastX, lastY);
        yaw = wantYaw;
        pitch = wantPitch;
        lookX = ball * Math.sin(yaw) * Math.cos(pitch);
        lookY = ball * Math.sin(pitch);
    };
    const onPointerMove = event => {
        if (event.pointerType && event.pointerType !== 'mouse') return;
        pointerSeen = true;
        lastX = event.clientX;
        lastY = event.clientY;
        aim(lastX, lastY);
    };
    const onPointerDown = event => {
        lastX = event.clientX;
        lastY = event.clientY;
        aim(lastX, lastY);
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
            if (pointerSeen) aim(lastX, lastY);
        }, 260);
    };

    window.portfolioY2k = {
        prepare: () => Promise.resolve(),
        show() {
            reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
            if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.className = 'y2k-eye';
                canvas.setAttribute('aria-hidden', 'true');
                context = canvas.getContext('2d');
                document.querySelector('.background-grid')?.after(canvas);
            }
            shown = true;
            open = 1;
            yaw = pitch = wantYaw = wantPitch = lookX = lookY = 0;
            // Brought in while a project is open (the frame monitor stepping the level), it
            // waits behind it like everything else.
            underProject = !!document.querySelector('.modal-overlay.active');
            build();
            lookAtSlider();
            whole();
            window.addEventListener('resize', onResize, { passive: true });
            document.addEventListener('visibilitychange', onVisibility);
            document.addEventListener('portfolio:modal-open', onModalOpen);
            document.addEventListener('portfolio:modal-close', onModalClose);
            if (!reducedMotion.matches) {
                window.addEventListener('pointermove', onPointerMove, { passive: true });
                window.addEventListener('pointerdown', onPointerDown, { passive: true });
                scheduleBlink();
                scheduleRoam();
            }
        },
        release() {
            shown = false;
            underProject = false;
            if (frame) cancelAnimationFrame(frame);
            frame = 0;
            clearTimeout(gapTimer);
            gapTimer = 0;
            blinkAt = -1;
            clearTimeout(blinkTimer);
            clearTimeout(roamTimer);
            clearTimeout(resizeTimer);
            window.removeEventListener('resize', onResize);
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('visibilitychange', onVisibility);
            document.removeEventListener('portfolio:modal-open', onModalOpen);
            document.removeEventListener('portfolio:modal-close', onModalClose);
            canvas?.remove();
            canvas = null;
            context = null;
            image = null;
            threshold = skinTone = whiteTone = tintR = tintG = tintB = edge = dimming = ballZ = ballShade = irisTone = irisR8 = irisG8 = irisB8 = null;
        }
    };
})();
