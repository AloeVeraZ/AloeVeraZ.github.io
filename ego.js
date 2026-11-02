/* The dark sky: the third of High FX's backdrops.

   Five quick presses on the effects slider's High stop go from the stars to the
   bright Frutiger Aero sky (aero.js), five more come here, and five more go back to
   the stars (the slider code in portfolio.js). This is that sunlit daydream's other
   side: the same bubbles, the same arm, a long way down where the light gives out.
   Black water, a few thin currents of light, glowing specks that wake near the
   cursor, and out of the dark a great lens, slowly breathing, that turns to look at
   whatever the visitor is looking at.

   Nothing here is fetched until someone asks, and leaving it hands everything back.
   Everything is painted once into sprites, and a frame is those sprites being moved
   with a few short paths for the tentacles and the sonar. The glass in front is the
   page's own and frosts and bends this as it does the stars. */
(function () {
    'use strict';

    const TAU = Math.PI * 2;
    const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
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
    const ICE = '#a6ecff';
    // Metal with almost no light on it: a thin bright line and a lot of black.
    const metal = (c, x0, y0, x1, y1) => linear(c, x0, y0, x1, y1, [[0, '#9aa7b3'], [.1, '#4b5660'], [.34, '#171c22'], [.5, '#05070a'], [.62, '#232a31'], [.84, '#6c7985'], [1, '#191e24']]);

    /* ---- Sprites ----------------------------------------------------------- */
    let scale = 1;
    const sprite = (width, height, anchorX, anchorY, paint) => {
        const canvas = blank(width * scale, height * scale);
        const context = canvas.getContext('2d');
        context.scale(scale, scale);
        context.translate(anchorX, anchorY);
        paint(context);
        return { canvas, width, height, anchorX, anchorY };
    };
    const disc = (c, x, y, r, fill) => {
        c.fillStyle = fill;
        c.beginPath();
        c.arc(x, y, r, 0, TAU);
        c.fill();
    };
    const ring = (c, r, color, width) => {
        c.strokeStyle = color;
        c.lineWidth = width;
        c.beginPath();
        c.arc(0, 0, r, 0, TAU);
        c.stroke();
    };
    const rounded = (c, x, y, width, height, radius) => {
        c.beginPath();
        if (c.roundRect) c.roundRect(x, y, width, height, radius);
        else c.rect(x, y, width, height);
    };
    const shellPath = (c, length, r0, r1) => {
        c.beginPath();
        c.arc(0, 0, r0, Math.PI / 2, -Math.PI / 2);
        c.lineTo(length, -r1);
        c.arc(length, 0, r1, -Math.PI / 2, Math.PI / 2);
        c.closePath();
    };

    /* ---- The arm, out of the dark ------------------------------------------ */
    const armLink = (length, r0, r1) => {
        const reach = Math.max(r0, r1) + 3;
        return sprite(length + r0 + r1 + 6, reach * 2, r0 + 3, reach, c => {
            shellPath(c, length, r0, r1);
            c.fillStyle = metal(c, 0, -reach, 0, reach);
            c.fill();
            c.save();
            shellPath(c, length, r0, r1);
            c.clip();
            c.fillStyle = 'rgba(0,0,0,.72)';
            c.fillRect(length * .1, -reach * .24, length * .8, reach * .48);
            c.fillStyle = ICE;
            c.globalAlpha = .75;
            c.shadowColor = ICE;
            c.shadowBlur = reach * .5;
            c.fillRect(length * .16, -reach * .022, length * .68, Math.max(1, reach * .044));
            c.restore();
        });
    };
    const joint = radius => sprite(radius * 2 + 16, radius * 2 + 16, radius + 8, radius + 8, c => {
        disc(c, 0, 0, radius, metal(c, -radius, -radius, radius, radius));
        disc(c, 0, 0, radius * .72, '#030406');
        c.shadowColor = ICE;
        c.shadowBlur = radius * .7;
        disc(c, 0, 0, radius * .17, ICE);
        c.shadowBlur = 0;
    });
    const armBase = size => sprite(size * 2.4, size * 1.5, size * 1.2, size * 1.2, c => {
        c.fillStyle = metal(c, -size, 0, size, 0);
        c.beginPath();
        c.moveTo(-size, size * .1);
        c.quadraticCurveTo(-size * .9, -size * .32, -size * .52, -size * .5);
        c.lineTo(size * .52, -size * .5);
        c.quadraticCurveTo(size * .9, -size * .32, size, size * .1);
        c.quadraticCurveTo(0, size * .3, -size, size * .1);
        c.fill();
    });
    const wand = radius => sprite(radius * 3.4 + 14, radius * 2.4 + 14, radius * .6 + 7, radius * 1.2 + 7, c => {
        c.strokeStyle = metal(c, 0, -radius * .2, 0, radius * .2);
        c.lineWidth = radius * .16;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(radius * .95, 0);
        c.stroke();
        const cx = radius * 1.75;
        c.strokeStyle = 'rgba(166,236,255,.8)';
        c.shadowColor = ICE;
        c.shadowBlur = radius * .3;
        c.lineWidth = Math.max(1, radius * .05);
        c.beginPath();
        c.arc(cx, 0, radius, 0, TAU);
        c.stroke();
        c.shadowBlur = 0;
    });
    // The kiwi drive, a long way from anywhere, with one headlamp.
    const kiwiBot = size => sprite(size * 2.8, size * 2, size * 1.4, size * 1.5, c => {
        for (const [x, y, r] of [[0, size * .04, size * .26], [-size * .78, size * .12, size * .32], [size * .78, size * .12, size * .32]]) {
            c.fillStyle = radial(c, x - r * .25, y - r * .3, r * .1, x, y, r, [[0, '#20262d'], [.7, '#0a0d11'], [1, '#020304']]);
            c.beginPath();
            c.ellipse(x, y, r * .78, r, 0, 0, TAU);
            c.fill();
        }
        c.fillStyle = metal(c, 0, -size * .52, 0, size * .32);
        c.beginPath();
        c.ellipse(0, -size * .1, size * 1.02, size * .42, 0, 0, TAU);
        c.fill();
        c.fillStyle = linear(c, 0, -size * .82, 0, -size * .1, [[0, '#14191f'], [1, '#020304']]);
        c.beginPath();
        c.ellipse(0, -size * .34, size * .62, size * .48, 0, Math.PI, 0);
        c.closePath();
        c.fill();
        c.fillStyle = ICE;
        c.shadowColor = ICE;
        c.shadowBlur = size * .3;
        c.beginPath();
        c.ellipse(size * .5, -size * .4, size * .09, size * .06, 0, 0, TAU);
        c.fill();
        c.shadowBlur = 0;
    });
    const headlamp = size => sprite(size * 7, size * 3, 0, size * 1.5, c => {
        c.fillStyle = linear(c, 0, 0, size * 7, 0, [[0, 'rgba(166,236,255,.3)'], [.5, 'rgba(120,210,255,.07)'], [1, 'rgba(120,210,255,0)']]);
        c.beginPath();
        c.moveTo(0, -size * .05);
        c.lineTo(size * 7, -size * 1.3);
        c.lineTo(size * 7, size * 1.3);
        c.lineTo(0, size * .05);
        c.closePath();
        c.fill();
    });
    // A robot of the depths: a pulsing bell of light with one instrument in it.
    const jellyBell = (size, rgb) => sprite(size * 3, size * 3, size * 1.5, size * 1.5, c => {
        c.fillStyle = radial(c, 0, 0, 0, 0, 0, size * 1.5, [[0, `rgba(${rgb},.3)`], [.45, `rgba(${rgb},.08)`], [1, `rgba(${rgb},0)`]]);
        c.fillRect(-size * 1.5, -size * 1.5, size * 3, size * 3);
        c.beginPath();
        c.ellipse(0, 0, size, size * .78, 0, Math.PI, 0);
        c.quadraticCurveTo(0, size * .24, -size, 0);
        c.closePath();
        c.fillStyle = radial(c, 0, -size * .4, size * .05, 0, -size * .2, size, [[0, `rgba(${rgb},.42)`], [.7, `rgba(${rgb},.14)`], [1, `rgba(${rgb},.3)`]]);
        c.fill();
        c.strokeStyle = `rgba(${rgb},.75)`;
        c.lineWidth = 1;
        c.stroke();
        disc(c, 0, -size * .28, size * .1, 'rgba(255,255,255,.92)');
    });

    /* ---- What the bubbles carry -------------------------------------------- */
    const toothedGear = (c, radius, teeth, hole, fill) => {
        c.beginPath();
        for (let i = 0; i < teeth; i++) {
            const a = i / teeth * TAU, w = TAU / teeth;
            for (const [angle, reach] of [[a, .8], [a + w * .14, 1], [a + w * .4, 1], [a + w * .54, .8]]) c.lineTo(Math.cos(angle) * radius * reach, Math.sin(angle) * radius * reach);
            c.arc(0, 0, radius * .8, a + w * .54, a + w, false);
        }
        c.closePath();
        c.moveTo(radius * hole, 0);
        c.arc(0, 0, radius * hole, 0, TAU, true);
        c.fillStyle = fill;
        c.fill('evenodd');
    };
    const steel = (c, r) => metal(c, -r, -r, r, r);
    const spark = (c, x, y, r) => {
        c.shadowColor = ICE;
        c.shadowBlur = r * 1.4;
        disc(c, x, y, r, ICE);
        c.shadowBlur = 0;
    };
    const ICONS = {
        gear: c => {
            toothedGear(c, 60, 12, .32, steel(c, 60));
            spark(c, 0, 0, 7);
        },
        gears: c => {
            c.save();
            c.translate(-22, 16);
            toothedGear(c, 42, 12, .3, steel(c, 42));
            c.restore();
            c.save();
            c.translate(32, -26);
            c.rotate(.14);
            toothedGear(c, 30, 9, .3, steel(c, 30));
            c.restore();
        },
        swerve: c => {
            c.fillStyle = metal(c, -34, 0, -12, 0);
            c.fillRect(-34, -62, 22, 44);
            c.fillStyle = metal(c, 12, 0, 34, 0);
            c.fillRect(12, -62, 22, 44);
            c.fillStyle = metal(c, 0, -22, 0, -10);
            c.fillRect(-46, -20, 92, 10);
            c.fillStyle = '#1c2228';
            c.fillRect(-42, -12, 8, 44);
            c.fillRect(34, -12, 8, 44);
            disc(c, 0, 22, 36, radial(c, -7, 14, 6, 0, 22, 38, [[0, '#262d34'], [.7, '#0c0f13'], [1, '#020304']]));
            c.save();
            c.translate(0, 22);
            toothedGear(c, 21, 10, .3, steel(c, 21));
            c.restore();
            spark(c, 0, 22, 4);
        },
        printer: c => {
            c.strokeStyle = metal(c, -50, -50, 50, 50);
            c.lineWidth = 6;
            c.strokeRect(-42, -48, 84, 96);
            c.fillStyle = metal(c, 0, -24, 0, -16);
            c.fillRect(-42, -24, 84, 8);
            c.fillStyle = '#05070a';
            c.fillRect(-13, -32, 26, 22);
            spark(c, 0, -6, 3);
            c.fillStyle = linear(c, 0, 8, 0, 34, [[0, 'rgba(166,236,255,.7)'], [1, 'rgba(60,120,170,.3)']]);
            c.beginPath();
            c.moveTo(-22, 34);
            c.lineTo(-13, 8);
            c.lineTo(13, 8);
            c.lineTo(22, 34);
            c.closePath();
            c.fill();
            c.fillStyle = metal(c, 0, 34, 0, 41);
            c.fillRect(-36, 34, 72, 7);
        },
        bot: c => {
            c.strokeStyle = '#4b5660';
            c.lineWidth = 3;
            c.beginPath();
            c.moveTo(0, -38);
            c.lineTo(0, -56);
            c.stroke();
            spark(c, 0, -57, 5);
            c.fillStyle = metal(c, 0, -40, 0, 42);
            rounded(c, -46, -40, 92, 80, 26);
            c.fill();
            c.fillStyle = '#020305';
            rounded(c, -34, -24, 68, 42, 16);
            c.fill();
            c.fillStyle = ICE;
            c.shadowColor = ICE;
            c.shadowBlur = 8;
            for (const side of [-1, 1]) {
                c.beginPath();
                c.ellipse(side * 15, -4, 5, 8, 0, 0, TAU);
                c.fill();
            }
            c.shadowBlur = 0;
        },
        board: c => {
            c.fillStyle = linear(c, -44, -44, 44, 44, [[0, '#0b1a22'], [1, '#02070a']]);
            rounded(c, -46, -40, 92, 80, 7);
            c.fill();
            c.strokeStyle = 'rgba(166,236,255,.55)';
            c.lineWidth = 1.6;
            for (let i = 0; i < 6; i++) {
                const y = -30 + i * 12;
                c.beginPath();
                c.moveTo(-40, y);
                c.lineTo(-22, y);
                c.moveTo(40, y);
                c.lineTo(22, y);
                c.stroke();
            }
            c.fillStyle = metal(c, -18, -22, 18, 22);
            c.fillRect(-20, -22, 40, 44);
        },
        power: c => {
            disc(c, 0, 0, 58, steel(c, 58));
            disc(c, 0, 0, 44, radial(c, -14, -18, 4, 0, 0, 46, [[0, '#141a20'], [.6, '#05070a'], [1, '#010203']]));
            c.strokeStyle = ICE;
            c.shadowColor = ICE;
            c.shadowBlur = 10;
            c.lineWidth = 5;
            c.lineCap = 'round';
            c.beginPath();
            c.arc(0, 2, 22, -Math.PI * .3, Math.PI * 1.3);
            c.stroke();
            c.beginPath();
            c.moveTo(0, -26);
            c.lineTo(0, -4);
            c.stroke();
            c.shadowBlur = 0;
        }
    };
    const iconSprite = (name, size) => sprite(size, size, size / 2, size / 2, c => {
        c.scale(size / 150, size / 150);
        ICONS[name](c);
    });

    /* ---- Light in the dark ---------------------------------------------------- */
    // A bubble is seen only by what catches its rim: drawn additively, it is nothing
    // in the middle, a cold line round the edge and one small window of light.
    const bubbleGlass = pixels => {
        const canvas = blank(pixels, pixels);
        const c = canvas.getContext('2d');
        const r = pixels / 2, R = r * .96;
        c.translate(r, r);
        c.fillStyle = radial(c, 0, 0, R * .7, 0, 0, R, [[0, 'rgba(60,150,190,0)'], [.8, 'rgba(70,170,210,.05)'], [.96, 'rgba(110,210,240,.18)'], [1, 'rgba(190,240,255,.3)']]);
        c.beginPath();
        c.arc(0, 0, R, 0, TAU);
        c.fill();
        if (c.createConicGradient) {
            const film = c.createConicGradient(.7, 0, 0);
            [[0, 'rgba(166,236,255,.8)'], [.3, 'rgba(70,200,190,.22)'], [.55, 'rgba(125,103,255,.5)'], [.8, 'rgba(60,120,255,.2)'], [1, 'rgba(166,236,255,.8)']]
                .forEach(([at, color]) => film.addColorStop(at, color));
            c.strokeStyle = film;
        } else c.strokeStyle = 'rgba(166,236,255,.5)';
        c.lineWidth = Math.max(1, R * .018);
        c.beginPath();
        c.arc(0, 0, R * .985, 0, TAU);
        c.stroke();
        c.save();
        c.rotate(-.72);
        c.fillStyle = radial(c, 0, -R * .74, 0, 0, -R * .74, R * .42, [[0, 'rgba(225,248,255,.42)'], [.5, 'rgba(190,235,255,.1)'], [1, 'rgba(190,235,255,0)']]);
        c.beginPath();
        c.ellipse(0, -R * .74, R * .4, R * .1, 0, 0, TAU);
        c.fill();
        c.restore();
        return canvas;
    };
    const glowSprite = (pixels, rgb) => {
        const canvas = blank(pixels, pixels);
        const c = canvas.getContext('2d');
        c.fillStyle = radial(c, pixels / 2, pixels / 2, 0, pixels / 2, pixels / 2, pixels / 2, [[0, 'rgba(255,255,255,.95)'], [.14, `rgba(${rgb},.7)`], [1, `rgba(${rgb},0)`]]);
        c.fillRect(0, 0, pixels, pixels);
        return canvas;
    };
    const softSprite = (pixels, rgb) => {
        const canvas = blank(pixels, pixels);
        const c = canvas.getContext('2d');
        c.fillStyle = radial(c, pixels / 2, pixels / 2, 0, pixels / 2, pixels / 2, pixels / 2, [[0, `rgba(${rgb},.5)`], [.5, `rgba(${rgb},.13)`], [1, `rgba(${rgb},0)`]]);
        c.fillRect(0, 0, pixels, pixels);
        return canvas;
    };

    /* ---- The lens --------------------------------------------------------------
       A body that never moves, an iris that turns toward the cursor and slowly
       opens and closes, and the coloured ghosts on the glass, which slide the other
       way, as reflections do. */
    const lensBody = R => sprite(R * 2.7, R * 2.7, R * 1.35, R * 1.35, c => {
        c.fillStyle = radial(c, 0, 0, R * .92, 0, 0, R * 1.34, [[0, 'rgba(50,120,190,.2)'], [.4, 'rgba(50,110,190,.06)'], [1, 'rgba(50,110,190,0)']]);
        c.fillRect(-R * 1.35, -R * 1.35, R * 2.7, R * 2.7);
        disc(c, 0, 0, R, metal(c, -R, -R, R, R));
        disc(c, 0, 0, R * .955, '#020406');
        // Knurling round the barrel, seen only where the light rakes it.
        for (let i = 0; i < 220; i++) {
            const a = i / 220 * TAU;
            c.strokeStyle = `rgba(190,225,245,${.05 + .3 * Math.pow(Math.max(0, Math.cos(a + 2.3)), 4)})`;
            c.lineWidth = 1;
            c.beginPath();
            c.moveTo(Math.cos(a) * R * .93, Math.sin(a) * R * .93);
            c.lineTo(Math.cos(a) * R * .955, Math.sin(a) * R * .955);
            c.stroke();
        }
        disc(c, 0, 0, R * .92, linear(c, -R, -R, R, R, [[0, '#10171d'], [.5, '#030507'], [1, '#0a0f14']]));
        ring(c, R * .92, 'rgba(170,215,240,.25)', 1);
        // The lettering engraved on its front ring.
        const words = 'ROBOT VISION   1 : 0.95   f = 3812 M   SEARCHING   ';
        const size = R * .046;
        c.font = `600 ${size}px "Barlow Condensed", sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = 'rgba(180,225,245,.5)';
        const step = .056;
        [...words].forEach((letter, i) => {
            c.save();
            c.rotate(-2.2 + i * step);
            c.translate(0, -R * .85);
            c.fillText(letter, 0, 0);
            c.restore();
        });
        disc(c, 0, 0, R * .78, radial(c, -R * .2, -R * .26, R * .04, 0, 0, R * .78, [[0, '#0b151e'], [.55, '#040a10'], [1, '#010203']]));
        ring(c, R * .78, 'rgba(160,205,235,.32)', 1.2);
        ring(c, R * .66, 'rgba(160,205,235,.12)', 1);
    });
    const irisSprite = R => sprite(R * 1.5, R * 1.5, R * .75, R * .75, c => {
        const outer = R * .62, hole = R * .2;
        c.save();
        c.beginPath();
        c.arc(0, 0, outer, 0, TAU);
        c.clip();
        disc(c, 0, 0, outer, radial(c, 0, 0, hole, 0, 0, outer, [[0, '#0c2230'], [.5, '#06121b'], [1, '#02060a']]));
        const blades = 9;
        for (let i = 0; i < blades; i++) {
            const a = i / blades * TAU;
            const at = (radius, angle) => [Math.cos(a + angle) * radius, Math.sin(a + angle) * radius];
            c.beginPath();
            c.moveTo(...at(hole, 0));
            c.lineTo(...at(outer * 1.1, .55));
            c.lineTo(...at(outer * 1.1, 1.5));
            c.lineTo(...at(hole, .74));
            c.closePath();
            c.fillStyle = linear(c, ...at(hole, .2), ...at(outer, 1), [[0, 'rgba(26,58,78,.92)'], [.5, 'rgba(9,22,32,.9)'], [1, 'rgba(3,8,12,.8)']]);
            c.fill();
            c.strokeStyle = 'rgba(150,215,245,.26)';
            c.lineWidth = 1;
            c.stroke();
        }
        c.restore();
        // The opening, ringed with a cold light, and the dark inside it.
        c.fillStyle = radial(c, 0, 0, hole * .86, 0, 0, hole * 1.7, [[0, 'rgba(110,210,255,.42)'], [1, 'rgba(110,210,255,0)']]);
        c.beginPath();
        c.arc(0, 0, hole * 1.7, 0, TAU);
        c.fill();
        disc(c, 0, 0, hole, radial(c, -hole * .2, -hole * .3, 0, 0, 0, hole, [[0, '#0a0d12'], [1, '#000000']]));
    });
    const lensGhosts = R => sprite(R * 2.4, R * 2.4, R * 1.2, R * 1.2, c => {
        const arc = (radius, from, to, rgb, alpha, width) => {
            c.strokeStyle = `rgba(${rgb},${alpha})`;
            c.lineWidth = R * width;
            c.lineCap = 'round';
            c.beginPath();
            c.arc(0, 0, radius, from, to);
            c.stroke();
        };
        arc(R * .7, 3.5, 4.5, '125,103,255', .4, .022);
        arc(R * .62, 3.7, 4.2, '70,220,190', .32, .012);
        arc(R * .73, .3, 1.1, '60,130,255', .3, .018);
        arc(R * .56, .5, .9, '125,103,255', .26, .01);
        c.fillStyle = radial(c, -R * .36, -R * .42, 0, -R * .36, -R * .42, R * .3, [[0, 'rgba(200,240,255,.16)'], [1, 'rgba(200,240,255,0)']]);
        c.fillRect(-R, -R, R * 2, R * 2);
        for (const [x, y, r, rgb, a] of [[.26, .3, .06, '70,220,190', .16], [.42, .46, .03, '125,103,255', .26], [-.2, .36, .025, '110,190,255', .22]]) {
            c.fillStyle = `rgba(${rgb},${a})`;
            c.beginPath();
            c.arc(R * x, R * y, R * r, 0, TAU);
            c.fill();
        }
    });
    const dialSprite = (R, ticks, arcs) => sprite(R * 2 + 6, R * 2 + 6, R + 3, R + 3, c => {
        c.strokeStyle = 'rgba(150,215,245,.32)';
        c.lineWidth = 1;
        for (let i = 0; i < ticks; i++) {
            const a = i / ticks * TAU, long = i % 5 === 0 ? .96 : .98;
            c.beginPath();
            c.moveTo(Math.cos(a) * R * long, Math.sin(a) * R * long);
            c.lineTo(Math.cos(a) * R, Math.sin(a) * R);
            c.stroke();
        }
        c.lineWidth = 1.6;
        c.strokeStyle = 'rgba(166,236,255,.42)';
        for (const [from, to] of arcs) {
            c.beginPath();
            c.arc(0, 0, R * .94, from, to);
            c.stroke();
        }
    });
    const streakSprite = R => sprite(R * 5, R * .3, R * 2.5, R * .15, c => {
        c.fillStyle = linear(c, -R * 2.5, 0, R * 2.5, 0, [[0, 'rgba(70,140,255,0)'], [.5, 'rgba(140,210,255,.55)'], [1, 'rgba(70,140,255,0)']]);
        c.beginPath();
        c.ellipse(0, 0, R * 2.5, R * .012, 0, 0, TAU);
        c.fill();
    });

    /* ---- The water ------------------------------------------------------------- */
    let canvas = null, context = null;
    let W = 0, H = 0, unit = 1, portrait = false;
    let ready = false, preparing = null, shown = false, frame = 0, lastFrame = 0, clock = 0;
    let underProject = false, underProjectTimer = 0;
    let scene = null, reducedMotion = null, rebuilding = 0, resizeTimer = 0;
    let pointerX = 0, pointerY = 0, pointerSeen = false, lookX = 0, lookY = 0, scrolled = 0, sinking = 0;

    const floorCurve = () => {
        const crest = portrait ? .93 : .9;
        return x => H * (crest + .02 * Math.sin(x / W * 2.4 + 3.2) + .011 * Math.sin(x / W * 6.3 + .6) + .004 * Math.sin(x / W * 19 + 1.2));
    };
    // Long tapered sweeps of the sort Metro laid across everything, here only just there.
    const swoosh = (c, x0, y0, cx, cy, x1, y1, thick, color) => {
        c.fillStyle = color;
        c.beginPath();
        c.moveTo(x0, y0);
        c.quadraticCurveTo(cx, cy - thick, x1, y1);
        c.quadraticCurveTo(cx, cy + thick, x0, y0);
        c.fill();
    };
    const paintWater = lens => {
        const sky = blank(W * scale, H * scale);
        const c = sky.getContext('2d', { alpha: false });
        c.scale(scale, scale);
        c.fillStyle = linear(c, 0, 0, 0, H, [[0, '#031019'], [.22, '#020a11'], [.55, '#01050a'], [1, '#000102']]);
        c.fillRect(0, 0, W, H);
        const span = Math.max(W, H);
        for (const [x, y, r, rgb, a] of [[W * .42, -H * .1, span * .55, '30,110,140', .2], [lens.x, lens.y, span * .46, '30,70,170', .16], [W * .08, H * .84, span * .4, '70,40,170', .13]]) {
            c.fillStyle = radial(c, x, y, 0, x, y, r, [[0, `rgba(${rgb},${a})`], [1, `rgba(${rgb},0)`]]);
            c.fillRect(0, 0, W, H);
        }
        c.globalCompositeOperation = 'lighter';
        swoosh(c, -W * .05, H * .68, W * .36, H * .34, W * 1.04, H * .26, H * .007, 'rgba(120,210,255,.1)');
        swoosh(c, -W * .05, H * .74, W * .44, H * .46, W * 1.04, H * .4, H * .004, 'rgba(160,230,255,.1)');
        swoosh(c, W * .1, H * .9, W * .52, H * .62, W * 1.04, H * .62, H * .006, 'rgba(125,103,255,.11)');
        c.globalCompositeOperation = 'source-over';
        // What the instruments are saying, somewhere off to one side.
        const size = Math.max(10, 12.5 * unit);
        c.font = `600 ${size}px "Barlow Condensed", sans-serif`;
        c.fillStyle = 'rgba(170,225,245,.3)';
        c.textBaseline = 'top';
        const hudX = portrait ? W * .06 : W * .5, hudY = portrait ? H * .06 + size * 3 : H * .86;
        ['DEPTH  3812 M', 'LIGHT  0.00', 'SIGNAL  ...'].forEach((text, i) => c.fillText(text, hudX, hudY + i * size * 1.35));
        // The shafts, the vignette and the scan lines go into this one picture rather
        // than over each frame: each would be another blend of the whole screen.
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = .85;
        c.drawImage(paintShafts(), 0, 0, W, H);
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'source-over';
        c.fillStyle = 'rgba(0,0,0,.07)';
        for (let y = 0; y < H; y += 3) c.fillRect(0, y, W, 1);
        c.fillStyle = radial(c, W / 2, H * .46, Math.min(W, H) * .38, W / 2, H * .46, Math.max(W, H) * .74, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.72)']]);
        c.fillRect(0, 0, W, H);
        return sky;
    };
    // Shafts of what little light gets down here.
    const paintShafts = () => {
        const shafts = blank(W, H);
        const c = shafts.getContext('2d');
        const random = seeded(4711);
        c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 9; i++) {
            const x = W * (.05 + random() * .9), lean = (random() - .5) * W * .22, width = W * (.012 + random() * .05), reach = H * (.45 + random() * .4);
            c.fillStyle = linear(c, 0, 0, 0, reach, [[0, `rgba(90,185,215,${.07 + random() * .09})`], [1, 'rgba(90,185,215,0)']]);
            c.beginPath();
            c.moveTo(x - width * .3, -4);
            c.lineTo(x + width * .3, -4);
            c.lineTo(x + lean + width, reach);
            c.lineTo(x + lean - width, reach);
            c.closePath();
            c.fill();
        }
        return shafts;
    };
    const paintFog = (size, rgb, seed) => {
        const fog = blank(size, size * .6);
        const c = fog.getContext('2d');
        const random = seeded(seed);
        c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 26; i++) {
            const x = size * (.12 + random() * .76), y = size * .6 * (.25 + random() * .5), r = size * (.06 + random() * .16);
            c.fillStyle = radial(c, x, y, 0, x, y, r, [[0, `rgba(${rgb},.11)`], [1, `rgba(${rgb},0)`]]);
            c.fillRect(x - r, y - r, r * 2, r * 2);
        }
        return fog;
    };
    // A current: fine strands of light, whole waves across its width so that two
    // side by side join up and it can slide for ever.
    const ribbonTile = (width, height, seed, rgb, strands, amplitude) => {
        const tile = blank(width, height);
        const c = tile.getContext('2d');
        const random = seeded(seed);
        const f1 = 1 + Math.floor(random() * 2), f2 = f1 + 1 + Math.floor(random() * 2);
        const p1 = random() * TAU, p2 = random() * TAU;
        const curve = (x, k) => height * .5
            + amplitude * Math.sin(x / width * TAU * f1 + p1 + k * 1.1)
            + amplitude * .42 * Math.sin(x / width * TAU * f2 + p2 - k * 1.7)
            + (k - .5) * height * .16 * (1 + .6 * Math.sin(x / width * TAU * f1 + p2));
        c.globalCompositeOperation = 'lighter';
        c.lineWidth = 1;
        for (let n = 0; n <= strands; n++) {
            const k = n / strands, edge = Math.sin(k * Math.PI);
            c.strokeStyle = `rgba(${rgb},${.03 + .12 * edge * edge})`;
            c.beginPath();
            for (let x = -4; x <= width + 4; x += 8) c.lineTo(x, curve(x, k));
            c.stroke();
        }
        return { canvas: tile, center: x => curve(x, .5) };
    };
    const paintFloor = curve => {
        const top = H * .78, height = H * .22 + 60;
        const layer = blank((W + 80) * scale, height * scale);
        const c = layer.getContext('2d');
        c.scale(scale, scale);
        c.translate(40, -top);
        c.beginPath();
        c.moveTo(-40, H + 60);
        for (let x = -40; x <= W + 40; x += 6) c.lineTo(x, curve(x));
        c.lineTo(W + 40, H + 60);
        c.closePath();
        c.fillStyle = linear(c, 0, top, 0, H, [[0, '#04090d'], [.5, '#020407'], [1, '#000000']]);
        c.fill();
        c.beginPath();
        for (let x = -40; x <= W + 40; x += 6) c.lineTo(x, curve(x));
        c.strokeStyle = 'rgba(120,200,235,.2)';
        c.lineWidth = 1;
        c.stroke();
        return { layer, top, height };
    };

    const build = async () => {
        W = Math.max(320, document.documentElement.clientWidth);
        H = Math.max(320, window.innerHeight);
        portrait = H > W * 1.1;
        unit = Math.min(W, H * 1.35) / 1000;
        const paced = document.documentElement.dataset.effectsPace;
        // Soft dark light has few edges to keep, and fewer pixels leave the glass in
        // front of it more of the frame.
        scale = Math.min(window.devicePixelRatio || 1, paced ? 1.25 : 1.6);
        const lens = portrait ? { x: W * .68, y: H * .3, r: W * .46 } : { x: W * .78, y: H * .4, r: Math.min(H * .37, W * .23) };

        const sky = paintWater(lens);
        await breathe();
        const fogSize = Math.ceil(Math.max(W, H) * .7);
        const fog = [
            { image: paintFog(fogSize, '50,150,190', 31), x: W * .1, y: H * .5, speed: 4 },
            { image: paintFog(fogSize, '80,60,190', 67), x: W * .6, y: H * .12, speed: -3 },
            { image: paintFog(fogSize, '40,110,170', 97), x: -W * .2, y: H * .7, speed: 2.5 }
        ];
        await breathe();
        const tileWidth = Math.ceil(Math.max(W, 900)), tileHeight = Math.ceil(H * .6);
        const ribbons = [
            { tile: ribbonTile(tileWidth, tileHeight, 71, '90,190,235', 44, H * .07), y: H * -.02, speed: 6, alpha: .7 },
            { tile: ribbonTile(tileWidth, tileHeight, 167, '110,90,240', 30, H * .06), y: H * .32, speed: -4, alpha: .55 }
        ];
        await breathe();
        const curve = floorCurve();
        const floor = paintFloor(curve);
        const lensParts = {
            body: lensBody(lens.r), iris: irisSprite(lens.r), ghosts: lensGhosts(lens.r), streak: streakSprite(lens.r),
            dials: [dialSprite(lens.r * 1.14, 90, [[.3, 1.1], [2.5, 3.2], [4.4, 5.6]]), dialSprite(lens.r * 1.26, 120, [[1.1, 1.5], [3.6, 4.8]])]
        };
        await breathe();

        const armScale = unit * (portrait ? 1.05 : 1.2);
        const armX = portrait ? W * .2 : W * .56;
        const sprites = {
            base: armBase(58 * armScale),
            upper: armLink(150 * armScale, 25 * armScale, 19 * armScale),
            fore: armLink(122 * armScale, 18 * armScale, 13 * armScale),
            shoulder: joint(26 * armScale),
            elbow: joint(19 * armScale),
            wrist: joint(13 * armScale),
            wand: wand(24 * armScale),
            kiwi: kiwiBot(30 * unit * 1.2),
            lamp: headlamp(30 * unit * 1.2),
            bells: [jellyBell(30 * unit, '110,220,255'), jellyBell(22 * unit, '140,120,255'), jellyBell(16 * unit, '90,230,210')]
        };
        const arm = {
            x: armX, y: curve(armX) + 4 * armScale,
            upper: 150 * armScale, fore: 122 * armScale, wandReach: 42 * armScale,
            shoulderHeight: 44 * armScale, shoulder: [0, 0], elbow: [0, 0], wrist: [0, 0], ring: [0, 0], angles: [0, 0, 0]
        };
        await breathe();

        const glassSizes = [96, 192, 384].map(size => ({ size, canvas: bubbleGlass(size) }));
        const icons = {};
        for (const name of Object.keys(ICONS)) icons[name] = iconSprite(name, 180);
        await breathe();
        const speck = glowSprite(32, '130,230,255');
        const speckViolet = glowSprite(32, '150,130,255');
        const torch = softSprite(256, '110,210,245');

        const random = seeded(2718);
        const count = portrait ? 14 : Math.round(clamp(W * H / 42000, 16, 30));
        const iconNames = ['power', 'gear', 'swerve', 'printer', 'bot', 'board', 'gears'];
        const bubbles = [];
        for (let i = 0; i < count; i++) {
            const carrying = i < iconNames.length;
            const radius = (carrying ? 40 + random() * 26 : 6 + Math.pow(random(), 2.2) * 40) * unit * (portrait ? 1.1 : 1.15);
            bubbles.push({
                x: random() * W, y: random() * (H + 200) - 100,
                r: radius, grown: 1, depth: .25 + random() * .75,
                rise: (carrying ? 6 : 10) + random() * 13,
                sway: 6 + random() * 18, swayRate: .14 + random() * .3, phase: random() * TAU,
                icon: carrying ? iconNames[i] : null,
                turn: 0, turnRate: (random() - .5) * .3, pop: 0, drawnX: 0, drawnY: 0
            });
        }
        const specks = [];
        const speckCount = portrait ? 90 : Math.round(clamp(W * H / 7000, 90, 220));
        for (let i = 0; i < speckCount; i++) {
            specks.push({ x: random() * W, y: random() * H, size: (1.4 + random() * random() * 5) * Math.max(.8, unit), drift: 2 + random() * 8, rate: .25 + random() * .9, phase: random() * TAU, violet: random() > .78, depth: .2 + random() * .8 });
        }
        const jellies = [
            { bell: 0, x: portrait ? .24 : .3, y: .3, spanX: .1, spanY: .08, rate: .05, phase: 1, depth: .5, size: 30 * unit },
            { bell: 1, x: portrait ? .8 : .44, y: .68, spanX: .08, spanY: .06, rate: .07, phase: 3, depth: .3, size: 22 * unit },
            { bell: 2, x: portrait ? .5 : .08, y: .55, spanX: .05, spanY: .1, rate: .09, phase: 5, depth: .22, size: 16 * unit }
        ];

        scene = {
            lens, sky, fog, ribbons, floor, curve, lensParts, arm, sprites, glassSizes, icons, speck, speckViolet, torch,
            bubbles, specks, jellies, sparks: [], irisX: 0, irisY: 0, pingAt: 4,
            kiwi: { x: W * (portrait ? .6 : .2), dir: 1, wait: 0 },
            nextWandBubble: 2, nextGlitch: 11
        };
        const first = bubbles.find(b => !b.icon);
        first.grown = 0;
        first.depth = 1;
    };

    /* ---- A frame --------------------------------------------------------------- */
    const put = (s, x, y, angle = 0, flip = 1, size = 1) => {
        const cos = Math.cos(angle) * size, sin = Math.sin(angle) * size;
        context.setTransform(scale * cos * flip, scale * sin * flip, -scale * sin, scale * cos, scale * x, scale * y);
        context.drawImage(s.canvas, -s.anchorX, -s.anchorY, s.width, s.height);
    };
    const glassFor = (s, r) => {
        const wanted = r * 2 * scale;
        for (const glass of s.glassSizes) if (glass.size >= wanted) return glass.canvas;
        return s.glassSizes[s.glassSizes.length - 1].canvas;
    };
    const scrollShift = bubble => scrolled * .16 * bubble.depth;

    const update = dt => {
        const s = scene, t = clock;
        lookX += ((pointerSeen ? pointerX / W - .5 : 0) - lookX) * Math.min(1, dt * 1.6);
        lookY += ((pointerSeen ? pointerY / H - .5 : 0) - lookY) * Math.min(1, dt * 1.6);
        sinking += (Math.min(scrolled * .09, H * .17) - sinking) * Math.min(1, dt * 6);

        // The iris turns toward the cursor, unhurried; with nothing to look at, it
        // looks about for itself.
        const reach = s.lens.r * .085;
        let wantX = Math.sin(t * .17) * reach * .6, wantY = Math.sin(t * .23 + 1) * reach * .5;
        if (pointerSeen) {
            const dx = pointerX - s.lens.x, dy = pointerY - s.lens.y, d = Math.hypot(dx, dy) || 1;
            const pull = Math.min(1, d / (s.lens.r * 1.4));
            wantX = dx / d * reach * pull;
            wantY = dy / d * reach * pull;
        }
        s.irisX += (wantX - s.irisX) * Math.min(1, dt * 1.8);
        s.irisY += (wantY - s.irisY) * Math.min(1, dt * 1.8);

        const arm = s.arm;
        const a0 = -1.34 + .1 * Math.sin(t * .23);
        const a1 = a0 + .86 + .2 * Math.sin(t * .33 + 1.1);
        const a2 = a1 + .42 + .3 * Math.sin(t * .43 + 2.3);
        arm.angles = [a0, a1, a2];
        arm.shoulder = [arm.x, arm.y - arm.shoulderHeight];
        arm.elbow = [arm.shoulder[0] + Math.cos(a0) * arm.upper, arm.shoulder[1] + Math.sin(a0) * arm.upper];
        arm.wrist = [arm.elbow[0] + Math.cos(a1) * arm.fore, arm.elbow[1] + Math.sin(a1) * arm.fore];
        arm.ring = [arm.wrist[0] + Math.cos(a2) * arm.wandReach, arm.wrist[1] + Math.sin(a2) * arm.wandReach];

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
                b.grown = Math.min(1, b.grown + dt / 1.8);
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
            if (pointerSeen) {
                const dx = b.drawnX - pointerX, dy = b.drawnY - pointerY, near = b.r + 54;
                const d2 = dx * dx + dy * dy;
                if (d2 < near * near) {
                    const d = Math.sqrt(d2) || 1, push = (1 - d / near) * 90 * dt;
                    b.x += dx / d * push;
                    b.y += dy / d * push;
                }
            }
            if (b.y + b.r < scrollShift(b) - 60) {
                if (!b.icon && t > s.nextWandBubble) {
                    b.grown = 0;
                    b.depth = 1;
                    b.r = (14 + Math.random() * 26) * unit * 1.15;
                    s.nextWandBubble = t + 3 + Math.random() * 2.4;
                } else fromBelow(b);
            }
        }
        for (let i = s.sparks.length - 1; i >= 0; i--) {
            const d = s.sparks[i];
            d.life -= dt / .5;
            if (d.life <= 0) { s.sparks.splice(i, 1); continue; }
            d.vy -= 60 * dt;
            d.x += d.vx * dt;
            d.y += d.vy * dt;
        }
        for (const speck of s.specks) {
            speck.y -= speck.drift * dt * .6;
            speck.x += Math.sin(t * speck.rate + speck.phase) * speck.drift * dt * .5;
            if (speck.y < -8) {
                speck.y = H + 8;
                speck.x = Math.random() * W;
            }
        }
        const kiwi = s.kiwi;
        if (kiwi.wait > 0) kiwi.wait -= dt;
        else {
            kiwi.x += kiwi.dir * 18 * unit * dt;
            const low = W * (portrait ? .36 : .06), high = W * (portrait ? .94 : .44);
            if (kiwi.x > high || kiwi.x < low) {
                kiwi.dir = kiwi.x > high ? -1 : 1;
                kiwi.wait = 3 + Math.random() * 4;
            }
        }
    };

    const draw = () => {
        const s = scene, c = context, t = clock;
        const lookAt = depth => [-lookX * 26 * depth, -lookY * 14 * depth];
        const flat = () => c.setTransform(scale, 0, 0, scale, 0, 0);
        flat();
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'source-over';
        c.drawImage(s.sky, 0, 0, W, H);

        c.globalCompositeOperation = 'lighter';
        for (const fog of s.fog) {
            const width = fog.image.width, span = W + width;
            const x = ((fog.x + t * fog.speed * unit) % span + span) % span - width;
            c.globalAlpha = .85;
            c.drawImage(fog.image, x, fog.y - sinking * .2, width, fog.image.height);
        }
        s.ribbons.forEach((ribbon, i) => {
            const tile = ribbon.tile.canvas;
            const [ox, oy] = lookAt(.1 + i * .08);
            const shift = ((t * ribbon.speed * unit) % tile.width + tile.width) % tile.width;
            c.globalAlpha = ribbon.alpha;
            c.drawImage(tile, -shift + ox, ribbon.y + oy, tile.width, tile.height);
            c.drawImage(tile, tile.width - shift + ox, ribbon.y + oy, tile.width, tile.height);
        });
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'source-over';

        // The lens.
        const L = s.lens, P = s.lensParts;
        const [lx, ly] = lookAt(.3);
        const lensX = L.x + lx, lensY = L.y + ly - sinking * .12;
        put(P.body, lensX, lensY);
        // Opening and closing, as slowly as breath.
        put(P.iris, lensX + s.irisX, lensY + s.irisY, t * .012, 1, 1 + .055 * Math.sin(t * .31));
        // Deep in the dark of it, one coal.
        flat();
        c.globalCompositeOperation = 'lighter';
        const coal = .55 + .3 * Math.sin(t * .47) + .1 * Math.sin(t * 2.3);
        const coalSize = L.r * .13;
        c.globalAlpha = coal;
        c.fillStyle = radial(c, lensX + s.irisX, lensY + s.irisY, 0, lensX + s.irisX, lensY + s.irisY, coalSize, [[0, 'rgba(255,190,150,.95)'], [.12, 'rgba(255,70,40,.75)'], [1, 'rgba(255,30,20,0)']]);
        c.fillRect(lensX + s.irisX - coalSize, lensY + s.irisY - coalSize, coalSize * 2, coalSize * 2);
        c.globalAlpha = .85;
        put(P.ghosts, lensX - s.irisX * 1.3, lensY - s.irisY * 1.3);
        c.globalAlpha = .55;
        put(P.dials[0], lensX, lensY, t * .05);
        put(P.dials[1], lensX, lensY, -t * .03);
        c.globalAlpha = .35 + .2 * Math.sin(t * .31);
        put(P.streak, lensX + s.irisX, lensY + s.irisY);
        c.globalAlpha = 1;

        // A ping, now and again, going out from it into nothing.
        flat();
        const pingAge = ((t - s.pingAt) % 11 + 11) % 11;
        if (t > s.pingAt && pingAge < 5) {
            const k = pingAge / 5;
            c.strokeStyle = `rgba(150,225,250,${(1 - k) * (1 - k) * .3})`;
            c.lineWidth = 1.2;
            c.beginPath();
            c.arc(lensX, lensY, L.r * (1 + k * 2.4), 0, TAU);
            c.stroke();
        }

        // The small lights that drift about out here.
        const jelly = (j, far) => {
            if ((j.depth < .4) !== far) return;
            const [jx, jy] = lookAt(j.depth);
            const x = W * (j.x + j.spanX * Math.sin(t * j.rate + j.phase)) + jx;
            const y = H * (j.y + j.spanY * Math.sin(t * j.rate * 1.7 + j.phase)) + jy - sinking * j.depth * .3;
            const beat = Math.sin(t * .9 + j.phase);
            const squash = 1 + beat * .09;
            c.globalCompositeOperation = 'lighter';
            put(s.sprites.bells[j.bell], x, y, Math.sin(t * .2 + j.phase) * .1, 1, squash);
            flat();
            c.strokeStyle = 'rgba(150,225,250,.2)';
            c.lineWidth = 1;
            for (let n = 0; n < 6; n++) {
                const spread = (n - 2.5) / 2.5;
                c.beginPath();
                c.moveTo(x + spread * j.size * .78, y + j.size * .05);
                for (let k = 1; k <= 7; k++) {
                    c.lineTo(x + spread * j.size * (.78 - k * .03) + Math.sin(t * .8 + k * .7 + n) * k * j.size * .045, y + k * j.size * .34 * (1.08 - beat * .08));
                }
                c.stroke();
            }
            c.globalCompositeOperation = 'source-over';
        };
        for (const j of s.jellies) jelly(j, true);

        flat();
        c.globalCompositeOperation = 'source-over';
        const [nx, ny] = lookAt(.62);
        const floorShift = sinking;
        c.drawImage(s.floor.layer, nx - 40, s.floor.top + ny + floorShift, W + 80, s.floor.height);

        // The kiwi, with its lamp, and the arm, on the bottom.
        const kiwi = s.kiwi;
        const slope = (s.curve(kiwi.x + 6) - s.curve(kiwi.x - 6)) / 12;
        const roll = kiwi.wait > 0 ? 0 : Math.sin(t * 7) * .4;
        const kiwiY = s.curve(kiwi.x) + 6 * unit + ny + floorShift + roll;
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = .8 + .2 * Math.sin(t * 1.3);
        put(s.sprites.lamp, kiwi.x + nx + kiwi.dir * 16 * unit, kiwiY - 12 * unit, kiwi.dir > 0 ? -.05 : Math.PI + .05);
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'source-over';
        put(s.sprites.kiwi, kiwi.x + nx, kiwiY, Math.atan(slope), kiwi.dir);

        const arm = s.arm, ax = nx, ay = ny + floorShift;
        put(s.sprites.base, arm.x + ax, arm.y + ay);
        put(s.sprites.upper, arm.shoulder[0] + ax, arm.shoulder[1] + ay, arm.angles[0]);
        put(s.sprites.shoulder, arm.shoulder[0] + ax, arm.shoulder[1] + ay);
        put(s.sprites.wand, arm.wrist[0] + ax, arm.wrist[1] + ay, arm.angles[2]);
        put(s.sprites.fore, arm.elbow[0] + ax, arm.elbow[1] + ay, arm.angles[1]);
        put(s.sprites.elbow, arm.elbow[0] + ax, arm.elbow[1] + ay);
        put(s.sprites.wrist, arm.wrist[0] + ax, arm.wrist[1] + ay);

        for (const j of s.jellies) jelly(j, false);

        // Bubbles, back to front.
        for (const b of s.bubbles) {
            const [bx, by] = lookAt(b.depth);
            const x = b.x + bx, y = b.y + by - scrollShift(b);
            b.drawnX = x;
            b.drawnY = y;
            if (b.pop) {
                flat();
                c.globalCompositeOperation = 'lighter';
                c.globalAlpha = (1 - b.pop) * .7;
                c.strokeStyle = ICE;
                c.lineWidth = Math.max(1, (1 - b.pop) * 2);
                c.beginPath();
                c.arc(x, y, b.r * (1 + b.pop * .42), 0, TAU);
                c.stroke();
                c.globalAlpha = 1;
                c.globalCompositeOperation = 'source-over';
                continue;
            }
            const r = b.r * (b.grown < 1 ? .2 + .8 * b.grown : 1);
            if (y + r < -6 || y - r > H + 6 || x + r < -6 || x - r > W + 6) continue;
            const wobble = 1 + Math.sin(t * 1.1 + b.phase) * .012;
            if (b.icon) {
                const icon = s.icons[b.icon];
                const turn = b.icon === 'gear' || b.icon === 'gears' ? b.turn * 3 : Math.sin(t * .35 + b.phase) * .22;
                const size = r * 1.32 / icon.width;
                const cos = Math.cos(turn) * size, sin = Math.sin(turn) * size;
                c.setTransform(scale * cos, scale * sin, -scale * sin, scale * cos, scale * x, scale * y);
                c.globalAlpha = .82;
                c.drawImage(icon.canvas, -icon.anchorX, -icon.anchorY, icon.width, icon.height);
                c.globalAlpha = 1;
            }
            flat();
            const rx = r * wobble, ry = r / wobble;
            c.globalCompositeOperation = 'lighter';
            c.drawImage(glassFor(s, r), x - rx, y - ry, rx * 2, ry * 2);
            c.globalCompositeOperation = 'source-over';
        }

        // The specks, which wake near the cursor, and its small circle of light.
        flat();
        c.globalCompositeOperation = 'lighter';
        const lit = 150 * Math.max(.8, unit);
        for (const speck of s.specks) {
            const [sx, sy] = lookAt(speck.depth);
            const x = speck.x + sx, y = speck.y + sy;
            let glow = .22 + .3 * Math.max(0, Math.sin(t * speck.rate * 1.4 + speck.phase));
            let size = speck.size;
            if (pointerSeen) {
                const near = 1 - Math.hypot(x - pointerX, y - pointerY) / lit;
                if (near > 0) {
                    glow += near * .75;
                    size *= 1 + near * 1.1;
                }
            }
            c.globalAlpha = Math.min(1, glow);
            c.drawImage(speck.violet ? s.speckViolet : s.speck, x - size, y - size, size * 2, size * 2);
        }
        if (pointerSeen) {
            const size = 240 * Math.max(.8, unit);
            c.globalAlpha = .34;
            c.drawImage(s.torch, pointerX - size, pointerY - size, size * 2, size * 2);
        }
        c.fillStyle = ICE;
        for (const d of s.sparks) {
            c.globalAlpha = d.life * .85;
            c.fillRect(d.x - d.r, d.y - d.r, d.r * 2, d.r * 2);
        }
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'source-over';

        // Very rarely, the signal slips.
        if (t > s.nextGlitch) {
            c.setTransform(1, 0, 0, 1, 0, 0);
            const height = canvas.height, width = canvas.width;
            for (let i = 0; i < 2; i++) {
                const y = Math.floor(Math.random() * height * .8), h = Math.floor(height * (.006 + Math.random() * .016));
                c.drawImage(canvas, 0, y, width, h, (Math.random() - .5) * 26 * scale, y, width, h);
            }
            if (t > s.nextGlitch + .07) s.nextGlitch = t + 14 + Math.random() * 18;
        }
    };

    /* ---- Running it ------------------------------------------------------------- */
    const stopLoop = () => {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
    };
    const tick = now => {
        frame = requestAnimationFrame(tick);
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
                const a = Math.random() * TAU, speed = 30 + Math.random() * 100;
                s.sparks.push({ x: b.drawnX + Math.cos(a) * b.r * .9, y: b.drawnY + Math.sin(a) * b.r * .9, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: .7 + Math.random() * 1.1, life: 1 });
            }
            return;
        }
    };
    const sizeCanvas = () => {
        canvas.width = Math.ceil(W * scale);
        canvas.height = Math.ceil(H * scale);
    };
    const onResize = () => {
        clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(rebuild, 260);
    };
    const rebuild = async () => {
        if (!shown) return;
        const width = document.documentElement.clientWidth, height = window.innerHeight;
        if (width === W && Math.abs(height - H) < H * .16) return;
        const mine = ++rebuilding;
        stopLoop();
        await build();
        if (mine !== rebuilding || !shown) return;
        sizeCanvas();
        update(1 / 60);
        draw();
        startLoop();
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
            canvas.className = 'ego-scene';
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
        update(1 / 60);
        draw();
        startLoop();
    };
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
        if (canvas) {
            canvas.width = canvas.height = 0;
            canvas.remove();
            canvas = null;
            context = null;
        }
    };

    window.portfolioEgo = { prepare, show, release };
})();
