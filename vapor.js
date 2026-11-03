/* The pastel desktop: Medium FX's hidden look.

   Two quick presses on the effects slider's Medium stop go round Medium's looks, and the
   desk is the last of them (the slider code in portfolio.js). A reload forgets it. The
   backdrop is only the lattice on pink. Everything in front on the desk is something to
   use, and all of it can be picked up and moved.

   It is a desktop for this portfolio. The infill window's slider takes a part from 1%
   to solid. The print job takes that part and prints it, taking longer and using more
   plastic the denser it is. The robot pulls a face when it is poked. Holding the torque
   window winds it up. Close a window and it comes back in a while; minimise one and it
   waits on the bar at the foot.

   Nothing is there to begin with. Then it comes down with what looks like a virus: in the
   first seven seconds hundreds of windows, stacking up over each other, and after that one
   every few seconds up to a limit. It is built in depth. At the back is a wall of the ones
   that do nothing, the printer's grumbles and jobs that never finish, three depths of them
   over the whole screen, each further back smaller and further gone into the pink, never
   pressed and painted once. In front of the wall are three depths of pop-ups that each
   lead somewhere: every project, which opens as its card does, and the rest of the page,
   About, Skills, the projects and each folder of the archive, Contact, and the links the
   page has. Only the robot gone bad, ALWAYS_BREAK.EXE, leads nowhere. All of it stands on
   one fixed layer behind the page, so it stays with the visitor down the page and
   everything on the page stays in front of it.

   It holds to what Medium promises. These are plain elements, and nothing on them runs
   unless someone is using it, so at rest the page still asks for no frames at all. This
   file is not fetched until someone asks, and leaving Medium hands all of it back. */
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

    const drawType = (canvas, text, ink = '#0c0a14') => {
        canvas.width = Math.max(1, text.length * 6 - 1);
        canvas.height = 7;
        canvas.style.setProperty('--cols', canvas.width);
        const c = canvas.getContext('2d');
        c.fillStyle = ink;
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
    /* Lettering as pictures: each line is drawn once, then shown as an image the browser
       paints in with everything round it. A canvas for each was a compositor layer for
       each, and a desk buried in notes came to hundreds of layers put together on every
       frame. Only the robot's own typing, which changes as it goes, stays a canvas. */
    const typeImages = new Map();
    const setType = (target, text) => {
        if (target instanceof HTMLCanvasElement) {
            drawType(target, text);
            return;
        }
        if (!typeImages.has(text)) {
            const canvas = document.createElement('canvas');
            drawType(canvas, text);
            typeImages.set(text, { url: canvas.toDataURL(), cols: canvas.width });
        }
        const { url, cols } = typeImages.get(text);
        target.src = url;
        target.alt = text;
        target.style.setProperty('--cols', cols);
    };
    const pixelType = (text, className = 'vapor-type') => {
        const image = document.createElement('img');
        image.className = className;
        image.decoding = 'sync';
        image.draggable = false;
        setType(image, text);
        return image;
    };    const ROBOT = [
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
    const COLOURS = { teal: '#5ff0d8', yellow: '#f5ea5a', purple: '#b18be8', hot: '#ff5c8a' };
    // On a tall screen the words run right across, so what goes behind them is paler.
    const isTall = () => window.innerHeight > window.innerWidth * 1.1;
    // What the virus leaves all over the back of the desk, too far back to be pressed: the
    // sort of thing a printer says, and jobs that never finish.
    const NOTES = [
        ['FILAMENT', 'RUNNING LOW.', 'OK'], ['BED LEVEL', 'ARE YOU SURE?', 'CHECK'], ['CAD', 'DID YOU SAVE?', 'SAVED'],
        ['M3 SCREWS', '0 REMAINING.', 'ORDER'], ['STRINGING', 'RETRACT MORE.', 'FINE'], ['TOLERANCE', 'PLUS OR MINUS WHAT?', 'SURE'],
        ['FIRST LAYER', 'LOOKS BAD.', 'AGAIN'], ['REMINDER', 'ALWAYS BUILD.', 'OK'], ['NOZZLE', 'CLOGGED AGAIN.', 'SIGH'],
        ['SUPPORTS', 'WILL NOT COME OFF.', 'PLIERS'], ['SERVO', 'STALLED.', 'RESET'], ['RENDER', '98% FOREVER.', 'WAIT'],
        ['ASSEMBLY', 'PARTS INTERFERE.', 'IGNORE'], ['BATTERY', 'LOW VOLTAGE.', 'CHARGE']
    ];
    const JOBS = [
        ['COPYING', 'ROBOT.STL', .62], ['RENDERING', 'FRAME 98 OF 99', .97], ['SLICING', 'LAYER 212 OF 640', .33], ['UPLOADING', 'CAD.ZIP', .45],
        ['DEFRAG', 'PLEASE WAIT.', .8], ['INSTALLING', 'MORE ROBOTS', .2], ['COMPILING', 'FIRMWARE', .71], ['HOMING', 'X Y Z', .5]
    ];
    /* The wall, far to near: how big its windows are against the front's, how far they have
       gone into the pink, and how many screens of them there are. The two at the back have
       their words worn down to lines, and are drawn soft, as things out of focus are. */
    const WALL_DEPTHS = [
        { scale: .42, fog: .7, cover: 1.1, worn: true },
        { scale: .55, fog: .55, cover: .9, worn: true },
        { scale: .68, fog: .4, cover: .75, worn: false }
    ];
    // However big the screen, no more windows than this on the wall: past it they grow instead.
    const WALL_MOST = 600;
    // The three depths in front, far to near. These are the ones that lead somewhere.
    const FRONT_SCALES = [.78, .89, 1];
    // Pop-ups that are really the way to the rest of the page, in the virus's voice, saying where
    // they go: [title, words, key, where, bar].
    const PLACES = [
        ['WARNING', 'WHO BUILT THIS? ABOUT ME', 'ABOUT', '#about', 'teal'],
        ['ALERT', 'CAD + CODE FOUND: SKILLS', 'SKILLS', '#skills', 'yellow'],
        ['URGENT', 'SEE THE FEATURED PROJECTS', 'PROJECTS', '#projects', 'teal'],
        ['1 NEW MESSAGE', 'SAY HELLO: CONTACT + LINKS', 'CONTACT', '#contact', 'yellow'],
        ['SCROLL LOCK', 'BACK TO THE TOP', 'TOP', '', 'teal']
    ];
    // Each folder of the archive gets one of these to go with its name.
    const FOLDER_TITLES = ['FOLDER FOUND', 'ARCHIVE.ZIP', 'NEW FOLDER', 'SCAN COMPLETE', 'FILES FOUND', 'DOWNLOADS'];
    // The page's own links, the ones under Contact and in the foot, as the page has them:
    // [what the link says or goes to, title, words, key, bar]. A link with none of these
    // still gets a pop-up of its own.
    const LINKS = [
        [/resume|\.pdf/i, 'RESUME.PDF', 'DOWNLOAD MY RESUME', 'RESUME', 'purple'],
        [/mail/i, 'YOU HAVE MAIL', 'SEND ME AN EMAIL', 'EMAIL', 'yellow'],
        [/linkedin/i, 'NEW CONNECTION', 'FIND ME ON LINKEDIN', 'LINKEDIN', 'yellow'],
        [/grabcad/i, 'CAD FILES FOUND', 'MY MODELS ON GRABCAD', 'GRABCAD', 'teal'],
        [/github/i, 'GITHUB.EXE', 'CODE + CAD FILES ON GITHUB', 'GITHUB', 'teal']
    ];
    const FOOT_LINKS = [
        [/updates/i, 'SYSTEM UPDATE', 'WHAT IS NEW ON THIS SITE', 'UPDATES', 'yellow'],
        [/source/i, 'SOURCE CODE', 'HOW THIS SITE IS MADE', 'SOURCE', 'purple']
    ];
    // A burst to begin with, over seven seconds, looked at this often. After that one now and then.
    const BURST_MS = 7000, BURST_TICK_MS = 50, LATER_GAP_MS = 5000, LATER_SPREAD_MS = 25000;
    // What the robot says it is doing to your machine, and what it says when it has.
    const THREATS = [
        'OVERHEATING YOUR HOTEND', 'STRIPPING YOUR M3 SCREWS', 'CORRUPTING YOUR CAD', 'SHORTING YOUR SERVOS', 'LOOSENING YOUR BELTS',
        'CLOGGING YOUR NOZZLE', 'UNPLUGGING YOUR ROBOT', 'DRAINING YOUR BATTERY', 'BREAKING YOUR TOLERANCES', 'WIPING YOUR G-CODE', 'REWRITING YOUR FIRMWARE'
    ];
    const GLOATS = ['TOO LATE.', 'HA HA HA HA', 'ALWAYS BREAK.', 'NICE MACHINE.', 'WAS A NICE MACHINE.', 'GOOD LUCK.'];
    const GREMLIN_TITLE = 'ALWAYS_BREAK.EXE';
    // Its little screen in cells, how many act up at once, and the beat they all keep.
    const GREMLIN_W = 48, GREMLIN_H = 33, GREMLINS_LIVE = 3, GREMLINS_SEATED = 4, BEAT_MS = 125;
    const INK = '#0c0a14', HOT = '#ff2d62';
    // How many cells wide a project's picture is drawn, and how many stand in a stack.
    const SNAP_W = 96, SNAP_H = 60, STACK_MOST = 14, SNAPS_AT_ONCE = 3;
    const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    // How long a press has to stay still before what is under it comes up, and how far it
    // may wander meanwhile before it counts as something else, like a swipe.
    const HOLD_MS = 220, HOLD_SLOP = 8;
    const shuffled = list => {
        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
    };

    /* The wall's windows. Each is drawn once, in the desk's own cells, as the same window as
       the ones in front down to its dots and its key, at the depth it stands at: its colours
       gone that far into the pink, and at the back its words worn down to lines. Then it is a
       picture, as the lettering is, and the wall is a few hundred pictures that cost nothing
       once they are painted. */
    const BRICKS = [
        ...NOTES.map(([title, text, key], i) => ({ id: `n${i}`, title, text, key, bar: ['yellow', 'teal', 'purple'][i % 3] })),
        ...JOBS.map(([title, text, job], i) => ({ id: `j${i}`, title, text, job, bar: ['purple', 'teal', 'yellow'][i % 3] })),
        ...FACES.map((face, i) => ({ id: `f${i}`, title: face.title, face: i, bar: 'yellow' }))
    ];
    const PINK = [248, 182, 238];
    const DOT = ['..###..', '.#####.', '#######', '#######', '#######', '.#####.', '..###..'];
    const DOT_INSIDE = ['.......', '..###..', '.#####.', '.#####.', '.#####.', '..###..', '.......'];
    const GROW = ['....#####', '.......##', '......#.#', '.....#..#', '....#....', '#..#.....', '#.#......', '##.......', '#####....'];
    // In cells: the narrowest window, its title bar, and the hard shadow under it.
    const BRICK_MIN = 128, BAR_CELLS = 15, SHADOW_CELLS = 3;
    const cellsWide = text => text.length * 6 - 1;
    const brickSize = brick => {
        const wide = Math.max(BRICK_MIN, cellsWide(brick.title) + 58, cellsWide(brick.text || '') + 16, brick.key ? cellsWide(brick.key) + 26 : 0);
        const pane = brick.face !== undefined ? 46 : brick.job !== undefined ? 35 : 39;
        return [wide + SHADOW_CELLS, BAR_CELLS + pane + 3 + SHADOW_CELLS];
    };
    const brickArt = new Map();
    const paintBrick = (brick, depth) => {
        const id = `${brick.id}/${depth}`;
        if (brickArt.has(id)) return brickArt.get(id);
        const { fog, worn } = WALL_DEPTHS[depth];
        const tone = hex => `rgb(${[1, 3, 5].map((at, i) => {
            const value = parseInt(hex.slice(at, at + 2), 16);
            return Math.round(value + (PINK[i] - value) * fog);
        }).join(',')})`;
        const ink = tone(INK), paper = tone('#ffffff');
        const [width, height] = brickSize(brick);
        const w = width - SHADOW_CELLS, h = height - SHADOW_CELLS;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const c = canvas.getContext('2d');
        const box = (colour, x, y, bw, bh) => {
            c.fillStyle = colour;
            c.fillRect(x, y, bw, bh);
        };
        const cells = (rows, x, y, colour, size = 1) => {
            c.fillStyle = colour;
            rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') c.fillRect(x + i * size, y + j * size, size, size); });
        };
        // A line of the type, across the middle of the window.
        const words = (text, y) => {
            const x = Math.round((w - cellsWide(text)) / 2);
            c.fillStyle = ink;
            if (worn) {
                let at = 0;
                for (const word of text.split(' ')) {
                    if (word) c.fillRect(x + at * 6, y + 2, cellsWide(word), 3);
                    at += word.length + 1;
                }
                return;
            }
            for (let i = 0; i < text.length; i++) {
                const glyph = FONT[text[i]];
                if (!glyph) continue;
                for (let row = 0; row < 7; row++) {
                    const bits = parseInt(glyph.substr(row * 2, 2), 16);
                    for (let col = 0; col < 5; col++) if (bits & (16 >> col)) c.fillRect(x + i * 6 + col, y + row, 1, 1);
                }
            }
        };
        box(ink, SHADOW_CELLS, SHADOW_CELLS, w, h);
        box(ink, 0, 0, w, h);
        box(paper, 1, 1, w - 2, h - 2);
        box(tone(COLOURS[brick.bar]), 1, 1, w - 2, BAR_CELLS);
        box(ink, 1, 1 + BAR_CELLS, w - 2, 1);
        for (const x of [3, 11, 19]) {
            cells(DOT, x, 5, ink);
            cells(DOT_INSIDE, x, 5, tone('#f8b6ee'));
        }
        cells(GROW, w - 12, 4, ink);
        words(brick.title, 5);
        const pane = 2 + BAR_CELLS;
        if (brick.face !== undefined) {
            const face = FACES[brick.face], x = Math.round((w - 38) / 2), y = pane + 7;
            cells(ROBOT, x, y, ink, 2);
            cells(face.left, x + 10, y + 10, ink, 2);
            cells(face.right, x + 22, y + 10, ink, 2);
            cells(face.mouth, x + 12, y + 18, ink, 2);
        } else {
            words(brick.text, pane + 7);
            if (brick.job !== undefined) {
                // A job that never finishes: its bar part filled, with the print job's stripes.
                const x = 8, y = pane + 19, bw = w - 16;
                box(ink, x, y, bw, 9);
                box(tone('#d9d9de'), x + 1, y + 1, bw - 2, 7);
                box(tone('#b18be8'), x + 1, y + 1, Math.round((bw - 2) * brick.job), 7);
                for (let stripe = x + 5; stripe < x + bw - 1; stripe += 5) box(paper, stripe, y + 1, 1, 7);
            } else {
                const kw = cellsWide(brick.key) + 10, kx = Math.round((w - kw) / 2), ky = pane + 19;
                box(ink, kx + 1, ky + 1, kw, 13);
                box(ink, kx, ky, kw, 13);
                box(paper, kx + 1, ky + 1, kw - 2, 11);
                words(brick.key, ky + 3);
            }
        }
        const art = { url: canvas.toDataURL(), width, height };
        brickArt.set(id, art);
        return art;
    };

    const buildDesk = () => {
        const root = document.createElement('div');
        root.className = 'vapor-desk';
        // Dialogs and the bar stay where they can be seen, wherever the page has got to.
        const over = document.createElement('div');
        over.className = 'vapor-over';
        // The wall at the back of the desk, one box to each of its depths, far to near.
        const wall = document.createElement('div');
        wall.className = 'vapor-wall';
        wall.setAttribute('aria-hidden', 'true');
        const wallDepths = WALL_DEPTHS.map(({ worn }) => {
            const depth = document.createElement('div');
            depth.className = 'vapor-wall-depth';
            if (worn) depth.dataset.worn = '';
            wall.appendChild(depth);
            return depth;
        });
        root.appendChild(wall);
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
        // Each depth in front keeps to its own: what is pressed comes to the top of its depth,
        // and nothing further back comes over anything nearer. The desk's own things stand at
        // the nearest, and the robot stays on top of the lot, where it can be seen enjoying itself.
        const raise = item => { item.style.zIndex = Number(item.dataset.depth ?? 2) * 1e6 + (item.gremlin ? 5e5 : 0) + ++top; };
        const place = (item, dx, dy) => {
            item.dataset.dx = dx;
            item.dataset.dy = dy;
            item.style.setProperty('--dx', `${dx}px`);
            item.style.setProperty('--dy', `${dy}px`);
        };
        // Anywhere at all, so long as enough of it stays on the screen to get hold of again.
        const keepReachable = (item, x, y) => {
            const box = item.getBoundingClientRect();
            const left = box.left - (parseFloat(item.dataset.dx) || 0), top = box.top - (parseFloat(item.dataset.dy) || 0);
            return [
                Math.min(Math.max(x, 48 - box.width - left), window.innerWidth - 48 - left),
                Math.min(Math.max(y, -top), window.innerHeight - 32 - top)
            ];
        };
        let hold = null;
        // While something is up in the air a finger moves that, not the page.
        const stayPut = event => {
            if (hold?.lifted && event.cancelable) event.preventDefault();
        };

        const makeWindow = (name, title, bar, parent = root) => {
            const win = document.createElement('section');
            win.className = 'vapor-win';
            win.dataset.win = name;
            win.dataset.item = '';
            win.setAttribute('aria-label', title);
            win.style.setProperty('--vapor-win-bar', COLOURS[bar]);
            win.addEventListener('touchmove', stayPut, { passive: false });
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
            const type = pixelType(title);
            const grow = document.createElement('button');
            grow.type = 'button';
            grow.className = 'vapor-grow';
            grow.dataset.act = 'grow';
            grow.setAttribute('aria-label', `Resize ${title}`);
            head.append(dots, type, grow);
            const pane = document.createElement('div');
            pane.className = 'vapor-pane';
            win.append(head, pane);
            win.setTitle = text => setType(type, text);
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
            const ink = isTall() ? [120, 88, 170] : [12, 10, 20];
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
        const info = pixelType('ROBOT.STL');
        info.classList.add('vapor-job-info');
        const printButton = document.createElement('button');
        printButton.type = 'button';
        printButton.className = 'vapor-key';
        printButton.dataset.act = 'print';
        printButton.setAttribute('aria-label', 'Print');
        const printLabel = pixelType('PRINT');
        printButton.appendChild(printLabel);
        row.append(info, printButton);
        printWin.pane.append(progress, row);
        const printJob = {
            state: 'idle',
            madeAt: 20,
            grams: () => Math.round(4 + density * .46),
            seconds: () => Math.round(5 + density * .13),
            describe() {
                if (this.state === 'idle') setType(info, `${this.grams()}G ${this.seconds()}S`);
            },
            start() {
                this.state = 'printing';
                this.madeAt = density;
                setType(printLabel, 'PAUSE');
                printWin.win.setTitle(`PRINTING ${density}%`);
                setType(info, 'ROBOT.STL');
                progress.style.setProperty('--vapor-print-time', `${this.seconds()}s`);
                fill.style.animationPlayState = 'running';
                progress.classList.remove('is-printing');
                void progress.offsetWidth;
                progress.classList.add('is-printing');
            },
            pause() {
                this.state = 'paused';
                setType(printLabel, 'GO');
                printWin.win.setTitle('PAUSED');
                fill.style.animationPlayState = 'paused';
            },
            resume() {
                this.state = 'printing';
                setType(printLabel, 'PAUSE');
                printWin.win.setTitle(`PRINTING ${this.madeAt}%`);
                fill.style.animationPlayState = 'running';
            },
            finish() {
                this.state = 'idle';
                setType(printLabel, 'PRINT');
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
                c.fillStyle = dark ? (isTall() ? 'rgb(120,88,170)' : '#0c0a14') : '#ffffff';
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
        hearts.addEventListener('touchmove', stayPut, { passive: false });
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
        file.addEventListener('touchmove', stayPut, { passive: false });
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
        file.append(glyph, pixelType('ROBOT.STL'));
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
            chip.appendChild(pixelType(titleOf(win)));
            tray.appendChild(chip);
        };
        const chipFor = win => tray.querySelector(`[data-restore="${win.dataset.win}"]`);
        // Everything starts put away, in a random order, and comes out one at a time.
        const waiting = shuffled([...windows, hearts, file]);
        waiting.forEach(item => {
            item.hidden = true;
            item.classList.add('is-gone');
        });
        // Somewhere on the screen, as clear of what is already out as a few tries find.
        const findPlace = item => {
            const box = item.getBoundingClientRect();
            const others = [...root.querySelectorAll('[data-item]')].filter(other => other !== item && !other.hidden).map(other => other.getBoundingClientRect());
            let best = [8, 72], least = Infinity;
            for (let i = 0; i < 14; i++) {
                const x = 8 + Math.random() * Math.max(0, window.innerWidth - box.width - 20);
                const y = 72 + Math.random() * Math.max(0, window.innerHeight - box.height - 84);
                let overlap = 0;
                for (const other of others) {
                    overlap += Math.max(0, Math.min(x + box.width, other.right) - Math.max(x, other.left)) * Math.max(0, Math.min(y + box.height, other.bottom) - Math.max(y, other.top));
                }
                if (overlap < least) {
                    least = overlap;
                    best = [x, y];
                }
            }
            return best;
        };
        const open = (item, somewhereNew) => {
            if (!item.hidden && !item.classList.contains('is-gone')) {
                raise(item);
                return;
            }
            item.hidden = false;
            item.classList.remove('is-gone');
            if (somewhereNew || !item.dataset.placed) {
                place(item, ...findPlace(item));
                item.dataset.placed = '1';
            }
            item.classList.add('is-opening');
            raise(item);
            later(() => item.classList.remove('is-opening'), 260);
            if (item.dataset.win) chipFor(item)?.remove();
            const queued = waiting.indexOf(item);
            if (queued > -1) waiting.splice(queued, 1);
            if (item === infillWin.win) askPattern();
            if (item === torqueWin.win) drawRings();
        };
        const hide = win => {
            win.classList.add('is-gone');
            later(() => { if (win.classList.contains('is-gone')) win.hidden = true; }, 200);
        };
        let popped = 0;
        const allGone = () => popped >= burstCount && windows.every(win => win.classList.contains('is-gone'));
        const afterHiding = () => {
            if (allGone()) later(() => {
                if (allGone()) popup('NOTHING LEFT', 'NOW WHAT?', 'ALWAYS BUILD', () => windows.forEach(win => open(win, true)));
            }, 500);
        };
        const tuck = win => {
            hide(win);
            const queued = waiting.indexOf(win);
            if (queued > -1) waiting.splice(queued, 1);
            if (!chipFor(win)) addChip(win);
            afterHiding();
        };
        // It does not stay closed. Nothing on this desk ever did: it goes to the back of
        // the queue and comes out again in its turn.
        const close = win => {
            hide(win);
            if (!waiting.includes(win)) waiting.push(win);
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
            const words = pixelType(text);
            words.classList.add('vapor-popup-words');
            const key = document.createElement('button');
            key.type = 'button';
            key.className = 'vapor-key';
            key.dataset.act = 'dismiss';
            key.appendChild(pixelType(answer));
            made.pane.append(words, key);
            made.win.then = then;
            raise(made.win);
            popups.add(made.win);
            later(() => made.win.classList.remove('is-opening'), 260);
            return made.win;
        };

        /* Hands on. A quick press is only a press, and a swipe still scrolls the page. Hold
           still for a moment and what is under the pointer comes up off the desk, and goes
           wherever the pointer goes, over the page and everything on it, until it is let go
           and sinks back behind. It is watched from the window, because a pointer in a
           hurry is off the thing it was holding before the first move is even heard. */
        let swallowClick = false;
        const letGo = event => {
            if (!hold || (event && event.pointerId !== hold.id)) return;
            clearTimeout(hold.timer);
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', letGo);
            window.removeEventListener('pointercancel', letGo);
            hold.item.classList.remove('is-held');
            if (hold.carrying) {
                hold.home.appendChild(hold.item);
                swallowClick = true;
                later(() => { swallowClick = false; }, 50);
            }
            hold = null;
        };
        const onPointerMove = event => {
            if (!hold || event.pointerId !== hold.id) return;
            if (!event.buttons) {
                letGo(event);
                return;
            }
            const far = Math.hypot(event.clientX - hold.fromX, event.clientY - hold.fromY);
            if (!hold.lifted) {
                if (far > HOLD_SLOP) letGo(event);
                return;
            }
            if (!hold.carrying) {
                if (far < 3) return;
                // Only now, so a slow press that never moves is still a click on what it hit.
                hold.carrying = true;
                over.appendChild(hold.item);
                hold.item.setPointerCapture?.(event.pointerId);
            }
            place(hold.item, ...keepReachable(hold.item, event.clientX - hold.x, event.clientY - hold.y));
        };
        const onPointerDown = event => {
            const item = event.target.closest('[data-item]');
            if (item) raise(item);
            if (event.target.dataset.act === 'wind') {
                holding = true;
                event.target.setPointerCapture?.(event.pointerId);
                windRings();
                return;
            }
            if (!item || event.button || event.target === slider) return;
            letGo();
            hold = {
                item, home: item.parentElement, id: event.pointerId, lifted: false, carrying: false,
                fromX: event.clientX, fromY: event.clientY,
                x: event.clientX - (parseFloat(item.dataset.dx) || 0),
                y: event.clientY - (parseFloat(item.dataset.dy) || 0),
                timer: window.setTimeout(() => {
                    hold.lifted = true;
                    item.classList.add('is-held');
                }, HOLD_MS)
            };
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', letGo);
            window.addEventListener('pointercancel', letGo);
        };
        const stopWinding = () => { holding = false; };
        const onClick = event => {
            if (swallowClick) {
                swallowClick = false;
                return;
            }
            const target = event.target.closest('[data-act]');
            if (!target) return;
            const win = target.closest('.vapor-win');
            const act = target.dataset.act;
            if (win && win.classList.contains('vapor-note') && (act === 'close' || act === 'tuck' || act === 'dismiss')) {
                dropNote(win);
                if (win.gremlin) comeBack(win.gremlin);
                return;
            }
            if (act === 'stop') {
                taunt(win.gremlin);
                return;
            }
            // A pop-up in front goes where it says from anywhere on it but its three dots.
            if (act === 'go') {
                const onward = win.onward;
                dropNote(win);
                onward?.();
                return;
            }
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
                place(win, ...findPlace(win));
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
                open(windows.find(w => w.dataset.win === target.dataset.restore));
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
            surface.addEventListener('pointerup', stopWinding);
            surface.addEventListener('pointercancel', stopWinding);
            surface.addEventListener('click', onClick);
            // A long press on a phone asks for a menu. While holding something, it does not get one.
            surface.addEventListener('contextmenu', event => { if (hold) event.preventDefault(); });
        }
        root.addEventListener('input', onInput);
        const layer = document.querySelector('.background-grid');
        if (layer) layer.after(root);
        else document.body.prepend(root);
        document.body.appendChild(over);

        printJob.describe();

        /* The wall: where each of its windows goes, worked out for the screen as it is. Each
           depth is spread evenly over the whole screen, a few windows at a time in a stack the
           way the virus deals them, each stack started as far from the others as a few tries
           find, hanging off the edges as often as not. Where they go is kept as a share of the
           screen and how big they are in the desk's own size, so a screen that changes shape
           only moves them about; one that changes size a good deal gets a wall laid again. */
        let wallPlan = [], wallShown = 0, wallArea = 0, wallShape = 1;
        const screenArea = () => {
            const em = parseFloat(getComputedStyle(root).fontSize) || 16;
            return window.innerWidth * window.innerHeight / (em * em);
        };
        const planWall = () => {
            const wide = window.innerWidth, high = window.innerHeight;
            const em = parseFloat(getComputedStyle(root).fontSize) || 16;
            // The bar along the top has no window behind its words at the top of the page, so the
            // wall stays below it, as the pop-ups always have.
            const clear = Math.min(high * .2, document.querySelector('.navbar')?.getBoundingClientRect().bottom || 0);
            // A window of the wall, in cells, as near as most of them come.
            const [bw, bh] = brickSize(BRICKS[0]);
            const wanted = WALL_DEPTHS.map(({ scale, cover }) => cover * wide * high / (bw * bh * (.125 * em * scale) ** 2));
            const total = wanted.reduce((sum, n) => sum + n, 0);
            const grow = total > WALL_MOST ? Math.sqrt(total / WALL_MOST) : 1;
            const plan = [], deck = [];
            let group = 0;
            WALL_DEPTHS.forEach(({ scale }, depth) => {
                const unit = .125 * scale * grow, cell = unit * em;
                const pw = bw * cell, ph = bh * cell, step = 1.6 * em * scale * grow;
                const count = Math.max(1, Math.round(wanted[depth] / (grow * grow)));
                const starts = [];
                for (let made = 0; made < count; group += 1) {
                    let best = [0, 0], furthest = -1;
                    for (let tries = 0; tries < 6; tries++) {
                        const x = -pw * .4 + Math.random() * (wide - pw * .2), y = clear + Math.random() * (high - clear - ph * .6);
                        let nearest = Infinity;
                        for (const [sx, sy] of starts) nearest = Math.min(nearest, ((sx - x) / pw) ** 2 + ((sy - y) / ph) ** 2);
                        if (nearest > furthest) {
                            furthest = nearest;
                            best = [x, y];
                        }
                    }
                    starts.push(best);
                    // Further back first, give or take, and each stack in the order it is dealt.
                    const order = depth + Math.random() * 1.3;
                    for (let i = 0, length = Math.min(count - made, 1 + Math.floor(Math.random() * 4)); i < length; i++, made++) {
                        if (!deck.length) deck.push(...shuffled([...BRICKS]));
                        plan.push({ depth, unit, order, group, x: (best[0] + i * step) / wide, y: (best[1] + i * step) / high, brick: deck.pop() });
                    }
                }
            });
            return plan.sort((a, b) => a.order - b.order || a.group - b.group);
        };
        const showBrick = ({ brick, depth, unit, x, y }) => {
            const art = paintBrick(brick, depth);
            const image = document.createElement('img');
            image.className = 'vapor-brick';
            image.alt = '';
            image.decoding = 'sync';
            image.draggable = false;
            image.src = art.url;
            image.style.cssText = `left:${(x * 100).toFixed(2)}%;top:${(y * 100).toFixed(2)}%;width:${(art.width * unit).toFixed(3)}em;height:${(art.height * unit).toFixed(3)}em`;
            wallDepths[depth].appendChild(image);
        };
        const layWall = all => {
            wallDepths.forEach(depth => depth.replaceChildren());
            wallPlan = planWall();
            wallShown = 0;
            wallArea = screenArea();
            wallShape = window.innerWidth / window.innerHeight;
            if (all) while (wallShown < wallPlan.length) showBrick(wallPlan[wallShown++]);
        };

        /* The pop-ups in front. They come the way a virus's do, each a little down and to the
           right of the last, until the stack runs out of room and starts again somewhere else,
           a stack to each depth. */
        const stacks = [];
        const stackPlace = item => {
            const depth = Number(item.dataset.depth ?? 2);
            const step = deskEm * 1.6 * (FRONT_SCALES[depth] ?? 1);
            const width = item.offsetWidth, height = item.offsetHeight;
            let stack = stacks[depth];
            if (stack) {
                stack.x += step;
                stack.y += step;
                stack.left -= 1;
            }
            if (!stack || stack.left <= 0 || stack.x + width > window.innerWidth - 4 || stack.y + height > window.innerHeight - 4) {
                stack = stacks[depth] = {
                    x: 4 + Math.random() * Math.max(0, window.innerWidth - width - 8),
                    y: 60 + Math.random() * Math.max(0, window.innerHeight - height - 64),
                    left: 2 + Math.floor(Math.random() * STACK_MOST)
                };
            }
            return [stack.x, stack.y];
        };
        const makeNote = (title, answer, fill, act, colour = 'yellow', depth = 2) => {
            const made = makeWindow('note', title, colour);
            made.win.classList.add('vapor-popup', 'vapor-note', 'is-opening');
            made.win.dataset.depth = depth;
            const key = document.createElement('button');
            key.type = 'button';
            key.className = 'vapor-key';
            key.dataset.act = act;
            key.appendChild(pixelType(answer));
            made.pane.append(fill, key);
            place(made.win, ...stackPlace(made.win));
            raise(made.win);
            later(() => made.win.classList.remove('is-opening'), 260);
            return made.win;
        };
        /* Where they go, read off the page as it stands: every project once, the page's
           sections, each folder of the archive, and the page's own links. */
        const smoothly = () => (stillness.matches ? 'auto' : 'smooth');
        const toType = text => text.toUpperCase().replace(/&/g, '+').replace(/[^A-Z0-9 .!%:+?/_-]/g, '').replace(/\s+/g, ' ').trim();
        // Short enough for a title bar, cut where a word ends.
        const fit = (text, most = 26) => {
            const typed = toType(text);
            if (typed.length <= most) return typed;
            const cut = typed.slice(0, most + 1).lastIndexOf(' ');
            return (cut > 8 ? typed.slice(0, cut) : typed.slice(0, most)).replace(/[ :+/-]+$/, '');
        };
        const linkTo = (anchor, kinds) => {
            const href = anchor.getAttribute('href');
            const named = anchor.getAttribute('title') || anchor.textContent.trim() || 'link';
            const known = kinds.find(([pattern]) => pattern.test(`${named} ${anchor.textContent} ${href}`));
            const [, title, words, answer, bar] = known || [null, 'NEW LINK', fit(`OPEN ${named}`), 'OPEN', 'teal'];
            return {
                key: `link:${href}`, title, words, answer, bar, label: `Open ${named}`,
                // The page's own link, so it opens the way the page opens it.
                go: () => (anchor.isConnected ? anchor : [...document.querySelectorAll('a[href]')].find(a => a.getAttribute('href') === href))?.click()
            };
        };
        const destinations = () => {
            const out = [], seen = new Set();
            for (const card of document.querySelectorAll('.project-card')) {
                const picture = card.querySelector('img.project-image');
                const name = card.querySelector('.project-title')?.textContent.trim();
                if (!card._openProject || !picture || !name || seen.has(name)) continue;
                seen.add(name);
                out.push({ key: `project:${name}`, title: fit(name), picture, answer: 'OPEN', bar: 'purple', label: `Open the project ${name}`, go: () => card._openProject() });
            }
            for (const [title, words, answer, where, bar] of PLACES) {
                const section = where ? document.querySelector(where) : null;
                if (where && !section) continue;
                const named = section?.querySelector('.section-title')?.textContent.trim();
                out.push({
                    key: `place:${where}`, title, words, answer, bar, label: section ? `Go to ${named || answer.toLowerCase()}` : 'Back to the top',
                    go: () => (section ? section.scrollIntoView({ behavior: smoothly(), block: 'start' }) : window.scrollTo({ top: 0, behavior: smoothly() }))
                });
            }
            document.querySelectorAll('.project-collection').forEach((folder, i) => {
                const name = folder.querySelector('.collection-copy strong')?.textContent.trim();
                if (!name) return;
                const count = [...folder.querySelectorAll('.project-card')].filter(card => card._openProject).length;
                out.push({
                    key: `folder:${folder.id || name}`, title: FOLDER_TITLES[i % FOLDER_TITLES.length], words: fit(count ? `${name}: ${count}` : name, 30),
                    answer: 'OPEN', bar: 'yellow', label: `Open the ${name} folder`,
                    // As the page's own way into a folder does it: open it, then go to it.
                    go: () => {
                        const toggle = folder.querySelector('.collection-toggle');
                        if (toggle && toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
                        requestAnimationFrame(() => requestAnimationFrame(() => folder.scrollIntoView({ behavior: smoothly(), block: 'start' })));
                    }
                });
            });
            document.querySelectorAll('#contact-links-container a[href]').forEach(anchor => out.push(linkTo(anchor, LINKS)));
            document.querySelectorAll('footer a[href]').forEach(anchor => {
                if (FOOT_LINKS.some(([pattern]) => pattern.test(`${anchor.textContent} ${anchor.getAttribute('href')}`))) out.push(linkTo(anchor, FOOT_LINKS));
            });
            return out;
        };
        // What is out in front, by where it goes, the longest out first.
        const frontOut = new Map();
        const dropNote = win => {
            win.remove();
            if (win.goesTo && frontOut.get(win.goesTo) === win) frontOut.delete(win.goesTo);
        };
        // Somewhere not out yet if there is anywhere; otherwise the one out longest comes up again.
        const nextDestination = () => {
            const all = destinations();
            const fresh = all.filter(where => !frontOut.has(where.key));
            if (fresh.length) return fresh[Math.floor(Math.random() * fresh.length)];
            const oldest = frontOut.keys().next().value;
            return all.find(where => where.key === oldest) || all[0];
        };
        const frontNote = depth => {
            const where = nextDestination();
            if (!where) return;
            const old = frontOut.get(where.key);
            if (old) dropNote(old);
            let fill;
            if (where.picture) {
                fill = document.createElement('img');
                fill.className = 'vapor-snap';
                fill.alt = '';
                fill.draggable = false;
                snapOf(smallestCopy(where.picture)).then(url => { fill.src = url; }, () => {});
            } else {
                fill = pixelType(where.words);
                fill.classList.add('vapor-popup-words');
            }
            const win = makeNote(where.title, where.answer, fill, 'go', where.bar, depth);
            win.dataset.act = 'go';
            win.querySelector('.vapor-key').setAttribute('aria-label', where.label);
            win.onward = where.go;
            win.goesTo = where.key;
            frontOut.set(where.key, win);
        };
        /* The portfolio's own projects, each picture read once from the smallest copy there
           is and dithered down to a few colours on a very small canvas. */
        const smallestCopy = picture => {
            const set = picture.dataset.srcset || picture.getAttribute('srcset');
            return (set && set.split(',')[0].trim().split(/\s+/)[0]) || picture.dataset.src || picture.getAttribute('src');
        };
        const shrink = (image, canvas) => {
            const c = canvas.getContext('2d', { willReadFrequently: true });
            const scale = Math.max(SNAP_W / image.naturalWidth, SNAP_H / image.naturalHeight);
            c.drawImage(image, (SNAP_W - image.naturalWidth * scale) / 2, (SNAP_H - image.naturalHeight * scale) / 2, image.naturalWidth * scale, image.naturalHeight * scale);
            const frame = c.getImageData(0, 0, SNAP_W, SNAP_H), data = frame.data;
            for (let y = 0; y < SNAP_H; y++) {
                for (let x = 0; x < SNAP_W; x++) {
                    const at = (y * SNAP_W + x) * 4, nudge = (BAYER4[(y & 3) * 4 + (x & 3)] / 16 - .5) * 48;
                    for (let i = 0; i < 3; i++) data[at + i] = Math.round(Math.min(255, Math.max(0, data[at + i] + nudge)) / 51) * 51;
                }
            }
            c.putImageData(frame, 0, 0);
        };
        // A few at a time and decoded away from the page's thread, however many are due.
        // Each kept as a picture, for the same reason as the lettering.
        const snaps = new Map(), snapJobs = [];
        let snapsGoing = 0;
        const nextSnap = () => {
            while (snapsGoing < SNAPS_AT_ONCE && snapJobs.length) {
                snapsGoing += 1;
                snapJobs.shift()().finally(() => {
                    snapsGoing -= 1;
                    nextSnap();
                });
            }
        };
        const snapOf = url => {
            if (!snaps.has(url)) {
                snaps.set(url, new Promise((resolve, reject) => {
                    snapJobs.push(() => {
                        const image = new Image();
                        image.src = url;
                        return image.decode().then(() => {
                            const canvas = document.createElement('canvas');
                            canvas.width = SNAP_W;
                            canvas.height = SNAP_H;
                            shrink(image, canvas);
                            resolve(canvas.toDataURL());
                        }, reject);
                    });
                    nextSnap();
                }));
            }
            return snaps.get(url);
        };
        /* The robot gone bad, and the point of all this. Its own little screen, in the same
           large cells as everything else, with blocks of static flickering on and off round
           it and the robot on top keeping time: bobbing, looking at the cursor, baring its
           teeth, laughing, breaking up. Underneath it types out what it is doing to your
           machine, and when the bar is full, says so. Only the newest few act up at once and
           the rest hold still, so it costs a few very small pictures eight times a second. */
        const speckle = (size, colours, chance) => {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = size;
            const c = canvas.getContext('2d');
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    if (Math.random() > chance) continue;
                    c.fillStyle = colours[Math.floor(Math.random() * colours.length)];
                    c.fillRect(x, y, 1, 1);
                }
            }
            return canvas;
        };
        const robotIn = (outline, inside) => {
            const canvas = document.createElement('canvas');
            canvas.width = 19;
            canvas.height = 16;
            const c = canvas.getContext('2d');
            ROBOT.forEach((row, y) => {
                const first = row.indexOf('#'), last = row.lastIndexOf('#');
                if (y < 14 && first > -1) {
                    c.fillStyle = inside;
                    c.fillRect(first, y, last - first + 1, 1);
                }
                c.fillStyle = outline;
                [...row].forEach((v, x) => { if (v === '#') c.fillRect(x, y, 1, 1); });
            });
            return canvas;
        };
        const stillness = window.matchMedia('(prefers-reduced-motion: reduce)');
        // What it turns into when it stops pretending: a neon green outline of itself and
        // a red husk it leaves behind.
        const GREEN = '#39ff8a', RED = '#ff2d55';
        let sprites = null;
        const gremlinSprites = () => {
            if (!sprites) {
                sprites = {
                    grain: speckle(64, ['#f8b6ee', '#5ff0d8', '#ffffff', '#b18be8'], .55),
                    redGrain: speckle(64, [RED, RED, GREEN, '#ffffff'], .5),
                    body: robotIn('#fdeafb', '#241433'),
                    teal: robotIn('#5ff0d8', '#5ff0d8'),
                    pink: robotIn('#ff5c8a', '#ff5c8a'),
                    husk: robotIn(RED, '#1a0008'),
                    ghost: robotIn(GREEN, 'rgba(0, 0, 0, 0)')
                };
            }
            return sprites;
        };
        const stamp = (c, rows, x, y, colour) => {
            c.fillStyle = colour;
            rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') c.fillRect(x + i, y + j, 1, 1); });
        };
        // A line a pixel at a time, for limbs.
        const pixelLine = (c, x0, y0, x1, y1, colour) => {
            c.fillStyle = colour;
            x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
            const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
            let err = dx + dy;
            for (let n = 0; n < 64; n++) {
                c.fillRect(x0, y0, 1, 1);
                if (x0 === x1 && y0 === y1) break;
                const e2 = 2 * err;
                if (e2 >= dy) { err += dy; x0 += sx; }
                if (e2 <= dx) { err += dx; y0 += sy; }
            }
        };
        const EYE_LEFT = ['#..', '##.', '###'], EYE_RIGHT = ['..#', '.##', '###'], EYE_SHUT = ['...', '###', '...'];
        const GRIN = ['#.....#', '.#.#.#.', '..#.#..'];
        const LAUGH = [['.#####.', '#.#.#.#', '.#####.'], ['.......', '.#####.', '#.#.#.#']];
        const newBlock = () => {
            const w = 3 + Math.floor(Math.random() * 7), h = 2 + Math.floor(Math.random() * 6);
            return { x: Math.floor(Math.random() * (GREMLIN_W - w)), y: Math.floor(Math.random() * (GREMLIN_H - h)), w, h, life: 1 + Math.floor(Math.random() * 6) };
        };
        const jump = g => {
            g.jumpX = Math.floor(Math.random() * (GREMLIN_W - 19));
            g.jumpY = Math.floor(Math.random() * (GREMLIN_H - 16));
        };
        const drawGremlin = g => {
            const c = g.c, art = gremlinSprites(), t = g.beat, mood = g.mood;
            c.fillStyle = INK;
            c.fillRect(0, 0, GREMLIN_W, GREMLIN_H);
            const grain = mood === 'split' || mood === 'eyes' || mood === 'limbs' ? art.redGrain : art.grain;
            for (let i = 0; i < g.blocks.length; i++) {
                const b = g.blocks[i];
                c.drawImage(grain, Math.floor(Math.random() * (64 - b.w)), Math.floor(Math.random() * (64 - b.h)), b.w, b.h, b.x, b.y, b.w, b.h);
                b.life -= 1;
                if (b.life <= 0) g.blocks[i] = newBlock();
            }
            // The eyes are on you, wherever you go.
            const left = parseFloat(g.win.dataset.dx) || 0;
            const look = pointerX < left ? -1 : pointerX > left + g.width ? 1 : 0;
            if (mood === 'limbs') {
                // Its face, gone to a green box, and limbs grown out of it that will not keep still.
                const fx = 16, fy = 9, fw = 16, fh = 12;
                for (const limb of g.limbs) {
                    const fromX = limb.side < 0 ? fx : fx + fw - 1, fromY = fy + limb.row;
                    const twitch = (Math.random() - .5) * 3;
                    const kneeX = fromX + limb.side * limb.reach * .5, kneeY = fromY + limb.bend + twitch;
                    const tipX = fromX + limb.side * limb.reach, tipY = fromY + limb.bend * 2.2 + twitch * 1.6 + (limb.row > 6 ? 4 : -2);
                    pixelLine(c, fromX, fromY, kneeX, kneeY, GREEN);
                    pixelLine(c, kneeX, kneeY, tipX, tipY, GREEN);
                }
                c.fillStyle = INK;
                c.fillRect(fx, fy, fw, fh);
                c.fillStyle = GREEN;
                c.fillRect(fx, fy, fw, 1);
                c.fillRect(fx, fy + fh - 1, fw, 1);
                c.fillRect(fx, fy, 1, fh);
                c.fillRect(fx + fw - 1, fy, 1, fh);
                stamp(c, ['##', '##'], fx + 4 + look, fy + 3, RED);
                stamp(c, ['##', '##'], fx + 10 + look, fy + 3, RED);
                stamp(c, t % 2 ? ['#.#.#.#.#'] : ['.#.#.#.#.'], fx + 3, fy + 8, GREEN);
            } else if (mood === 'split') {
                // The body stays behind, an empty red husk, and the real thing is somewhere else.
                c.drawImage(art.husk, 14, 9);
                c.drawImage(art.ghost, g.jumpX, g.jumpY);
                stamp(c, EYE_LEFT, g.jumpX + 5 + look, g.jumpY + 5, GREEN);
                stamp(c, EYE_RIGHT, g.jumpX + 11 + look, g.jumpY + 5, GREEN);
            } else {
                const laughing = mood === 'laugh';
                let x = 14, y = 9 + (t % 4 < 2 ? 0 : 1);
                if (laughing) {
                    x += t % 2 ? 1 : -1;
                    y = 9 + t % 2;
                }
                if (mood === 'skitter') {
                    x = g.jumpX;
                    y = g.jumpY;
                }
                if (mood === 'glitch') {
                    c.drawImage(art.teal, x - 2, y);
                    c.drawImage(art.pink, x + 2, y);
                }
                c.drawImage(art.body, x, y);
                stamp(c, mood === 'wink' ? EYE_SHUT : EYE_LEFT, x + 5 + look, y + 5, HOT);
                stamp(c, EYE_RIGHT, x + 11 + look, y + 5, HOT);
                stamp(c, laughing ? LAUGH[t % 2] : GRIN, x + 6, y + 9, '#ffffff');
                if (t % 3 === 0) stamp(c, ['#.#', '.#.'], x + 8, y - 3, t % 2 ? '#5ff0d8' : '#f5ea5a');
            }
            if (mood === 'eyes') {
                // Eyes opening all over its screen, more of them every moment, every one on you.
                for (const eye of g.eyes) {
                    if (Math.random() < .12) eye.open = !eye.open;
                    if (eye.open) {
                        stamp(c, ['.##.', '####', '.##.'], eye.x, eye.y, RED);
                        c.fillStyle = INK;
                        c.fillRect(eye.x + 1 + (look > 0 ? 1 : look < 0 ? 0 : .5), eye.y + 1, 1, 1);
                    } else stamp(c, ['####'], eye.x, eye.y + 1, '#5a0c1c');
                }
            }
            // Breaking up: bands of the picture pulled sideways.
            if (mood === 'glitch' || mood === 'split' || (mood === 'skitter' && Math.random() < .5)) {
                for (let band = 0; band < 3; band++) {
                    const top = Math.floor(Math.random() * (GREMLIN_H - 4)), tall = 2 + Math.floor(Math.random() * 3);
                    c.drawImage(g.screen, 0, top, GREMLIN_W, tall, (Math.random() < .5 ? -1 : 1) * (2 + Math.floor(Math.random() * 5)), top, GREMLIN_W, tall);
                }
            }
        };
        const setMood = (g, mood, beats) => {
            g.mood = mood;
            g.moodLeft = beats;
        };
        // Its moods come in fits, never on a rhythm: [mood, how often, fewest beats, most].
        const MOODS = [['grin', .24, 8, 22], ['laugh', .13, 6, 14], ['glitch', .1, 2, 4], ['wink', .05, 3, 3],
            ['eyes', .15, 10, 20], ['split', .13, 6, 14], ['limbs', .11, 8, 16], ['skitter', .09, 3, 8]];
        const nextMood = g => {
            let roll = Math.random();
            let picked = MOODS[0];
            for (const mood of MOODS) {
                picked = mood;
                roll -= mood[1];
                if (roll <= 0) break;
            }
            setMood(g, picked[0], picked[2] + Math.floor(Math.random() * (picked[3] - picked[2] + 1)));
            g.eyes = [];
            jump(g);
            if (g.mood === 'limbs') {
                g.limbs = Array.from({ length: 4 + Math.floor(Math.random() * 3) }, (_, i) => ({
                    side: i % 2 ? 1 : -1, row: 1 + Math.floor(Math.random() * 10), reach: 5 + Math.random() * 10, bend: Math.random() * 6 - 3
                }));
            }
            // Sometimes it goes dead still first, which is worse.
            g.frozen = Math.random() < .22 ? 3 + Math.floor(Math.random() * 10) : 0;
        };
        const threaten = g => {
            g.text = THREATS[g.threat++ % THREATS.length];
            g.typed = 0;
            g.gloating = false;
            g.left = 0;
            g.fill.parentElement.classList.remove('is-printing');
            void g.fill.offsetWidth;
            g.fill.parentElement.style.setProperty('--vapor-print-time', `${g.hackBeats * BEAT_MS / 1000}s`);
            g.fill.parentElement.classList.add('is-printing');
            g.left = g.hackBeats;
        };
        const gloat = (g, text) => {
            g.text = text;
            g.typed = text.length;
            g.gloating = true;
            g.left = 20;
            drawType(g.words, text, '#ff5c8a');
            setMood(g, 'laugh', 16);
            g.frozen = 0;
        };
        const stepGremlin = g => {
            if (g.frozen > 0) {
                g.frozen -= 1;
                return;
            }
            g.beat += 1;
            g.moodLeft -= 1;
            if (g.moodLeft <= 0) nextMood(g);
            if (g.mood === 'skitter') jump(g);
            else if (g.mood === 'split' && Math.random() < .45) jump(g);
            else if (g.mood === 'eyes' && g.eyes.length < 26) {
                for (let n = 0, more = 1 + Math.floor(Math.random() * 3); n < more; n++) {
                    g.eyes.push({ x: Math.floor(Math.random() * (GREMLIN_W - 5)), y: Math.floor(Math.random() * (GREMLIN_H - 4)), open: true });
                }
            }
            if (!g.gloating && g.typed < g.text.length) {
                g.typed += 1;
                drawType(g.words, g.text.slice(0, g.typed).padEnd(g.text.length), '#ff5c8a');
            }
            g.left -= 1;
            if (g.left <= 0) {
                if (g.gloating) threaten(g);
                else gloat(g, GLOATS[Math.floor(Math.random() * GLOATS.length)]);
            }
            drawGremlin(g);
            // Now and then it lashes out at the desk itself.
            if (Math.random() < .011) lashOut(g);
        };
        /* It does not stay in its window. It glitches to another place, or hangs off the
           top of the screen; it shakes; green outlines of it flicker up all over the desk
           and are gone; or a red pulse goes through the lot. */
        const ghosts = [];
        let ghostSource = '';
        const haunt = () => {
            if (stillness.matches) return;
            if (!ghostSource) {
                const art = gremlinSprites();
                const outline = document.createElement('canvas');
                outline.width = 19;
                outline.height = 16;
                const c = outline.getContext('2d');
                c.drawImage(art.ghost, 0, 0);
                stamp(c, EYE_LEFT, 5, 5, GREEN);
                stamp(c, EYE_RIGHT, 11, 5, GREEN);
                ghostSource = outline.toDataURL();
            }
            if (!ghosts.length) {
                for (let i = 0; i < 2; i++) {
                    const ghost = document.createElement('img');
                    ghost.className = 'vapor-ghost';
                    ghost.alt = '';
                    ghost.src = ghostSource;
                    ghost.hidden = true;
                    root.appendChild(ghost);
                    ghosts.push(ghost);
                }
            }
            let flickers = 3 + Math.floor(Math.random() * 5), at = 0;
            while (flickers-- > 0) {
                const ghost = ghosts[flickers % ghosts.length];
                at += 60 + Math.random() * 180;
                later(() => {
                    ghost.style.setProperty('--dx', `${Math.random() * (window.innerWidth - 80)}px`);
                    ghost.style.setProperty('--dy', `${60 + Math.random() * (window.innerHeight - 160)}px`);
                    ghost.style.setProperty('--ghost-scale', (.7 + Math.random() * 1.1).toFixed(2));
                    ghost.style.zIndex = 9e6 + top;
                    ghost.hidden = false;
                    later(() => { ghost.hidden = true; }, 50 + Math.random() * 120);
                }, at);
            }
        };
        const lashOut = g => {
            const roll = Math.random();
            if (roll < .3) haunt();
            else if (roll < .5) {
                g.win.classList.remove('is-opening');
                void g.win.offsetWidth;
                g.win.classList.add('is-opening');
                place(g.win, ...gremlinPlace(g.win));
                later(() => g.win.classList.remove('is-opening'), 300);
            } else if (roll < .65) {
                place(g.win, ...keepReachable(g.win, parseFloat(g.win.dataset.dx) || 0, -g.win.offsetHeight * .4));
                g.win.classList.add('is-buzzing');
                later(() => g.win.classList.remove('is-buzzing'), 620);
            } else if (roll < .85) surge(8, true);
            else surge(6);
        };
        const gremlins = [];
        // Where it can be seen: clear of the page's name where there is room, and as far
        // from the others as a few tries find.
        const gremlinPlace = item => {
            const width = item.offsetWidth, height = item.offsetHeight, wide = window.innerWidth, high = window.innerHeight;
            const fromX = isTall() ? 4 : wide * .5, fromY = isTall() ? high * .42 : 64;
            let best = [fromX, fromY], furthest = -1;
            for (let i = 0; i < 10; i++) {
                const x = fromX + Math.random() * Math.max(0, wide - width - 8 - fromX), y = fromY + Math.random() * Math.max(0, high - height - 8 - fromY);
                let nearest = Infinity;
                for (const g of gremlins) nearest = Math.min(nearest, Math.hypot(x - (parseFloat(g.win.dataset.dx) || 0), y - (parseFloat(g.win.dataset.dy) || 0)));
                if (nearest > furthest) {
                    furthest = nearest;
                    best = [x, y];
                }
            }
            return best;
        };
        const seatGremlin = () => {
            const screen = document.createElement('canvas');
            screen.className = 'vapor-gremlin';
            screen.width = GREMLIN_W;
            screen.height = GREMLIN_H;
            screen.setAttribute('role', 'img');
            screen.setAttribute('aria-label', 'The robot, gone bad, laughing at you');
            // Its typing changes as it goes, so it stays a canvas, on the robot's own layer.
            const words = document.createElement('canvas');
            words.className = 'vapor-type';
            drawType(words, '');
            const bar = document.createElement('div');
            bar.className = 'vapor-progress';
            const fill = document.createElement('i');
            bar.appendChild(fill);
            const body = document.createElement('div');
            body.className = 'vapor-gremlin-body';
            body.append(screen, words, bar);
            const win = makeNote(GREMLIN_TITLE, 'STOP IT', body, 'stop', 'hot');
            win.classList.add('vapor-gremlin-win');
            const g = {
                win, screen, words, fill, c: screen.getContext('2d'), beat: Math.floor(Math.random() * 8), mood: 'grin', moodLeft: 10,
                threat: Math.floor(Math.random() * THREATS.length), text: '', typed: 0, gloating: false, left: 0,
                hackBeats: 32 + Math.floor(Math.random() * 40), width: win.offsetWidth,
                blocks: Array.from({ length: 12 }, newBlock)
            };
            win.gremlin = g;
            raise(win);
            place(win, ...gremlinPlace(win));
            threaten(g);
            drawGremlin(g);
            gremlins.push(g);
            // The older ones hold still, their last face on them.
            while (gremlins.length > GREMLINS_LIVE) gremlins.shift();
        };
        const speak = () => { if (outNow() < mostOut) seatGremlin(); };
        // Pressing STOP only makes it worse.
        const taunt = g => {
            if (!gremlins.includes(g)) {
                gremlins.push(g);
                while (gremlins.length > GREMLINS_LIVE) gremlins.shift();
            }
            gloat(g, 'NO.');
            surge(8);
            if (outNow() < mostOut) frontNote(laterDepth());
        };
        // And closing it only brings it back, with a friend.
        const comeBack = g => {
            const at = gremlins.indexOf(g);
            if (at > -1) gremlins.splice(at, 1);
            later(() => {
                speak();
                if (outNow() < mostOut) frontNote(laterDepth());
                surge(8);
            }, 350);
        };
        /* A surge: static breaking out across the whole desk in blocks that flicker on and
           off, and whatever is out shaking like a phone that will not stop ringing. Once it
           passes its canvas is put away and asks for nothing. */
        const deskEm = parseFloat(getComputedStyle(root).fontSize);
        /* How many come out in the burst. The wall is enough to bury a screen of any size a few
           times over. In front, every place there is to go, or as many as three depths of a
           screen this size have room for, whichever is fewer, with the desk's own six things and
           the robot three times; the rest of the places come after, one at a time. */
        const frontCount = Math.max(8, Math.min(destinations().length, Math.round(screenArea() / 90)));
        const burstCount = frontCount + waiting.length + 3;
        const burstGap = BURST_MS / burstCount, mostOut = burstCount + 60, gremlinEvery = Math.round(burstCount / 3);
        // The burst lays the front from the back depth to the nearest; after it, any depth.
        const laterDepth = () => [0, 1, 1, 2, 2, 2][Math.floor(Math.random() * 6)];
        const burstDepth = () => Math.min(2, Math.floor(3 * popped / burstCount));
        const crackle = document.createElement('canvas');
        crackle.className = 'vapor-static';
        crackle.hidden = true;
        root.appendChild(crackle);
        let crackleLeft = 0, grit = null, redGrit = null, crackleRed = false;
        const CRACKLE_CELL = 6;
        const drawCrackle = () => {
            const c = crackle.getContext('2d'), w = crackle.width, h = crackle.height;
            c.clearRect(0, 0, w, h);
            const blocks = Math.ceil(w * h / 700);
            for (let i = 0; i < blocks; i++) {
                const bw = 4 + Math.floor(Math.random() * 18), bh = 3 + Math.floor(Math.random() * 12);
                c.drawImage(crackleRed ? redGrit : grit, Math.floor(Math.random() * (96 - bw)), Math.floor(Math.random() * (96 - bh)), bw, bh, Math.floor(Math.random() * w), Math.floor(Math.random() * h), bw, bh);
            }
        };
        const surge = (beats, red = false) => {
            if (stillness.matches) return;
            crackleRed = red;
            if (!crackleLeft) {
                if (!grit) grit = speckle(96, [INK, INK, '#ffffff', '#5ff0d8', '#ff5c8a'], .6);
                if (!redGrit) redGrit = speckle(96, [INK, INK, RED, RED, GREEN], .55);
                crackle.width = Math.ceil(window.innerWidth / CRACKLE_CELL);
                crackle.height = Math.ceil(window.innerHeight / CRACKLE_CELL);
                crackle.hidden = false;
            }
            crackleLeft = Math.max(crackleLeft, beats);
            // Only what is on top of the pile shakes: anything moving under the rest would
            // have the whole pile above it painted again.
            const out = [...gremlins.map(g => g.win), ...[...root.querySelectorAll('.vapor-note:not([hidden])')].slice(-3)];
            for (let i = 0; i < 8 && out.length; i++) {
                const item = out.splice(Math.floor(Math.random() * out.length), 1)[0];
                item.classList.add('is-buzzing');
                later(() => item.classList.remove('is-buzzing'), 620);
            }
        };
        let pointerX = window.innerWidth / 2, paused = false;
        const onDeskPointer = event => { pointerX = event.clientX; };
        const onProjectOpen = () => { paused = true; };
        const onProjectClose = () => { paused = false; };
        window.addEventListener('pointermove', onDeskPointer, { passive: true });
        document.addEventListener('portfolio:modal-open', onProjectOpen);
        document.addEventListener('portfolio:modal-close', onProjectClose);
        const beat = () => {
            if (!paused && !document.hidden) {
                for (const g of gremlins) stepGremlin(g);
                if (crackleLeft > 0) {
                    crackleLeft -= 1;
                    if (crackleLeft > 0) drawCrackle();
                    else {
                        crackle.hidden = true;
                        crackle.width = crackle.height = 1;
                    }
                }
            }
            later(beat, BEAT_MS);
        };
        if (!stillness.matches) later(beat, BEAT_MS);

        const outNow = () => root.querySelectorAll('[data-item]:not([hidden])').length + over.querySelectorAll('[data-item]:not([hidden])').length;
        let lastGremlin = 0, burstFrom = 0;
        const popOne = () => {
            const realThing = popped < burstCount ? Math.random() < waiting.length / (burstCount - popped) : waiting.length > 0;
            // It arrives first, and keeps turning up.
            // The pop-ups in front come round again rather than piling up, so the robot would
            // pile up in their place: no more than four of it come of their own accord, each on
            // a layer of its own. Closing one still brings it back with a friend.
            if (popped === 0 || (!realThing && popped - lastGremlin >= gremlinEvery && root.querySelectorAll('.vapor-gremlin-win').length < GREMLINS_SEATED)) {
                seatGremlin();
                lastGremlin = popped;
            } else if (realThing) open(waiting[0], true);
            else frontNote(popped < burstCount ? burstDepth() : laterDepth());
            if (popped === 0) surge(Math.round(BURST_MS / BEAT_MS));
            else if (popped >= burstCount && Math.random() < .4) surge(10);
            popped += 1;
        };
        layWall(false);
        const popNext = () => {
            const bursting = popped < burstCount || wallShown < wallPlan.length;
            if (!document.hidden) {
                // On time however late the timer comes, as busy as the page is in the burst: as
                // many as are due by now, a few at a time at most.
                if (!burstFrom) burstFrom = performance.now();
                const gone = performance.now() - burstFrom;
                if (wallShown < wallPlan.length) {
                    const due = Math.ceil(wallPlan.length * Math.min(1, gone / BURST_MS));
                    for (let n = 0; n < 24 && wallShown < due; n++) showBrick(wallPlan[wallShown++]);
                }
                if (outNow() < mostOut) {
                    if (popped < burstCount) {
                        const due = Math.min(burstCount, 1 + Math.floor(gone / burstGap));
                        for (let n = 0; n < 4 && popped < due && outNow() < mostOut; n++) popOne();
                    } else if (!bursting) popOne();
                }
            }
            later(popNext, popped < burstCount || wallShown < wallPlan.length ? BURST_TICK_MS : LATER_GAP_MS + Math.random() * LATER_SPREAD_MS);
        };
        later(popNext, BURST_TICK_MS);

        return {
            redraw() {
                askPattern();
                drawRings();
                // A screen of a very different size or shape, a phone turned on its side, gets a
                // wall of its own; a finished one at once.
                const shape = window.innerWidth / window.innerHeight;
                if (Math.abs(screenArea() / wallArea - 1) > .35 || Math.abs(Math.log(shape / wallShape)) > .4) layWall(wallShown >= wallPlan.length);
                // A smaller window must not strand anything out of reach.
                root.querySelectorAll('[data-item]:not([hidden])').forEach(item => {
                    place(item, ...keepReachable(item, parseFloat(item.dataset.dx) || 0, parseFloat(item.dataset.dy) || 0));
                });
            },
            remove() {
                letGo();
                window.removeEventListener('pointermove', onDeskPointer);
                document.removeEventListener('portfolio:modal-open', onProjectOpen);
                document.removeEventListener('portfolio:modal-close', onProjectClose);
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
