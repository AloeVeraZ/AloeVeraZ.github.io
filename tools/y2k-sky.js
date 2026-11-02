window.__paintY2k = async (W, H, portrait) => {
    await Promise.all(['600 20px "Barlow Condensed"', '700 20px "Barlow Condensed"', '500 16px Inter'].map(f => document.fonts.load(f).catch(() => {})));
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const c = canvas.getContext('2d');
    const TAU = Math.PI * 2;
    let s = 20001231;
    const rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const lin = (x0, y0, x1, y1, stops) => { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach(([a, k]) => g.addColorStop(a, k)); return g; };
    const rad = (x0, y0, r0, x1, y1, r1, stops) => { const g = c.createRadialGradient(x0, y0, r0, x1, y1, r1); stops.forEach(([a, k]) => g.addColorStop(a, k)); return g; };
    const U = Math.min(W, H * 1.6) / 1000;
    const glow = (x, y, r, rgb, a) => {
        c.fillStyle = rad(x, y, 0, x, y, r, [[0, `rgba(${rgb},${a})`], [.45, `rgba(${rgb},${a * .36})`], [1, `rgba(${rgb},0)`]]);
        c.fillRect(x - r, y - r, r * 2, r * 2);
    };
    const blurred = (radius, paint) => { c.save(); c.filter = `blur(${radius * U}px)`; paint(); c.restore(); };

    const cx = W * (portrait ? .6 : .7), cy = H * (portrait ? .34 : .47);
    const R = Math.min(W, H) * (portrait ? .42 : .44);

    c.fillStyle = '#040209';
    c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'lighter';

    // The aura: colour fields with no edges, deep violet with heat at one side.
    glow(cx, cy, Math.max(W, H) * .72, '74,28,214', .62);
    glow(cx + R * .7, cy - R * .9, R * 1.3, '220,50,210', .3);
    glow(cx - R * .95, cy + R * .9, R * 1.3, '30,70,255', .3);
    glow(cx, cy, R * .9, '150,110,255', .34);
    glow(W * .02, H * .02, W * .34, '60,30,170', .16);

    // A halo round the machine: a ring of holographic colour, thrown out of focus.
    const conic = c.createConicGradient(1.1, cx, cy);
    [[0, 'rgba(255,90,220,.9)'], [.2, 'rgba(120,120,255,.8)'], [.42, 'rgba(70,220,255,.7)'], [.6, 'rgba(160,110,255,.9)'], [.82, 'rgba(255,120,190,.75)'], [1, 'rgba(255,90,220,.9)']].forEach(([a, k]) => conic.addColorStop(a, k));
    blurred(26, () => { c.strokeStyle = conic; c.globalAlpha = .42; c.lineWidth = 34 * U; c.beginPath(); c.arc(cx, cy, R * .86, 0, TAU); c.stroke(); });
    blurred(7, () => { c.strokeStyle = conic; c.globalAlpha = .4; c.lineWidth = 6 * U; c.beginPath(); c.arc(cx, cy, R * .86, 0, TAU); c.stroke(); });
    blurred(.5, () => { c.strokeStyle = 'rgba(235,225,255,.55)'; c.lineWidth = 1.1 * U; c.beginPath(); c.arc(cx, cy, R * .86, 0, TAU); c.stroke(); });

    // Shards of violet glass flung out from it: far ones lost in the blur, near
    // ones with a lit edge.
    const shard = (angle, dist, size, blurAmount, alpha) => {
        const x = cx + Math.cos(angle) * dist, y = cy + Math.sin(angle) * dist;
        const twist = angle + (rnd() - .5) * 1.1;
        const a = size * (.45 + rnd() * .55), b = size * (.9 + rnd() * .9);
        const pts = [[-a, -b * .5], [a * .9, -b * .62], [a, b * .46], [-a * .7, b * .6]].map(([px, py]) => [x + px * Math.cos(twist) - py * Math.sin(twist), y + px * Math.sin(twist) + py * Math.cos(twist)]);
        blurred(blurAmount, () => {
            c.beginPath();
            pts.forEach(([px, py]) => c.lineTo(px, py));
            c.closePath();
            c.fillStyle = lin(pts[0][0], pts[0][1], pts[2][0], pts[2][1], [[0, `rgba(196,160,255,${alpha})`], [.45, `rgba(120,70,240,${alpha * .55})`], [1, `rgba(60,20,170,${alpha * .08})`]]);
            c.fill();
        });
        if (blurAmount < 1.6) {
            c.strokeStyle = `rgba(235,222,255,${alpha * .9})`;
            c.lineWidth = Math.max(.7, .9 * U);
            c.beginPath();
            c.moveTo(pts[0][0], pts[0][1]);
            c.lineTo(pts[1][0], pts[1][1]);
            c.stroke();
        }
    };
    for (let i = 0; i < 14; i++) shard(rnd() * TAU, R * (.7 + rnd() * .9), R * (.3 + rnd() * .34), 16, .22);
    for (let i = 0; i < 16; i++) shard(rnd() * TAU, R * (.55 + rnd() * .8), R * (.14 + rnd() * .24), 3.4, .3);
    for (let i = 0; i < 12; i++) shard(rnd() * TAU, R * (.42 + rnd() * .75), R * (.06 + rnd() * .16), .6, .42);

    // Long curves of light sweeping round it.
    const sweep = (r, from, to, width, rgb, alpha, squash = 1, tilt = 0) => {
        c.save();
        c.translate(cx, cy);
        c.rotate(tilt);
        c.scale(1, squash);
        c.lineCap = 'round';
        c.save();
        c.filter = `blur(${9 * U}px)`;
        c.strokeStyle = `rgba(${rgb},${alpha * .75})`;
        c.lineWidth = width * 5;
        c.beginPath(); c.arc(0, 0, r, from, to); c.stroke();
        c.restore();
        c.strokeStyle = `rgba(245,240,255,${alpha})`;
        c.lineWidth = width;
        c.beginPath(); c.arc(0, 0, r, from, to); c.stroke();
        c.restore();
    };
    sweep(R * 1.02, .4, 2.4, 1.6 * U, '170,130,255', .85);
    sweep(R * 1.32, 3.5, 5.0, 1 * U, '120,160,255', .55, .62, .3);
    sweep(R * .7, -1.2, .5, .9 * U, '255,150,230', .55, .4, -.42);
    sweep(R * 1.6, 2.1, 3.2, 1 * U, '150,120,255', .4, .8, -.2);

    // The beam and the machine lie along one axis, tipped over.
    c.save();
    c.translate(cx, cy);
    c.rotate(.27);
    const up = Math.max(W, H) * 1.1;
    const beam = (y0, y1, width, blurAmount, stops) => blurred(blurAmount, () => {
        c.fillStyle = lin(0, y0, 0, y1, stops);
        c.fillRect(-width / 2, Math.min(y0, y1), width, Math.abs(y1 - y0));
    });
    const fall = (rgb, a) => [[0, `rgba(${rgb},${a})`], [1, `rgba(${rgb},${a * .55})`]];
    const tail = (rgb, a) => [[0, `rgba(${rgb},${a})`], [.6, `rgba(${rgb},${a * .28})`], [1, `rgba(${rgb},0)`]];
    beam(-up, -R * .42, 150 * U, 54, fall('255,50,60', .26));
    beam(-up, -R * .42, 62 * U, 20, fall('255,76,50', .55));
    beam(-up, -R * .42, 26 * U, 6, fall('255,120,70', .9));
    beam(-up, -R * .42, 8 * U, 1.5, fall('255,240,225', 1));
    beam(R * .45, R * 1.5, 84 * U, 24, tail('255,60,120', .42));
    beam(R * .45, R * 1.5, 18 * U, 4, tail('255,120,110', .85));
    beam(R * .45, R * 1.2, 4 * U, 1, tail('255,235,225', .9));
    glow(0, -R * .46, R * .62, '255,110,70', .55);
    glow(0, R * .46, R * .34, '255,80,150', .4);

    // The machine. Everything on it is a mirror of the violet around it.
    c.globalCompositeOperation = 'source-over';
    const chrome = (x0, x1) => lin(x0, 0, x1, 0, [[0, '#0a0814'], [.14, '#4a4f86'], [.3, '#eef2ff'], [.4, '#8e97d2'], [.54, '#161330'], [.74, '#2b2858'], [.86, '#c4cdf5'], [1, '#14112a']]);
    const cylinder = (x, y0, y1, r) => {
        c.fillStyle = chrome(x - r, x + r);
        c.fillRect(x - r, y0, r * 2, y1 - y0);
        c.beginPath(); c.ellipse(x, y1, r, r * .3, 0, 0, Math.PI); c.fill();
        c.fillStyle = lin(x - r, 0, x + r, 0, [[0, '#2a2750'], [.5, '#b7c0ee'], [1, '#2a2750']]);
        c.beginPath(); c.ellipse(x, y0, r, r * .3, 0, 0, TAU); c.fill();
    };
    const plate = (y, rx, ry, depth) => {
        c.fillStyle = lin(-rx, 0, rx, 0, [[0, '#080613'], [.3, '#2f2b5e'], [.48, '#7b80bf'], [.7, '#1a1736'], [1, '#07050f']]);
        c.fillRect(-rx, y, rx * 2, depth);
        c.beginPath(); c.ellipse(0, y + depth, rx, ry, 0, 0, Math.PI); c.fill();
        c.fillStyle = rad(-rx * .3, y - ry * .4, rx * .1, 0, y, rx, [[0, '#6c6aa8'], [.5, '#231f48'], [1, '#0b0918']]);
        c.beginPath(); c.ellipse(0, y, rx, ry, 0, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(225,215,255,.75)';
        c.lineWidth = Math.max(.8, 1.1 * U);
        c.beginPath(); c.ellipse(0, y, rx, ry, 0, Math.PI, TAU); c.stroke();
    };
    const span = R * .46;
    // The struts behind the column, then the column, then the struts in front.
    for (const x of [-.27, .27]) cylinder(R * x, -span, span, R * .022);
    plate(-span - R * .04, R * .37, R * .1, R * .05);
    cylinder(0, -span * .92, span * .92, R * .135);
    for (const [y, h] of [[-.72, .08], [-.42, .03], [-.1, .1], [.2, .03], [.42, .09], [.7, .05]]) {
        c.fillStyle = 'rgba(6,4,14,.9)';
        c.fillRect(-R * .135, span * y, R * .27, span * h);
        c.fillStyle = 'rgba(210,205,255,.4)';
        c.fillRect(-R * .135, span * y, R * .27, Math.max(.8, 1 * U));
    }
    c.globalCompositeOperation = 'lighter';
    for (const y of [-.28, .1, .6]) {
        glow(0, span * y, R * .2, '255,110,70', .85);
        c.fillStyle = 'rgba(255,225,205,.95)';
        c.beginPath(); c.ellipse(0, span * y, R * .128, R * .02, 0, 0, TAU); c.fill();
    }
    c.globalCompositeOperation = 'source-over';
    for (const x of [-.18, .18]) cylinder(R * x, -span * 1.02, span * 1.02, R * .034);
    plate(span, R * .34, R * .085, R * .06);
    for (const [x, r] of [[-.34, .012], [.34, .012]]) cylinder(R * x, -span * .7, span * .7, R * r);
    c.restore();

    // A last bloom over it all, as if the lens could not quite hold it.
    c.globalCompositeOperation = 'lighter';
    glow(cx, cy, R * .62, '150,100,255', .22);

    // The ghost in it: an eye in hard dither, floating in the dark in a thin window.
    {
        const ew = W * (portrait ? .62 : .24), eh = ew * .5;
        const ex = W * (portrait ? .62 : .862), ey = H * (portrait ? .75 : .8);
        const cell = Math.max(2, Math.round(1.7 * U));
        const cols = Math.floor(ew / cell), rows = Math.floor(eh / cell);
        const eye = document.createElement('canvas');
        eye.width = cols; eye.height = rows;
        const e = eye.getContext('2d');
        const image = e.createImageData(cols, rows);
        const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
        for (let j = 0; j < rows; j++) {
            for (let i = 0; i < cols; i++) {
                const u = (i / cols - .5) * 2, v = (j / rows - .5) * 2;
                const lid = (1 - u * u) * .78;
                const inEye = Math.abs(v) < lid;
                const d = Math.hypot(u * 1.9, v * 1.05);
                let tone = 0;
                if (inEye) {
                    tone = .86 - Math.abs(u) * .34 - Math.max(0, -v) * .42;
                    if (d < .62) tone = .22 + .5 * Math.max(0, Math.sin(Math.atan2(v, u) * 22 + d * 8)) * (d / .62) ;
                    if (d < .28) tone = 0;
                    if (Math.hypot(u * 1.9 - .15, v * 1.05 + .17) < .1) tone = 1;
                } else {
                    const edge = Math.abs(v) - lid;
                    tone = Math.max(0, .34 - edge * 1.5) * (1 - Math.abs(u) * .7);
                }
                const fade = Math.max(0, 1 - Math.pow(Math.hypot(u, v * .9), 3));
                const on = tone * fade * 15.99 > bayer[(j % 4) * 4 + (i % 4)];
                const at = (j * cols + i) * 4;
                image.data[at] = 212; image.data[at + 1] = 196; image.data[at + 2] = 255;
                image.data[at + 3] = on ? 255 : 0;
            }
        }
        e.putImageData(image, 0, 0);
        c.imageSmoothingEnabled = false;
        const x0 = ex - cols * cell / 2, y0 = ey - rows * cell / 2;
        c.globalCompositeOperation = 'source-over';
        c.fillStyle = 'rgba(5,2,14,.82)';
        c.fillRect(x0 - 14 * U, y0 - 30 * U, cols * cell + 28 * U, rows * cell + 52 * U);
        c.globalCompositeOperation = 'lighter';
        blurred(7, () => { c.globalAlpha = .4; c.drawImage(eye, x0, y0, cols * cell, rows * cell); });
        c.globalAlpha = .9;
        c.drawImage(eye, x0, y0, cols * cell, rows * cell);
        c.globalAlpha = 1;
        c.imageSmoothingEnabled = true;
        // Its window, in hairlines.
        c.globalCompositeOperation = 'source-over';
        const fx = x0 - 14 * U, fy = y0 - 30 * U, fw = cols * cell + 28 * U, fh = rows * cell + 52 * U;
        c.strokeStyle = 'rgba(205,190,255,.42)';
        c.lineWidth = Math.max(.8, .9 * U);
        c.strokeRect(fx, fy, fw, fh);
        c.fillStyle = lin(fx, 0, fx + fw, 0, [[0, 'rgba(70,40,190,.85)'], [1, 'rgba(160,110,255,.2)']]);
        c.fillRect(fx, fy, fw, 18 * U);
        c.font = `700 ${11 * U}px "Barlow Condensed", sans-serif`;
        c.fillStyle = 'rgba(240,235,255,.92)';
        c.textBaseline = 'middle';
        c.fillText('GHOST_IN_THE_ARM.EXE', fx + 7 * U, fy + 9.5 * U);
        c.textAlign = 'right';
        c.fillText('×', fx + fw - 7 * U, fy + 9 * U);
        c.textAlign = 'left';
        c.globalCompositeOperation = 'lighter';
    }

    // A player's readout, lit from inside.
    {
        const px = W * (portrait ? .36 : .775), py = H * (portrait ? .085 : .115), pw = W * (portrait ? .56 : .185), ph = pw * .34;
        c.globalCompositeOperation = 'source-over';
        c.fillStyle = 'rgba(8,4,20,.58)';
        c.fillRect(px, py, pw, ph);
        c.strokeStyle = 'rgba(205,190,255,.34)';
        c.lineWidth = Math.max(.8, .9 * U);
        c.strokeRect(px, py, pw, ph);
        c.globalCompositeOperation = 'lighter';
        c.font = `600 ${ph * .13}px "Barlow Condensed", sans-serif`;
        c.fillStyle = 'rgba(215,200,255,.8)';
        c.textBaseline = 'top';
        c.fillText('SWERVE.WSZ  -  ROBOT  -  192 KBPS', px + ph * .1, py + ph * .08);
        c.font = `700 ${ph * .3}px "Barlow Condensed", sans-serif`;
        blurred(4, () => { c.fillStyle = 'rgba(190,140,255,.9)'; c.fillText('00:06', px + ph * .1, py + ph * .3); });
        c.fillStyle = 'rgba(240,230,255,.95)';
        c.fillText('00:06', px + ph * .1, py + ph * .3);
        const bars = 18, bx = px + pw * .36, room = pw * .58, bh = ph * .4, by = py + ph * .68;
        const r2 = () => rnd();
        const levels = Array.from({ length: bars }, () => .2 + r2() * .8);
        const drawBars = () => levels.forEach((level, i) => {
            c.fillStyle = lin(0, by - bh, 0, by, [[0, 'rgba(255,170,220,.95)'], [1, 'rgba(120,90,255,.95)']]);
            c.fillRect(bx + i * room / bars, by - bh * level, room / bars * .62, bh * level);
        });
        blurred(5, drawBars);
        drawBars();
        c.strokeStyle = 'rgba(205,180,255,.7)';
        c.lineWidth = Math.max(.8, 1 * U);
        c.beginPath();
        for (let x = 0; x <= pw - ph * .2; x += 3 * U) c.lineTo(px + ph * .1 + x, py + ph * .84 + Math.sin(x / (9 * U)) * Math.sin(x / (46 * U)) * ph * .07);
        c.stroke();
    }

    // Glitch: hard white fragments off the edge, burning a little.
    {
        const gx = W * (portrait ? .72 : .86), gy = H * (portrait ? .53 : .34), g = 1 * U;
        const frags = () => {
            c.fillStyle = 'rgba(255,255,255,.95)';
            [[0, 0, 150, 22], [52, -14, 40, 14], [92, 22, 104, 10], [-34, 8, 22, 4], [24, 42, 66, 3], [150, -8, 90, 12]].forEach(([x, y, w, h]) => c.fillRect(gx + x * g, gy + y * g, w * g, h * g));
        };
        blurred(12, () => { c.globalAlpha = .55; frags(); });
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = .88;
        frags();
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'lighter';
    }

    // Stars of the period: four thin points and a soft heart.
    const star = (x, y, r, alpha) => {
        glow(x, y, r * .7, '190,160,255', alpha * .8);
        c.fillStyle = `rgba(255,250,255,${alpha})`;
        for (const a of [0, Math.PI / 2]) {
            c.save();
            c.translate(x, y);
            c.rotate(a);
            c.beginPath();
            c.moveTo(-r, 0);
            c.quadraticCurveTo(0, -r * .03, r, 0);
            c.quadraticCurveTo(0, r * .03, -r, 0);
            c.fill();
            c.restore();
        }
    };
    for (let i = 0; i < 40; i++) {
        c.fillStyle = `rgba(225,215,255,${.25 + rnd() * .55})`;
        const x = rnd() * W, y = rnd() * H, r = (.5 + rnd() * rnd() * 1.4) * U;
        c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    }
    for (const [x, y, r, a] of [[.55, .17, 42, .9], [.93, .5, 30, .8], [.62, .86, 24, .7], [.42, .08, 16, .6], [.97, .9, 18, .6]]) star(W * (portrait ? x * .95 : x), H * y, r * U, a);

    // What the machine is saying, in very small type.
    c.globalCompositeOperation = 'source-over';
    c.font = `600 ${11.5 * U}px "Barlow Condensed", sans-serif`;
    c.fillStyle = 'rgba(205,190,255,.62)';
    c.textBaseline = 'alphabetic';
    const capX = W * (portrait ? .08 : .66), capY = H * (portrait ? .955 : .955);
    c.fillText('>> HOMING AXES - [//-X.INTELLIGENT SYSTEM_  > COLLISIONS DETECTED.', capX, capY);
    c.fillText('>> REACHING EXCITED STATE - RESULT: BUILD AGAIN', capX, capY + 15 * U);
    c.font = `600 ${64 * U}px "Barlow Condensed", sans-serif`;
    c.fillStyle = 'rgba(200,180,255,.05)';
    c.fillText('AMPLIFICATION OF MOTION', W * (portrait ? .04 : .5), H * (portrait ? .62 : .68));

    // The left of a wide picture goes quiet, for the page's words; on a tall one
    // the whole of it comes down a little.
    if (portrait) {
        c.fillStyle = 'rgba(4,2,9,.34)';
        c.fillRect(0, 0, W, H);
    } else {
        c.fillStyle = lin(0, 0, W * .62, 0, [[0, 'rgba(4,2,9,.86)'], [.55, 'rgba(4,2,9,.52)'], [1, 'rgba(4,2,9,0)']]);
        c.fillRect(0, 0, W, H);
    }
    // A vignette, and a breath of noise so the long dark gradients do not band.
    c.fillStyle = rad(W * .6, H * .5, Math.min(W, H) * .4, W * .6, H * .5, Math.max(W, H) * .78, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.6)']]);
    c.fillRect(0, 0, W, H);
    const noise = c.getImageData(0, 0, W, H), d = noise.data;
    for (let i = 0; i < d.length; i += 4) {
        const n = (rnd() - .5) * 3.2;
        d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    c.putImageData(noise, 0, 0);
    return canvas.toDataURL('image/webp', .84);
};
