/* The eye, at Medium: the first of Medium FX's hidden looks.

   Two quick presses on the effects slider's Medium stop go round Medium's looks: the still
   stars, this, the pink desk (vapor.js), and the stars again (the slider code in
   portfolio.js). It is the same eye as Low's (y2k.js) and High's (ego.js), with what lies
   between them to spend.

   Low's works out each cell on the page's own thread a few times a second. High's runs on
   the graphics card on every frame, through a second pass full of light. This is the one
   pass on the graphics card, thirty times a second, and only while something is moving:
   a ball that turns, with veins that go round with it, a lit rim, lids that follow it and
   a soft light under the dither. Between one movement and the next it asks for no frames
   at all, as Medium promises. Once awake it looks about for itself and blinks. Pressed twice
   on the eye, it follows the pointer for ten seconds,
   its pupil pinned and the iris flushed. Not fetched until someone asks, and leaving it
   takes it off the page; what was compiled for it is kept for the next time. */
(function () {
    'use strict';

    const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
    const smooth = (low, high, value) => {
        const t = clamp((value - low) / (high - low), 0, 1);
        return t * t * (3 - 2 * t);
    };
    const FRAME_MS = 32;
    const FOLLOW_MS = 10000;
    const DOUBLE_PRESS_MS = 450;
    // The waking's clock (it starts SHUT_MS in, the lids flying open), how long after it is
    // brought in a press is ignored, how long light pours into its iris before it wakes, and
    // how long it goes wild once it has.
    const SHUT_MS = 650, SETTLE_MS = SHUT_MS + 700, GATHER_MS = 600, FRENZY_MS = 500;
    // How long it takes to build itself, from the bones out, when it is brought in.
    const BIRTH_MS = 5000;
    // How far the ball can turn, in radians: a long way to the sides, less up and down.
    const MOST_YAW = .72, MOST_PITCH = .3;
    const turnFor = (offset, most) => clamp(Math.asin(clamp(offset, -1, 1)), -most, most);

    const QUAD = `#version 300 es
        void main() {
            vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
            gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
        }`;

    const EYE = `#version 300 es
        precision highp float;
        uniform vec2 uGrid, uEye, uLookAt, uLid;
        uniform vec3 uSize;
        uniform mat3 uTurn;
        uniform float uBall, uCap, uIris, uOpen, uPupil, uShock, uTall, uFollow, uBirth;
        out vec4 outColor;
        const float TAU = 6.2831853;
        const vec3 LIGHT = vec3(0.26, -0.34, 0.9);
        const vec3 WIRE = vec3(0.5, 0.95, 1.0);
        float hash(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
        }
        float noise(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
        }
        float fbm(vec2 p) {
            float a = 0.5, s = 0.0;
            for (int i = 0; i < 3; i++) {
                s += a * noise(p);
                p = p * 2.03 + 17.1;
                a *= 0.5;
            }
            return s / 0.875;
        }
        float bayer(vec2 p) {
            ivec2 c = ivec2(mod(p, 8.0));
            int x = c.x, y = c.y, z = x ^ y;
            int v = ((z & 1) << 5) | ((y & 1) << 4) | ((z & 2) << 2) | ((y & 2) << 1) | ((z & 4) >> 1) | ((y & 4) >> 2);
            return (float(v) + 0.5) / 64.0;
        }
        void main() {
            vec2 cell = vec2(floor(gl_FragCoord.x), uGrid.y - 1.0 - floor(gl_FragCoord.y));
            vec2 r = cell / uGrid;
            float x = cell.x, y = cell.y;
            // The lids go a little way with the ball, as lids do.
            float u = clamp((x - uEye.x - uLid.x) / uSize.x, -1.0, 1.0);
            float edge = pow(1.0 - u * u, 1.08);
            float middle = uEye.y + uLid.y;
            // Being born, over five seconds, from the bones out, as High's is (ego.js): a wire
            // skeleton, its pieces coming in from round it, veins growing over the white from the
            // rim, the iris, the skin closing over it into lids, and the seams sealed.
            float born = uBirth;
            float wireIn = smoothstep(0.0, 0.2, born), wireOut = 1.0 - smoothstep(0.78, 0.96, born);
            float sealed = smoothstep(0.86, 0.99, born);
            float veinsIn = smoothstep(0.4, 0.68, born);
            float irisIn = smoothstep(0.55, 0.84, born);
            float skinIn = smoothstep(0.66, 0.92, born);
            float opening = mix(2.6, edge, skinIn);
            float top = middle - uOpen * uSize.y * opening, foot = middle + uOpen * uSize.z * opening;
            float lidTop = middle - uOpen * uSize.y * edge, lidFoot = middle + uOpen * uSize.z * edge;
            float dim = mix(0.24 + 0.76 * smoothstep(0.14, 0.68, r.x), 0.46, uTall) * (0.3 + 0.7 * smoothstep(0.05, 0.17, r.y));
            float warm = smoothstep(0.25, 0.95, r.x) * smoothstep(0.8, 0.1, r.y);
            float cool = smoothstep(0.7, 0.1, r.x) * smoothstep(0.3, 1.0, r.y);
            vec3 color = vec3(206.0 + warm * 49.0 - cool * 90.0, 190.0 - warm * 70.0 - cool * 20.0, 255.0 - warm * 14.0) / 255.0;
            float tone;
            vec2 toEye = cell - uEye;
            float wedgeAt = (atan(toEye.y, toEye.x) / TAU + 0.5) * 10.0;
            float wedge = floor(wedgeAt);
            float due = 0.18 + 0.3 * hash(vec2(wedge, 7.0));
            float apart = 1.0 - smoothstep(due, due + 0.16, born);
            float mid = (wedge + 0.5) / 10.0 * TAU - TAU * 0.5;
            vec2 outward = vec2(cos(mid), sin(mid));
            vec2 placed = toEye - outward * apart * uBall * 0.5;
            bool gap = apart > 0.0 && dot(placed, outward) < 0.0;
            float seamAt = min(fract(wedgeAt), 1.0 - fract(wedgeAt)) * TAU / 10.0 * length(toEye);
            float seam = (1.0 - sealed) * smoothstep(1.6, 0.4, seamAt);
            float moving = apart * (1.0 - apart) * 4.0;
            toEye = placed;
            float rr = length(toEye) / uBall;
            if (y > top && y < foot) {
                // The ball. Where this cell lands on it is n, and p is the part of the ball
                // that has turned to face it, so everything painted by p goes round with it.
                vec2 across = toEye / uBall;
                float reach = dot(across, across);
                if (gap) tone = 0.0;
                else if (reach < 1.0) {
                    vec3 n = vec3(across, sqrt(1.0 - reach));
                    vec3 p = uTurn * n;
                    float k = acos(clamp(p.z, -1.0, 1.0)) / uCap;
                    float angle = atan(p.y, p.x);
                    float light = max(0.0, dot(n, LIGHT));
                    // The white, round under its light, with veins in it.
                    tone = 0.05 + 0.6 * pow(light, 1.5);
                    float rn = fbm(p.xy / (1.0 + max(p.z, -0.6)) * 13.0);
                    float reachOf = mix(2.6, 0.75, veinsIn);
                    float vein = pow(1.0 - abs(rn * 2.0 - 1.0), 44.0) * smoothstep(0.75, 1.9, k) * smoothstep(reachOf - 0.12, reachOf, k) * step(0.001, veinsIn);
                    float tip = pow(1.0 - abs(rn * 2.0 - 1.0), 30.0) * exp(-pow((k - reachOf) / 0.07, 2.0)) * veinsIn * (1.0 - veinsIn) * 4.0;
                    if (vein > 0.3) {
                        tone = max(tone, vein * 0.9);
                        color = mix(color, vec3(1.0, 0.36, 0.72), 0.8);
                    }
                    if (tip > 0.2) {
                        tone = max(tone, tip);
                        color = mix(color, vec3(1.0, 0.85, 0.95), 0.8);
                    }
                    if (k < 1.0 && irisIn > 0.0) {
                        float pupil = 0.36 + uPupil;
                        float fibre = 0.5 + 0.5 * sin(angle * 34.0 + sin(angle * 9.0) * 1.6);
                        tone = 0.2 + 0.62 * fibre * smoothstep(pupil - 0.06, 0.7, k) * smoothstep(1.0, 0.78, k);
                        tone += 0.24 * exp(-pow((k - 0.48) / 0.07, 2.0));
                        tone *= smoothstep(1.0, 0.9, k) * 0.9 + 0.1;
                        color = mix(vec3(1.0, 0.5 + k * 0.24, 0.84), vec3(0.74, 0.5, 1.0), smoothstep(0.42, 0.7, k));
                        color = mix(color, vec3(1.0, 0.32, 0.56), uFollow * 0.55);
                        tone += uFollow * 0.1;
                        if (k < pupil) tone = 0.0;
                        else tone = max(tone, 0.14 * smoothstep(pupil * 1.3, pupil, k));
                        tone *= 0.42 + 0.72 * light;
                        // Winding in, from its rim to its middle.
                        float irisHere = smoothstep((1.0 - k) * 0.85 + fract(angle / TAU + 0.5) * 0.15 - 0.06, (1.0 - k) * 0.85 + fract(angle / TAU + 0.5) * 0.15, irisIn * 1.1);
                        tone = mix(0.05 + 0.6 * pow(light, 1.5), tone, irisHere);
                    }
                    // Light caught round the edge of the ball, where it turns away.
                    float rim = pow(1.0 - n.z, 2.6);
                    tone += rim * 0.6;
                    color = mix(color, vec3(0.62, 0.42, 1.0), min(1.0, rim * 1.4));
                    // The window it reflects stays with the room, and only slides a little
                    // as the bulge of the eye comes round under it.
                    vec2 glint = (toEye - (uLookAt - uEye) * 0.28) / uIris;
                    if (born > 0.9 && (length(glint - vec2(0.3, -0.34)) < 0.09 || length(glint + vec2(0.24, -0.3)) < 0.035)) {
                        tone = 1.0;
                        color = vec3(1.0);
                    }
                    // Before the skin, the flesh of it, scanned in lines; the wire skeleton drawn
                    // in line by line, with its iris and pupil ringed and a cross through it; the
                    // pieces' cut edges lit as they move; and a ring of light sealing it.
                    float bare = 1.0 - skinIn;
                    tone *= 1.0 - 0.45 * bare * (0.5 + 0.5 * step(0.5, fract(y * 0.5)));
                    color = mix(color, vec3(0.86, 0.34, 0.5), 0.5 * bare * (1.0 - irisIn));
                    float away = acos(clamp(p.z, -1.0, 1.0)), lines = 16.0 * wireIn;
                    float wireLon = step(fract(angle / TAU + 0.5) * 16.0, lines) * smoothstep(0.9, 1.0, abs(fract(angle / TAU * 16.0) - 0.5) * 2.0);
                    float wireLat = step(away / 3.1416 * 9.0, lines) * smoothstep(0.88, 1.0, abs(fract(away * 2.9) - 0.5) * 2.0);
                    float marks = 0.0;
                    if (abs(length(toEye) - uIris) < 0.7 || abs(length(toEye) - uIris * (0.36 + uPupil)) < 0.6) marks = step(0.5, fract(atan(toEye.y, toEye.x) * 12.0));
                    if ((abs(toEye.x) < 0.6 || abs(toEye.y) < 0.6) && length(toEye) < uBall) marks = max(marks, step(0.45, fract(length(toEye) * 0.25)));
                    float wire = max(max(wireLon, wireLat) * wireIn, marks * wireIn * 0.8) * wireOut;
                    tone = max(tone * (0.15 + 0.85 * smoothstep(0.12, 0.5, born)), wire * 0.95);
                    color = mix(color, WIRE, wire * 0.85);
                    float cut = moving * (smoothstep(1.4, 0.3, seamAt) + smoothstep(0.9, 1.0, rr));
                    tone = max(tone * (1.0 - seam * 0.85), cut * 0.9);
                    color = mix(color, WIRE, min(1.0, cut));
                    float fuse = exp(-pow((rr - (1.15 - sealed * 1.3)) / 0.07, 2.0)) * sealed * (1.0 - sealed) * 4.0;
                    tone += fuse * 0.85;
                    color = mix(color, vec3(0.9, 0.97, 1.0), min(1.0, fuse));
                } else tone = 0.025;
                // The shadows the lids throw on it.
                float under = (y - top) / (uGrid.y * 0.07);
                if (under < 1.0) tone *= 0.15 + 0.85 * under;
                float above = (foot - y) / (uGrid.y * 0.03);
                if (above < 1.0) tone *= 0.5 + 0.5 * above;
            } else {
                // The skin round it: a crease above, a fold below, and the dark beyond them.
                float crease = middle - (uSize.y + uGrid.y * 0.085) * pow(edge, 0.8);
                float fold = middle + (uSize.z + uGrid.y * 0.07) * pow(edge, 0.8);
                tone = 0.05 + 0.2 * exp(-pow((y - top) / (uGrid.y * 0.16), 2.0)) + 0.16 * exp(-pow((y - foot) / (uGrid.y * 0.1), 2.0));
                tone += 0.46 * exp(-pow((y - crease) / (uGrid.y * 0.009 + 0.9), 2.0)) * min(1.0, edge * 2.6);
                tone += 0.24 * exp(-pow((y - fold) / (uGrid.y * 0.007 + 0.8), 2.0)) * min(1.0, edge * 2.6);
                float toLid = min(abs(y - top), abs(y - foot));
                if (edge > 0.02 && toLid < 1.3) tone = abs(y - top) < 1.3 ? 0.92 : 0.6;
                // The skin comes in from the edges of the screen.
                float fromEdge = max(abs(r.x - 0.5) * 2.0, abs(r.y - 0.5) * 2.0);
                tone *= smoothstep(1.0 - skinIn * 1.15, 1.0 - skinIn * 1.15 + 0.12, fromEdge) * skinIn;
            }
            // Before the skin, where the lids will be, drawn in wire.
            if (wireOut > 0.0 && edge > 0.02 && (abs(y - lidTop) < 0.7 || abs(y - lidFoot) < 0.7) && step(0.5, fract(x * 0.2)) > 0.0) {
                tone = max(tone, 0.7 * wireIn * wireOut * (1.0 - skinIn * 0.6));
                color = mix(color, WIRE, 0.85);
            }
            // A shock sends rings out from it across everything, one after another.
            if (uShock >= 0.0) {
                for (int i = 0; i < 3; i++) {
                    float s = uShock - float(i) * 0.16;
                    if (s < 0.0 || s > 1.0) continue;
                    float wave = exp(-pow((length(cell - uLookAt) / uGrid.x - s * 1.5) / (0.018 + 0.01 * float(i)), 2.0)) * (1.0 - s) * (1.0 - 0.3 * float(i));
                    tone += wave * 1.5;
                    color = mix(color, vec3(1.0, 0.78, 0.96), min(1.0, wave * 2.0));
                }
            }
            // The cells the dither leaves dark keep a little of the light, soft, which is
            // what Low's has no way to do.
            bool on = tone * (0.35 + 0.65 * dim) > bayer(cell);
            float alpha = on ? 0.38 + 0.62 * dim : min(0.34, tone * dim * 0.34);
            outColor = vec4(color * alpha, alpha);
        }`;

    let canvas = null, gl = null, program = null, uniforms = null, vao = null;
    let shown = false, frame = 0, lastDraw = 0, underProject = false, reducedMotion = null;
    let blinkTimer = 0, lookTimer = 0, followTimer = 0, resizeTimer = 0, builtWidth = 0, builtHeight = 0;
    let cols = 0, rows = 0, cell = 4, cx = 0, cy = 0, A = 0, upper = 0, lower = 0, irisR = 0, ball = 1, tall = 0;
    // A pointer is remembered, but followed only during the ten-second double-press response.
    let yaw = 0, pitch = 0, wantYaw = 0, wantPitch = 0, mostYaw = MOST_YAW, pointerX = 0, pointerY = 0, pointerSeen = false;
    let open = 1, blinkAt = -1, shockAt = -1, followUntil = 0, followAmount = 0, lastPress = -1e9;
    let shownAt = 0, wakeAt = -1, waking = false, wakeTimers = [], kick = 0, dieAt = -1, dieMs = 1, birthStart = -Infinity, born = 1, frenzyUntil = -1, nextDart = 0;
    let yawVelocity = 0, pitchVelocity = 0;
    const turn = new Float32Array(9);

    const compile = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
        return shader;
    };
    const setUp = () => {
        canvas = document.createElement('canvas');
        canvas.className = 'iris-eye';
        canvas.setAttribute('aria-hidden', 'true');
        gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
        if (!gl) throw new Error('no WebGL 2');
        program = gl.createProgram();
        gl.attachShader(program, compile(gl.VERTEX_SHADER, QUAD));
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, EYE));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
        uniforms = {};
        for (const name of ['uGrid', 'uEye', 'uLookAt', 'uLid', 'uSize', 'uTurn', 'uBall', 'uCap', 'uIris', 'uOpen', 'uPupil', 'uShock', 'uTall', 'uFollow', 'uBirth']) {
            uniforms[name] = gl.getUniformLocation(program, name);
        }
        vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        gl.useProgram(program);
    };
    const size = () => {
        const width = Math.max(320, document.documentElement.clientWidth), height = Math.max(320, window.innerHeight);
        builtWidth = document.documentElement.clientWidth;
        builtHeight = window.innerHeight;
        // From wide to tall with no jump on the way, and the same few cells at any size or shape.
        tall = smooth(.9, 1.4, height / width);
        const shaped = (wide, narrow) => wide + (narrow - wide) * tall;
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
        canvas.width = cols;
        canvas.height = rows;
        gl.viewport(0, 0, cols, rows);
    };
    const draw = now => {
        const u = uniforms;
        const yawS = Math.sin(yaw), yawC = Math.cos(yaw), pitchS = Math.sin(pitch), pitchC = Math.cos(pitch);
        const lookX = ball * yawS * pitchC, lookY = ball * pitchS;
        turn[0] = yawC;
        turn[1] = -yawS * pitchS;
        turn[2] = yawS * pitchC;
        turn[3] = 0;
        turn[4] = pitchC;
        turn[5] = pitchS;
        turn[6] = -yawS;
        turn[7] = -yawC * pitchS;
        turn[8] = yawC * pitchC;
        gl.uniformMatrix3fv(u.uTurn, false, turn);
        gl.uniform2f(u.uGrid, cols, rows);
        gl.uniform2f(u.uEye, cx, cy);
        gl.uniform2f(u.uLookAt, cx + lookX, cy + lookY);
        gl.uniform2f(u.uLid, lookX * .05, lookY * .2);
        gl.uniform3f(u.uSize, A, upper, lower);
        gl.uniform1f(u.uBall, ball);
        gl.uniform1f(u.uCap, Math.asin(irisR / ball));
        gl.uniform1f(u.uIris, irisR);
        gl.uniform1f(u.uOpen, open);
        gl.uniform1f(u.uPupil, followAmount * -.1 + kick);
        gl.uniform1f(u.uTall, tall);
        gl.uniform1f(u.uFollow, followAmount);
        gl.uniform1f(u.uBirth, born);
        const shock = shockAt < 0 ? -1 : (now - shockAt) / 1000;
        gl.uniform1f(u.uShock, shock >= 0 && shock < 1.4 ? shock : -1);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const following = () => performance.now() < followUntil;
    // True for as long as anything is on its way somewhere and another frame is wanted.
    const update = (dt, now) => {
        const fixed = following();
        if (fixed && canvas.dataset.following === undefined) canvas.dataset.following = '';
        else if (!fixed && canvas.dataset.following !== undefined) delete canvas.dataset.following;
        const wantFollow = fixed ? 1 : 0;
        followAmount += (wantFollow - followAmount) * Math.min(1, dt * 4);
        if (fixed && pointerSeen) {
            // Turned until the pupil is on the cursor, as far as a ball can turn.
            wantYaw = turnFor((pointerX / cell - cx) / ball, mostYaw);
            wantPitch = turnFor((pointerY / cell - cy) / ball, MOST_PITCH);
        }
        // Critically damped turns ease into each glance and carry momentum
        // through a new target without snapping or depending on frame rate.
        const rate = fixed ? 15 : waking ? 20 : 12;
        const decay = Math.exp(-rate * dt);
        const yawOffset = yaw - wantYaw, pitchOffset = pitch - wantPitch;
        const yawStep = (yawVelocity + rate * yawOffset) * dt;
        const pitchStep = (pitchVelocity + rate * pitchOffset) * dt;
        yaw = wantYaw + (yawOffset + yawStep) * decay;
        pitch = wantPitch + (pitchOffset + pitchStep) * decay;
        yawVelocity = (yawVelocity - rate * yawStep) * decay;
        pitchVelocity = (pitchVelocity - rate * pitchStep) * decay;
        let moving = Math.abs(yawVelocity) > .6 / ball || Math.abs(pitchVelocity) > .6 / ball || Math.abs(wantYaw - yaw) > .4 / ball || Math.abs(wantPitch - pitch) > .4 / ball || Math.abs(wantFollow - followAmount) > .02;
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
        if (wakeAt >= 0) {
            // Wide awake all at once, with a jolt through everything.
            const age = now - wakeAt;
            if (age < SHUT_MS) open = .04;
            else if (age < SHUT_MS + 110) {
                open = Math.min(1, (age - SHUT_MS) / 110);
                if (shockAt < wakeAt) {
                    shockAt = now;
                    kick = -.2;
                }
            } else {
                open = 1;
                wakeAt = -1;
            }
            moving = true;
        }
        kick += (0 - kick) * Math.min(1, dt * 3.5);
        if (Math.abs(kick) > .01) moving = true;
        // Just woken, wild a moment: darting everywhere, its pupil throbbing, rings going out.
        if (now < frenzyUntil) {
            if (now > nextDart) {
                wantYaw = (Math.random() * 2 - 1) * mostYaw;
                wantPitch = (Math.random() * 2 - 1) * MOST_PITCH;
                nextDart = now + 90 + Math.random() * 90;
            }
            kick = -.15 + .2 * Math.sin(now * .034);
            if (now - shockAt > 550) shockAt = now;
            moving = true;
        }
        // Building itself: every frame until it is whole, from when it can be seen (show()
        // wakes it then; under the switch that brings it there is nothing to draw).
        born = clamp((now - birthStart) / BIRTH_MS, 0, 1);
        if (born < 1 && now >= birthStart) moving = true;
        // Dying, on the way out: the pupil blows, it rolls up and away, and the lids come down.
        if (dieAt >= 0) {
            const k = clamp((now - dieAt) / dieMs, 0, 1);
            kick = .5 * smooth(0, .5, k);
            wantPitch = -MOST_PITCH;
            open = 1 - smooth(.3, .85, k);
            blinkAt = -1;
            moving = k < 1;
        }
        if (shockAt >= 0) {
            if (now - shockAt < 1400) moving = true;
            else shockAt = -1;
        }
        return moving;
    };
    // There are frames only while something is moving.
    const step = now => {
        frame = 0;
        if (!shown || underProject || document.hidden) return;
        if (now - lastDraw < FRAME_MS) {
            frame = requestAnimationFrame(step);
            return;
        }
        const dt = lastDraw ? Math.min(.1, (now - lastDraw) / 1000) : 1 / 30;
        lastDraw = now;
        const moving = update(dt, now);
        draw(now);
        if (moving) frame = requestAnimationFrame(step);
        else lastDraw = 0;
    };
    const wake = () => {
        if (!frame && shown && !underProject && !document.hidden) frame = requestAnimationFrame(step);
    };
    const quiet = () => !shown || underProject || document.hidden || reducedMotion.matches;
    const scheduleBlink = () => {
        clearTimeout(blinkTimer);
        blinkTimer = window.setTimeout(() => {
            // Not while it builds itself and the light pours in: a blink would cut the
            // bare ball down to a slit.
            if (!quiet() && performance.now() >= shownAt) {
                blinkAt = performance.now();
                wake();
            }
            scheduleBlink();
        }, 2400 + Math.random() * 5000);
    };
    // A dart somewhere, and a while looking at it. Now and then back to the middle.
    const scheduleLook = () => {
        clearTimeout(lookTimer);
        const glance = restingEyeGaze(wantYaw, wantPitch, mostYaw, MOST_PITCH);
        lookTimer = window.setTimeout(() => {
            if (!quiet() && !following()) {
                wantYaw = glance.yaw;
                wantPitch = glance.pitch;
                wake();
            }
            scheduleLook();
        }, glance.delay);
    };
    /* Whole, and the light poured into it: it wakes all at once. The lids fly open, rings go
       out from it, the pupil pins, it goes wild a moment, and has a quick look round before
       it settles into looking about for itself. */
    const wakeUp = () => {
        if (reducedMotion.matches) return;
        const now = performance.now() - SHUT_MS;
        const x = cx * cell, y = cy * cell;
        open = .04;
        wakeAt = now;
        shockAt = -1;
        kick = 0;
        waking = true;
        wantYaw = turnFor((x / cell - cx) / ball, mostYaw);
        wantPitch = turnFor((y / cell - cy) / ball, MOST_PITCH);
        [[SHUT_MS + 300, -1, .5], [SHUT_MS + 640, .8, -.6], [SHUT_MS + 980, -.3, .2]].forEach(([at, yawShare, pitchShare]) => {
            wakeTimers.push(window.setTimeout(() => {
                wantYaw = yawShare * mostYaw;
                wantPitch = pitchShare * MOST_PITCH;
                wake();
            }, at));
        });
        wakeTimers.push(window.setTimeout(() => {
            waking = false;
            scheduleLook();
        }, SHUT_MS + 1360));
        // It starts out at the viewer as the lids fly open.
        frenzyUntil = now + SHUT_MS + FRENZY_MS;
        pop();
    };
    // Where its iris is on the screen, for what portfolio.js draws round it.
    const irisAt = () => {
        const across = document.documentElement.clientWidth / cols, down = window.innerHeight / rows;
        // At the pupil, where it is looking.
        return { x: (cx + ball * Math.sin(yaw) * Math.cos(pitch)) * across, y: (cy + ball * Math.sin(pitch)) * down, r: irisR * across };
    };
    const pop = () => {
        if (!canvas || reducedMotion.matches) return;
        const at = irisAt();
        canvas.style.transformOrigin = `${Math.round(at.x)}px ${Math.round(at.y)}px`;
        canvas.animate([
            { transform: 'scale(1)', filter: 'brightness(1)' },
            { transform: 'scale(1.1)', filter: 'brightness(2)', offset: .22 },
            { transform: 'scale(.99)', filter: 'brightness(1.05)', offset: .58 },
            { transform: 'scale(1)', filter: 'brightness(1)' }
        ], { duration: 620, easing: 'cubic-bezier(.2, .9, .3, 1)' });
    };
    const onPointerMove = event => {
        pointerX = event.clientX;
        pointerY = event.clientY;
        pointerSeen = true;
        if (following()) wake();
    };
    // Double presses on the visible eye answer; page controls keep their own behavior.
    const ANSWERS = 'a, button, input, select, textarea, label, .project-card, .about-highlight, .skill-group, .navbar, .modal-overlay, .collection-toggle';
    const onPointerDown = event => {
        pointerX = event.clientX;
        pointerY = event.clientY;
        pointerSeen = true;
        const x = event.clientX / cell - cx, y = event.clientY / cell - cy;
        const onEye = (x / A) ** 2 + (y / (y < 0 ? upper : lower)) ** 2 <= 1;
        if (event.button || event.target.closest?.(ANSWERS) || !onEye || underProject || born < 1) {
            lastPress = -1e9;
            return;
        }
        const now = performance.now();
        // A hand still spamming the slider as the eye arrives, where a press lands on nothing
        // in particular, is not asking for anything.
        if (now - shownAt < SETTLE_MS) return;
        if (now - lastPress < DOUBLE_PRESS_MS) {
            followUntil = now + FOLLOW_MS;
            shockAt = now;
            lastPress = -1e9;
            clearTimeout(followTimer);
            // Nothing else would wake it to let go when the time is up.
            followTimer = window.setTimeout(() => {
                wantYaw = wantPitch = 0;
                wake();
            }, FOLLOW_MS + 50);
            wake();
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
            size();
            draw(performance.now());
        }, 200);
    };

    window.portfolioIris = {
        prepare() {
            try {
                if (!gl || gl.isContextLost()) setUp();
                return Promise.resolve();
            } catch (error) {
                gl = null;
                canvas = null;
                return Promise.reject(error);
            }
        },
        // `after`: how long it is hidden under the switch that brings it (portfolio.js); it
        // starts building itself that much later, so it is built where it can be seen.
        // `settled`: brought in from another level's eye, it is simply there, awake, where that
        // one was.
        show({ after = 0, settled = false } = {}) {
            if (!gl) return;
            reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
            followUntil = 0;
            lastPress = -1e9;
            delete canvas.dataset.following;
            shownAt = performance.now() + after;
            // Remember the cursor for a later double press; waking never starts tracking.
            if (window.portfolioPointer) {
                ({ x: pointerX, y: pointerY } = window.portfolioPointer);
                pointerSeen = true;
            }
            // Brought in while a project is open (the frame monitor stepping the level), it
            // waits behind it like everything else.
            underProject = !!document.querySelector('.modal-overlay.active');
            document.querySelector('.background-grid')?.after(canvas);
            yawVelocity = pitchVelocity = 0;
            shown = true;
            open = 1;
            dieAt = frenzyUntil = -1;
            canvas.getAnimations?.().forEach(animation => animation.cancel());
            yaw = pitch = wantYaw = wantPitch = followAmount = kick = 0;
            size();
            // It builds itself, from the bones out; then light pours into its iris and it wakes.
            // Whole already, it does not pick up a build the last showing left unfinished.
            born = 1;
            birthStart = -Infinity;
            if (!reducedMotion.matches && !settled) {
                birthStart = performance.now() + after;
                born = 0;
                shownAt += BIRTH_MS + GATHER_MS;
                if (after > 0) wakeTimers.push(window.setTimeout(wake, after));
                wakeTimers.push(window.setTimeout(() => {
                    document.dispatchEvent(new CustomEvent('portfolio:eye-gather', { detail: { ...irisAt(), ms: GATHER_MS } }));
                }, after + BIRTH_MS));
                wakeTimers.push(window.setTimeout(() => {
                    wakeUp();
                    wake();
                }, after + BIRTH_MS + GATHER_MS));
            } else if (settled && !reducedMotion.matches) {
                // There already: awake, looking about, a press answered at once.
                shownAt -= SETTLE_MS;
                scheduleLook();
            }
            draw(performance.now());
            window.addEventListener('resize', onResize, { passive: true });
            document.addEventListener('visibilitychange', onVisibility);
            document.addEventListener('portfolio:modal-open', onModalOpen);
            document.addEventListener('portfolio:modal-close', onModalClose);
            if (!reducedMotion.matches) {
                window.addEventListener('pointermove', onPointerMove, { passive: true });
                window.addEventListener('pointerdown', onPointerDown, { passive: true });
                scheduleBlink();
                wake();
            }
        },
        irisAt: () => irisAt(),
        // On the way out (portfolio.js): it dies over `ms`, and is put away after.
        die(ms) {
            if (!shown || reducedMotion.matches) return;
            dieAt = performance.now();
            dieMs = ms;
            clearTimeout(blinkTimer);
            clearTimeout(lookTimer);
            wakeTimers.forEach(id => clearTimeout(id));
            wakeTimers = [];
            wakeAt = -1;
            wake();
        },
        release() {
            shown = false;
            underProject = false;
            if (frame) cancelAnimationFrame(frame);
            frame = 0;
            dieAt = -1;
            blinkAt = shockAt = wakeAt = -1;
            waking = false;
            wakeTimers.forEach(id => clearTimeout(id));
            wakeTimers = [];
            followUntil = 0;
            clearTimeout(blinkTimer);
            clearTimeout(lookTimer);
            clearTimeout(followTimer);
            clearTimeout(resizeTimer);
            window.removeEventListener('resize', onResize);
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('visibilitychange', onVisibility);
            document.removeEventListener('portfolio:modal-open', onModalOpen);
            document.removeEventListener('portfolio:modal-close', onModalClose);
            // Off the page, but what was compiled for it is kept, so a switch back is at once.
            canvas?.remove();
        }
    };
})();
