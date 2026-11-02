/* The Frutiger Aero sky: High FX's hidden second backdrop.

   Five quick presses on the effects slider's High stop swap the space sky for
   a bright glass-and-water daydream of the mid-2000s, and five more move on to
   its dark twin in ego.js (the slider code in portfolio.js). This file holds all of it, and it
   is not fetched until someone asks: a visitor who never does downloads none
   of it, parses none of it and allocates nothing for it, at any level. Going
   back to the space sky, or down to Medium or Low, hands everything here back
   (release, below), down to the canvas.

   It is a picture of this portfolio as much as of the era. A glass orb holds
   a New York skyline, a robot arm on the hill blows the bubbles through a wand,
   the bubbles carry the things on these pages -- gears, a swerve module, a 3D
   printer, a robot, a controller board -- a three-wheeled kiwi drive potters
   about on the grass, and the contrail across the sky belongs to a drone.

   Everything is drawn here, in code, in two steps. Getting ready paints the
   slow things once into sprites: the clouds come from a worker, so the sky
   already on screen keeps moving while they are worked out. After that a frame
   is only sprites being moved, about fifty drawImage calls and no paths but the
   contrail, so it costs little beyond the pixels themselves. The glass in
   front of it is the page's own and is not touched: it frosts and bends this
   the way it frosts and bends the stars. */
(function () {
    'use strict';

    const TAU = Math.PI * 2;
    const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
    const mix = (a, b, t) => a + (b - a) * t;
    const seeded = seed => {
        let s = seed >>> 0;
        return () => {
            s = (s + 0x6D2B79F5) | 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };
    const blank = (width, height) => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(width));
        canvas.height = Math.max(1, Math.ceil(height));
        return canvas;
    };
    const breathe = () => new Promise(resolve => setTimeout(resolve));
    const linear = (context, x0, y0, x1, y1, stops) => {
        const gradient = context.createLinearGradient(x0, y0, x1, y1);
        stops.forEach(([at, color]) => gradient.addColorStop(at, color));
        return gradient;
    };
    const radial = (context, x0, y0, r0, x1, y1, r1, stops) => {
        const gradient = context.createRadialGradient(x0, y0, r0, x1, y1, r1);
        stops.forEach(([at, color]) => gradient.addColorStop(at, color));
        return gradient;
    };

    /* ---- Clouds -----------------------------------------------------------
       A cumulus is a flat-bottomed heap of round puffs with a torn edge, lit
       from one side. So: a field of soft puffs, warped and eaten into by
       fractal noise, cut flat along the foot, and then for each pixel a short
       march toward the sun through that same field -- how much cloud lies
       between it and the light decides how white it is. Self-contained, as it
       is also sent to a worker as text. */
    function cloudPixels(seed, width, height, lightX, lightY) {
        let s = seed >>> 0;
        const random = () => {
            s = (s + 0x6D2B79F5) | 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        const SIZE = 256, MASK = SIZE - 1;
        const lattice = new Float32Array(SIZE * SIZE);
        for (let i = 0; i < lattice.length; i++) lattice[i] = random();
        const noise = (x, y) => {
            const xi = Math.floor(x), yi = Math.floor(y);
            const fx = x - xi, fy = y - yi;
            const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
            const x0 = xi & MASK, x1 = (xi + 1) & MASK;
            const y0 = (yi & MASK) * SIZE, y1 = ((yi + 1) & MASK) * SIZE;
            const a = lattice[y0 + x0], b = lattice[y0 + x1], c = lattice[y1 + x0], d = lattice[y1 + x1];
            return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
        };
        const fractal = (x, y, octaves) => {
            let sum = 0, amplitude = .5, total = 0;
            for (let o = 0; o < octaves; o++) {
                sum += amplitude * noise(x, y);
                total += amplitude;
                amplitude *= .56;
                x = x * 2.03 + 17.1;
                y = y * 2.03 + 9.2;
            }
            return sum / total;
        };
        const puffs = [];
        const count = 11 + Math.floor(random() * 7);
        const foot = height * .76;
        for (let i = 0; i < count; i++) {
            const across = (i + .15 + random() * .7) / count;
            const crown = Math.pow(Math.sin(across * Math.PI), .75);
            const radius = width * (.05 + .09 * crown * (.55 + random() * .7));
            puffs.push({
                x: width * (.1 + .8 * across),
                y: foot - radius * (.2 + .85 * random()) - crown * height * .2 * random(),
                r: radius
            });
        }
        const density = new Float32Array(width * height);
        const warpScale = 5 / width, detailScale = 16 / width, warpReach = width * .075;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const wx = x + (fractal(x * warpScale, y * warpScale, 3) - .5) * warpReach;
                const wy = y + (fractal(x * warpScale + 40, y * warpScale + 21, 3) - .5) * warpReach;
                let field = 0;
                for (let p = 0; p < puffs.length; p++) {
                    const puff = puffs[p];
                    const dx = wx - puff.x, dy = (wy - puff.y) * 1.14;
                    const q = 1 - (dx * dx + dy * dy) / (puff.r * puff.r);
                    if (q > 0) field += q * q;
                }
                if (field <= .002) continue;
                const detail = fractal(x * detailScale, y * detailScale, 5) - .47;
                // The foot is flat only from a distance: up close it frays.
                const fray = (fractal(x * warpScale * 2.4, 3.3, 4) - .5) * height * .2;
                const under = clamp01((foot + fray - y) / (height * .17));
                density[y * width + x] = (field + detail * .85 * clamp01(field * 2.6)) * under * under * (3 - 2 * under);
            }
        }
        function clamp01(value) { return value < 0 ? 0 : value > 1 ? 1 : value; }
        const pixels = new Uint8ClampedArray(width * height * 4);
        const step = width * .011;
        const px = lightX * step, py = lightY * step;
        const at_ = (x, y) => {
            const sx = Math.round(x), sy = Math.round(y);
            if (sx < 0 || sy < 0 || sx >= width || sy >= height) return 0;
            const value = density[sy * width + sx];
            return value > 1 ? 1 : value;
        };
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const here = density[y * width + x];
                if (here <= .1) continue;
                // How much cloud lies toward the sun decides the broad shade;
                // the step just beside this pixel picks out each lump of it.
                let depth = 0;
                for (let k = 1; k <= 6; k++) depth += at_(x + px * k, y + py * k);
                const relief = (Math.min(here, 1) - at_(x + px * 1.2, y + py * 1.2)) * .75;
                const belly = clamp01((y - foot * .62) / (foot * .38));
                const lit = clamp01(Math.exp(-depth * .19) * 1.08 + .24 + relief - belly * .34);
                const at = (y * width + x) * 4;
                pixels[at] = 158 + 97 * lit;
                pixels[at + 1] = 188 + 67 * lit;
                pixels[at + 2] = 226 + 29 * lit;
                const edge = clamp01((here - .1) / .3);
                pixels[at + 3] = 255 * edge * edge * (3 - 2 * edge);
            }
        }
        return pixels;
    }

    const CLOUD_WORKER = `self.onmessage = event => {
        const { id, seed, width, height, lightX, lightY } = event.data;
        const pixels = (${cloudPixels})(seed, width, height, lightX, lightY);
        self.postMessage({ id, pixels }, [pixels.buffer]);
    };`;

    // Every cloud at once, off the page's thread where a worker can be had. A
    // browser that refuses one gets them here, a breath between each.
    const makeClouds = async orders => {
        const toCanvas = (order, pixels) => {
            const canvas = blank(order.width, order.height);
            canvas.getContext('2d').putImageData(new ImageData(pixels, order.width, order.height), 0, 0);
            return canvas;
        };
        let worker = null, url = '';
        try {
            url = URL.createObjectURL(new Blob([CLOUD_WORKER], { type: 'text/javascript' }));
            worker = new Worker(url);
        } catch (error) {
            worker = null;
        }
        const results = [];
        if (worker) {
            try {
                await new Promise((resolve, reject) => {
                    let left = orders.length;
                    worker.onerror = reject;
                    worker.onmessage = event => {
                        results[event.data.id] = toCanvas(orders[event.data.id], event.data.pixels);
                        if (--left === 0) resolve();
                    };
                    orders.forEach((order, id) => worker.postMessage({ id, ...order }));
                });
            } catch (error) {
                results.length = 0;
            }
            worker.terminate();
        }
        if (url) URL.revokeObjectURL(url);
        for (let id = 0; id < orders.length; id++) {
            if (results[id]) continue;
            const order = orders[id];
            await breathe();
            results[id] = toCanvas(order, cloudPixels(order.seed, order.width, order.height, order.lightX, order.lightY));
        }
        return results;
    };

    /* ---- Sprites ----------------------------------------------------------
       A sprite is painted once in CSS pixels around an anchor, at the scene's
       own resolution, and from then on only moved. */
    let scale = 1;
    const sprite = (width, height, anchorX, anchorY, paint) => {
        const canvas = blank(width * scale, height * scale);
        const context = canvas.getContext('2d');
        context.scale(scale, scale);
        context.translate(anchorX, anchorY);
        paint(context);
        return { canvas, width, height, anchorX, anchorY };
    };

    // Round-ended, tapering, lit from above: the white plastic of everything
    // Aero ever imagined a robot being made of.
    const shellPath = (c, length, r0, r1) => {
        c.beginPath();
        c.arc(0, 0, r0, Math.PI / 2, -Math.PI / 2);
        c.lineTo(length, -r1);
        c.arc(length, 0, r1, -Math.PI / 2, Math.PI / 2);
        c.closePath();
    };
    const armLink = (length, r0, r1) => {
        const reach = Math.max(r0, r1) + 3;
        return sprite(length + r0 + r1 + 6, reach * 2, r0 + 3, reach, c => {
            shellPath(c, length, r0, r1);
            c.fillStyle = linear(c, 0, -reach, 0, reach, [[0, '#ffffff'], [.32, '#f4f9ff'], [.62, '#cfe1f3'], [.86, '#8fb1d2'], [1, '#6f94ba']]);
            c.fill();
            c.save();
            shellPath(c, length, r0, r1);
            c.clip();
            // A bright streak along the top and a band of aqua trim.
            c.fillStyle = linear(c, 0, -reach, 0, -reach * .2, [[0, 'rgba(255,255,255,.95)'], [1, 'rgba(255,255,255,0)']]);
            c.fillRect(-r0, -reach, length + r0 + r1, reach * .8);
            c.fillStyle = linear(c, 0, -reach, 0, reach, [[0, '#7fe4ff'], [.5, '#17a9e8'], [1, '#0a6db8']]);
            c.fillRect(length * .42, -reach, length * .1, reach * 2);
            c.fillStyle = 'rgba(255,255,255,.45)';
            c.fillRect(length * .42, -reach, length * .1, reach * .55);
            c.restore();
            c.strokeStyle = 'rgba(70,110,150,.38)';
            c.lineWidth = .8;
            shellPath(c, length, r0, r1);
            c.stroke();
        });
    };
    const joint = radius => sprite(radius * 2 + 4, radius * 2 + 4, radius + 2, radius + 2, c => {
        c.fillStyle = radial(c, -radius * .3, -radius * .4, radius * .1, 0, 0, radius, [[0, '#ffffff'], [.55, '#d8e8f7'], [1, '#7f9fc0']]);
        c.beginPath();
        c.arc(0, 0, radius, 0, TAU);
        c.fill();
        c.fillStyle = radial(c, -radius * .15, -radius * .2, 0, 0, 0, radius * .58, [[0, '#c9f6ff'], [.45, '#2fc0f2'], [1, '#07619f']]);
        c.beginPath();
        c.arc(0, 0, radius * .58, 0, TAU);
        c.fill();
        c.fillStyle = 'rgba(255,255,255,.8)';
        c.beginPath();
        c.ellipse(-radius * .18, -radius * .24, radius * .22, radius * .12, -.5, 0, TAU);
        c.fill();
    });
    const armBase = size => sprite(size * 2.4, size * 1.5, size * 1.2, size * 1.2, c => {
        c.fillStyle = radial(c, 0, size * .12, size * .1, 0, size * .12, size * 1.15, [[0, 'rgba(10,50,20,.5)'], [1, 'rgba(10,50,20,0)']]);
        c.beginPath();
        c.ellipse(0, size * .12, size * 1.15, size * .2, 0, 0, TAU);
        c.fill();
        c.fillStyle = linear(c, -size, 0, size, 0, [[0, '#9db8d3'], [.3, '#ffffff'], [.7, '#dbe9f6'], [1, '#7f9fc0']]);
        c.beginPath();
        c.moveTo(-size, size * .1);
        c.quadraticCurveTo(-size * .9, -size * .32, -size * .52, -size * .5);
        c.lineTo(size * .52, -size * .5);
        c.quadraticCurveTo(size * .9, -size * .32, size, size * .1);
        c.quadraticCurveTo(0, size * .3, -size, size * .1);
        c.fill();
        c.fillStyle = linear(c, -size, 0, size, 0, [[0, '#0a6db8'], [.35, '#6fe0ff'], [1, '#0a6db8']]);
        c.fillRect(-size * .74, -size * .16, size * 1.48, size * .09);
    });
    // The wand the arm holds: a ring on a stalk, with soap across it.
    const wand = radius => sprite(radius * 3.4 + 6, radius * 2.4 + 6, radius * .6 + 3, radius * 1.2 + 3, c => {
        c.strokeStyle = linear(c, 0, -radius, 0, radius, [[0, '#ffffff'], [.5, '#8ec9ee'], [1, '#4b86b8']]);
        c.lineWidth = radius * .2;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(radius * .95, 0);
        c.stroke();
        const cx = radius * 1.75;
        c.fillStyle = radial(c, cx - radius * .25, -radius * .3, 0, cx, 0, radius, [[0, 'rgba(255,255,255,.3)'], [.6, 'rgba(170,235,255,.16)'], [1, 'rgba(255,190,240,.32)']]);
        c.beginPath();
        c.arc(cx, 0, radius * .92, 0, TAU);
        c.fill();
        c.strokeStyle = linear(c, cx - radius, -radius, cx + radius, radius, [[0, '#ffffff'], [.5, '#39c1f4'], [1, '#0b6cb5']]);
        c.lineWidth = radius * .17;
        c.beginPath();
        c.arc(cx, 0, radius, 0, TAU);
        c.stroke();
    });

    // A three-wheeled kiwi drive, about the size of a shoe box and proud of it.
    const kiwiBot = size => sprite(size * 2.6, size * 1.9, size * 1.3, size * 1.45, c => {
        c.fillStyle = radial(c, 0, size * .32, 0, 0, size * .32, size * 1.2, [[0, 'rgba(8,48,14,.6)'], [1, 'rgba(8,48,14,0)']]);
        c.beginPath();
        c.ellipse(0, size * .32, size * 1.2, size * .22, 0, 0, TAU);
        c.fill();
        const wheel = (x, y, r) => {
            c.fillStyle = radial(c, x - r * .25, y - r * .3, r * .1, x, y, r, [[0, '#3f566e'], [.72, '#1b2a3a'], [1, '#0a1420']]);
            c.beginPath();
            c.ellipse(x, y, r * .78, r, 0, 0, TAU);
            c.fill();
            c.fillStyle = radial(c, x - r * .1, y - r * .15, 0, x, y, r * .42, [[0, '#e9fbff'], [.6, '#2bc3f4'], [1, '#0a6db8']]);
            c.beginPath();
            c.ellipse(x, y, r * .32, r * .42, 0, 0, TAU);
            c.fill();
        };
        wheel(0, size * .04, size * .26);
        wheel(-size * .78, size * .12, size * .32);
        wheel(size * .78, size * .12, size * .32);
        c.fillStyle = linear(c, 0, -size * .5, 0, size * .3, [[0, '#ffffff'], [.5, '#e4f0fb'], [1, '#88aacb']]);
        c.beginPath();
        c.ellipse(0, -size * .1, size * 1.02, size * .42, 0, 0, TAU);
        c.fill();
        c.fillStyle = linear(c, -size, 0, size, 0, [[0, '#0a6db8'], [.5, '#6fe7ff'], [1, '#0a6db8']]);
        c.beginPath();
        c.ellipse(0, -size * .04, size * 1.02, size * .36, 0, 0, Math.PI);
        c.ellipse(0, -size * .1, size * 1.02, size * .36, 0, Math.PI, 0, true);
        c.fill();
        // A dome of tinted glass, and two eyes behind it.
        c.fillStyle = radial(c, -size * .2, -size * .75, size * .05, 0, -size * .45, size * .68, [[0, '#d9f7ff'], [.4, '#45b9ec'], [1, '#07386e']]);
        c.beginPath();
        c.ellipse(0, -size * .34, size * .62, size * .48, 0, Math.PI, 0);
        c.closePath();
        c.fill();
        c.fillStyle = '#d6ffff';
        c.shadowColor = '#7ff3ff';
        c.shadowBlur = size * .22;
        for (const side of [-1, 1]) {
            c.beginPath();
            c.ellipse(side * size * .2, -size * .47, size * .075, size * .11, 0, 0, TAU);
            c.fill();
        }
        c.shadowBlur = 0;
        c.fillStyle = 'rgba(255,255,255,.72)';
        c.beginPath();
        c.ellipse(-size * .26, -size * .66, size * .2, size * .07, -.45, 0, TAU);
        c.fill();
    });

    const droneBody = size => sprite(size * 3, size * 1.6, size * 1.5, size * .8, c => {
        c.strokeStyle = linear(c, 0, -size * .3, 0, size * .3, [[0, '#ffffff'], [1, '#8fb1d2']]);
        c.lineWidth = size * .1;
        c.lineCap = 'round';
        for (const [x, y] of [[-1.1, -.36], [1.1, -.36], [-1.1, .34], [1.1, .34]]) {
            c.beginPath();
            c.moveTo(0, 0);
            c.lineTo(x * size, y * size);
            c.stroke();
            c.fillStyle = 'rgba(255,255,255,.34)';
            c.beginPath();
            c.ellipse(x * size, y * size - size * .05, size * .42, size * .08, 0, 0, TAU);
            c.fill();
            c.fillStyle = '#17a9e8';
            c.beginPath();
            c.arc(x * size, y * size, size * .07, 0, TAU);
            c.fill();
        }
        c.fillStyle = linear(c, 0, -size * .3, 0, size * .3, [[0, '#ffffff'], [.5, '#e4f0fb'], [1, '#7f9fc0']]);
        c.beginPath();
        c.ellipse(0, 0, size * .46, size * .25, 0, 0, TAU);
        c.fill();
        c.fillStyle = radial(c, size * .1, -size * .03, 0, size * .13, 0, size * .15, [[0, '#d9fbff'], [.5, '#17a9e8'], [1, '#07386e']]);
        c.beginPath();
        c.arc(size * .13, 0, size * .13, 0, TAU);
        c.fill();
    });

    /* ---- What the bubbles carry -------------------------------------------- */
    const toothedGear = (c, radius, teeth, hole, fill) => {
        c.beginPath();
        for (let i = 0; i < teeth; i++) {
            const a = i / teeth * TAU, w = TAU / teeth;
            const steps = [[a, .8], [a + w * .14, 1], [a + w * .4, 1], [a + w * .54, .8]];
            for (const [angle, reach] of steps) c.lineTo(Math.cos(angle) * radius * reach, Math.sin(angle) * radius * reach);
            c.arc(0, 0, radius * .8, a + w * .54, a + w, false);
        }
        c.closePath();
        c.moveTo(radius * hole, 0);
        c.arc(0, 0, radius * hole, 0, TAU, true);
        c.fillStyle = fill;
        c.fill('evenodd');
    };
    const steel = (c, r) => linear(c, -r, -r, r, r, [[0, '#ffffff'], [.35, '#c5d9ec'], [.55, '#8fb2d3'], [.8, '#dfeaf5'], [1, '#6f94ba']]);
    const rounded = (c, x, y, width, height, radius) => {
        c.beginPath();
        if (c.roundRect) c.roundRect(x, y, width, height, radius);
        else c.rect(x, y, width, height);
    };
    const ICONS = {
        gear: c => {
            toothedGear(c, 60, 12, .32, steel(c, 60));
            c.strokeStyle = 'rgba(255,255,255,.75)';
            c.lineWidth = 2;
            c.beginPath();
            c.arc(0, 0, 40, -2.6, -.9);
            c.stroke();
            c.fillStyle = radial(c, -6, -8, 1, 0, 0, 18, [[0, '#c9f6ff'], [.5, '#2fc0f2'], [1, '#07619f']]);
            c.beginPath();
            c.arc(0, 0, 13, 0, TAU);
            c.fill();
        },
        gears: c => {
            c.save();
            c.translate(-22, 16);
            toothedGear(c, 42, 12, .3, linear(c, -42, -42, 42, 42, [[0, '#bff0ff'], [.5, '#22a9e6'], [1, '#07619f']]));
            c.restore();
            c.save();
            c.translate(32, -26);
            c.rotate(.14);
            toothedGear(c, 30, 9, .3, steel(c, 30));
            c.restore();
        },
        // A swerve module from the side: wheel below, plates around it, the
        // two motors standing on top.
        swerve: c => {
            c.fillStyle = linear(c, -8, 0, 8, 0, [[0, '#9fbbd6'], [.4, '#ffffff'], [1, '#7f9fc0']]);
            c.fillRect(-34, -62, 22, 44);
            c.fillStyle = linear(c, 12, 0, 34, 0, [[0, '#0f73c4'], [.4, '#58d2f8'], [1, '#07518e']]);
            c.fillRect(12, -62, 22, 44);
            c.fillStyle = linear(c, 0, -22, 0, -10, [[0, '#ffffff'], [1, '#a4bfd8']]);
            c.fillRect(-46, -20, 92, 10);
            c.fillStyle = 'rgba(190,212,233,.92)';
            c.fillRect(-42, -12, 8, 44);
            c.fillRect(34, -12, 8, 44);
            c.fillStyle = radial(c, -7, 14, 6, 0, 22, 38, [[0, '#4d6680'], [.7, '#223344'], [1, '#0a1420']]);
            c.beginPath();
            c.arc(0, 22, 36, 0, TAU);
            c.fill();
            c.save();
            c.translate(0, 22);
            toothedGear(c, 21, 10, .3, steel(c, 21));
            c.restore();
            c.fillStyle = '#17a9e8';
            c.beginPath();
            c.arc(0, 22, 5, 0, TAU);
            c.fill();
        },
        // A printer in its frame, a part half built on the bed.
        printer: c => {
            c.strokeStyle = linear(c, -50, -50, 50, 50, [[0, '#ffffff'], [1, '#6f94ba']]);
            c.lineWidth = 7;
            c.lineJoin = 'round';
            c.strokeRect(-42, -48, 84, 96);
            c.fillStyle = 'rgba(205,235,255,.22)';
            c.fillRect(-42, -48, 84, 96);
            c.fillStyle = linear(c, 0, -22, 0, -12, [[0, '#ffffff'], [1, '#9db8d3']]);
            c.fillRect(-42, -24, 84, 8);
            c.fillStyle = linear(c, -12, 0, 12, 0, [[0, '#0f73c4'], [.4, '#58d2f8'], [1, '#07518e']]);
            c.fillRect(-13, -32, 26, 22);
            c.fillStyle = '#e8f4ff';
            c.beginPath();
            c.moveTo(-6, -10);
            c.lineTo(6, -10);
            c.lineTo(0, 1);
            c.closePath();
            c.fill();
            c.fillStyle = linear(c, 0, 8, 0, 34, [[0, '#ffc66b'], [.5, '#ff9a2e'], [1, '#e8650f']]);
            c.beginPath();
            c.moveTo(-22, 34);
            c.lineTo(-13, 8);
            c.lineTo(13, 8);
            c.lineTo(22, 34);
            c.closePath();
            c.fill();
            c.fillStyle = linear(c, 0, 34, 0, 41, [[0, '#ffffff'], [1, '#8fb1d2']]);
            c.fillRect(-36, 34, 72, 7);
        },
        // A small friend. Every Aero mascot had a face like this.
        bot: c => {
            c.strokeStyle = '#8fb1d2';
            c.lineWidth = 4;
            c.beginPath();
            c.moveTo(0, -38);
            c.lineTo(0, -56);
            c.stroke();
            c.fillStyle = radial(c, -2, -60, 1, 0, -57, 9, [[0, '#ffffff'], [.5, '#4fd2f7'], [1, '#0a6db8']]);
            c.beginPath();
            c.arc(0, -57, 8, 0, TAU);
            c.fill();
            c.fillStyle = linear(c, -48, 0, -38, 0, [[0, '#17a9e8'], [1, '#0a6db8']]);
            c.fillRect(-54, -10, 12, 26);
            c.fillRect(42, -10, 12, 26);
            c.fillStyle = linear(c, 0, -40, 0, 42, [[0, '#ffffff'], [.6, '#e4f0fb'], [1, '#88aacb']]);
            rounded(c, -46, -40, 92, 80, 26);
            c.fill();
            c.fillStyle = linear(c, 0, -24, 0, 16, [[0, '#123a63'], [1, '#07213d']]);
            rounded(c, -34, -24, 68, 42, 16);
            c.fill();
            c.fillStyle = '#c8fbff';
            c.shadowColor = '#5feaff';
            c.shadowBlur = 9;
            for (const side of [-1, 1]) {
                c.beginPath();
                c.ellipse(side * 15, -4, 7, 10, 0, 0, TAU);
                c.fill();
            }
            c.shadowBlur = 0;
            c.fillStyle = 'rgba(255,255,255,.2)';
            c.beginPath();
            c.ellipse(-8, -18, 22, 5, -.1, 0, TAU);
            c.fill();
        },
        // The sort of board the keychains and subway signs on these pages run on.
        board: c => {
            c.fillStyle = linear(c, -44, -44, 44, 44, [[0, '#1b9d62'], [1, '#07583a']]);
            rounded(c, -46, -40, 92, 80, 7);
            c.fill();
            c.strokeStyle = 'rgba(255,214,120,.86)';
            c.lineWidth = 2;
            for (let i = 0; i < 6; i++) {
                const y = -30 + i * 12;
                c.beginPath();
                c.moveTo(-40, y);
                c.lineTo(-22, y);
                c.lineTo(-22 + (i % 2 ? 7 : -3), y + 3);
                c.moveTo(40, y);
                c.lineTo(22, y);
                c.stroke();
            }
            c.fillStyle = linear(c, -18, -22, 18, 22, [[0, '#566a7d'], [.5, '#1b2a3a'], [1, '#0a1420']]);
            c.fillRect(-20, -22, 40, 44);
            c.fillStyle = 'rgba(255,255,255,.22)';
            c.fillRect(-20, -22, 40, 8);
            c.fillStyle = '#6ff3ff';
            c.shadowColor = '#6ff3ff';
            c.shadowBlur = 8;
            c.beginPath();
            c.arc(30, 30, 4, 0, TAU);
            c.fill();
            c.shadowBlur = 0;
        }
    };
    const iconSprite = (name, size) => sprite(size, size, size / 2, size / 2, c => {
        c.scale(size / 150, size / 150);
        ICONS[name](c);
    });

    /* ---- The bubble's glass ------------------------------------------------
       Clear in the middle, bright at the rim, with a thin film of colour round
       it, and the world behind it upside down: a soap bubble shows the sky at
       its foot and the ground at its head. */
    const bubbleGlass = pixels => {
        const canvas = blank(pixels, pixels);
        const c = canvas.getContext('2d');
        const r = pixels / 2;
        c.translate(r, r);
        const R = r * .97;
        c.save();
        c.beginPath();
        c.arc(0, 0, R, 0, TAU);
        c.clip();
        c.fillStyle = linear(c, 0, -R, 0, R, [[0, 'rgba(105,195,85,.15)'], [.44, 'rgba(235,250,255,.03)'], [.56, 'rgba(235,250,255,.03)'], [1, 'rgba(90,175,255,.2)']]);
        c.fillRect(-R, -R, R * 2, R * 2);
        c.fillStyle = radial(c, 0, 0, R * .5, 0, 0, R, [[0, 'rgba(255,255,255,0)'], [.62, 'rgba(225,245,255,.1)'], [.9, 'rgba(205,238,255,.42)'], [1, 'rgba(255,255,255,.82)']]);
        c.fillRect(-R, -R, R * 2, R * 2);
        c.fillStyle = radial(c, R * .28, R * .52, 0, R * .28, R * .52, R * .7, [[0, 'rgba(255,255,255,.34)'], [1, 'rgba(255,255,255,0)']]);
        c.fillRect(-R, -R, R * 2, R * 2);
        c.restore();
        // The film. Thin, and most of it only where the rim is turned away.
        if (c.createConicGradient) {
            const film = c.createConicGradient(.7, 0, 0);
            [[0, 'rgba(90,240,255,.62)'], [.2, 'rgba(255,150,240,.55)'], [.42, 'rgba(255,245,150,.5)'], [.62, 'rgba(120,255,190,.55)'], [.82, 'rgba(120,170,255,.6)'], [1, 'rgba(90,240,255,.62)']]
                .forEach(([at, color]) => film.addColorStop(at, color));
            c.strokeStyle = film;
            c.lineWidth = R * .045;
            c.beginPath();
            c.arc(0, 0, R * .965, 0, TAU);
            c.stroke();
        }
        c.strokeStyle = 'rgba(255,255,255,.9)';
        c.lineWidth = Math.max(1, R * .012);
        c.beginPath();
        c.arc(0, 0, R, 0, TAU);
        c.stroke();
        // The window every bubble of the period reflects, up on its left.
        c.save();
        c.rotate(-.72);
        c.fillStyle = radial(c, 0, -R * .72, 0, 0, -R * .72, R * .5, [[0, 'rgba(255,255,255,.96)'], [.4, 'rgba(255,255,255,.55)'], [1, 'rgba(255,255,255,0)']]);
        c.beginPath();
        c.ellipse(0, -R * .72, R * .46, R * .15, 0, 0, TAU);
        c.fill();
        c.restore();
        c.fillStyle = 'rgba(255,255,255,.92)';
        c.beginPath();
        c.ellipse(R * .5, R * .56, R * .09, R * .045, -.8, 0, TAU);
        c.fill();
        return canvas;
    };

    // A lens star: a soft bloom and two long thin rays.
    const sparkleSprite = pixels => {
        const canvas = blank(pixels, pixels);
        const c = canvas.getContext('2d');
        const r = pixels / 2;
        c.translate(r, r);
        c.fillStyle = radial(c, 0, 0, 0, 0, 0, r * .4, [[0, 'rgba(255,255,255,1)'], [.3, 'rgba(255,255,255,.62)'], [1, 'rgba(210,245,255,0)']]);
        c.fillRect(-r, -r, r * 2, r * 2);
        c.fillStyle = 'rgba(255,255,255,.98)';
        for (const angle of [0, Math.PI / 2]) {
            c.save();
            c.rotate(angle);
            c.beginPath();
            c.moveTo(-r, 0);
            c.quadraticCurveTo(0, -r * .055, r, 0);
            c.quadraticCurveTo(0, r * .055, -r, 0);
            c.fill();
            c.restore();
        }
        return canvas;
    };

    /* ---- The skyline in the orb ---------------------------------------------- */
    const tower = (c, x, base, width, height, tone, windowStep, random) => {
        const top = base - height;
        const front = width * .68;
        c.fillStyle = linear(c, 0, top, 0, base, tone.front);
        c.fillRect(x, top, front, height);
        c.fillStyle = linear(c, 0, top, 0, base, tone.side);
        c.fillRect(x + front, top, width - front, height);
        c.fillStyle = 'rgba(255,255,255,.3)';
        for (let y = top + windowStep; y < base; y += windowStep) c.fillRect(x, y, width, .7);
        c.fillStyle = 'rgba(255,255,255,.22)';
        const mullions = Math.max(2, Math.floor(front / 5));
        for (let i = 1; i < mullions; i++) c.fillRect(x + i * front / mullions, top, .6, height);
        // The sky sliding off the glass.
        c.save();
        c.beginPath();
        c.rect(x, top, front, height);
        c.clip();
        c.fillStyle = 'rgba(255,255,255,.32)';
        const slope = random() * height * .4;
        c.beginPath();
        c.moveTo(x, top + slope);
        c.lineTo(x + front * .55, top);
        c.lineTo(x + front, top);
        c.lineTo(x + front, top + height * .1);
        c.lineTo(x, top + slope + height * .34);
        c.closePath();
        c.fill();
        c.restore();
    };
    const skyline = (c, cx, base, span, unit) => {
        const random = seeded(1913);
        const tones = {
            far: { front: [[0, 'rgba(240,250,255,.78)'], [1, 'rgba(180,225,250,.5)']], side: [[0, 'rgba(208,236,252,.78)'], [1, 'rgba(150,205,240,.5)']] },
            near: { front: [[0, '#e6f7ff'], [.45, '#8ed4f6'], [1, '#3e9dd6']], side: [[0, '#b4e0f6'], [.45, '#57a9dc'], [1, '#2379b4']] }
        };
        const left = cx - span / 2;
        // The far row, faint with distance.
        for (let x = left; x < cx + span / 2;) {
            const width = unit * (11 + random() * 17);
            tower(c, x, base, width, unit * (60 + random() * 95), tones.far, unit * 4, random);
            x += width * (.82 + random() * .3);
        }
        // The Empire State, in its setbacks, and the spire on it.
        const stepped = (x, height, width) => {
            const levels = [[1, 0, .56], [.72, .56, .74], [.44, .74, .88], [.22, .88, 1]];
            for (const [share, from, to] of levels) {
                const w = width * share;
                tower(c, x + (width - w) / 2, base - height * from, w, height * (to - from), tones.near, unit * 2.6, random);
            }
            c.fillStyle = linear(c, 0, base - height * 1.2, 0, base - height, [[0, '#ffffff'], [1, '#8ed4f6']]);
            c.beginPath();
            c.moveTo(x + width / 2 - unit * 1.1, base - height);
            c.lineTo(x + width / 2, base - height * 1.2);
            c.lineTo(x + width / 2 + unit * 1.1, base - height);
            c.closePath();
            c.fill();
        };
        // One World Trade: a square turned as it climbs, and a mast.
        const tapered = (x, height, width) => {
            c.fillStyle = linear(c, x, 0, x + width, 0, [[0, '#d9f3ff'], [.45, '#7fcbf2'], [.5, '#3e9dd6'], [1, '#6cb9e6']]);
            c.beginPath();
            c.moveTo(x, base);
            c.lineTo(x + width * .18, base - height);
            c.lineTo(x + width * .82, base - height);
            c.lineTo(x + width, base);
            c.closePath();
            c.fill();
            c.fillStyle = 'rgba(255,255,255,.32)';
            c.beginPath();
            c.moveTo(x, base);
            c.lineTo(x + width * .18, base - height);
            c.lineTo(x + width * .5, base - height);
            c.lineTo(x + width * .5, base);
            c.closePath();
            c.fill();
            c.fillStyle = 'rgba(255,255,255,.2)';
            for (let y = base - height + unit * 3; y < base; y += unit * 3) c.fillRect(x, y, width, .7);
            c.fillStyle = '#f0fbff';
            c.fillRect(x + width / 2 - unit * .55, base - height * 1.2, unit * 1.1, height * .2);
        };
        const row = [.02, .13, .24, .36, .5, .61, .72, .83];
        const heights = [78, 118, 92, 0, 0, 102, 134, 84];
        row.forEach((at, i) => {
            if (!heights[i]) return;
            const width = unit * (15 + random() * 11);
            tower(c, left + span * at, base, width, unit * heights[i], tones.near, unit * 3.2, random);
        });
        tapered(left + span * .37, unit * 172, unit * 27);
        stepped(left + span * .54, unit * 142, unit * 31);
        // The city stands in its own mist.
        c.fillStyle = linear(c, 0, base - unit * 34, 0, base, [[0, 'rgba(255,255,255,0)'], [.72, 'rgba(255,255,255,.86)'], [1, 'rgba(255,255,255,.98)']]);
        c.fillRect(left - span * .1, base - unit * 34, span * 1.2, unit * 36);
    };

    const orbSprite = (diameter, cloud) => sprite(diameter + 28, diameter + 28, diameter / 2 + 14, diameter / 2 + 14, c => {
        const r = diameter / 2;
        c.fillStyle = radial(c, 0, 0, r * .92, 0, 0, r * 1.08, [[0, 'rgba(255,255,255,.42)'], [1, 'rgba(255,255,255,0)']]);
        c.beginPath();
        c.arc(0, 0, r * 1.08, 0, TAU);
        c.fill();
        c.save();
        c.beginPath();
        c.arc(0, 0, r, 0, TAU);
        c.clip();
        c.fillStyle = linear(c, 0, -r, 0, r, [[0, 'rgba(70,160,240,.34)'], [.55, 'rgba(170,225,255,.18)'], [1, 'rgba(255,255,255,.46)']]);
        c.fillRect(-r, -r, r * 2, r * 2);
        c.globalAlpha = .9;
        c.drawImage(cloud, -r * 1.2, -r * 1.02, r * 1.75, r * .86);
        c.globalAlpha = .55;
        c.drawImage(cloud, -r * .12, -r * .58, r * 1.3, r * .62);
        c.globalAlpha = 1;
        skyline(c, 0, r * .62, r * 1.75, r / 205);
        c.fillStyle = linear(c, 0, r * .56, 0, r, [[0, 'rgba(255,255,255,.95)'], [.3, 'rgba(240,255,240,.9)'], [1, 'rgba(130,212,92,.95)']]);
        c.fillRect(-r, r * .6, r * 2, r * .4);
        // The glass itself: thick and bright where it turns away.
        c.fillStyle = radial(c, 0, 0, r * .62, 0, 0, r, [[0, 'rgba(255,255,255,0)'], [.7, 'rgba(210,240,255,.12)'], [.92, 'rgba(180,225,255,.5)'], [1, 'rgba(255,255,255,.85)']]);
        c.fillRect(-r, -r, r * 2, r * 2);
        c.restore();
        // A long sweep of window across the top left, and its answer at the foot.
        c.save();
        c.rotate(-.8);
        c.fillStyle = linear(c, 0, -r * .94, 0, -r * .5, [[0, 'rgba(255,255,255,.92)'], [1, 'rgba(255,255,255,0)']]);
        c.beginPath();
        c.arc(0, 0, r * .93, -Math.PI * .86, -Math.PI * .14);
        c.quadraticCurveTo(0, -r * .56, Math.cos(-Math.PI * .86) * r * .93, Math.sin(-Math.PI * .86) * r * .93);
        c.closePath();
        c.fill();
        c.restore();
        c.save();
        c.rotate(-.8 + Math.PI);
        c.strokeStyle = 'rgba(255,255,255,.6)';
        c.lineWidth = r * .02;
        c.lineCap = 'round';
        c.beginPath();
        c.arc(0, 0, r * .9, -Math.PI * .72, -Math.PI * .28);
        c.stroke();
        c.restore();
        c.strokeStyle = linear(c, -r, -r, r, r, [[0, '#ffffff'], [.5, 'rgba(160,220,255,.82)'], [1, '#ffffff']]);
        c.lineWidth = Math.max(1.4, r * .012);
        c.beginPath();
        c.arc(0, 0, r, 0, TAU);
        c.stroke();
    });

    /* ---- The land ------------------------------------------------------------ */
    const NOISE_SIZE = 256;
    const noiseTile = () => {
        const canvas = blank(NOISE_SIZE, NOISE_SIZE);
        const c = canvas.getContext('2d');
        const image = c.createImageData(NOISE_SIZE, NOISE_SIZE);
        const random = seeded(77);
        for (let i = 0; i < image.data.length; i += 4) {
            const v = random() * 255;
            image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
            image.data[i + 3] = 255;
        }
        c.putImageData(image, 0, 0);
        return canvas;
    };

    const hillFill = (c, curve, width, bottom, margin) => {
        c.beginPath();
        c.moveTo(-margin, bottom);
        for (let x = -margin; x <= width + margin; x += 6) c.lineTo(x, curve(x));
        c.lineTo(width + margin, curve(width + margin));
        c.lineTo(width + margin, bottom);
        c.closePath();
    };
    const paintHill = (c, curve, width, height, bottom, options, tile, sun) => {
        const { top, stops, seed, blades, rim } = options;
        const random = seeded(seed);
        c.save();
        hillFill(c, curve, width, bottom, 40);
        c.clip();
        c.fillStyle = linear(c, 0, top, 0, bottom, stops);
        c.fillRect(-40, top - 40, width + 80, bottom - top + 80);
        // Long soft swells of light and shade, so it rolls.
        for (let i = 0; i < 16; i++) {
            const x = random() * width, y = mix(top, bottom, random() * random());
            const w = width * (.14 + random() * .3), h = (bottom - top) * (.09 + random() * .2);
            c.save();
            c.translate(x, y);
            c.scale(1, h / w);
            c.fillStyle = radial(c, 0, 0, 0, 0, 0, w, random() > .45
                ? [[0, 'rgba(232,255,140,.26)'], [1, 'rgba(232,255,140,0)']]
                : [[0, 'rgba(10,92,26,.24)'], [1, 'rgba(10,92,26,0)']]);
            c.beginPath();
            c.arc(0, 0, w, 0, TAU);
            c.fill();
            c.restore();
        }
        // The sun, falling across the side that faces it.
        c.fillStyle = radial(c, sun.x, top, 0, sun.x, top, width * .62, [[0, 'rgba(255,255,190,.42)'], [.5, 'rgba(255,255,170,.13)'], [1, 'rgba(255,255,170,0)']]);
        c.fillRect(-40, top - 40, width + 80, bottom - top + 80);
        // Fine grain, stretched sideways as distance stretches grass.
        c.globalCompositeOperation = 'overlay';
        c.globalAlpha = options.grain;
        c.save();
        c.scale(1, .5);
        c.fillStyle = c.createPattern(tile, 'repeat');
        c.fillRect(-40, (top - 40) * 2, width + 80, (bottom - top + 80) * 2);
        c.restore();
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'source-over';
        // Blades, thickest at the crest and thinning with height on the screen.
        const palette = ['rgba(236,255,150,.7)', 'rgba(164,232,76,.7)', 'rgba(70,170,44,.62)', 'rgba(24,120,36,.5)'];
        c.lineWidth = options.bladeWidth;
        c.lineCap = 'round';
        for (let i = 0; i < blades; i++) {
            const x = random() * (width + 40) - 20;
            const crest = curve(x);
            const depth = Math.pow(random(), 1.7);
            const y = crest + depth * (bottom - crest);
            const tall = (3 + random() * 6) * options.bladeScale * (.55 + depth * .9);
            c.strokeStyle = palette[Math.floor(random() * palette.length)];
            c.beginPath();
            c.moveTo(x, y);
            c.quadraticCurveTo(x + (random() - .5) * 3, y - tall * .6, x + (random() - .5) * 5, y - tall);
            c.stroke();
        }
        c.restore();
        // A line of light along the crest, where the glossy hills of the period
        // catch it.
        c.save();
        c.beginPath();
        for (let x = -40; x <= width + 40; x += 6) c.lineTo(x, curve(x) + .5);
        c.strokeStyle = rim;
        c.lineWidth = 1.5;
        c.shadowColor = 'rgba(240,255,180,.9)';
        c.shadowBlur = 12;
        c.stroke();
        c.restore();
    };
    const paintTree = (c, x, y, height, sun) => {
        const random = seeded(4242);
        const crownY = y - height * .62, crownW = height * .48, crownH = height * .44;
        const trunk = linear(c, x - height * .05, 0, x + height * .05, 0, [[0, '#5a3a22'], [.5, '#8a6236'], [1, '#3f2815']]);
        c.fillStyle = trunk;
        c.beginPath();
        c.moveTo(x - height * .055, y);
        c.quadraticCurveTo(x - height * .02, y - height * .25, x - height * .03, y - height * .52);
        c.lineTo(x + height * .03, y - height * .52);
        c.quadraticCurveTo(x + height * .02, y - height * .25, x + height * .065, y);
        c.closePath();
        c.fill();
        c.strokeStyle = trunk;
        c.lineCap = 'round';
        for (let i = 0; i < 6; i++) {
            const a = -Math.PI / 2 + (i - 2.5) * .36;
            c.lineWidth = height * .018;
            c.beginPath();
            c.moveTo(x, y - height * (.3 + random() * .18));
            c.lineTo(x + Math.cos(a) * crownW * .7, crownY + Math.sin(a) * crownH * .45 + crownH * .1);
            c.stroke();
        }
        // A crown is big lobes of many small leaves, each lobe lit on its own
        // and the whole of it lit from the sun's side. Lobes first, so the
        // leaves know how bright to be from where they fall in one.
        const lightX = sun.x > x ? .6 : -.6;
        const lobes = [];
        for (let i = 0; i < 26; i++) {
            const a = random() * TAU, d = Math.pow(random(), .6);
            lobes.push({
                x: x + Math.cos(a) * d * crownW * .92,
                y: crownY + Math.sin(a) * d * crownH * .9,
                r: height * (.09 + random() * .085)
            });
        }
        lobes.sort((a, b) => b.y - a.y);
        const greens = ['#0d5a22', '#14702a', '#1f8a2f', '#35a437', '#58bd3f', '#84d24a', '#b2e45e', '#dcf48a'];
        const leaf = height * .0075;
        c.lineCap = 'round';
        for (const lobe of lobes) {
            c.fillStyle = radial(c, lobe.x + lightX * lobe.r * .25, lobe.y - lobe.r * .3, lobe.r * .1, lobe.x, lobe.y, lobe.r, [[0, '#2f9a35'], [.75, '#14702a'], [1, 'rgba(13,90,34,0)']]);
            c.beginPath();
            c.arc(lobe.x, lobe.y, lobe.r, 0, TAU);
            c.fill();
            for (let i = 0; i < 340; i++) {
                const a = random() * TAU, d = Math.sqrt(random());
                const lx = Math.cos(a) * d, ly = Math.sin(a) * d;
                // Dot product with the light, inside the lobe and across the tree.
                const inLobe = lx * lightX - ly * .8;
                const inTree = (lobe.x - x) / crownW * lightX - (lobe.y - crownY) / crownH * .7;
                const tone = clamp(3.1 + inLobe * 2.6 + inTree * 1.5 + (random() - .5) * 1.6, 0, greens.length - 1);
                c.strokeStyle = greens[Math.round(tone)];
                c.lineWidth = leaf * (.7 + random() * .7);
                const px = lobe.x + lx * lobe.r, py = lobe.y + ly * lobe.r;
                const turn = random() * TAU;
                c.beginPath();
                c.moveTo(px, py);
                c.lineTo(px + Math.cos(turn) * leaf * 1.1, py + Math.sin(turn) * leaf * 1.1);
                c.stroke();
            }
        }
    };

    /* ---- The scene ------------------------------------------------------------ */
    let canvas = null, context = null;
    let W = 0, H = 0, unit = 1, portrait = false;
    let ready = false, preparing = null, shown = false, frame = 0, lastFrame = 0, clock = 0;
    let underProject = false, underProjectTimer = 0;
    let scene = null;
    let cloudCache = null;
    let cloudCacheKey = '';
    let reducedMotion = null;
    let rebuilding = 0;
    let resizeTimer = 0;
    let pointerX = 0, pointerY = 0, pointerSeen = false;
    let lookX = 0, lookY = 0;
    let scrolled = 0, sinking = 0;

    const FAR = 40, GROUND_MARGIN = 30;
    const curves = () => {
        const crest = portrait ? .76 : .715;
        const near = portrait ? .85 : .83;
        return {
            far: x => H * (crest + .03 * Math.sin(x / W * 2.5 + .3) + .016 * Math.sin(x / W * 6.1 + 1.6)),
            near: x => H * (near + .05 * Math.sin(x / W * 2 + 3.2) + .012 * Math.sin(x / W * 5.3 + .6)),
            ridge: x => H * (crest - .035 + .018 * Math.sin(x / W * 9 + .4) + .01 * Math.sin(x / W * 23 + 2) + .006 * Math.sin(x / W * 51))
        };
    };

    const paintSky = sun => {
        const sky = blank(W * scale, H * scale);
        const c = sky.getContext('2d', { alpha: false });
        c.scale(scale, scale);
        c.fillStyle = linear(c, 0, 0, 0, H * .84, [[0, '#0f73dc'], [.24, '#2a97ee'], [.5, '#5dbdf7'], [.72, '#a4e0fd'], [.92, '#e0f7ff'], [1, '#f2fcff']]);
        c.fillRect(0, 0, W, H);
        const reach = Math.max(W, H) * .78;
        c.fillStyle = radial(c, sun.x, sun.y, 0, sun.x, sun.y, reach, [[0, 'rgba(255,255,255,1)'], [.09, 'rgba(255,255,255,.96)'], [.16, 'rgba(255,255,240,.62)'], [.34, 'rgba(235,248,255,.26)'], [.62, 'rgba(210,240,255,.07)'], [1, 'rgba(210,240,255,0)']]);
        c.fillRect(0, 0, W, H);
        c.fillStyle = linear(c, 0, H * .46, 0, H * .78, [[0, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,.55)']]);
        c.fillRect(0, H * .46, W, H * .54);
        // A veil of high cirrus, thin enough to sit behind everything.
        const random = seeded(3101);
        for (let i = 0; i < 12; i++) {
            const x = random() * W, y = H * (.06 + random() * .4), w = W * (.12 + random() * .22), h = H * (.006 + random() * .018);
            c.save();
            c.translate(x, y);
            c.rotate(-.05 - random() * .08);
            c.scale(w, h);
            c.fillStyle = radial(c, 0, 0, 0, 0, 0, 1, [[0, 'rgba(255,255,255,.34)'], [1, 'rgba(255,255,255,0)']]);
            c.beginPath();
            c.arc(0, 0, 1, 0, TAU);
            c.fill();
            c.restore();
        }
        return sky;
    };
    const paintRays = size => {
        const rays = blank(size, size);
        const c = rays.getContext('2d');
        const r = size / 2;
        c.translate(r, r);
        const random = seeded(909);
        for (let i = 0; i < 22; i++) {
            const a = random() * TAU, spread = .012 + random() * .05;
            c.fillStyle = `rgba(255,255,255,${.05 + random() * .1})`;
            c.beginPath();
            c.moveTo(0, 0);
            c.arc(0, 0, r, a - spread, a + spread);
            c.closePath();
            c.fill();
        }
        c.globalCompositeOperation = 'destination-in';
        c.fillStyle = radial(c, 0, 0, r * .05, 0, 0, r, [[0, 'rgba(0,0,0,1)'], [.45, 'rgba(0,0,0,.42)'], [1, 'rgba(0,0,0,0)']]);
        c.fillRect(-r, -r, size, size);
        return rays;
    };
    const paintFlare = size => {
        const flare = blank(size, size);
        const c = flare.getContext('2d');
        const r = size / 2;
        c.translate(r, r);
        c.fillStyle = radial(c, 0, 0, r * .55, 0, 0, r, [[0, 'rgba(160,230,255,.1)'], [.8, 'rgba(160,230,255,.3)'], [.94, 'rgba(255,255,255,.34)'], [1, 'rgba(255,255,255,0)']]);
        c.beginPath();
        c.arc(0, 0, r, 0, TAU);
        c.fill();
        return flare;
    };

    const buildLand = async sun => {
        const curve = curves();
        const tile = noiseTile();
        const groundHeight = H * .52;
        const groundTop = H - groundHeight;
        const makeLayer = paint => {
            const layer = blank((W + GROUND_MARGIN * 2) * scale, (groundHeight + GROUND_MARGIN) * scale);
            const c = layer.getContext('2d');
            c.scale(scale, scale);
            c.translate(GROUND_MARGIN, -groundTop);
            paint(c);
            return layer;
        };
        // The one big tree stands at the right-hand edge, half out of the
        // picture and behind the orb, its foot behind the near hill: the page's
        // text runs down the left, and small type does not read over leaves.
        const treeX = W * 1.01;
        const treeHeight = portrait ? H * .3 : H * .54;
        const treeY = curve.near(treeX) + H * .02;
        const treeSprite = sprite(treeHeight * 1.5, treeHeight * 1.5, treeHeight * .75, treeHeight * 1.38, c => paintTree(c, 0, 0, treeHeight, { x: sun.x - treeX }));
        await breathe();
        const far = makeLayer(c => {
            // Blue hills on the edge of sight.
            hillFill(c, curve.ridge, W, H + 40, 40);
            c.fillStyle = linear(c, 0, H * .62, 0, H * .76, [[0, 'rgba(120,186,232,.85)'], [1, 'rgba(198,232,246,.9)']]);
            c.fill();
            paintHill(c, curve.far, W, H, H + 40, {
                top: H * .66, seed: 21, blades: Math.round(W * H * .0035), grain: .3, bladeWidth: .7, bladeScale: .55,
                rim: 'rgba(238,255,180,.85)',
                stops: [[0, '#c9f07a'], [.2, '#8ddc47'], [.55, '#4fb92f'], [1, '#2a8f24']]
            }, tile, sun);
            // Small trees along the far hill, too small to get in the way of
            // anything, so the hill has a distance to it.
            const sizes = [[.03, .085], [.066, .11], [.1, .075], [.205, .06], [.24, .08], [.42, .055], [.45, .07]];
            for (const [at, size] of sizes) {
                const x = W * at, tall = H * size * (portrait ? .55 : 1);
                const box = tall / treeHeight;
                c.drawImage(treeSprite.canvas, x - treeSprite.anchorX * box, curve.far(x) + 2 - treeSprite.anchorY * box, treeSprite.width * box, treeSprite.height * box);
            }
        });
        await breathe();
        const near = makeLayer(c => {
            paintHill(c, curve.near, W, H, H + 40, {
                top: H * .78, seed: 57, blades: Math.round(W * H * .0085), grain: .36, bladeWidth: 1, bladeScale: 1,
                rim: 'rgba(245,255,190,.92)',
                stops: [[0, '#b8ec5c'], [.22, '#7fd63a'], [.6, '#3fae2b'], [1, '#1f8423']]
            }, tile, sun);
            // Daisies in the grass.
            const random = seeded(808);
            for (let i = 0; i < W * .11; i++) {
                const x = random() * W;
                const y = curve.near(x) + 8 + Math.pow(random(), 1.4) * (H + 30 - curve.near(x));
                const r = .7 + random() * 1.3;
                c.fillStyle = random() > .3 ? 'rgba(255,255,255,.9)' : 'rgba(255,232,110,.92)';
                c.beginPath();
                c.arc(x, y, r, 0, TAU);
                c.fill();
            }
        });
        return { far, near, groundTop, groundHeight, tree: { sprite: treeSprite, x: treeX, y: treeY }, curve };
    };

    const build = async () => {
        W = Math.max(320, document.documentElement.clientWidth);
        H = Math.max(320, window.innerHeight);
        portrait = H > W * 1.1;
        unit = Math.min(W, H * 1.35) / 1000;
        const paced = document.documentElement.dataset.effectsPace;
        // Sharper than the space sky, which is soft light: these have edges.
        scale = Math.min(window.devicePixelRatio || 1, paced ? 1.5 : 2);
        const sun = portrait ? { x: W * .8, y: H * .08 } : { x: W * .88, y: H * .12 };

        const cloudKey = `${unit > .6 ? 'large' : 'small'}`;
        if (!cloudCache || cloudCacheKey !== cloudKey) {
            const large = unit > .6 ? 960 : 640, small = unit > .6 ? 620 : 420;
            const orders = [
                { seed: 11, width: large, height: Math.round(large * .5) },
                { seed: 29, width: large, height: Math.round(large * .5) },
                { seed: 47, width: large, height: Math.round(large * .5) },
                { seed: 61, width: small, height: Math.round(small * .46) },
                { seed: 83, width: small, height: Math.round(small * .46) },
                { seed: 97, width: small, height: Math.round(small * .46) }
            ].map(order => ({ ...order, lightX: .6, lightY: -.8 }));
            cloudCache = await makeClouds(orders);
            cloudCacheKey = cloudKey;
        }
        await breathe();
        const sky = paintSky(sun);
        const rays = paintRays(Math.min(1400, Math.ceil(Math.max(W, H) * 1.5)));
        const flare = paintFlare(256);
        await breathe();
        const land = await buildLand(sun);
        await breathe();

        const orbSize = portrait ? W * .72 : Math.min(H * .66, W * .4);
        const orbX = portrait ? W * .66 : W * .78;
        const orb = {
            sprite: orbSprite(orbSize, cloudCache[0]),
            x: orbX,
            y: land.curve.far(orbX) - orbSize * .34,
            size: orbSize
        };
        await breathe();

        const armScale = unit * (portrait ? 1.05 : 1.2);
        const armX = portrait ? W * .24 : W * .58;
        const sprites = {
            base: armBase(58 * armScale),
            upper: armLink(150 * armScale, 25 * armScale, 19 * armScale),
            fore: armLink(122 * armScale, 18 * armScale, 13 * armScale),
            shoulder: joint(26 * armScale),
            elbow: joint(19 * armScale),
            wrist: joint(13 * armScale),
            wand: wand(24 * armScale),
            kiwi: kiwiBot(30 * unit * 1.2),
            drone: droneBody(34 * unit * 1.15)
        };
        const arm = {
            x: armX, y: land.curve.near(armX) + 4 * armScale, scale: armScale,
            upper: 150 * armScale, fore: 122 * armScale, wandReach: 42 * armScale,
            shoulderHeight: 44 * armScale, ringRadius: 24 * armScale,
            shoulder: [0, 0], elbow: [0, 0], wrist: [0, 0], ring: [0, 0], angles: [0, 0, 0]
        };
        await breathe();

        const glassSizes = [96, 192, 384].map(size => ({ size, canvas: bubbleGlass(size) }));
        const icons = {};
        for (const name of Object.keys(ICONS)) icons[name] = iconSprite(name, 180);
        await breathe();
        const sparkle = sparkleSprite(128);

        // The clouds, far ones low and small and near ones high and large.
        const clouds = [
            { sprite: 3, x: .02, y: .47, w: .34, speed: 2.8, alpha: .94, depth: .1 },
            { sprite: 4, x: .4, y: .52, w: .28, speed: 2.2, alpha: .92, depth: .08 },
            { sprite: 5, x: .74, y: .5, w: .3, speed: 2.5, alpha: .9, depth: .08 },
            { sprite: 1, x: .3, y: .2, w: .56, speed: 5.5, alpha: .98, depth: .22 },
            { sprite: 2, x: -.26, y: .03, w: .62, speed: 7, alpha: 1, depth: .3 },
            { sprite: 0, x: .78, y: .28, w: .46, speed: 4.8, alpha: .96, depth: .2 }
        ].map(cloud => {
            const widthPx = Math.max(cloud.w * W, portrait ? 300 : 0);
            const image = cloudCache[cloud.sprite];
            return { ...cloud, image, x: cloud.x * W, y: cloud.y * H, w: widthPx, h: widthPx * image.height / image.width };
        });

        const random = seeded(2718);
        const count = portrait ? 18 : Math.round(clamp(W * H / 34000, 22, 42));
        const iconNames = ['gear', 'swerve', 'printer', 'bot', 'board', 'gears'];
        const bubbles = [];
        for (let i = 0; i < count; i++) {
            const carrying = i < iconNames.length;
            const radius = (carrying ? 44 + random() * 26 : 7 + Math.pow(random(), 2.2) * 42) * unit * (portrait ? 1.1 : 1.15);
            bubbles.push({
                x: random() * W, y: random() * (H + 200) - 100,
                r: radius, grown: 1, depth: .25 + random() * .75,
                rise: (carrying ? 7 : 12) + random() * 15,
                sway: 8 + random() * 22, swayRate: .16 + random() * .36, phase: random() * TAU,
                icon: carrying ? iconNames[i] : null,
                turn: 0, turnRate: (random() - .5) * .3,
                pop: 0, drawnX: 0, drawnY: 0
            });
        }
        const sparkles = [];
        for (let i = 0; i < 24; i++) {
            const onGrass = i < 13;
            sparkles.push({
                x: random() * W,
                y: onGrass ? mix(land.curve.near(W / 2), H, random()) : H * random() * .7,
                size: (onGrass ? 12 + random() * 20 : 8 + random() * 24) * unit * 1.2,
                rate: .3 + random() * .8, phase: random() * TAU, grass: onGrass
            });
        }
        const droplets = [];

        scene = {
            sun, sky, rays, flare, land, orb, arm, sprites, glassSizes, icons, sparkle, clouds, bubbles, sparkles, droplets,
            kiwi: { x: W * (portrait ? .55 : .24), dir: 1, wait: 0 },
            drone: { trail: [], clock: random() * 20 },
            nextWandBubble: 2
        };
        // The arm starts with one already in the ring.
        const first = bubbles.find(b => !b.icon);
        first.grown = 0;
        first.depth = 1;
    };

    /* ---- A frame --------------------------------------------------------------- */
    const put = (s, x, y, angle = 0, flip = 1) => {
        const cos = Math.cos(angle), sin = Math.sin(angle);
        context.setTransform(scale * cos * flip, scale * sin * flip, -scale * sin, scale * cos, scale * x, scale * y);
        context.drawImage(s.canvas, -s.anchorX, -s.anchorY, s.width, s.height);
    };
    const glassFor = (s, r) => {
        const wanted = r * 2 * scale;
        for (const glass of s.glassSizes) if (glass.size >= wanted) return glass.canvas;
        return s.glassSizes[s.glassSizes.length - 1].canvas;
    };

    const update = dt => {
        const s = scene;
        const t = clock;
        lookX += ((pointerSeen ? pointerX / W - .5 : 0) - lookX) * Math.min(1, dt * 2.2);
        lookY += ((pointerSeen ? pointerY / H - .5 : 0) - lookY) * Math.min(1, dt * 2.2);
        sinking += (Math.min(scrolled * .09, H * .17) - sinking) * Math.min(1, dt * 6);

        for (const cloud of s.clouds) {
            cloud.x += cloud.speed * dt * unit;
            if (cloud.x > W + 20) cloud.x = -cloud.w - 20;
        }

        // The arm sways through a slow, unhurried reach.
        const arm = s.arm;
        const a0 = -1.34 + .1 * Math.sin(t * .29);
        const a1 = a0 + .86 + .2 * Math.sin(t * .41 + 1.1);
        const a2 = a1 + .42 + .3 * Math.sin(t * .53 + 2.3);
        arm.angles = [a0, a1, a2];
        arm.shoulder = [arm.x, arm.y - arm.shoulderHeight];
        arm.elbow = [arm.shoulder[0] + Math.cos(a0) * arm.upper, arm.shoulder[1] + Math.sin(a0) * arm.upper];
        arm.wrist = [arm.elbow[0] + Math.cos(a1) * arm.fore, arm.elbow[1] + Math.sin(a1) * arm.fore];
        arm.ring = [arm.wrist[0] + Math.cos(a2) * arm.wandReach, arm.wrist[1] + Math.sin(a2) * arm.wandReach];

        // One bubble at a time swells in the ring, breaks off and floats.
        const pointerNear = (x, y, reach) => {
            if (!pointerSeen) return null;
            const dx = x - pointerX, dy = y - pointerY;
            const d2 = dx * dx + dy * dy;
            if (d2 > reach * reach) return null;
            const d = Math.sqrt(d2) || 1;
            return [dx / d, dy / d, 1 - d / reach];
        };
        const fromBelow = b => {
            b.pop = 0;
            b.grown = 1;
            b.y = H + b.r + Math.random() * 160 + scrollShift(b);
            b.x = Math.random() * W;
        };

        for (const b of s.bubbles) {
            if (b.pop) {
                b.pop += dt / .32;
                if (b.pop >= 1) fromBelow(b);
                continue;
            }
            if (b.grown < 1) {
                // Held in the ring, wherever the arm and the view have got to.
                b.grown = Math.min(1, b.grown + dt / 1.5);
                b.x = arm.ring[0] + (lookX * 26 * b.depth - lookX * 26 * .62);
                b.y = arm.ring[1] + (lookY * 14 * b.depth - lookY * 14 * .62) + sinking + scrollShift(b);
                if (b.grown >= 1) {
                    b.x += Math.cos(arm.angles[2]) * b.r * .9;
                    b.y += Math.sin(arm.angles[2]) * b.r * .9 - b.r * .3;
                }
                continue;
            }
            b.y -= b.rise * dt * unit * 1.4;
            b.x += Math.cos(t * b.swayRate + b.phase) * b.sway * dt;
            b.turn += b.turnRate * dt;
            const push = pointerNear(b.drawnX, b.drawnY, b.r + 54);
            if (push) {
                b.x += push[0] * push[2] * 90 * dt;
                b.y += push[1] * push[2] * 90 * dt;
            }
            if (b.y + b.r < scrollShift(b) - 60) {
                // Off the top. The plain ones take turns going back to the arm.
                if (!b.icon && t > s.nextWandBubble) {
                    b.grown = 0;
                    b.depth = 1;
                    b.r = (16 + Math.random() * 28) * unit * 1.15;
                    s.nextWandBubble = t + 2.4 + Math.random() * 1.8;
                } else fromBelow(b);
            }
        }
        for (let i = s.droplets.length - 1; i >= 0; i--) {
            const d = s.droplets[i];
            d.life -= dt / .5;
            if (d.life <= 0) { s.droplets.splice(i, 1); continue; }
            d.vy += 340 * dt;
            d.x += d.vx * dt;
            d.y += d.vy * dt;
        }

        // The kiwi drive potters along the hill, stops to think, turns round.
        const kiwi = s.kiwi;
        if (kiwi.wait > 0) kiwi.wait -= dt;
        else {
            kiwi.x += kiwi.dir * 26 * unit * dt;
            const low = W * (portrait ? .4 : .08), high = W * (portrait ? .92 : .46);
            if (kiwi.x > high || kiwi.x < low) {
                kiwi.dir = kiwi.x > high ? -1 : 1;
                kiwi.wait = 1.6 + Math.random() * 2.4;
            }
        }

        // The drone, tracing a long lazy loop, its contrail behind it.
        const drone = s.drone;
        drone.clock += dt;
        const dc = drone.clock * .11;
        const nextX = W * (.5 + .46 * Math.sin(dc));
        const nextY = H * (.3 + .15 * Math.sin(dc * 2 + 1.1));
        drone.vx = nextX - (drone.x ?? nextX);
        drone.x = nextX;
        drone.y = nextY;
        const last = drone.trail[drone.trail.length - 1];
        if (!last || Math.hypot(last[0] - nextX, last[1] - nextY) > 6) {
            drone.trail.push([nextX, nextY]);
            if (drone.trail.length > 120) drone.trail.shift();
        }
    };
    // How far the page's scroll has carried a bubble at its depth.
    const scrollShift = bubble => scrolled * .16 * bubble.depth;

    const draw = () => {
        const s = scene, c = context, t = clock;
        c.setTransform(scale, 0, 0, scale, 0, 0);
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'source-over';
        c.drawImage(s.sky, 0, 0, W, H);

        const lookAt = depth => [-lookX * 26 * depth, -lookY * 14 * depth];

        for (const cloud of s.clouds) {
            const [ox, oy] = lookAt(cloud.depth);
            c.globalAlpha = cloud.alpha;
            c.drawImage(cloud.image, cloud.x + ox, cloud.y + oy - sinking * cloud.depth * .4, cloud.w, cloud.h);
        }
        c.globalAlpha = 1;

        // The rays turn too slowly to see except as a change in the light.
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = .62 + .14 * Math.sin(t * .23);
        {
            const a = t * .012, cos = Math.cos(a), sin = Math.sin(a);
            const size = s.rays.width;
            c.setTransform(scale * cos, scale * sin, -scale * sin, scale * cos, scale * s.sun.x, scale * s.sun.y);
            c.drawImage(s.rays, -size / 2, -size / 2, size, size);
        }
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = 1;
        c.setTransform(scale, 0, 0, scale, 0, 0);

        // Land, from far to near, sinking away as the page scrolls.
        const farShift = sinking * .55, nearShift = sinking;
        const [fx, fy] = lookAt(.3);
        const [nx, ny] = lookAt(.62);
        const widthOfLayer = W + GROUND_MARGIN * 2, heightOfLayer = s.land.groundHeight + GROUND_MARGIN;
        c.drawImage(s.land.far, fx - GROUND_MARGIN, s.land.groundTop + fy + farShift, widthOfLayer, heightOfLayer);
        const tree = s.land.tree;
        put(tree.sprite, tree.x + fx * 1.2, tree.y + fy + nearShift);

        const bob = Math.sin(t * .4) * 3;
        const [ox, oy] = lookAt(.42);
        put(s.orb.sprite, s.orb.x + ox, s.orb.y + bob + oy + farShift);

        c.setTransform(scale, 0, 0, scale, 0, 0);
        c.drawImage(s.land.near, nx - GROUND_MARGIN, s.land.groundTop + ny + nearShift, widthOfLayer, heightOfLayer);

        // The kiwi on the grass, and the arm on its stand.
        const kiwi = s.kiwi;
        const slope = (s.land.curve.near(kiwi.x + 6) - s.land.curve.near(kiwi.x - 6)) / 12;
        const roll = kiwi.wait > 0 ? 0 : Math.sin(t * 9) * .55;
        put(s.sprites.kiwi, kiwi.x + nx, s.land.curve.near(kiwi.x) + 7 * unit + ny + nearShift + roll, Math.atan(slope), kiwi.dir);

        const arm = s.arm;
        const ax = nx, ay = ny + nearShift;
        put(s.sprites.base, arm.x + ax, arm.y + ay);
        put(s.sprites.upper, arm.shoulder[0] + ax, arm.shoulder[1] + ay, arm.angles[0]);
        put(s.sprites.shoulder, arm.shoulder[0] + ax, arm.shoulder[1] + ay);
        put(s.sprites.wand, arm.wrist[0] + ax, arm.wrist[1] + ay, arm.angles[2]);
        put(s.sprites.fore, arm.elbow[0] + ax, arm.elbow[1] + ay, arm.angles[1]);
        put(s.sprites.elbow, arm.elbow[0] + ax, arm.elbow[1] + ay);
        put(s.sprites.wrist, arm.wrist[0] + ax, arm.wrist[1] + ay);

        // The contrail, thin and fading, and the drone at the head of it.
        const drone = s.drone;
        c.setTransform(scale, 0, 0, scale, 0, 0);
        const [dx, dy] = lookAt(.5);
        if (drone.trail.length > 2) {
            c.lineCap = 'round';
            const buckets = 10;
            const each = Math.ceil(drone.trail.length / buckets);
            for (let b = 0; b < buckets; b++) {
                const from = b * each;
                if (from >= drone.trail.length - 1) break;
                const to = Math.min(from + each + 1, drone.trail.length);
                const fade = (b + 1) / buckets;
                c.strokeStyle = `rgba(255,255,255,${.78 * fade * fade})`;
                c.lineWidth = (1 + fade * 4.6) * unit * 1.3;
                c.beginPath();
                c.moveTo(drone.trail[from][0] + dx, drone.trail[from][1] + dy);
                for (let i = from + 1; i < to; i++) c.lineTo(drone.trail[i][0] + dx, drone.trail[i][1] + dy);
                c.stroke();
            }
        }
        put(s.sprites.drone, drone.x + dx, drone.y + dy + Math.sin(t * 2.1) * 1.4, clamp((drone.vx || 0) * .6, -.22, .22));

        // The sun's echo down the glass of whatever is looking at it.
        c.setTransform(scale, 0, 0, scale, 0, 0);
        c.globalCompositeOperation = 'lighter';
        const axisX = W / 2 + lookX * W * .18 - s.sun.x, axisY = H / 2 + lookY * H * .18 - s.sun.y;
        for (const [along, radius, alpha] of [[.34, .05, .16], [.6, .028, .28], [.86, .08, .08], [1.28, .04, .14]]) {
            const r = radius * Math.max(W, H);
            c.globalAlpha = alpha;
            c.drawImage(s.flare, s.sun.x + axisX * along - r, s.sun.y + axisY * along - r, r * 2, r * 2);
        }
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = 1;

        // Bubbles, back to front.
        for (const b of s.bubbles) {
            const [bx, by] = lookAt(b.depth);
            const shift = scrollShift(b);
            const x = b.x + bx, y = b.y + by - shift;
            b.drawnX = x;
            b.drawnY = y;
            if (b.pop) {
                c.setTransform(scale, 0, 0, scale, 0, 0);
                c.globalAlpha = (1 - b.pop) * .9;
                c.strokeStyle = '#fff';
                c.lineWidth = Math.max(1, (1 - b.pop) * 3);
                c.beginPath();
                c.arc(x, y, b.r * (1 + b.pop * .42), 0, TAU);
                c.stroke();
                c.globalAlpha = 1;
                continue;
            }
            const r = b.r * (b.grown < 1 ? .2 + .8 * b.grown : 1);
            if (y + r < -6 || y - r > H + 6 || x + r < -6 || x - r > W + 6) continue;
            const wobble = 1 + Math.sin(t * 1.3 + b.phase) * .012;
            if (b.icon) {
                const icon = s.icons[b.icon];
                const spin = b.icon === 'gear' || b.icon === 'gears' ? b.turn * 3 : Math.sin(t * .4 + b.phase) * .22;
                const size = r * 1.32 / icon.width;
                const cos = Math.cos(spin) * size, sin = Math.sin(spin) * size;
                c.setTransform(scale * cos, scale * sin, -scale * sin, scale * cos, scale * x, scale * y);
                c.globalAlpha = .96;
                c.drawImage(icon.canvas, -icon.anchorX, -icon.anchorY, icon.width, icon.height);
                c.globalAlpha = 1;
            }
            c.setTransform(scale, 0, 0, scale, 0, 0);
            const rx = r * wobble, ry = r / wobble;
            c.drawImage(glassFor(s, r), x - rx, y - ry, rx * 2, ry * 2);
        }

        // Droplets from a burst bubble.
        c.setTransform(scale, 0, 0, scale, 0, 0);
        c.fillStyle = '#fff';
        for (const d of s.droplets) {
            c.globalAlpha = d.life * .9;
            c.beginPath();
            c.arc(d.x, d.y, d.r, 0, TAU);
            c.fill();
        }
        c.globalAlpha = 1;

        // Glints, on the grass and in the air.
        c.globalCompositeOperation = 'lighter';
        for (const spark of s.sparkles) {
            const wave = Math.sin(t * spark.rate + spark.phase);
            if (wave <= .15) continue;
            const size = spark.size * wave * wave;
            const y = spark.y + (spark.grass ? nearShift + ny : 0);
            const x = spark.x + (spark.grass ? nx : 0);
            c.globalAlpha = wave;
            c.drawImage(s.sparkle, x - size, y - size, size * 2, size * 2);
        }
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = 1;
    };

    /* ---- Running it ------------------------------------------------------------- */
    const stopLoop = () => {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
    };
    const tick = now => {
        frame = requestAnimationFrame(tick);
        // A machine the page has found struggling draws half as often. A display
        // faster than sixty is held to sixty: nothing here moves fast enough to
        // show the difference.
        const interval = document.documentElement.dataset.effectsPace ? 33.3 : 16.6;
        if (lastFrame && now - lastFrame < interval - 3) return;
        const dt = lastFrame ? Math.min(.05, (now - lastFrame) / 1000) : 1 / 60;
        lastFrame = now;
        clock += dt;
        update(dt);
        draw();
    };
    const startLoop = () => {
        if (frame || !shown || !scene || document.hidden || underProject) return;
        lastFrame = 0;
        if (reducedMotion && reducedMotion.matches) {
            update(1 / 60);
            draw();
            return;
        }
        frame = requestAnimationFrame(tick);
    };

    const onVisibility = () => {
        if (document.hidden) stopLoop();
        else startLoop();
    };
    // A project open in front of the page leaves a twentieth of the sky to see,
    // so it rests until the project closes, as the space sky does.
    const onModalOpen = () => {
        clearTimeout(underProjectTimer);
        underProjectTimer = window.setTimeout(() => {
            underProject = true;
            stopLoop();
        }, 260);
    };
    const onModalClose = () => {
        clearTimeout(underProjectTimer);
        if (!underProject) return;
        underProject = false;
        startLoop();
    };
    const onScroll = () => { scrolled = window.scrollY; };
    const onPointerMove = event => {
        if (event.pointerType && event.pointerType !== 'mouse') return;
        pointerX = event.clientX;
        pointerY = event.clientY;
        pointerSeen = true;
    };
    // A bubble caught under a press bursts, whatever else the press is doing.
    const onPointerDown = event => {
        if (!scene || event.button) return;
        const s = scene;
        for (let i = s.bubbles.length - 1; i >= 0; i--) {
            const b = s.bubbles[i];
            if (b.pop || b.grown < 1) continue;
            const dx = event.clientX - b.drawnX, dy = event.clientY - b.drawnY;
            if (dx * dx + dy * dy > b.r * b.r) continue;
            b.pop = .001;
            for (let k = 0; k < 14; k++) {
                const a = Math.random() * TAU, speed = 40 + Math.random() * 130;
                s.droplets.push({ x: b.drawnX + Math.cos(a) * b.r * .9, y: b.drawnY + Math.sin(a) * b.r * .9, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 50, r: .8 + Math.random() * 1.8, life: 1 });
            }
            return;
        }
    };
    const onResize = () => {
        clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(rebuild, 260);
    };
    // A phone's address bar sliding away changes the height and nothing else,
    // and the picture need not be painted again for that.
    const rebuild = async () => {
        if (!shown) return;
        const width = document.documentElement.clientWidth, height = window.innerHeight;
        if (width === W && Math.abs(height - H) < H * .16) return;
        const mine = ++rebuilding;
        // The last frame stands, stretched, while the new picture is painted.
        stopLoop();
        await build();
        if (mine !== rebuilding || !shown) return;
        sizeCanvas();
        update(1 / 60);
        draw();
        startLoop();
    };
    const sizeCanvas = () => {
        canvas.width = Math.ceil(W * scale);
        canvas.height = Math.ceil(H * scale);
    };

    const prepare = () => {
        if (ready) return Promise.resolve();
        if (preparing) return preparing;
        reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        preparing = build().then(() => {
            preparing = null;
            ready = true;
        }, error => {
            preparing = null;
            throw error;
        });
        return preparing;
    };
    const show = () => {
        if (!ready) return;
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.className = 'aero-scene';
            canvas.setAttribute('aria-hidden', 'true');
            context = canvas.getContext('2d', { alpha: false });
            const anchor = document.querySelector('.galaxy-nebula') || document.querySelector('.galaxy-field');
            if (anchor) anchor.after(canvas);
            else document.body.prepend(canvas);
        }
        shown = true;
        sizeCanvas();
        canvas.hidden = false;
        scrolled = window.scrollY;
        sinking = Math.min(scrolled * .09, H * .17);
        document.addEventListener('visibilitychange', onVisibility);
        document.addEventListener('portfolio:modal-open', onModalOpen);
        document.addEventListener('portfolio:modal-close', onModalClose);
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('pointermove', onPointerMove, { passive: true });
        window.addEventListener('pointerdown', onPointerDown, { passive: true });
        window.addEventListener('resize', onResize, { passive: true });
        // The first frame now, so a crossfade has a picture to fade to.
        update(1 / 60);
        draw();
        startLoop();
    };
    // Everything back: the loop, the listeners, the sprites and the canvas's
    // own memory. Nothing of this is kept for a level that does not show it.
    const release = () => {
        shown = false;
        ready = false;
        rebuilding += 1;
        stopLoop();
        clearTimeout(resizeTimer);
        clearTimeout(underProjectTimer);
        underProject = false;
        document.removeEventListener('visibilitychange', onVisibility);
        document.removeEventListener('portfolio:modal-open', onModalOpen);
        document.removeEventListener('portfolio:modal-close', onModalClose);
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('resize', onResize);
        scene = null;
        cloudCache = null;
        if (canvas) {
            canvas.width = canvas.height = 0;
            canvas.remove();
            canvas = null;
            context = null;
        }
    };

    window.portfolioAero = { prepare, show, release };
})();
