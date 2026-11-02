/* The pastel desktop: Medium FX's hidden look.

   Ten quick presses on the effects slider's Medium stop find it, and after that two
   quick presses turn it on and off (the slider code in portfolio.js). A reload forgets
   it. The backdrop is only the lattice on pink. Everything else on the desk is something
   to use, and all of it can be picked up and moved.

   It is a desktop for this portfolio. The infill window's slider takes a part from 1%
   to solid. The print job takes that part and prints it, taking longer and using more
   plastic the denser it is. The robot pulls a face when it is poked. Holding the torque
   window winds it up. Close a window and it comes back on its own; minimise one and it
   waits on the bar at the foot.

   It holds to what Medium promises. These are plain elements lying on the page at its
   top, in the empty places beside the words, and they scroll away with it. Nothing on
   them runs unless someone is using it, so at rest the page still asks for no frames at
   all. This file is not fetched until someone asks, and leaving Medium hands all of it
   back. */
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

    /* A labyrinth, the way a skin or a print's infill grows one: each cell pushed
       toward what is near it and away from what is a little further off, a few dozen
       times. Stands alone, as its source text is also the worker's. */
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
        const grow = ${growField};
        onmessage = ({ data: { width, height } }) => {
            const field = grow(width, height);
            postMessage(field, [field.buffer]);
        };`;
    let field = null, cuts = null, desk = null, growing = null;

    // Off the page's thread, or here once if a worker cannot be had.
    const growAway = () => new Promise(resolve => {
        const here = () => resolve(growField(FIELD_W, FIELD_H));
        if (!('Worker' in window)) {
            here();
            return;
        }
        let source = '', worker = null;
        const finish = () => {
            worker?.terminate();
            if (source) URL.revokeObjectURL(source);
        };
        try {
            source = URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' }));
            worker = new Worker(source);
        } catch (error) {
            finish();
            here();
            return;
        }
        worker.onerror = () => {
            finish();
            here();
        };
        worker.onmessage = ({ data }) => {
            finish();
            resolve(data);
        };
        worker.postMessage({ width: FIELD_W, height: FIELD_H });
    });

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
    const pixelCanvas = (text, className = 'vapor-type') => {
        const canvas = document.createElement('canvas');
        canvas.className = className;
        drawType(canvas, text);
        return canvas;
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
    const PAGE = ['#########..', '#.......##.', '#.......#.#', '#.......###', '#..#####..#', '#.........#', '#..#####..#', '#.........#', '#..#####..#', '#.........#', '#.........#', '###########'];
    const COLOURS = { teal: '#5ff0d8', yellow: '#f5ea5a', purple: '#b18be8' };
    // A tall screen has no empty places beside its words, so there everything waits
    // on the bar until it is asked for.
    const isTall = () => window.innerHeight > window.innerWidth * 1.1;

    const buildDesk = () => {
        const root = document.createElement('div');
        root.className = 'vapor-desk';
        // Dialogs and the bar stay where they can be seen, wherever the page has got to.
        const over = document.createElement('div');
        over.className = 'vapor-over';
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
        const raise = item => { item.style.zIndex = ++top; };
        const place = (item, dx, dy) => {
            item.dataset.dx = dx;
            item.dataset.dy = dy;
            item.style.setProperty('--dx', `${dx}px`);
            item.style.setProperty('--dy', `${dy}px`);
        };

        const makeWindow = (name, title, bar, parent = root) => {
            const win = document.createElement('section');
            win.className = 'vapor-win';
            win.dataset.win = name;
            win.dataset.item = '';
            win.setAttribute('aria-label', title);
            win.style.setProperty('--vapor-win-bar', COLOURS[bar]);
            const head = document.createElement('header');
            head.className = 'vapor-bar';
            head.dataset.handle = '';
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
                    data[k] = on ? 12 : 255;
                    data[k + 1] = on ? 10 : 255;
                    data[k + 2] = on ? 20 : 255;
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
            printJob.describe();
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
        const printJob = {
            state: 'idle',
            madeAt: 20,
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
        fill.addEventListener('animationend', () => printJob.finish());

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
            const cx = px / 2, cy = py / 2, R = Math.hypot(px, py) / 2;
            const step = Math.max(6, Math.min(px, py) * .06);
            c.fillStyle = '#ffffff';
            c.fillRect(0, 0, px, py);
            const offset = ((phase % 1) + 1) % 1;
            let dark = Math.floor(R / step) % 2 === 0;
            for (let r = R + step * (1 - offset); r > 0; r -= step, dark = !dark) {
                c.fillStyle = dark ? '#0c0a14' : '#ffffff';
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

        /* Three hearts and a file, lying on the desk. */
        const hearts = document.createElement('div');
        hearts.className = 'vapor-hearts';
        hearts.dataset.item = '';
        hearts.dataset.handle = '';
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
        file.dataset.item = '';
        file.dataset.handle = '';
        file.setAttribute('aria-label', 'Print robot.stl');
        const glyph = document.createElement('canvas');
        glyph.className = 'vapor-file-icon';
        glyph.width = 11;
        glyph.height = 12;
        {
            const c = glyph.getContext('2d');
            PAGE.forEach((line, y) => {
                const first = line.indexOf('#'), last = line.lastIndexOf('#');
                c.fillStyle = '#ffffff';
                c.fillRect(first, y, last - first + 1, 1);
                c.fillStyle = '#0c0a14';
                [...line].forEach((v, x) => { if (v === '#') c.fillRect(x, y, 1, 1); });
            });
        }
        file.append(glyph, pixelCanvas('ROBOT.STL'));
        root.append(hearts, file);

        /* The bar along the foot, for whatever has been put away. */
        const tray = document.createElement('div');
        tray.className = 'vapor-tray';
        over.appendChild(tray);
        const windows = [robotWin.win, infillWin.win, printWin.win, torqueWin.win];
        const titleOf = win => win.getAttribute('aria-label');
        const addChip = win => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'vapor-chip';
            chip.dataset.act = 'restore';
            chip.dataset.restore = win.dataset.win;
            chip.setAttribute('aria-label', `Restore ${titleOf(win)}`);
            chip.appendChild(pixelCanvas(titleOf(win)));
            tray.appendChild(chip);
        };
        const chipFor = win => tray.querySelector(`[data-restore="${win.dataset.win}"]`);
        // The page may have scrolled on since this window was last seen.
        const intoView = win => {
            const box = win.getBoundingClientRect();
            const room = window.innerHeight;
            if (box.top >= 56 && box.bottom <= room - 8) return;
            const dy = parseFloat(win.dataset.dy) || 0;
            const to = Math.max(64, Math.min(room * .14, room - box.height - 8));
            place(win, parseFloat(win.dataset.dx) || 0, dy + to - box.top);
        };
        const open = (win, bringIt) => {
            if (!win.hidden && !win.classList.contains('is-gone')) {
                raise(win);
                if (bringIt) intoView(win);
                return;
            }
            win.hidden = false;
            win.classList.remove('is-gone');
            win.classList.add('is-opening');
            raise(win);
            later(() => win.classList.remove('is-opening'), 260);
            chipFor(win)?.remove();
            if (bringIt) intoView(win);
            if (win === infillWin.win) askPattern();
            if (win === torqueWin.win) drawRings();
        };
        const hide = win => {
            win.classList.add('is-gone');
            later(() => { if (win.classList.contains('is-gone')) win.hidden = true; }, 200);
        };
        const allGone = () => windows.every(win => win.classList.contains('is-gone'));
        const afterHiding = () => {
            if (!isTall() && allGone()) later(() => {
                if (allGone()) popup('NOTHING LEFT', 'NOW WHAT?', 'ALWAYS BUILD', () => windows.forEach(win => open(win, true)));
            }, 500);
        };
        const tuck = win => {
            hide(win);
            if (!chipFor(win)) addChip(win);
            afterHiding();
        };
        const close = win => {
            if (isTall()) {
                tuck(win);
                return;
            }
            hide(win);
            // It does not stay closed. Nothing on this desk ever did.
            later(() => { if (win.classList.contains('is-gone') && !chipFor(win)) open(win); }, 7000 + Math.random() * 9000);
            afterHiding();
        };
        const popups = new Set();
        const popup = (title, text, answer, then) => {
            popups.forEach(old => {
                if (old.dataset.title !== title) return;
                popups.delete(old);
                old.remove();
            });
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
            raise(made.win);
            popups.add(made.win);
            later(() => made.win.classList.remove('is-opening'), 260);
            return made.win;
        };

        /* Hands on. Anything with a handle can be picked up. A press that does not move
           is still only a press, so a heart can be pressed or carried off. */
        let drag = null, swallowClick = false;
        const onPointerDown = event => {
            const item = event.target.closest('[data-item]');
            if (item) raise(item);
            if (event.target.dataset.act === 'wind') {
                holding = true;
                event.target.setPointerCapture?.(event.pointerId);
                windRings();
                return;
            }
            const handle = event.target.closest('[data-handle]');
            if (!handle || event.button) return;
            if (handle.classList.contains('vapor-bar') && event.target.closest('button')) return;
            drag = {
                item, handle, id: event.pointerId, moved: false, fromX: event.clientX, fromY: event.clientY,
                x: event.clientX - (parseFloat(item.dataset.dx) || 0),
                y: event.clientY - (parseFloat(item.dataset.dy) || 0)
            };
        };
        const onPointerMove = event => {
            if (!drag || event.pointerId !== drag.id) return;
            if (!drag.moved) {
                if (Math.hypot(event.clientX - drag.fromX, event.clientY - drag.fromY) < 4) return;
                drag.moved = true;
                drag.handle.setPointerCapture?.(event.pointerId);
                drag.item.classList.add('is-held');
            }
            place(drag.item, event.clientX - drag.x, event.clientY - drag.y);
        };
        const onPointerUp = event => {
            holding = false;
            if (drag && event.pointerId === drag.id) {
                if (drag.moved) {
                    swallowClick = true;
                    later(() => { swallowClick = false; }, 50);
                }
                drag.item.classList.remove('is-held');
                drag = null;
            }
        };
        const onClick = event => {
            if (swallowClick) {
                swallowClick = false;
                return;
            }
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
                win.classList.add('is-hopping');
                place(win, (Math.random() - .5) * window.innerWidth * .34, (Math.random() - .5) * window.innerHeight * .34);
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
                if (printJob.state === 'idle') printJob.start();
                else if (printJob.state === 'printing') printJob.pause();
                else printJob.resume();
            } else if (act === 'restore') {
                open(windows.find(w => w.dataset.win === target.dataset.restore), true);
            } else if (act === 'file') {
                open(printWin.win, true);
                if (printJob.state === 'idle') printJob.start();
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
        document.body.append(root, over);

        printJob.describe();
        if (isTall()) {
            windows.forEach(win => {
                win.classList.add('is-gone');
                win.hidden = true;
                addChip(win);
            });
        }
        return {
            redraw() {
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

    let resizeTimer = 0;
    const onResize = () => {
        clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => desk?.redraw(), 250);
    };

    window.portfolioVapor = {
        prepare() {
            if (field) return Promise.resolve();
            if (!growing) growing = growAway().then(made => {
                field = made;
                growing = null;
            });
            return growing;
        },
        show() {
            if (!desk) desk = buildDesk();
            desk.redraw();
            window.addEventListener('resize', onResize, { passive: true });
        },
        release() {
            clearTimeout(resizeTimer);
            window.removeEventListener('resize', onResize);
            desk?.remove();
            desk = null;
            field = null;
            cuts = null;
        }
    };
})();
