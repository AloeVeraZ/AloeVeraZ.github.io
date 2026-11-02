/* The pastel desktop: Medium FX's hidden second backdrop.

   Five quick presses on the effects slider's Medium stop swap the still starry sky
   for a pink desktop of about 1999, and five more swap it back (the slider code in
   portfolio.js). It holds to everything Medium promises. What only sits there is
   drawn once, in a worker, into one picture on the lattice's own fixed layer, where
   the still sky goes. What can be used is a few plain elements on one fixed layer
   behind the page: nothing on them runs unless someone is using it, so at rest the
   page still asks for no frames at all, and a scroll draws none of it again. This
   file is not fetched until someone asks, and leaving Medium hands all of it back.

   It is a desktop for this portfolio. The infill window's slider takes a part from
   1% to solid. The print job takes that part and prints it, taking longer and using
   more plastic the denser it is. The robot pulls a face when it is poked. Holding
   the torque window winds it up. Windows drag by their title bars and grow. Close
   one and it comes back on its own, a little further along the desk; minimise one
   and it waits on the bar at the bottom. */
(function () {
    'use strict';

    /* The type: a five-by-seven system font, in hex rows, which needs no font file
       and reads the same on every machine. */
    const FONT = {
        A: '0E11111F111111', B: '1E11111E11111E', C: '0E11101010110E', D: '1E11111111111E', E: '1F10101E10101F', F: '1F10101E101010',
        G: '0E11101711110F', H: '1111111F111111', I: '0E04040404040E', J: '0702020202120C', K: '11121418141211', L: '1010101010101F',
        M: '111B1515111111', N: '11191513111111', O: '0E11111111110E', P: '1E11111E101010', Q: '0E11111115120D', R: '1E11111E141211',
        S: '0F10100E01011E', T: '1F040404040404', U: '1111111111110E', V: '11111111110A04', W: '1111111515150A', X: '11110A040A1111',
        Y: '11110A04040404', Z: '1F01020408101F', 0: '0E11131519110E', 1: '040C040404040E', 2: '0E11010204081F', 3: '1F02040201110E',
        4: '02060A121F0202', 5: '1F101E0101110E', 6: '0608101E11110E', 7: '1F010204080808', 8: '0E11110E11110E', 9: '0E11110F01020C',
        '.': '00000000000C0C', _: '0000000000001F', '!': '04040404040004', '%': '18190204081303', '-': '0000001F000000', ':': '000C0C000C0C00',
        '+': '0004041F040400', '?': '0E110102040004', '/': '01010204081010'
    };

    /* Stands alone, with FONT, as its source text is also the worker's: everything
       on the desk that nobody can use. CSS pixels, on a context already scaled. */
    function paintVapor(c, W, H) {
        const TAU = Math.PI * 2;
        const INK = '#0c0a14', PINK = '#f8b6ee', TEAL = '#5ff0d8', PURPLE = '#b18be8', WHITE = '#ffffff', GREY = '#b4b4bd';
        const ratio = c.getTransform ? c.getTransform().a : 1;
        const portrait = H > W * 1.1;
        const u = Math.min(W, H * 1.6) / 1000;
        const line = Math.max(1.5, 2.2 * u);
        let s = 90210;
        const random = () => {
            s = (s + 0x6D2B79F5) | 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        const crisp = value => Math.max(1, Math.round(value * ratio)) / ratio;
        const box = (x, y, w, h, fill) => {
            c.fillStyle = fill;
            c.fillRect(x, y, w, h);
            c.strokeStyle = INK;
            c.lineWidth = line;
            c.strokeRect(x, y, w, h);
        };
        const disc = (x, y, r, fill) => {
            c.fillStyle = fill;
            c.beginPath();
            c.arc(x, y, r, 0, TAU);
            c.fill();
        };
        const pixelText = (text, x, y, cell, color) => {
            c.fillStyle = color;
            for (let i = 0; i < text.length; i++) {
                const glyph = FONT[text[i]];
                if (!glyph) continue;
                for (let row = 0; row < 7; row++) {
                    const bits = parseInt(glyph.substr(row * 2, 2), 16);
                    for (let col = 0; col < 5; col++) {
                        if (bits & (16 >> col)) c.fillRect(x + (i * 6 + col) * cell, y + row * cell, cell, cell);
                    }
                }
            }
        };
        const bitmap = (rows, x, y, cell, fill) => {
            rows.forEach((row, r) => {
                const first = row.indexOf('#'), last = row.lastIndexOf('#');
                if (first < 0) return;
                if (fill) {
                    c.fillStyle = fill;
                    c.fillRect(x + first * cell, y + r * cell, (last - first + 1) * cell, cell);
                }
                c.fillStyle = INK;
                for (let i = first; i <= last; i++) {
                    if (row[i] === '#') c.fillRect(x + i * cell, y + r * cell, cell, cell);
                }
            });
        };
        // A disc that comes apart into squares at one edge.
        const dissolving = (cx, cy, r, fill, cell, from) => {
            c.save();
            c.beginPath();
            c.rect(cx - r - 2, cy - r - 2, r * 2 + 4, r + from * r + 2);
            c.clip();
            disc(cx, cy, r, fill);
            c.restore();
            c.fillStyle = fill;
            for (let yy = cy + from * r; yy < cy + r * 1.28; yy += cell) {
                const depth = (yy - (cy + from * r)) / (r * (1.28 - from));
                const half = Math.sqrt(Math.max(0, r * r - Math.min(r * .98, yy - cy) ** 2));
                for (let xx = cx - half; xx < cx + half; xx += cell) {
                    if (random() > depth * 1.05) c.fillRect(xx, yy, cell * .96, cell * .96);
                }
            }
        };
        const HAND = [
            '.....##......', '....#..#.....', '....#..#.....', '....#..#.....', '....#..###...', '....#..#..##.', '.##.#..#..#.#', '#..##..#..#.#',
            '#...#.......#', '.#..........#', '..#.........#', '..#........#.', '...#.......#.', '...#......#..', '....#######..'
        ];
        const ARROW = ['#.......', '##......', '#.#.....', '#..#....', '#...#...', '#....#..', '#..####.', '#.#.#...', '##..#...', '.....#..'];
        const chevrons = (x, y, size, count) => {
            c.fillStyle = TEAL;
            for (let i = 0; i < count; i++) {
                const left = x + i * size * .78;
                c.beginPath();
                c.moveTo(left, y);
                c.lineTo(left + size * .32, y);
                c.lineTo(left + size * .72, y + size * .5);
                c.lineTo(left + size * .32, y + size);
                c.lineTo(left, y + size);
                c.lineTo(left + size * .4, y + size * .5);
                c.closePath();
                c.fill();
            }
        };
        const stripes = (x, y, w, bar, gap, count) => {
            c.fillStyle = PURPLE;
            for (let i = 0; i < count; i++) c.fillRect(x, y + i * (bar + gap), w, bar);
        };
        const dotGrid = (x, y, cols, rows, gap) => {
            c.strokeStyle = WHITE;
            c.lineWidth = Math.max(1, 1.3 * u);
            for (let j = 0; j < rows; j++) {
                for (let i = 0; i < cols; i++) {
                    c.beginPath();
                    c.arc(x + i * gap, y + j * gap, gap * .3, 0, TAU);
                    c.stroke();
                }
            }
        };
        const hub = (x, y, w, depth, tall) => {
            const skew = depth * .55;
            c.lineWidth = line;
            c.strokeStyle = INK;
            c.lineJoin = 'round';
            c.fillStyle = PURPLE;
            c.beginPath();
            c.moveTo(x + skew, y);
            c.lineTo(x + w, y + depth * .3);
            c.lineTo(x + w - skew, y + depth);
            c.lineTo(x, y + depth * .7);
            c.closePath();
            c.fill();
            c.stroke();
            c.fillStyle = TEAL;
            c.beginPath();
            c.moveTo(x, y + depth * .7);
            c.lineTo(x, y + depth * .7 + tall);
            c.lineTo(x + w * .22, y + depth * .72 + tall * 1.28);
            c.lineTo(x + w - skew, y + depth + tall);
            c.lineTo(x + w - skew, y + depth);
            c.closePath();
            c.fill();
            c.stroke();
            c.fillStyle = WHITE;
            c.beginPath();
            c.moveTo(x + w * .22, y + depth * .78);
            c.lineTo(x + w - skew, y + depth);
            c.lineTo(x + w - skew, y + depth + tall);
            c.lineTo(x + w * .22, y + depth * .72 + tall * 1.28);
            c.closePath();
            c.fill();
            c.stroke();
            const left = x + w * .27, across = (w - skew - w * .27) / 4;
            c.fillStyle = INK;
            for (let i = 0; i < 4; i++) c.fillRect(left + i * across + across * .12, y + depth * .86 + tall * .25 + i * depth * .05, across * .62, tall * .52);
        };
        const gearIcon = (x, y, size) => {
            box(x, y, size, size, WHITE);
            c.fillStyle = PINK;
            c.fillRect(x + size * .14, y + size * .14, size * .72, size * .72);
            const cx = x + size / 2, cy = y + size / 2, r = size * .26;
            c.fillStyle = WHITE;
            for (let i = 0; i < 8; i++) {
                c.save();
                c.translate(cx, cy);
                c.rotate(i / 8 * TAU);
                c.fillRect(-r * .22, -r * 1.3, r * .44, r * .7);
                c.restore();
            }
            disc(cx, cy, r, WHITE);
            disc(cx, cy, r * .42, PINK);
            bitmap(ARROW, x + size * .55, y + size * .52, Math.max(1, size * .034), WHITE);
        };
        const scrollBar = (y, height) => {
            box(-2, y, W + 4, height, WHITE);
            box(0, y, height * 1.6, height, WHITE);
            box(W - height * 1.6, y, height * 1.6, height, WHITE);
            c.fillStyle = GREY;
            c.fillRect(height * 2, y + height * .24, W - height * 4, height * .52);
            c.fillStyle = INK;
            const tri = (x, dir) => {
                c.beginPath();
                c.moveTo(x, y + height * .25);
                c.lineTo(x, y + height * .75);
                c.lineTo(x + dir * height * .34, y + height * .5);
                c.closePath();
                c.fill();
            };
            tri(height * .98, -1);
            tri(W - height * .98, 1);
        };
        const powerBar = (x, y, w, height) => {
            const gradient = c.createLinearGradient(x, 0, x + w, 0);
            gradient.addColorStop(0, TEAL);
            gradient.addColorStop(1, PURPLE);
            c.fillStyle = gradient;
            c.fillRect(x, y, w, height);
        };
        // Down the side, in whatever the machine sets Japanese in: making things.
        const kana = (x, y, size) => {
            const word = 'ものづくり';
            c.font = `500 ${size}px "Yu Gothic", "Hiragino Sans", "Noto Sans CJK JP", "Noto Sans JP", Meiryo, sans-serif`;
            if (c.measureText('も').width < size * .7) return;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillStyle = WHITE;
            for (let i = 0; i < word.length; i++) c.fillText(word[i], x, y + i * size * 1.12);
        };
        const sweep = (x, r) => {
            const g = c.createLinearGradient(x - r, 0, x + r, 0);
            g.addColorStop(0, TEAL);
            g.addColorStop(.55, '#8ec5e8');
            g.addColorStop(1, PURPLE);
            return g;
        };

        const groundBar = Math.max(16, 24 * u);
        if (!portrait) {
            dissolving(W * .68, H * .74, H * .2, sweep(W * .68, H * .2), Math.max(8, 15 * u), .25);
            dissolving(W * .285, -H * .02, H * .105, INK, Math.max(7, 13 * u), .34);
            chevrons(W * .63, H * .022, Math.max(16, 27 * u), 7);
            dotGrid(W * .018, H * .73, 8, 4, Math.max(13, 21 * u));
            stripes(0, H * .885, W * .13, Math.max(6, 10 * u), Math.max(5, 8 * u), 3);
            kana(W * .582, H * .14, Math.max(20, 38 * u));
            bitmap(HAND, W * .765, H * .63, crisp(Math.max(2.4, 4 * u)), WHITE);
            gearIcon(W * .62, H * .815, Math.max(44, 72 * u));
            hub(W * .685, H * .9 - groundBar, W * .085, H * .035, H * .03);
            pixelText('LOADING...', W * .636, H * .085, crisp(Math.max(1.4, 2.2 * u)), INK);
            powerBar(0, H - groundBar * 2.2, W * .46, groundBar * .85);
            const cell = crisp(Math.max(1.6, 2.4 * u));
            pixelText('FULL POWER', W * .47, H - groundBar * 2.2 + (groundBar * .85 - 7 * cell) / 2, cell, INK);
        } else {
            dissolving(W * .78, H * .79, W * .3, sweep(W * .78, W * .3), Math.max(7, 12 * u), .2);
            dissolving(W * .6, -H * .012, W * .13, INK, Math.max(6, 10 * u), .3);
            chevrons(W * .06, H * .075, Math.max(11, 18 * u), 6);
            dotGrid(W * .05, H * .36, 5, 3, Math.max(12, 18 * u));
            stripes(0, H * .87, W * .22, Math.max(5, 8 * u), Math.max(4, 6 * u), 3);
            kana(W * .93, H * .68, Math.max(16, 24 * u));
        }
        scrollBar(H - groundBar - 1, groundBar);
    }

    /* A labyrinth, the way a skin or a print's infill grows one: each cell pushed
       toward what is near it and away from what is a little further off, a few dozen
       times. The density slider decides where to cut it. */
    function growField(gw, gh) {
        let s = 3101;
        const random = () => {
            s = (s + 0x6D2B79F5) | 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        const field = new Float32Array(gw * gh);
        for (let i = 0; i < field.length; i++) field[i] = random() * 2 - 1;
        const near = new Float32Array(gw * gh), far = new Float32Array(gw * gh);
        const sums = new Float32Array((gw + 1) * (gh + 1));
        const blur = (out, r) => {
            for (let j = 0; j < gh; j++) {
                let row = 0;
                for (let i = 0; i < gw; i++) {
                    row += field[j * gw + i];
                    sums[(j + 1) * (gw + 1) + i + 1] = sums[j * (gw + 1) + i + 1] + row;
                }
            }
            for (let j = 0; j < gh; j++) {
                const y0 = Math.max(0, j - r), y1 = Math.min(gh, j + r + 1);
                for (let i = 0; i < gw; i++) {
                    const x0 = Math.max(0, i - r), x1 = Math.min(gw, i + r + 1);
                    out[j * gw + i] = (sums[y1 * (gw + 1) + x1] - sums[y0 * (gw + 1) + x1] - sums[y1 * (gw + 1) + x0] + sums[y0 * (gw + 1) + x0]) / ((x1 - x0) * (y1 - y0));
                }
            }
        };
        for (let turn = 0; turn < 26; turn++) {
            blur(near, 2);
            blur(far, 4);
            let peak = 0;
            for (let i = 0; i < field.length; i++) {
                field[i] += near[i] > far[i] ? .09 : -.09;
                if (Math.abs(field[i]) > peak) peak = Math.abs(field[i]);
            }
            for (let i = 0; i < field.length; i++) field[i] /= peak;
        }
        // Softened, so that its heights say how far each cell is from a line where it
        // crosses zero. Those lines are the walls the density slider draws.
        for (let i = 0; i < field.length; i++) field[i] = field[i] > 0 ? 1 : -1;
        for (let pass = 0; pass < 2; pass++) {
            blur(near, 2);
            field.set(near);
        }
        return field;
    }

    const FIELD_W = 200, FIELD_H = 340;
    const WORKER = `
        const FONT = ${JSON.stringify(FONT)};
        const paint = ${paintVapor};
        const grow = ${growField};
        onmessage = async ({ data: { width, height, ratio, fieldW, fieldH } }) => {
            try {
                const canvas = new OffscreenCanvas(Math.round(width * ratio), Math.round(height * ratio));
                const context = canvas.getContext('2d');
                context.setTransform(ratio, 0, 0, ratio, 0, 0);
                paint(context, width, height);
                const blob = await canvas.convertToBlob({ type: 'image/png' });
                const field = grow(fieldW, fieldH);
                postMessage({ blob, field }, [field.buffer]);
            } catch (error) {
                postMessage(null);
            }
        };`;

    const layer = document.querySelector('.background-grid');
    let url = '', drawn = '', job = 0, shown = false, resizeTimer = 0;
    let field = null, cuts = null;
    const shape = () => `${window.innerWidth}x${Math.round(window.innerHeight / 40)}@${Math.min(window.devicePixelRatio || 1, 2)}`;

    // A browser with no canvas for its workers to draw on does it here, once.
    const paintHere = (width, height, ratio) => new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        const context = canvas.getContext('2d');
        if (!context) {
            reject(new Error('no canvas'));
            return;
        }
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        paintVapor(context, width, height);
        canvas.toBlob(blob => (blob ? resolve({ blob, field: growField(FIELD_W, FIELD_H) }) : reject(new Error('no picture'))), 'image/png');
    });
    const paintAway = (width, height, ratio) => new Promise((resolve, reject) => {
        if (!('OffscreenCanvas' in window) || !('Worker' in window)) {
            reject(new Error('no worker'));
            return;
        }
        const source = URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' }));
        const worker = new Worker(source);
        const finish = () => {
            worker.terminate();
            URL.revokeObjectURL(source);
        };
        worker.onerror = error => {
            finish();
            reject(error);
        };
        worker.onmessage = ({ data }) => {
            finish();
            if (data) resolve(data);
            else reject(new Error('no picture'));
        };
        worker.postMessage({ width, height, ratio, fieldW: FIELD_W, fieldH: FIELD_H });
    });
    const paint = async () => {
        const ticket = ++job;
        const width = window.innerWidth, height = window.innerHeight;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const taken = shape();
        const made = await paintAway(width, height, ratio).catch(() => paintHere(width, height, ratio));
        if (ticket !== job) return;
        const next = URL.createObjectURL(made.blob);
        const picture = new Image();
        picture.src = next;
        await picture.decode().catch(() => {});
        if (ticket !== job) {
            URL.revokeObjectURL(next);
            return;
        }
        const previous = url;
        url = next;
        drawn = taken;
        field = made.field;
        cuts = null;
        if (shown) {
            layer?.style.setProperty('--vapor-sky', `url("${url}")`);
            desk?.redraw();
        }
        if (previous) window.setTimeout(() => URL.revokeObjectURL(previous), 1000);
    };
    const onResize = () => {
        clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
            if (!shown) return;
            desk?.redraw();
            if (shape() !== drawn) paint();
        }, 250);
    };

    /* ---- The desk -------------------------------------------------------------
       Everything here happens because someone did something, and stops when they
       stop. No loop runs unless a hand is on the torque window or it is still
       winding down. */
    let desk = null;

    const pixelCanvas = (text, className = 'vapor-type') => {
        const canvas = document.createElement('canvas');
        canvas.className = className;
        drawType(canvas, text);
        return canvas;
    };
    const drawType = (canvas, text) => {
        canvas.width = Math.max(1, text.length * 6 - 1);
        canvas.height = 7;
        canvas.style.setProperty('--cols', canvas.width);
        const c = canvas.getContext('2d');
        c.fillStyle = '#0c0a14';
        for (let i = 0; i < text.length; i++) {
            const glyph = FONT[text[i]];
            if (!glyph) continue;
            for (let row = 0; row < 7; row++) {
                const bits = parseInt(glyph.substr(row * 2, 2), 16);
                for (let col = 0; col < 5; col++) {
                    if (bits & (16 >> col)) c.fillRect(i * 6 + col, row, 1, 1);
                }
            }
        }
    };
    const ROBOT = [
        '.........#.........', '........###........', '....###########....', '...#...........#...', '..#.............#..',
        '.##.............##.', '.##.............##.', '.##.............##.', '..#.............#..', '..#.............#..',
        '..#.............#..', '..#.............#..', '...#...........#...', '....###########....', '......#.....#......', '....#####.#####....'
    ];
    const FACES = [
        { title: 'ALWAYS BUILD', left: ['###', '###', '###'], right: ['###', '###', '###'], mouth: ['#.....#', '.#...#.', '..###..'] },
        { title: 'ALWAYS ITERATE', left: ['###', '###', '###'], right: ['...', '###', '...'], mouth: ['#.....#', '.#...#.', '..###..'] },
        { title: 'TOLERANCES?!', left: ['###', '#.#', '###'], right: ['###', '#.#', '###'], mouth: ['..###..', '..#.#..', '..###..'] },
        { title: 'NICE PRINT', left: ['#.#', '###', '.#.'], right: ['#.#', '###', '.#.'], mouth: ['#.....#', '.#...#.', '..###..'] },
        { title: 'NO MORE M3S', left: ['#.#', '.#.', '#.#'], right: ['#.#', '.#.', '#.#'], mouth: ['.......', '..###..', '.#...#.'] }
    ];
    const HEART = ['.##...##.', '#..#.#..#', '#...#...#', '#.......#', '.#.....#.', '..#...#..', '...#.#...', '....#....'];
    const COLOURS = { teal: '#5ff0d8', yellow: '#f5ea5a', purple: '#b18be8' };

    const buildDesk = () => {
        const root = document.createElement('div');
        root.className = 'vapor-desk';
        const timers = new Set();
        const later = (fn, ms) => {
            const id = window.setTimeout(() => {
                timers.delete(id);
                fn();
            }, ms);
            timers.add(id);
            return id;
        };
        let top = 10;
        const raise = win => { win.style.zIndex = ++top; };

        // Dialogs come up over the page, where they can be seen; everything else
        // stays on the desk behind it.
        const over = document.createElement('div');
        over.className = 'vapor-over';
        const makeWindow = (name, title, bar, parent = root) => {
            const win = document.createElement('section');
            win.className = 'vapor-win';
            win.dataset.win = name;
            win.setAttribute('aria-label', title);
            win.style.setProperty('--vapor-win-bar', COLOURS[bar]);
            const head = document.createElement('header');
            head.className = 'vapor-bar';
            const dots = document.createElement('span');
            dots.className = 'vapor-dots';
            for (const [act, label] of [['close', 'Close'], ['tuck', 'Minimise'], ['hop', 'Send across the desk']]) {
                const dot = document.createElement('button');
                dot.type = 'button';
                dot.className = 'vapor-dot';
                dot.dataset.act = act;
                dot.setAttribute('aria-label', `${label} ${title}`);
                dots.appendChild(dot);
            }
            const type = pixelCanvas(title);
            const grow = document.createElement('button');
            grow.type = 'button';
            grow.className = 'vapor-grow';
            grow.dataset.act = 'grow';
            grow.setAttribute('aria-label', `Resize ${title}`);
            head.append(dots, type, grow);
            const pane = document.createElement('div');
            pane.className = 'vapor-pane';
            win.append(head, pane);
            win.setTitle = text => drawType(type, text);
            parent.appendChild(win);
            return { win, pane };
        };

        /* The robot. A poke changes its face and what it has to say. */
        const robotWin = makeWindow('robot', 'ALWAYS BUILD', 'yellow');
        const face = document.createElement('canvas');
        face.className = 'vapor-robot';
        face.width = 19;
        face.height = 16;
        let faceAt = 0;
        const drawFace = at => {
            faceAt = at;
            const f = FACES[at], c = face.getContext('2d');
            c.clearRect(0, 0, 19, 16);
            c.fillStyle = '#0c0a14';
            const stamp = (rows, x, y) => rows.forEach((row, j) => [...row].forEach((v, i) => { if (v === '#') c.fillRect(x + i, y + j, 1, 1); }));
            stamp(ROBOT, 0, 0);
            stamp(f.left, 5, 5);
            stamp(f.right, 11, 5);
            stamp(f.mouth, 6, 9);
            robotWin.win.setTitle(f.title);
        };
        drawFace(0);
        const poke = document.createElement('button');
        poke.type = 'button';
        poke.className = 'vapor-poke';
        poke.dataset.act = 'poke';
        poke.setAttribute('aria-label', 'Poke the robot');
        poke.appendChild(face);
        robotWin.pane.appendChild(poke);

        /* Infill: the labyrinth, cut wherever the slider says. */
        const infillWin = makeWindow('infill', 'INFILL 20%', 'teal');
        const pattern = document.createElement('canvas');
        pattern.className = 'vapor-pattern';
        const foot = document.createElement('div');
        foot.className = 'vapor-infill-foot';
        const stepper = (act, label) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `vapor-step vapor-step-${act}`;
            button.dataset.act = act;
            button.setAttribute('aria-label', label);
            return button;
        };
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '1';
        slider.max = '100';
        slider.value = '20';
        slider.className = 'vapor-slider';
        slider.setAttribute('aria-label', 'Infill density');
        foot.append(stepper('less', 'Less infill'), slider, stepper('more', 'More infill'));
        infillWin.pane.append(pattern, foot);
        let density = 20, patternFrame = 0;
        const drawPattern = () => {
            patternFrame = 0;
            if (!field || infillWin.win.hidden) return;
            const box = pattern.getBoundingClientRect();
            if (!box.width || !box.height) return;
            const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
            const px = Math.max(1, Math.round(box.width * ratio)), py = Math.max(1, Math.round(box.height * ratio));
            if (pattern.width !== px || pattern.height !== py) {
                pattern.width = px;
                pattern.height = py;
            }
            // As a slicer does it: walls of one width, set further apart the less
            // plastic there is to spend, until above about half they can get no
            // closer and thicken instead, and at 100% close up solid. The walls are
            // the lines where the field crosses zero, and the part of the field
            // nearest zero is exactly the share of the window that should be inked.
            if (!cuts) cuts = Float32Array.from(field, value => Math.abs(value)).sort();
            const share = density / 100;
            const cut = density >= 100 ? Infinity : cuts[Math.min(cuts.length - 1, Math.floor(share * cuts.length))];
            const WALL = 2.5, CELLS_APART = 8;
            const perCell = Math.max(13, WALL * 2 / share) / CELLS_APART * ratio;
            // From the middle of the field, so that it opens up from the window's
            // centre as the slider moves; past its end it folds back on itself.
            const fold = (value, size) => {
                const span = size * 2 - 2;
                const m = Math.abs(value) % span;
                return m < size - 1 ? m : span - m;
            };
            const portrait = window.innerHeight > window.innerWidth * 1.1;
            const ink = portrait ? [120, 88, 170] : [12, 10, 20];
            const c = pattern.getContext('2d');
            const image = c.createImageData(px, py);
            const data = image.data;
            for (let j = 0; j < py; j++) {
                const fy = fold(FIELD_H / 2 + (j - py / 2) / perCell, FIELD_H), j0 = Math.floor(fy), ty = fy - j0, j1 = Math.min(FIELD_H - 1, j0 + 1);
                for (let i = 0; i < px; i++) {
                    const fx = fold(FIELD_W / 2 + (i - px / 2) / perCell, FIELD_W), i0 = Math.floor(fx), tx = fx - i0, i1 = Math.min(FIELD_W - 1, i0 + 1);
                    const a = field[j0 * FIELD_W + i0], b = field[j0 * FIELD_W + i1], d = field[j1 * FIELD_W + i0], e = field[j1 * FIELD_W + i1];
                    const value = a + (b - a) * tx + (d - a) * ty + (a - b - d + e) * tx * ty;
                    const on = Math.abs(value) < cut;
                    const k = (j * px + i) * 4;
                    data[k] = on ? ink[0] : 255;
                    data[k + 1] = on ? ink[1] : 255;
                    data[k + 2] = on ? ink[2] : 255;
                    data[k + 3] = 255;
                }
            }
            c.putImageData(image, 0, 0);
        };
        const askPattern = () => {
            if (!patternFrame) patternFrame = requestAnimationFrame(drawPattern);
        };
        const setDensity = value => {
            density = Math.max(1, Math.min(100, Math.round(value)));
            slider.value = String(density);
            slider.setAttribute('aria-valuetext', `${density} percent`);
            infillWin.win.setTitle(`INFILL ${density}%`);
            askPattern();
            job1.describe();
        };

        /* The print job: the part as it stands, printed. The bar fills in steps by a
           plain animation, so nothing has to run while it does. */
        const printWin = makeWindow('print', 'PRINT JOB', 'purple');
        const progress = document.createElement('div');
        progress.className = 'vapor-progress';
        const fill = document.createElement('i');
        progress.appendChild(fill);
        const row = document.createElement('div');
        row.className = 'vapor-job-row';
        const info = pixelCanvas('ROBOT.STL');
        info.classList.add('vapor-job-info');
        const printButton = document.createElement('button');
        printButton.type = 'button';
        printButton.className = 'vapor-key';
        printButton.dataset.act = 'print';
        printButton.setAttribute('aria-label', 'Print');
        const printLabel = pixelCanvas('PRINT');
        printButton.appendChild(printLabel);
        row.append(info, printButton);
        printWin.pane.append(progress, row);
        const job1 = {
            state: 'idle',
            grams: () => Math.round(4 + density * .46),
            seconds: () => Math.round(5 + density * .13),
            describe() {
                if (this.state === 'idle') drawType(info, `${this.grams()}G ${this.seconds()}S`);
            },
            start() {
                this.state = 'printing';
                this.madeAt = density;
                drawType(printLabel, 'PAUSE');
                printWin.win.setTitle(`PRINTING ${density}%`);
                drawType(info, 'ROBOT.STL');
                progress.style.setProperty('--vapor-print-time', `${this.seconds()}s`);
                fill.style.animationPlayState = 'running';
                progress.classList.remove('is-printing');
                void progress.offsetWidth;
                progress.classList.add('is-printing');
            },
            pause() {
                this.state = 'paused';
                drawType(printLabel, 'GO');
                printWin.win.setTitle('PAUSED');
                fill.style.animationPlayState = 'paused';
            },
            resume() {
                this.state = 'printing';
                drawType(printLabel, 'PAUSE');
                printWin.win.setTitle(`PRINTING ${this.madeAt}%`);
                fill.style.animationPlayState = 'running';
            },
            finish() {
                this.state = 'idle';
                drawType(printLabel, 'PRINT');
                printWin.win.setTitle('PRINT JOB');
                progress.classList.remove('is-printing');
                this.describe();
                const made = this.madeAt;
                const verdict = made >= 100 ? 'THATS A PAPERWEIGHT.' : made >= 70 ? 'STRONG. SLOW. WORTH IT?' : made >= 15 ? 'THAT WILL HOLD.' : made >= 5 ? 'BRAVE.' : 'IT FELL APART.';
                popup('PRINT COMPLETE', `${made}% - ${verdict}`, 'NICE');
                drawFace(made < 5 ? 4 : 3);
            }
        };
        fill.addEventListener('animationend', () => job1.finish());

        /* Torque: hold it down and the rings wind up; let go and they run down. */
        const torqueWin = makeWindow('torque', 'TORQUE', 'teal');
        const rings = document.createElement('canvas');
        rings.className = 'vapor-rings';
        rings.dataset.act = 'wind';
        torqueWin.pane.appendChild(rings);
        let phase = 0, spin = 0, holding = false, ringFrame = 0, lastRing = 0, lastTitle = 0;
        const drawRings = () => {
            const box = rings.getBoundingClientRect();
            if (!box.width || !box.height) return;
            const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
            const px = Math.round(box.width * ratio), py = Math.round(box.height * ratio);
            if (rings.width !== px || rings.height !== py) {
                rings.width = px;
                rings.height = py;
            }
            const c = rings.getContext('2d');
            const portrait = window.innerHeight > window.innerWidth * 1.1;
            const ink = portrait ? 'rgb(120,88,170)' : '#0c0a14';
            const cx = px / 2, cy = py / 2, R = Math.hypot(px, py) / 2;
            const step = Math.max(6, Math.min(px, py) * .06);
            c.fillStyle = '#ffffff';
            c.fillRect(0, 0, px, py);
            const offset = ((phase % 1) + 1) % 1;
            let dark = Math.floor(R / step) % 2 === 0;
            for (let r = R + step * (1 - offset); r > 0; r -= step, dark = !dark) {
                c.fillStyle = dark ? ink : '#ffffff';
                c.beginPath();
                c.arc(cx, cy, r, 0, Math.PI * 2);
                c.fill();
            }
        };
        const ringStep = now => {
            ringFrame = 0;
            const dt = lastRing ? Math.min(.05, (now - lastRing) / 1000) : 1 / 60;
            lastRing = now;
            spin = holding ? Math.min(9, spin + dt * 6) : spin * Math.pow(.14, dt);
            phase += spin * dt;
            drawRings();
            if (now - lastTitle > 120) {
                lastTitle = now;
                torqueWin.win.setTitle(spin < .02 ? 'TORQUE' : `${(spin * 1.4).toFixed(1)} N-M`);
            }
            if (holding || spin > .02) ringFrame = requestAnimationFrame(ringStep);
            else {
                spin = 0;
                lastRing = 0;
                torqueWin.win.setTitle('TORQUE');
            }
        };
        const windRings = () => {
            if (!ringFrame) ringFrame = requestAnimationFrame(ringStep);
        };

        /* Three hearts and a file, on the desk itself. */
        const hearts = document.createElement('div');
        hearts.className = 'vapor-hearts';
        const heartColours = ['#b18be8', '#5ff0d8', '#f5ea5a'];
        const drawHeart = (canvas, on, colour) => {
            const c = canvas.getContext('2d');
            c.clearRect(0, 0, 9, 8);
            HEART.forEach((line, y) => {
                const first = line.indexOf('#'), last = line.lastIndexOf('#');
                c.fillStyle = on ? colour : '#ffffff';
                c.fillRect(first, y, last - first + 1, 1);
                c.fillStyle = '#0c0a14';
                [...line].forEach((v, x) => { if (v === '#') c.fillRect(x, y, 1, 1); });
            });
        };
        const heartStates = [true, true, true];
        heartColours.forEach((colour, i) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'vapor-heart';
            button.dataset.act = 'heart';
            button.dataset.index = i;
            button.setAttribute('aria-label', 'Heart');
            button.setAttribute('aria-pressed', 'true');
            const canvas = document.createElement('canvas');
            canvas.width = 9;
            canvas.height = 8;
            drawHeart(canvas, true, colour);
            button.appendChild(canvas);
            hearts.appendChild(button);
        });
        const file = document.createElement('button');
        file.type = 'button';
        file.className = 'vapor-file';
        file.dataset.act = 'file';
        file.setAttribute('aria-label', 'Open robot.stl');
        file.appendChild(pixelCanvas('ROBOT.STL'));
        root.append(hearts, file);

        /* The bar along the foot, for whatever has been put away. */
        const tray = document.createElement('div');
        tray.className = 'vapor-tray';
        root.appendChild(tray);

        const windows = [robotWin.win, infillWin.win, printWin.win, torqueWin.win];
        const titleOf = win => win.getAttribute('aria-label');
        const nudge = win => {
            const dx = (parseFloat(win.dataset.dx) || 0) + (Math.random() - .5) * 60;
            const dy = (parseFloat(win.dataset.dy) || 0) + (Math.random() - .5) * 44;
            moveWindow(win, dx, dy);
        };
        const moveWindow = (win, dx, dy) => {
            win.dataset.dx = dx;
            win.dataset.dy = dy;
            win.style.setProperty('--dx', `${dx}px`);
            win.style.setProperty('--dy', `${dy}px`);
        };
        const open = (win, noisy) => {
            if (!win.hidden && !win.classList.contains('is-gone')) {
                raise(win);
                return;
            }
            win.hidden = false;
            win.classList.remove('is-gone');
            win.classList.add('is-opening');
            raise(win);
            later(() => win.classList.remove('is-opening'), 260);
            tray.querySelector(`[data-restore="${win.dataset.win}"]`)?.remove();
            if (noisy) nudge(win);
            if (win === infillWin.win) askPattern();
            if (win === torqueWin.win) drawRings();
        };
        const hide = win => {
            win.classList.add('is-gone');
            later(() => { if (win.classList.contains('is-gone')) win.hidden = true; }, 200);
        };
        const allGone = () => windows.every(win => win.classList.contains('is-gone'));
        const afterHiding = () => {
            if (allGone()) later(() => {
                if (allGone()) popup('NOTHING LEFT', 'NOW WHAT?', 'ALWAYS BUILD', () => windows.forEach(win => open(win)));
            }, 500);
        };
        const close = win => {
            hide(win);
            // It does not stay closed. Nothing on this desk ever did.
            later(() => { if (win.classList.contains('is-gone') && !tray.querySelector(`[data-restore="${win.dataset.win}"]`)) open(win, true); }, 7000 + Math.random() * 9000);
            afterHiding();
        };
        const tuck = win => {
            hide(win);
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'vapor-chip';
            chip.dataset.act = 'restore';
            chip.dataset.restore = win.dataset.win;
            chip.setAttribute('aria-label', `Restore ${titleOf(win)}`);
            chip.appendChild(pixelCanvas(titleOf(win)));
            tray.appendChild(chip);
            afterHiding();
        };
        const popups = new Set();
        const popup = (title, text, answer, then) => {
            popups.forEach(old => { if (old.dataset.title === title) old.remove(); });
            const made = makeWindow('popup', title, 'yellow', over);
            made.win.classList.add('vapor-popup', 'is-opening');
            made.win.dataset.title = title;
            const words = pixelCanvas(text);
            words.classList.add('vapor-popup-words');
            const key = document.createElement('button');
            key.type = 'button';
            key.className = 'vapor-key';
            key.dataset.act = 'dismiss';
            key.appendChild(pixelCanvas(answer));
            made.pane.append(words, key);
            made.win.then = then;
            moveWindow(made.win, (Math.random() - .5) * 60, (Math.random() - .5) * 44);
            raise(made.win);
            popups.add(made.win);
            later(() => made.win.classList.remove('is-opening'), 260);
            return made.win;
        };

        /* Hands on. */
        let drag = null;
        const onPointerDown = event => {
            const win = event.target.closest('.vapor-win');
            if (win) raise(win);
            if (event.target.dataset.act === 'wind') {
                holding = true;
                event.target.setPointerCapture?.(event.pointerId);
                windRings();
                return;
            }
            const head = event.target.closest('.vapor-bar');
            if (!head || event.target.closest('button') || event.button) return;
            drag = {
                win, id: event.pointerId,
                x: event.clientX - (parseFloat(win.dataset.dx) || 0),
                y: event.clientY - (parseFloat(win.dataset.dy) || 0)
            };
            head.setPointerCapture?.(event.pointerId);
            win.classList.add('is-held');
            event.preventDefault();
        };
        const onPointerMove = event => {
            if (!drag || event.pointerId !== drag.id) return;
            moveWindow(drag.win, event.clientX - drag.x, event.clientY - drag.y);
        };
        const onPointerUp = event => {
            if (holding) holding = false;
            if (drag && event.pointerId === drag.id) {
                drag.win.classList.remove('is-held');
                drag = null;
            }
        };
        const onClick = event => {
            const target = event.target.closest('[data-act]');
            if (!target) return;
            const win = target.closest('.vapor-win');
            const act = target.dataset.act;
            if (act === 'close' || act === 'tuck' || act === 'dismiss') {
                if (win.classList.contains('vapor-popup')) {
                    const then = win.then;
                    popups.delete(win);
                    win.remove();
                    if (act === 'dismiss' && then) then();
                } else if (act === 'close') close(win);
                else tuck(win);
            } else if (act === 'hop') {
                if (!win.classList.contains('vapor-popup')) win.classList.add('is-hopping');
                moveWindow(win, (Math.random() - .5) * window.innerWidth * .3, (Math.random() - .5) * window.innerHeight * .24);
                later(() => win.classList.remove('is-hopping'), 400);
            } else if (act === 'grow') {
                win.classList.toggle('is-big');
                askPattern();
                if (win === torqueWin.win) later(drawRings, 30);
            } else if (act === 'poke') {
                drawFace((faceAt + 1) % FACES.length);
                poke.classList.remove('is-poked');
                void poke.offsetWidth;
                poke.classList.add('is-poked');
            } else if (act === 'less') setDensity(density - 5);
            else if (act === 'more') setDensity(density + 5);
            else if (act === 'print') {
                if (job1.state === 'idle') job1.start();
                else if (job1.state === 'printing') job1.pause();
                else job1.resume();
            } else if (act === 'restore') {
                open(windows.find(w => w.dataset.win === target.dataset.restore));
            } else if (act === 'file') {
                open(printWin.win);
                if (job1.state === 'idle') job1.start();
            } else if (act === 'heart') {
                const i = Number(target.dataset.index);
                heartStates[i] = !heartStates[i];
                target.setAttribute('aria-pressed', String(heartStates[i]));
                drawHeart(target.querySelector('canvas'), heartStates[i], heartColours[i]);
                drawFace(heartStates.every(Boolean) ? 3 : heartStates.some(Boolean) ? 0 : 4);
            }
        };
        const onInput = event => {
            if (event.target === slider) setDensity(Number(slider.value));
        };
        for (const surface of [root, over]) {
            surface.addEventListener('pointerdown', onPointerDown);
            surface.addEventListener('pointermove', onPointerMove);
            surface.addEventListener('pointerup', onPointerUp);
            surface.addEventListener('pointercancel', onPointerUp);
            surface.addEventListener('click', onClick);
        }
        root.addEventListener('input', onInput);

        layer?.after(root);
        document.body.appendChild(over);
        // A phone has room for three behind its words. The fourth waits on the bar.
        if (window.innerHeight > window.innerWidth * 1.1) {
            torqueWin.win.classList.add('is-gone');
            torqueWin.win.hidden = true;
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'vapor-chip';
            chip.dataset.act = 'restore';
            chip.dataset.restore = 'torque';
            chip.setAttribute('aria-label', 'Restore TORQUE');
            chip.appendChild(pixelCanvas('TORQUE'));
            tray.appendChild(chip);
        }
        job1.describe();
        return {
            redraw() {
                askPattern();
                drawRings();
            },
            first() {
                askPattern();
                drawRings();
            },
            remove() {
                timers.forEach(id => clearTimeout(id));
                timers.clear();
                if (patternFrame) cancelAnimationFrame(patternFrame);
                if (ringFrame) cancelAnimationFrame(ringFrame);
                root.remove();
                over.remove();
            }
        };
    };

    window.portfolioVapor = {
        prepare: () => (url && field && shape() === drawn ? Promise.resolve() : paint()),
        show() {
            shown = true;
            if (url) layer?.style.setProperty('--vapor-sky', `url("${url}")`);
            if (!desk) desk = buildDesk();
            desk.first();
            window.addEventListener('resize', onResize, { passive: true });
        },
        release() {
            shown = false;
            job++;
            clearTimeout(resizeTimer);
            window.removeEventListener('resize', onResize);
            layer?.style.removeProperty('--vapor-sky');
            desk?.remove();
            desk = null;
            if (url) window.setTimeout((old => () => URL.revokeObjectURL(old))(url), 1000);
            url = '';
            drawn = '';
            field = null;
            cuts = null;
        }
    };
})();
