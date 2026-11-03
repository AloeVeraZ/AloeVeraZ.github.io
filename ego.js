/* The eye, in full: the third of High FX's backdrops.

   Ten quick presses on the effects slider's High stop find High's other skies, and
   after that two quick presses go round them: the stars, the bright Frutiger Aero sky
   (aero.js), this, and the stars again (the slider code in portfolio.js). It is the same
   dithered eye as Low's other look (y2k.js), with all that High can spend on it.

   It is a ball, and it moves by turning. The iris lies on the ball and narrows as it comes
   round to the edge, the veins go round with it, its light and the window it reflects stay
   where they are, and the lids go a little way with it. It looks about for itself, and
   blinks. Pressed twice, anywhere the page itself does not answer, it turns to fix on the
   cursor for fifteen seconds and then goes back to looking about.

   It is two passes on the graphics card. The first draws the eye one dither cell at a
   time on a very small picture: moving fibres, waves going out from the pupil, veins
   that light up, sparks going round it, an aura that flows. The second lays that on the
   screen with its pixels showing, its colours pulled apart, light bleeding from it and
   shafts coming off the pupil, and tears it now and then. Not fetched until someone asks,
   and leaving it hands everything back. The glass in front is the page's own and frosts
   and bends this as it does the stars. */
(function () {
    'use strict';

    const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
    const smooth = (low, high, value) => {
        const t = clamp((value - low) / (high - low), 0, 1);
        return t * t * (3 - 2 * t);
    };
    const FOLLOW_MS = 15000;
    const DOUBLE_PRESS_MS = 450;
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
        uniform float uBall, uCap, uIris, uTime, uOpen, uPupil, uShock, uTall, uFollow;
        out vec4 outColor;
        const float TAU = 6.2831853;
        const vec3 LIGHT = vec3(0.26, -0.34, 0.9);
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
            for (int i = 0; i < 4; i++) {
                s += a * noise(p);
                p = p * 2.03 + 17.1;
                a *= 0.5;
            }
            return s;
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
            float top = middle - uOpen * uSize.y * edge, foot = middle + uOpen * uSize.z * edge;
            float dim = mix(0.24 + 0.76 * smoothstep(0.14, 0.68, r.x), 0.46, uTall) * (0.3 + 0.7 * smoothstep(0.05, 0.17, r.y));
            float warm = smoothstep(0.25, 0.95, r.x) * smoothstep(0.8, 0.1, r.y);
            float cool = smoothstep(0.7, 0.1, r.x) * smoothstep(0.3, 1.0, r.y);
            vec3 tint = vec3(206.0 + warm * 49.0 - cool * 90.0, 190.0 - warm * 70.0 - cool * 20.0, 255.0 - warm * 14.0) / 255.0;
            vec3 color = tint;
            float tone;
            vec2 toEye = cell - uEye;
            float ringAt = length(toEye) / (uIris * 0.1), angle = atan(toEye.y, toEye.x);
            if (y > top && y < foot) {
                // The ball. Where this cell lands on it is n, and p is the part of the ball
                // that has turned to face it, so everything painted by p goes round with it.
                vec2 flat2 = toEye / uBall;
                float reach = dot(flat2, flat2);
                if (reach < 1.0) {
                    vec3 n = vec3(flat2, sqrt(1.0 - reach));
                    vec3 p = uTurn * n;
                    float away = acos(clamp(p.z, -1.0, 1.0));
                    float k = away / uCap;
                    angle = atan(p.y, p.x);
                    ringAt = k * 10.0;
                    float light = max(0.0, dot(n, LIGHT));
                    // The white, round under its light, with veins in it that flare and fade.
                    tone = 0.05 + 0.6 * pow(light, 1.5);
                    float rn = fbm(p.xy / (1.0 + max(p.z, -0.6)) * 13.0);
                    float vein = pow(1.0 - abs(rn * 2.0 - 1.0), 18.0) * smoothstep(0.75, 1.9, k);
                    float flare = 0.4 + 0.6 * pow(0.5 + 0.5 * sin(uTime * 1.3 + rn * 22.0), 3.0);
                    if (vein * flare > 0.12) {
                        tone = max(tone, vein * flare * 1.4);
                        color = mix(color, vec3(1.0, 0.36, 0.72), 0.85);
                    }
                    // Faint lines round it, like a globe's, that wrap as it turns.
                    float lat = smoothstep(0.92, 1.0, abs(fract(away * 5.2 - uTime * 0.03) - 0.5) * 2.0);
                    float lon = smoothstep(0.95, 1.0, abs(fract(angle / TAU * 16.0) - 0.5) * 2.0);
                    if (k > 1.04) tone += (0.1 * lat + 0.07 * lon) * (0.3 + light);
                    if (k < 1.0) {
                        float pupil = 0.36 + uPupil;
                        float fibre = 0.5 + 0.5 * sin(angle * 34.0 + sin(angle * 9.0 + uTime * 0.3) * 1.6 + uTime * 0.25);
                        float fine = 0.5 + 0.5 * sin(angle * 71.0 - uTime * 0.7);
                        tone = 0.2 + 0.62 * fibre * smoothstep(pupil - 0.06, 0.7, k) * smoothstep(1.0, 0.78, k);
                        tone += 0.24 * exp(-pow((k - 0.48) / 0.07, 2.0)) + 0.12 * fine * smoothstep(1.0, 0.6, k);
                        // Waves going out from the pupil.
                        tone += 0.55 * exp(-pow((k - fract(uTime * 0.17) * 1.25) / 0.045, 2.0));
                        tone += 0.3 * exp(-pow((k - fract(uTime * 0.17 + 0.5) * 1.25) / 0.03, 2.0));
                        tone *= smoothstep(1.0, 0.9, k) * 0.9 + 0.1;
                        color = mix(vec3(1.0, 0.5 + k * 0.24, 0.84), vec3(0.74, 0.5, 1.0), smoothstep(0.42, 0.7, k));
                        color = mix(color, vec3(0.42, 0.9, 1.0), 0.42 * (0.5 + 0.5 * sin(angle * 3.0 + uTime * 0.8)) * smoothstep(0.5, 0.92, k));
                        color = mix(color, vec3(1.0, 0.32, 0.56), uFollow * 0.55);
                        tone += uFollow * 0.1;
                        if (k < pupil) tone = 0.0;
                        else tone = max(tone, 0.14 * smoothstep(pupil * 1.3, pupil, k));
                        tone *= 0.42 + 0.72 * light;
                    }
                    // Light caught round the edge of the ball, where it turns away.
                    float rim = pow(1.0 - n.z, 2.6);
                    tone += rim * 0.6;
                    color = mix(color, vec3(0.62, 0.42, 1.0), min(1.0, rim * 1.4));
                    // The window it reflects stays with the room, and only slides a little
                    // as the bulge of the eye comes round under it.
                    vec2 glint = (toEye - (uLookAt - uEye) * 0.28) / uIris;
                    if (length(glint - vec2(0.3, -0.34)) < 0.09 || length(glint + vec2(0.24, -0.3)) < 0.035) {
                        tone = 1.0;
                        color = vec3(1.0);
                    }
                } else tone = 0.025;
                // The shadows the lids throw on it.
                float under = (y - top) / (uGrid.y * 0.07);
                if (under < 1.0) tone *= 0.15 + 0.85 * under;
                float above = (foot - y) / (uGrid.y * 0.03);
                if (above < 1.0) tone *= 0.5 + 0.5 * above;
            } else {
                // The skin round it, lit by an aura that flows.
                float crease = middle - (uSize.y + uGrid.y * 0.085) * pow(edge, 0.8);
                float fold = middle + (uSize.z + uGrid.y * 0.07) * pow(edge, 0.8);
                tone = 0.05 + 0.2 * exp(-pow((y - top) / (uGrid.y * 0.16), 2.0)) + 0.16 * exp(-pow((y - foot) / (uGrid.y * 0.1), 2.0));
                tone += 0.46 * exp(-pow((y - crease) / (uGrid.y * 0.009 + 0.9), 2.0)) * min(1.0, edge * 2.6);
                tone += 0.24 * exp(-pow((y - fold) / (uGrid.y * 0.007 + 0.8), 2.0)) * min(1.0, edge * 2.6);
                float flow = fbm(cell * 0.016 + vec2(uTime * 0.05, -uTime * 0.035) + fbm(cell * 0.01 - uTime * 0.03) * 2.4);
                tone += 0.34 * smoothstep(0.42, 0.78, flow);
                color = mix(color, vec3(0.5, 0.42, 1.0), smoothstep(0.42, 0.72, flow) * 0.6);
                float toLid = min(abs(y - top), abs(y - foot));
                if (edge > 0.02 && toLid < 1.3) tone = abs(y - top) < 1.3 ? 0.92 : 0.6;
            }
            // Sparks going round it, ring by ring: on the ball they ride it as it turns.
            float ring = floor(ringAt);
            if (ring > 10.0) {
                float way = mod(ring, 2.0) * 2.0 - 1.0;
                float count = 16.0 + ring * 2.0;
                float at = floor((angle / TAU + 0.5 + uTime * way * (0.012 + 0.03 * hash(vec2(ring, 3.0)))) * count);
                float life = hash(vec2(ring, at));
                if (life > 0.9 && fract(ringAt) < 0.34) {
                    tone = max(tone, 0.55 + 0.45 * sin(uTime * 3.0 + life * 40.0));
                    color = mix(color, vec3(1.0), 0.6);
                }
            }
            // A press sends a ring out from it across everything.
            if (uShock >= 0.0) {
                float wave = exp(-pow((length(cell - uLookAt) / uGrid.x - uShock * 1.5) / 0.018, 2.0)) * (1.0 - uShock);
                tone += wave * 1.3;
                color = mix(color, vec3(1.0, 0.78, 0.96), min(1.0, wave * 2.0));
            }
            bool on = tone * (0.35 + 0.65 * dim) > bayer(cell);
            outColor = vec4(on ? color * (0.38 + 0.62 * dim) : vec3(0.0), 1.0);
        }`;

    const SCREEN = `#version 300 es
        precision highp float;
        uniform sampler2D uScene;
        uniform vec2 uGrid, uRes, uPupilAt;
        uniform float uTime, uGlitch, uTall, uFollow;
        out vec4 outColor;
        float hash(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
        }
        vec3 cell(vec2 uv) {
            ivec2 at = ivec2(clamp(uv, vec2(0.0), vec2(0.9999)) * uGrid);
            return texelFetch(uScene, at, 0).rgb;
        }
        void main() {
            vec2 uv = gl_FragCoord.xy / uRes;
            float beat = floor(uTime * 24.0);
            float band = floor(uv.y * 44.0);
            float tear = (hash(vec2(band, beat)) - 0.5) * uGlitch * step(0.7, hash(vec2(band * 3.1, beat))) * 0.14;
            vec2 at = uv + vec2(tear, 0.0);
            float split = 0.0009 + 0.0012 * length(uv - 0.5) + 0.007 * uGlitch;
            vec3 crisp = vec3(cell(at + vec2(split, 0.0)).r, cell(at).g, cell(at - vec2(split, 0.0)).b);
            // The aura underneath, breathing.
            float wide = uRes.x / uRes.y;
            vec2 q = (uv - vec2(0.6, 0.52)) * vec2(wide, 1.0);
            float breath = 0.86 + 0.14 * sin(uTime * 0.5);
            vec3 base = vec3(0.016, 0.008, 0.035);
            base += vec3(0.33, 0.14, 0.84) * 0.56 * breath * exp(-dot(q, q) * 2.2);
            vec2 w = (uv - vec2(0.9, 0.88)) * vec2(wide, 1.0);
            base += vec3(0.84, 0.2, 0.78) * 0.3 * exp(-dot(w, w) * 4.5);
            vec2 z = (uv - vec2(0.2, 0.08)) * vec2(wide, 1.0);
            base += vec3(0.13, 0.27, 0.94) * 0.3 * exp(-dot(z, z) * 4.0);
            // Light bleeding out of the bright places.
            vec3 bloom = textureLod(uScene, at, 2.0).rgb * 0.55 + textureLod(uScene, at, 4.0).rgb * 0.8 + textureLod(uScene, at, 5.5).rgb * 0.7;
            // Shafts coming off the pupil.
            vec3 shafts = vec3(0.0);
            vec2 toPupil = (uPupilAt - uv) / 9.0;
            vec2 walk = uv + toPupil * hash(gl_FragCoord.xy + uTime);
            float fall = 1.0;
            for (int i = 0; i < 9; i++) {
                shafts += textureLod(uScene, walk, 3.0).rgb * fall;
                walk += toPupil;
                fall *= 0.9;
            }
            shafts *= 0.09 * (0.8 + 0.5 * uFollow);
            float quiet = mix(0.38 + 0.62 * smoothstep(0.1, 0.66, uv.x), 0.6, uTall);
            vec3 color = base + crisp + (bloom * 0.62 + shafts) * quiet;
            color *= 0.955 + 0.045 * sin(gl_FragCoord.y * 2.2);
            vec2 edge = uv - 0.5;
            color *= 1.0 - dot(edge, edge) * 0.72;
            outColor = vec4(color, 1.0);
        }`;

    let canvas = null, gl = null, scene = null, target = null, eyeProgram = null, screenProgram = null, eyeUniforms = null, screenUniforms = null, vao = null;
    let shown = false, frame = 0, lastFrame = 0, clock = 0, underProject = false, underProjectTimer = 0, resizeTimer = 0;
    let reducedMotion = null;
    let cols = 0, rows = 0, cell = 4, cx = 0, cy = 0, A = 0, upper = 0, lower = 0, irisR = 0, ball = 1, tall = 0, builtWidth = 0, builtHeight = 0;
    let yaw = 0, pitch = 0, wantYaw = 0, wantPitch = 0, mostYaw = MOST_YAW, pointerX = 0, pointerY = 0, pointerSeen = false;
    let open = 1, blinkAt = -1, nextBlink = 3, secondBlink = false, nextLook = 1, shockAt = -9, glitchUntil = -1, nextGlitch = 6;
    let followUntil = 0, followAmount = 0, lastPress = -1e9, pupil = 0;
    const turn = new Float32Array(9);

    const compile = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
        return shader;
    };
    const link = (fragment, names) => {
        const program = gl.createProgram();
        gl.attachShader(program, compile(gl.VERTEX_SHADER, QUAD));
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
        const uniforms = {};
        for (const name of names) uniforms[name] = gl.getUniformLocation(program, name);
        return { program, uniforms };
    };
    const setUp = () => {
        canvas = document.createElement('canvas');
        canvas.className = 'ego-scene';
        canvas.setAttribute('aria-hidden', 'true');
        gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
        if (!gl) throw new Error('no WebGL 2');
        const eye = link(EYE, ['uGrid', 'uEye', 'uLookAt', 'uLid', 'uSize', 'uTurn', 'uBall', 'uCap', 'uIris', 'uTime', 'uOpen', 'uPupil', 'uShock', 'uTall', 'uFollow']);
        const screen = link(SCREEN, ['uScene', 'uGrid', 'uRes', 'uPupilAt', 'uTime', 'uGlitch', 'uTall', 'uFollow']);
        eyeProgram = eye.program;
        eyeUniforms = eye.uniforms;
        screenProgram = screen.program;
        screenUniforms = screen.uniforms;
        vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        scene = gl.createTexture();
        target = gl.createFramebuffer();
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
        // The look of it is in its large pixels, so the screen needs no more than this.
        const ratio = Math.min(window.devicePixelRatio || 1, document.documentElement.dataset.effectsPace ? 1 : 1.25);
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        gl.bindTexture(gl.TEXTURE_2D, scene);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, scene, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };

    const following = () => performance.now() < followUntil;
    const update = dt => {
        const t = clock;
        const fixed = following();
        if (canvas) {
            if (fixed && !canvas.dataset.following) canvas.dataset.following = '';
            else if (!fixed && canvas.dataset.following !== undefined) delete canvas.dataset.following;
        }
        followAmount += ((fixed ? 1 : 0) - followAmount) * Math.min(1, dt * 4);
        if (fixed && pointerSeen) {
            // Turned until the pupil is on the cursor, as far as a ball can turn.
            wantYaw = turnFor((pointerX / cell - cx) / ball, mostYaw);
            wantPitch = turnFor((pointerY / cell - cy) / ball, MOST_PITCH);
        } else if (t > nextLook) {
            // A dart somewhere, and a while looking at it. Now and then back to the middle.
            if (Math.random() < .25) {
                wantYaw = (Math.random() - .5) * mostYaw * .3;
                wantPitch = (Math.random() - .5) * MOST_PITCH * .3;
            } else {
                wantYaw = (Math.random() * 2 - 1) * mostYaw;
                wantPitch = (Math.random() * 2 - 1) * MOST_PITCH;
            }
            nextLook = t + .7 + Math.random() * Math.random() * 3.6;
        }
        const pull = Math.min(1, dt * (fixed ? 7 : 11));
        yaw += (wantYaw - yaw) * pull;
        pitch += (wantPitch - pitch) * pull;
        const wantPupil = .03 * Math.sin(t * .4) + (fixed ? -.1 : 0);
        pupil += (wantPupil - pupil) * Math.min(1, dt * 2.4);
        if (blinkAt < 0 && t > nextBlink) {
            blinkAt = t;
            secondBlink = Math.random() < .22;
            nextBlink = t + 2.4 + Math.random() * 5;
        }
        if (blinkAt >= 0) {
            const age = t - blinkAt;
            if (age < .11) open = 1 - .96 * (age / .11);
            else if (age < .15) open = .04;
            else if (age < .34) open = .04 + .96 * ((age - .15) / .19);
            else {
                open = 1;
                blinkAt = secondBlink ? t + .09 : -1;
                secondBlink = false;
            }
        }
        if (t > nextGlitch) {
            glitchUntil = t + .07 + Math.random() * .16;
            nextGlitch = t + 4 + Math.random() * 7;
        }
    };
    const draw = () => {
        const t = clock;
        gl.bindVertexArray(vao);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target);
        gl.viewport(0, 0, cols, rows);
        gl.useProgram(eyeProgram);
        const e = eyeUniforms;
        gl.uniform2f(e.uGrid, cols, rows);
        gl.uniform2f(e.uEye, cx, cy);
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
        gl.uniformMatrix3fv(e.uTurn, false, turn);
        gl.uniform2f(e.uLookAt, cx + lookX, cy + lookY);
        gl.uniform2f(e.uLid, lookX * .05, lookY * .2);
        gl.uniform1f(e.uBall, ball);
        gl.uniform1f(e.uCap, Math.asin(irisR / ball));
        gl.uniform3f(e.uSize, A, upper, lower);
        gl.uniform1f(e.uIris, irisR);
        gl.uniform1f(e.uTime, t);
        gl.uniform1f(e.uOpen, open);
        gl.uniform1f(e.uPupil, pupil);
        gl.uniform1f(e.uTall, tall);
        gl.uniform1f(e.uFollow, followAmount);
        const shock = t - shockAt;
        gl.uniform1f(e.uShock, shock < 1 ? shock : -1);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, scene);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(screenProgram);
        const s = screenUniforms;
        gl.uniform1i(s.uScene, 0);
        gl.uniform2f(s.uGrid, cols, rows);
        gl.uniform2f(s.uRes, canvas.width, canvas.height);
        gl.uniform2f(s.uPupilAt, (cx + lookX) / cols, 1 - (cy + lookY) / rows);
        gl.uniform1f(s.uTime, t);
        gl.uniform1f(s.uGlitch, t < glitchUntil ? 1 : Math.max(0, 1 - shock * 3));
        gl.uniform1f(s.uTall, tall);
        gl.uniform1f(s.uFollow, followAmount);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

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
        if (frame || !shown || document.hidden || underProject) return;
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
    const onPointerMove = event => {
        pointerX = event.clientX;
        pointerY = event.clientY;
        pointerSeen = true;
    };
    // Pressed twice, anywhere the page itself does not answer a press.
    const ANSWERS = 'a, button, input, select, textarea, label, .project-card, .about-highlight, .skill-group, .navbar, .modal-overlay, .collection-toggle';
    const onPointerDown = event => {
        pointerX = event.clientX;
        pointerY = event.clientY;
        pointerSeen = true;
        if (event.button || event.target.closest?.(ANSWERS)) return;
        const now = performance.now();
        if (now - lastPress < DOUBLE_PRESS_MS) {
            followUntil = now + FOLLOW_MS;
            shockAt = clock;
            lastPress = -1e9;
        } else lastPress = now;
    };
    const onResize = () => {
        clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
            if (!shown) return;
            // A phone's address bar coming and going is not a new screen.
            if (document.documentElement.clientWidth === builtWidth && Math.abs(window.innerHeight - builtHeight) < builtHeight * .16) return;
            size();
            draw();
        }, 200);
    };

    window.portfolioEgo = {
        prepare() {
            try {
                if (!gl) setUp();
                return Promise.resolve();
            } catch (error) {
                gl = null;
                canvas = null;
                return Promise.reject(error);
            }
        },
        show() {
            if (!gl) return;
            reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
            const anchor = document.querySelector('.galaxy-nebula') || document.querySelector('.galaxy-field');
            if (anchor) anchor.after(canvas);
            else document.body.prepend(canvas);
            shown = true;
            size();
            update(1 / 60);
            draw();
            document.addEventListener('visibilitychange', onVisibility);
            document.addEventListener('portfolio:modal-open', onModalOpen);
            document.addEventListener('portfolio:modal-close', onModalClose);
            window.addEventListener('pointermove', onPointerMove, { passive: true });
            window.addEventListener('pointerdown', onPointerDown, { passive: true });
            window.addEventListener('resize', onResize, { passive: true });
            startLoop();
        },
        release() {
            shown = false;
            stopLoop();
            clearTimeout(resizeTimer);
            clearTimeout(underProjectTimer);
            underProject = false;
            followUntil = 0;
            document.removeEventListener('visibilitychange', onVisibility);
            document.removeEventListener('portfolio:modal-open', onModalOpen);
            document.removeEventListener('portfolio:modal-close', onModalClose);
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerdown', onPointerDown);
            window.removeEventListener('resize', onResize);
            if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext();
            canvas?.remove();
            canvas = null;
            gl = null;
        }
    };
})();
