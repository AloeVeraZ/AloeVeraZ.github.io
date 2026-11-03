/* The living sky: Medium and High FX.

   Low shows a sky that holds still (portfolio.js, setupStillSky), and Medium and High lay
   that same picture down first: far off, stars and far galaxies as points of light. Over
   it, on the graphics card, this draws what is near, a dark galaxy full of things that act
   on one another, as the old High's sky did: orbs and worlds drift and are pulled into
   black holes, go round and round and are swallowed with a flare and a spray of sparks;
   comets bend round the holes and are caught by them; every world is lit from the side of
   whatever burns nearest it, its moon going round in front and behind and throwing a
   shadow as it crosses. The cursor has weight: the light behind it bends, and what is near
   it is pushed aside and drifts back -- or, pushed hard enough toward a hole, goes in. A
   press sends a shock out through all of it. The black holes bend the picture behind them
   too, so the stars of the still sky are drawn round them in rings as they pass.

   Medium has the spiral of its still picture, and its heart is a hole that feeds; nine
   worlds, orbs and holes hold still on the screen as the page scrolls over them, comets
   crossing and the holes now and then taking one in, drawn thirty times a second unless
   something is moving fast. High has its own galaxy at the top of the page and is
   crowded with orbs that wander and can be pushed a long way, eight things to a screen,
   at every frame; whatever a hole takes there comes apart on the way in. And a war across
   all of it: two kinds of fighters hunting each other, steering round worlds, knocking
   orbs about with their shots and pulled at by the holes, and landers setting down on
   worlds. Left alone, the whole backdrop goes dark (portfolio.js) and this stops; moving
   brings it back, with a flare.

   All of it rests with the tab hidden and under an open project, and holds still for
   anyone who prefers reduced motion. Not fetched for Low. */
(function () {
    'use strict';

    const TAU = Math.PI * 2;
    const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
    const smooth = (low, high, value) => {
        const t = clamp((value - low) / (high - low), 0, 1);
        return t * t * (3 - 2 * t);
    };
    const ANSWERS = 'a, button, input, select, textarea, label, .project-card, .about-highlight, .skill-group, .navbar, .modal-overlay, .collection-toggle, .fx-slider';
    const root = document.documentElement;
    const LIMIT = 40;
    // spiral, hole, nebula, orb, world with a ring, cluster, dying star, edge on, world with a moon
    const HOLE = 1, ORB = 3, RINGED = 4, MOONED = 8;
    const MOVES = [false, false, false, true, true, true, true, false, true];
    // Far off: small, faint, and slow past the window. The rest are near.
    const FAR = [true, false, true, false, false, true, false, true, false];
    const isWorld = kind => kind === ORB || kind === RINGED || kind === MOONED;
    // What lights a world: how bright, and the colour of the light (the shader's lightTint).
    const LIGHTS = { 1: [.85, 2], 5: [.3, 3], 6: [1.1, 1] };
    // The colour of what an orb or a world breaks into: rock, ice, molten, light; a world.
    const SHARDS = ['176,156,140', '196,220,240', '255,130,60', '214,170,255', '206,176,146'];
    const shardOf = thing => (thing.kind === ORB ? SHARDS[thing.own < .3 ? 0 : thing.own < .55 ? 1 : thing.own < .8 ? 2 : 3] : SHARDS[4]);
    // What each level may spend. `rest` is how many frames a second Medium draws while
    // nothing is moving fast (0: every frame); `reach` is how hard a hole pulls on what it
    // has chosen to feed on; `spring` how hard what was pushed floats back, and `breaks`
    // whether a thing a hole has hold of comes apart as it goes in.
    const LEVELS = {
        // `sharp` is the most pixels to a CSS pixel it draws at, and `eased` that on a machine
        // the page has eased; `dim` and `mono` how dark and how grey it all is.
        medium: {
            perScreen: 9, fixed: true, odds: [.06, .15, .05, .14, .18, .09, .14, .04, .15], near: [0, 0], far: [0, 0], sharp: 1.25, eased: 1, rest: 30,
            push: 0, spring: 1.4, shock: 0, feed: [12, 22], reach: 34, fall: 4.2, comets: [14, 26], landers: [24, 42],
            armed: false, galaxy: false, breaks: false, cursorLens: 2.5, dim: .8, mono: .5
        },
        high: {
            perScreen: 9, odds: [.06, .08, .03, .42, .09, .05, .05, .05, .17], near: [.45, .95], far: [.12, .28], sharp: 2, eased: 1.5, rest: 0,
            push: 2400, spring: .45, shock: 620, feed: [6, 11], reach: 70, fall: 2.6, comets: [9, 16], landers: [14, 26],
            armed: true, galaxy: true, breaks: true, cursorLens: 4, dim: .78, mono: .55
        }
    };
    const DAMP = 1.3;

    const VERTEX = `#version 300 es
        void main() {
            vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
            gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
        }`;

    const skySource = high => `#version 300 es
        precision highp float;
        ${high ? '#define HIGH' : ''}
        uniform vec2 uRes;
        uniform float uScale, uTime, uScroll, uSkyOn, uDim, uMono;
        uniform vec3 uCursor;
        uniform sampler2D uSky;
        uniform vec4 uSkyMap;
        uniform vec4 uLens[8];
        uniform int uLensCount;
        uniform vec4 uShock;
        uniform vec4 uObj[${LIMIT}];
        uniform vec4 uObjB[${LIMIT}];
        uniform vec4 uObjC[${LIMIT}];
        uniform vec4 uObjD[${LIMIT}];
        uniform int uCount;
        #ifdef HIGH
        uniform vec2 uCenter, uMoonA, uMoonB;
        uniform float uSpin, uRadius, uTilt, uAngle, uBeat, uFlare, uMain;
        #endif
        out vec4 outColor;
        const float TAU = 6.2831853;
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
            for (int i = 0; i < 5; i++) {
                s += a * noise(p);
                p = p * 2.03 + 17.1;
                a *= 0.5;
            }
            return s / 0.97;
        }
        vec2 rotate(vec2 v, float a) {
            float c = cos(a), s = sin(a);
            return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
        }
        // A black hole seen at a slant: nothing in the middle and a disc of gas round it, brighter on the side coming toward us, its near half
        // across the hole and its far half bent up over the top.
        vec3 hole(vec2 css, vec2 at, float r, float slant, float turn, float spin, float heat) {
            vec2 d = rotate(css - at, -turn);
            float ds = length(d);
            vec2 p = vec2(d.x, d.y / slant);
            float pr = length(p) / r;
            float flow = fbm(vec2(atan(p.y, p.x) * 3.0 - spin * 2.0 / max(pr, 0.6), pr * 4.0));
            float disc = smoothstep(1.3, 1.6, pr) * smoothstep(5.0, 1.8, pr) * (0.45 + 0.9 * flow);
            disc *= 0.7 + 0.5 * cos(atan(p.y, p.x) - 0.6);
            vec3 fire = mix(vec3(1.0, 0.86, 0.66), vec3(0.85, 0.32, 0.12), smoothstep(1.5, 4.0, pr));
            vec3 col = fire * disc * heat;
            float arc = exp(-pow((ds / r - 1.45) / 0.18, 2.0)) * smoothstep(0.0, -0.6, d.y / r) * 0.9;
            col += fire * arc * heat * (0.6 + 0.4 * flow);
            float shadow = smoothstep(1.0, 0.94, ds / r);
            float front = step(0.0, d.y) * disc;
            return col * (1.0 - shadow) + fire * front * shadow * heat;
        }
        float holeShadow(vec2 css, vec2 at, float r) {
            return smoothstep(1.0, 0.94, length(css - at) / r);
        }
        // The light a world is lit by: a cold white, a dying star's red, a hole's fire, or
        // the faint far light every world has.
        vec3 lightTint(float t) {
            return t < 0.5 ? vec3(0.78, 0.86, 1.0) : t < 1.5 ? vec3(1.0, 0.5, 0.36) : t < 2.5 ? vec3(1.0, 0.72, 0.48) : vec3(0.86, 0.82, 0.78);
        }
        // Stars nearer than the picture, so a scroll carries them past it, each layer at its
        // own pace: one star at most to a cell, most of them faint, all of them twinkling.
        vec3 stars(vec2 p, float cell, float seed, float bright) {
            vec2 id = floor(p / cell);
            float h = hash(id + seed);
            if (h < 0.55) return vec3(0.0);
            vec2 at = (id + 0.2 + 0.6 * vec2(hash(id + seed + 3.1), hash(id + seed + 7.7))) * cell;
            float size = 0.45 + pow(hash(id + seed + 1.3), 6.0) * 1.5;
            float twinkle = 0.6 + 0.4 * sin(uTime * (0.6 + h * 2.4) + h * 60.0);
            float light = smoothstep(size + 0.9, size * 0.3, length(p - at)) * twinkle * bright * (0.2 + 0.8 * pow(hash(id + seed + 9.4), 3.0));
            return mix(vec3(0.74, 0.8, 1.0), vec3(1.0, 0.84, 0.7), step(0.85, fract(h * 13.0))) * light;
        }
        void main() {
            vec2 css = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uScale;
            float screenW = uRes.x / uScale;
            // Weight bends light: every black hole on the screen draws what lies behind it
            // round itself, into a ring where it lines up.
            vec2 bent = css;
            for (int i = 0; i < 8; i++) {
                if (i >= uLensCount) break;
                vec4 lens = uLens[i];
                vec2 d = css - lens.xy;
                float d2 = dot(d, d);
                float reach = lens.z * 7.0;
                if (d2 > reach * reach) continue;
                float s = lens.z * 1.5 * lens.w;
                bent -= d * (s * s) / (d2 + s * s * 0.35) * smoothstep(reach, reach * 0.45, sqrt(d2));
            }
            // The cursor too, gently: a little of the sky is gathered in under it.
            vec2 fromCursor = css - uCursor.xy;
            bent -= fromCursor * uCursor.z * 0.03 * exp(-dot(fromCursor, fromCursor) / 4900.0);
            // A press sends a shock out through everything.
            float shock = 0.0;
            if (uShock.z >= 0.0) {
                vec2 fromShock = css - uShock.xy;
                float ds = length(fromShock);
                float band = exp(-pow((ds - uShock.z * 820.0) / (34.0 + uShock.z * 30.0), 2.0)) * exp(-uShock.z * 1.4) * uShock.w;
                bent += fromShock / max(ds, 1.0) * band * 30.0;
                shock = band;
            }
            // The picture behind, wherever it has been bent; elsewhere it shows as it is.
            vec4 base = vec4(0.0);
            float moved = length(bent - css);
            if (uSkyOn > 0.5 && moved > 0.2) {
                float m = smoothstep(0.2, 1.4, moved);
                base = vec4(texture(uSky, bent * uSkyMap.xy + uSkyMap.zw).rgb * m, m);
            }
            vec3 col = stars(bent + vec2(0.0, uScroll * 0.06), 40.0, 1.7, 0.34);
            #ifdef HIGH
            col += stars(bent + vec2(0.0, uScroll * 0.18), 66.0, 9.3, 0.5);
            #endif
            float cover = 0.0;
            #ifdef HIGH
            // ---- The galaxy at the top of the page: pale arms half lost in dust, cold
            // light, a little red where stars are being born, and at its heart a hole with a
            // ring of fire round it that beats like a heart.
            if (uMain > 0.01) {
                vec2 q = rotate(bent - uCenter, -uAngle);
                q.y /= uTilt;
                q /= uRadius;
                float r = length(q), th = atan(q.y, q.x);
                if (r < 2.4) {
                    float within = smoothstep(1.2, 0.5, r);
                    float th2 = th - uSpin * 0.9 / (0.18 + r);
                    vec2 flow = r * vec2(cos(th2), sin(th2));
                    float phase = th - log(max(r, 0.03)) / 0.46 + uSpin * 0.22;
                    float arms = pow(0.5 + 0.5 * cos(2.0 * phase), 3.0);
                    vec3 g = vec3(0.0);
                    float dust = 0.0;
                    if (r < 1.25) {
                        float gas = fbm(flow * 5.0 + 3.1);
                        float fine = fbm(flow * 14.0 - 7.3);
                        float disk = exp(-r * 2.6) * within;
                        float armLight = arms * (0.25 + 1.1 * gas) * smoothstep(0.05, 0.2, r) * within;
                        dust = (pow(0.5 + 0.5 * cos(2.0 * (phase + 0.5)), 5.0) * 0.9 + smoothstep(0.55, 0.85, fine) * 0.5)
                            * smoothstep(0.06, 0.2, r) * smoothstep(1.05, 0.4, r);
                        g += mix(vec3(0.78, 0.72, 0.66), vec3(0.5, 0.58, 0.74), smoothstep(0.1, 0.6, r)) * armLight * 0.66;
                        g += vec3(0.42, 0.42, 0.5) * disk * 0.35;
                        vec2 kUV = flow * 26.0;
                        float kh = hash(floor(kUV));
                        float knot = step(0.92, kh) * smoothstep(0.42, 0.0, length(fract(kUV) - 0.5)) * arms * within;
                        knot *= 0.5 + 0.5 * sin(uTime * (1.5 + kh * 4.0) + kh * 50.0);
                        g += mix(vec3(0.78, 0.14, 0.18), vec3(0.6, 0.72, 0.95), step(0.975, kh)) * knot * 0.8;
                        vec2 sUV = flow * 120.0;
                        float sh = hash(floor(sUV));
                        float star = step(0.972, sh) * smoothstep(0.3, 0.0, length(fract(sUV) - 0.5)) * (disk * 4.0 + arms * 1.2) * within;
                        g += vec3(0.86, 0.9, 1.0) * star * (0.55 + 0.45 * sin(uTime * 3.0 + sh * 90.0));
                    }
                    g *= 1.0 - dust * 0.8 * within;
                    g += vec3(0.16, 0.13, 0.2) * exp(-r * 1.4);
                    g += vec3(0.75, 0.32, 0.12) * exp(-r / 0.08) * (0.3 + 0.35 * uBeat + 0.5 * uFlare);
                    for (int i = 0; i < 2; i++) {
                        vec2 moon = i == 0 ? uMoonA : uMoonB;
                        vec2 m = q - moon;
                        float mr = dot(m, m);
                        g += vec3(0.5, 0.52, 0.6) * exp(-mr / 0.008) * 0.32 + vec3(0.9, 0.85, 0.78) * exp(-mr / 0.0005) * 0.5;
                        float trail = exp(-pow(length(q) - length(moon), 2.0) / 0.0016) * exp(-pow(mod(atan(q.y, q.x) - atan(moon.y, moon.x) + TAU * 1.5, TAU) - TAU * 0.5 - 0.35, 2.0) / 0.08);
                        g += vec3(0.42, 0.44, 0.55) * trail * 0.18;
                    }
                    // The heart is drawn where it is, not where its own weight bends it.
                    float heartR = uRadius * 0.05;
                    g = g * (1.0 - holeShadow(css, uCenter, heartR)) + hole(css, uCenter, heartR, uTilt, uAngle, uSpin * 3.0, 0.75 + 0.6 * uBeat + 1.2 * uFlare);
                    vec2 fromMiddle = css - uCenter;
                    vec2 axis = vec2(-sin(uAngle), cos(uAngle));
                    float along = dot(fromMiddle, axis);
                    float across = length(fromMiddle - axis * along);
                    g += vec3(0.62, 0.72, 0.95) * exp(-across * across / 26.0) * exp(-abs(along) / (uRadius * 0.9)) * uFlare * 1.4;
                    col += g * uMain;
                    cover += (dust * 0.55 * within + holeShadow(css, uCenter, heartR)) * uMain;
                }
            }
            #endif
            // ---- Everything else, each on a layer of its own depth: [x, y, size, kind],
            // [angle, slant, its own number, its own speed], [the way to its light, how
            // bright, which light] and [how far it has faded in, heat, how far its disc has
            // been spun on].
            for (int i = 0; i < ${LIMIT}; i++) {
                if (i >= uCount) break;
                vec4 o = uObj[i];
                vec4 b = uObjB[i];
                vec4 c = uObjC[i];
                vec4 e = uObjD[i];
                vec2 d = bent - o.xy;
                float r = o.z;
                if (dot(d, d) > r * r * 6.0) continue;
                int kind = int(o.w + 0.5);
                float fade = e.x;
                // A shade quieter behind the page's words, down the left.
                float quiet = mix(0.82, 1.0, smoothstep(0.1, 0.5, o.x / screenW));
                vec3 tint = lightTint(c.w);
                vec3 L = normalize(vec3(c.xy, 0.55));
                vec3 light = vec3(0.0);
                float hide = 0.0;
                if (kind == 0) {
                    // A spiral, far off: pale arms, dust down them, a hard bright middle.
                    vec2 q = rotate(d, -b.x);
                    q.y /= b.y;
                    q /= r;
                    float rr = length(q);
                    if (rr < 1.3) {
                        float ph = atan(q.y, q.x) - log(max(rr, 0.04)) / 0.5 + uTime * (0.04 + b.w * 0.05);
                        float arm = pow(0.5 + 0.5 * cos(2.0 * ph), 3.0);
                        float gas = noise(q * 6.0 + b.z * 40.0) * 0.6 + noise(q * 14.0 - b.z * 9.0) * 0.4;
                        float body = arm * (0.3 + gas) * smoothstep(1.1, 0.3, rr) * smoothstep(0.05, 0.18, rr) + exp(-rr * 10.0) * 1.3;
                        float lane = pow(0.5 + 0.5 * cos(2.0 * (ph + 0.5)), 6.0) * smoothstep(0.1, 0.3, rr) * smoothstep(1.0, 0.5, rr);
                        light = mix(vec3(0.62, 0.66, 0.78), vec3(0.8, 0.7, 0.6), b.z) * body * (1.0 - lane * 0.7) * 0.5 * quiet;
                        hide = lane * 0.3 * smoothstep(1.0, 0.6, rr);
                    }
                } else if (kind == 1) {
                    // A black hole and its disc of fire, hotter and faster for a while after
                    // it has fed. Drawn where it is, not where its own weight bends it.
                    float hr = r * 0.3;
                    float sh = holeShadow(css, o.xy, hr) * fade;
                    col *= 1.0 - sh;
                    light = hole(css, o.xy, hr, 0.25 + b.y * 0.35, b.x, uTime * (0.4 + b.w * 0.5) + e.z, 0.6 * quiet + 0.1 + e.y * 1.1);
                    hide = sh;
                } else if (kind == 2) {
                    // A nebula: a cloud of dull colour with dark pillars standing in it.
                    vec2 q = d / r;
                    float n = fbm(q * 1.6 + b.z * 30.0 + vec2(uTime * 0.015, 0.0));
                    float body = smoothstep(1.0, 0.15, length(q) + (n - 0.5) * 0.8) * n;
                    vec3 tone = b.z < 0.33 ? vec3(0.42, 0.2, 0.2) : b.z < 0.66 ? vec3(0.2, 0.28, 0.32) : vec3(0.28, 0.25, 0.34);
                    float pillar = smoothstep(0.58, 0.72, noise(q * 3.0 + b.z * 7.0)) * body;
                    light = tone * body * 0.34 * (1.0 - pillar) * quiet;
                    hide = pillar * 0.5;
                } else if (kind == 3) {
                    // An orb: a small dark world of its own -- rock, ice, molten under a black
                    // crust, or a ball of pale light -- turning, lit at its edge from the side of
                    // whatever burns nearest, a faint aura round it. One a hole has hold of turns
                    // faster, glows, and cracks open as it comes apart. Its edge is drawn soft by
                    // a pixel, so it stays round however close it is looked at.
                    float pr = r * 0.5;
                    vec2 q = d / pr;
                    float rr2 = dot(q, q);
                    float limb = sqrt(rr2);
                    float inside = clamp((1.0 - limb) * pr * uScale / 1.4 + 0.5, 0.0, 1.0);
                    vec3 aura = b.z < 0.3 ? vec3(0.7, 0.66, 0.62) * 0.05 : b.z < 0.55 ? vec3(0.5, 0.62, 0.8) * 0.1
                        : b.z < 0.8 ? vec3(0.9, 0.36, 0.14) * 0.12 : vec3(0.78, 0.82, 0.92) * 0.2;
                    if (inside > 0.0) {
                        vec3 n = vec3(q, sqrt(max(0.0, 1.0 - rr2)));
                        float lit = max(0.0, dot(n, L));
                        vec2 uv = vec2((atan(n.x, n.z) + e.z + uTime * (0.05 + b.w * 0.1)) * 1.6, n.y * 2.2) + b.z * 17.0;
                        float ground = noise(uv * 2.0) * 0.6 + noise(uv * 5.0) * 0.4;
                        vec3 surface;
                        if (b.z < 0.8) {
                            vec3 tone = b.z < 0.3 ? mix(vec3(0.16, 0.15, 0.15), vec3(0.42, 0.38, 0.35), ground)
                                : b.z < 0.55 ? mix(vec3(0.26, 0.3, 0.36), vec3(0.62, 0.68, 0.74), ground) : vec3(0.07, 0.05, 0.05);
                            surface = tone * (0.02 + pow(lit, 1.6) * c.z * 0.8) * tint;
                            // The rim catches the light, as a dark world does against the black.
                            surface += tint * pow(1.0 - n.z, 4.0) * pow(lit, 0.7) * c.z * 0.55 + aura * pow(1.0 - n.z, 3.0);
                            if (b.z >= 0.55) surface += vec3(0.85, 0.28, 0.08) * smoothstep(0.6, 0.82, ground) * (0.3 + 0.15 * sin(uTime * 1.7 + b.z * 30.0));
                        } else {
                            // A ball of pale light: a hot heart, slow weather across it.
                            surface = aura * (1.0 + 0.8 * ground) * (0.4 + 0.9 * n.z) + vec3(0.95, 0.95, 1.0) * pow(n.z, 8.0) * 0.32;
                        }
                        float crack = smoothstep(0.6, 0.7, noise(uv * 7.0 + e.y * 3.0)) * e.y;
                        surface += vec3(1.0, 0.45, 0.18) * (e.y * 0.4 * pow(1.0 - n.z, 2.0) + crack * 1.6);
                        col = mix(col, surface * quiet, fade * inside);
                        cover = mix(cover, 1.0, fade * inside);
                    }
                    light = (aura + vec3(1.0, 0.4, 0.15) * e.y * 0.5) * exp(-max(limb - 1.0, 0.0) * 3.0) * (1.0 - inside) * quiet;
                } else if (kind == 4) {
                    // A world with a ring, lit at its edge from the side of its light, its ring
                    // passing in front and behind; glowing where a hole is tearing at it.
                    float pr = r * 0.42;
                    vec2 q = d / pr;
                    float rr2 = dot(q, q);
                    float inside = clamp((1.0 - sqrt(rr2)) * pr * uScale / 1.4 + 0.5, 0.0, 1.0);
                    vec2 rq = rotate(d, -b.x);
                    rq.y /= 0.22 + b.y * 0.2;
                    float ringR = length(rq) / pr;
                    float ring = smoothstep(1.35, 1.45, ringR) * smoothstep(2.15, 1.95, ringR) * (0.45 + 0.55 * noise(vec2(ringR * 22.0, b.z * 9.0)));
                    vec3 ringCol = vec3(0.5, 0.48, 0.45) * ring * (0.1 + 0.35 * c.z) * tint * quiet;
                    if (inside > 0.0) {
                        vec3 n = vec3(q, sqrt(max(0.0, 1.0 - rr2)));
                        float lit = max(0.0, dot(n, L));
                        float bands = 0.65 + 0.35 * noise(vec2(q.y * 9.0 + b.z * 10.0, q.x * 1.5 + uTime * 0.04));
                        vec3 ground = b.z < 0.5 ? vec3(0.4, 0.33, 0.28) : vec3(0.26, 0.31, 0.38);
                        vec3 surface = ground * bands * (0.02 + pow(lit, 1.6) * c.z * 0.8) * tint * quiet;
                        surface += tint * pow(1.0 - n.z, 4.0) * pow(lit, 0.7) * c.z * 0.45 * quiet;
                        surface += vec3(1.0, 0.42, 0.18) * e.y * (0.25 + 0.5 * pow(1.0 - n.z, 2.0));
                        col = mix(col, surface + (rq.y > 0.0 ? ringCol : vec3(0.0)), fade * inside);
                        cover = mix(cover, 1.0, fade * inside);
                    }
                    light = ringCol * (1.0 - inside);
                } else if (kind == 5) {
                    // A cluster of old stars, thick in the middle.
                    vec2 q = d / r;
                    float density = exp(-dot(q, q) * 3.0);
                    float h = hash(floor(d / 3.0) + b.z * 100.0);
                    float star = step(1.0 - density * 0.35, h) * smoothstep(0.5, 0.0, length(fract(d / 3.0) - 0.5));
                    light = (vec3(0.85, 0.88, 1.0) * star * (0.5 + 0.5 * sin(uTime * 2.0 + h * 50.0)) + vec3(0.36, 0.38, 0.5) * density * 0.14) * quiet;
                    light += vec3(1.0, 0.45, 0.2) * e.y * density * 0.5;
                } else if (kind == 6) {
                    // A dying star, deep red, throwing off its shells.
                    float sd = length(d);
                    float pulse = 0.75 + 0.25 * sin(uTime * 1.3 + b.z * 9.0);
                    vec3 s = vec3(1.0, 0.45, 0.3) * exp(-sd / (r * 0.05)) * 1.1 * pulse + vec3(0.5, 0.12, 0.08) * exp(-sd / (r * 0.4)) * 0.22 * pulse;
                    for (int k = 0; k < 3; k++) {
                        float shell = fract(uTime * 0.07 + b.z + float(k) / 3.0);
                        float rad = shell * r * 1.8;
                        float wobble = 1.0 + 0.12 * noise(d * 0.03 + float(k) * 7.0);
                        s += vec3(0.7, 0.22, 0.16) * exp(-pow((sd - rad * wobble) / (3.0 + shell * 12.0), 2.0)) * (1.0 - shell) * 0.26;
                    }
                    light = s * quiet;
                } else if (kind == 7) {
                    // A galaxy seen edge on, a dark lane of dust across its middle.
                    vec2 q = rotate(d, -b.x);
                    float er = length(vec2(q.x, q.y * 6.0)) / r;
                    vec3 eg = vec3(0.72, 0.68, 0.62) * exp(-er * 2.8) * 0.8 + vec3(0.95, 0.88, 0.76) * exp(-length(q) / (r * 0.08)) * 0.5;
                    float lane = exp(-pow(q.y / (r * 0.025 + 1.0), 2.0)) * smoothstep(r, 0.0, abs(q.x));
                    light = eg * (1.0 - lane * 0.92) * quiet;
                    hide = lane * 0.4;
                } else {
                    // A world and its moon, lit at the edge from the side of whatever burns
                    // nearest; the moon goes round in front and behind and throws its shadow as
                    // it crosses.
                    float pr = r * 0.4;
                    vec2 q = d / pr;
                    float rr2 = dot(q, q);
                    float inside = clamp((1.0 - sqrt(rr2)) * pr * uScale / 1.4 + 0.5, 0.0, 1.0);
                    float ma = uTime * (0.16 + b.w * 0.22) + b.x;
                    vec3 moon = vec3(cos(ma) * 1.85, sin(ma) * 1.85 * (0.2 + b.y * 0.3), sin(ma));
                    float mr = 0.24 + b.z * 0.08;
                    vec2 mq = (q - moon.xy) / mr;
                    float mm = dot(mq, mq);
                    float inMoon = clamp((1.0 - sqrt(mm)) * mr * pr * uScale / 1.4 + 0.5, 0.0, 1.0);
                    vec3 ground = b.z < 0.33 ? vec3(0.36, 0.31, 0.28) : b.z < 0.66 ? vec3(0.24, 0.29, 0.34) : vec3(0.32, 0.25, 0.2);
                    if (inside > 0.0) {
                        vec3 n = vec3(q, sqrt(max(0.0, 1.0 - rr2)));
                        float lit = max(0.0, dot(n, L));
                        float bands = 0.7 + 0.3 * noise(vec2(q.y * 7.0 + b.z * 13.0, q.x * 2.0 + uTime * 0.03));
                        float shade = moon.z > 0.0 ? smoothstep(mr * 0.8, mr * 1.15, length(q - (moon.xy - L.xy * 0.25))) : 1.0;
                        vec3 surface = ground * bands * (0.02 + pow(lit, 1.6) * c.z * 0.8 * shade) * tint;
                        surface += tint * pow(1.0 - n.z, 4.0) * pow(lit, 0.7) * c.z * 0.45 * shade;
                        surface += vec3(1.0, 0.42, 0.18) * e.y * (0.3 + 0.6 * pow(1.0 - n.z, 2.0));
                        col = mix(col, surface * quiet, fade * inside);
                        cover = mix(cover, 1.0, fade * inside);
                    } else {
                        // A thin breath of air round its lit edge.
                        float limb = sqrt(rr2);
                        light = tint * ground * exp(-(limb - 1.0) * 16.0) * 0.18 * c.z * smoothstep(-0.2, 0.6, dot(q / limb, L.xy)) * quiet;
                    }
                    // The moon, over the world when it is in front of it.
                    if (inMoon > 0.0 && (moon.z > 0.0 || inside < 1.0)) {
                        vec3 n = vec3(mq, sqrt(max(0.0, 1.0 - mm)));
                        float lit = max(0.0, dot(n, L));
                        float over = fade * inMoon * (moon.z > 0.0 ? 1.0 : 1.0 - inside);
                        col = mix(col, vec3(0.42, 0.41, 0.4) * (0.02 + pow(lit, 1.4) * c.z * 0.8) * tint * quiet, over);
                        cover = mix(cover, 1.0, over);
                    }
                }                col += light * fade;
                cover += hide * fade;
            }
            col += vec3(0.8, 0.72, 0.7) * shock * 0.3;
            col = max(col, vec3(0.0));
            // Dark, and nearly without colour: what light there is, cold and grey, as space is.
            col = mix(col, vec3(dot(col, vec3(0.3, 0.59, 0.11))), uMono) * uDim;
            cover = clamp(cover + clamp(max(max(col.r, col.g), col.b), 0.0, 1.0) * 0.85, 0.0, 1.0);
            outColor = vec4(base.rgb * (1.0 - cover) + min(col, vec3(1.0)), base.a + (1.0 - base.a) * cover);
        }`;
    const UNIFORMS = ['uRes', 'uScale', 'uTime', 'uScroll', 'uSkyOn', 'uCursor', 'uSky', 'uSkyMap', 'uLens', 'uLensCount', 'uShock',
        'uDim', 'uMono', 'uObj', 'uObjB', 'uObjC', 'uObjD', 'uCount', 'uCenter', 'uMoonA', 'uMoonB', 'uSpin', 'uRadius', 'uTilt', 'uAngle', 'uBeat', 'uFlare', 'uMain'];

    let canvas = null, gl = null, nearCanvas = null, near = null, building = null, broken = false, vertex = null;
    const programs = {};
    let level = '', spec = LEVELS.high, prog = null, using = null;
    let shown = false, frame = 0, waitFrame = 0, lastFrame = 0, clock = 0, spin = 0, beatPhase = 0, eased = false;
    let width = 0, height = 0, scale = 1, centerX = 0, centerY = 0, radius = 1;
    let angle = -.42, tilt = .42;
    const baseAngle = -.42, baseTilt = .42;
    let cursorX = -1e5, cursorY = -1e5, cursorSeen = false, nearness = 0, attention = 0;
    let flare = 0, shockX = 0, shockY = 0, shockAt = -1, shockStrength = 1;
    let scrolled = 0, depth = 0, lastScrollAt = -1e9, lastPointerAt = -1e9, underProject = false, reducedMotion = null, resizeTimer = 0;
    let dark = false, darkTimer = 0, fastThings = 0, frameNumber = 0;
    let skyTexture = null, skyPicture = null, skyReady = false, skyMap = [0, 0, 0, 0];

    /* ---- What is scattered down the page ---------------------------------------
       So many to a screen's worth of scrolling, each with its own place on the screen at
       its own point of the scroll and its own speed past it, so going down the page is
       going past things at different depths. Each is made from its own number, so the
       same page always has the same things in the same places, and a page that grows only
       gets more of them. Each floats a little about its place; the rest is what acts on it. */
    let things = [];
    const view = [], holes = [], worlds = [];
    // The heart of the galaxy (High's own, or the spiral in Medium's picture): a hole that
    // feeds like the others, and is drawn by the galaxy at High and as a thing at Medium.
    const heart = { kind: HOLE, flare: 0, spinBy: 0, nextFeed: 4, lens: null, fade: 1, size: 1, angle: -.42, slant: (.42 - .25) / .35, own: .5, pace: .2 };
    const objectData = new Float32Array(LIMIT * 4), objectMore = new Float32Array(LIMIT * 4);
    const objectLight = new Float32Array(LIMIT * 4), objectState = new Float32Array(LIMIT * 4);
    const lensData = new Float32Array(32);
    // The Halton sequence: spread out evenly however many are asked for.
    const halton = (index, base) => {
        let share = 1, value = 0;
        for (let i = index; i > 0; i = Math.floor(i / base)) {
            share /= base;
            value += share * (i % base);
        }
        return value;
    };
    const thingAt = index => {
        let state = (index + 1) * 0x9E3779B1 + (level === 'medium' ? 0x51ED27 : 0) | 0;
        const random = () => {
            state = (state + 0x6D2B79F5) | 0;
            let t = Math.imul(state ^ (state >>> 15), 1 | state);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        let roll = random(), kind = 0;
        while (kind < spec.odds.length - 1 && roll > spec.odds[kind]) roll -= spec.odds[kind++];
        const unit = Math.min(width, height) / 900, sizeRoll = random();
        let size = (level === 'medium'
            ? (sizeRoll < .55 ? 34 + random() * 30 : sizeRoll < .92 ? 64 + random() * 44 : 112 + random() * 40)
            : (sizeRoll < .6 ? 22 + random() * 30 : sizeRoll < .93 ? 55 + random() * 50 : 110 + random() * 50)) * unit * (kind === 2 ? 1.6 : 1);
        // At High what is far is small, and the orbs come in every size a hand could push.
        if (spec.galaxy && FAR[kind]) size *= .6;
        if (kind === ORB) size = (sizeRoll < .65 ? 28 + random() * 30 : sizeRoll < .93 ? 58 + random() * 40 : 98 + random() * 40) * unit;
        // Spread evenly rather than left to chance: down the page one after another, and across
        // and up the screen by a sequence that never bunches (Halton's), shaken a little, so the
        // middle gets its share and no stretch is bare. At Medium they hold still on the screen,
        // the page scrolling over them.
        const at = spec.fixed ? 0 : (index + .5 + (random() - .5) * .7) * height / spec.perScreen;
        const [slow, fast] = FAR[kind] ? spec.far : spec.near;
        const speed = spec.fixed ? 0 : slow + random() * (fast - slow);
        const homeY = height * (.08 + .84 * ((halton(index + 1, 3) + random() * .08) % 1));
        // Anywhere across, the holes and the dying stars as much as the rest; never on top of
        // the galaxy.
        let x = 0;
        for (let tries = 0; tries < 5; tries++) {
            const across = (halton(index + 1, 2) + tries * .37 + random() * .06) % 1;
            x = width * (.04 + across * .93);
            if (!spec.galaxy || Math.hypot(x - centerX, homeY - (centerY - at * .35)) > radius * 1.3 + size * 1.2) break;
        }
        return {
            kind, x, y: homeY + at * speed, size, speed, angle: random() * TAU, slant: .3 + random() * .6, own: random(), pace: random(),
            // How far it wanders about its place, and how long a wander takes: orbs further and quicker.
            drift: spec.fixed ? 0 : (kind === ORB ? 24 + random() * 46 : 6 + random() * 18) * unit * 1.5, wobble: TAU / (kind === ORB ? 10 + random() * 14 : 20 + random() * 25),
            shedding: 0,
            sx: 0, sy: 0, ox: 0, oy: 0, vx: 0, vy: 0, fade: 1, shrink: 1, heat: 0, gone: false, goneAt: 0, away: 30, fall: null, pullBy: null, pullUntil: 0,
            flare: 0, spinBy: 0, nextFeed: random() * spec.feed[1], lens: null, sense: random() < .5 ? -1 : 1, seen: -1,
            lit: .45, lx: -.6, ly: -.45, tint: 3
        };
    };
    const scatter = () => {
        const want = spec.fixed ? spec.perScreen : Math.min(300, Math.ceil(document.documentElement.scrollHeight / (height / spec.perScreen)) + spec.perScreen);
        while (things.length < want) things.push(thingAt(things.length));
    };
    // How far down the page this is, as a share of all there is to scroll.
    const measureDepth = () => {
        scrolled = window.scrollY || 0;
        const room = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        depth = clamp(scrolled / room, 0, 1);
    };

    /* ---- The picture behind ------------------------------------------------------
       setupStillSky hands over the picture it has laid on the page, so what the holes bend
       is the sky actually there; this works out where on the screen the stylesheet put it
       (center / cover), and at Medium where the spiral it holds has its heart. */
    const takePicture = detail => {
        skyPicture = detail || null;
        skyReady = false;
        if (!gl || !detail) return;
        if (!skyTexture) skyTexture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, skyTexture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        try {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, detail.picture);
        } catch (error) {
            return;
        }
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        skyReady = true;
        if (width) mapSky();
    };
    // Where this visit's galaxy stands, as shares of the screen: chosen with the still sky
    // (portfolio.js, skySpot), anywhere across it.
    const galaxySpot = tall => (window.portfolioSkySpot ? window.portfolioSkySpot(tall) : tall ? [.64, .28] : [.76, .5]);
    const mapSky = () => {
        const layer = document.querySelector('.background-grid');
        const box = layer?.getBoundingClientRect();
        const boxW = box?.width || width, boxH = box?.height || height;
        const pictureW = skyPicture?.width || boxW, pictureH = skyPicture?.height || boxH;
        const fit = Math.max(boxW / pictureW, boxH / pictureH);
        const shownW = pictureW * fit, shownH = pictureH * fit;
        const left = (box?.left || 0) + (boxW - shownW) / 2, top = (box?.top || 0) + (boxH - shownH) / 2;
        skyMap = [1 / shownW, 1 / shownH, -left / shownW, -top / shownH];
        if (!spec.galaxy) {
            // Where paintGalaxySky (portfolio.js) put the spiral, and how big its heart is.
            const tall = pictureH >= pictureW * 1.1;
            const spiral = (tall ? Math.min(pictureW * 1.25, pictureH * .64) : Math.min(pictureW * .64, pictureH * 1.28)) * .46;
            const [spotX, spotY] = galaxySpot(tall);
            heart.sx = left + pictureW * spotX * fit;
            heart.sy = top + pictureH * spotY * fit;
            heart.size = spiral * .034 * fit / .3;
        }
    };

    // Nothing is asked of a shader until it is done: where the browser can build it on
    // the side (KHR_parallel_shader_compile), the page goes on answering meanwhile.
    const compile = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        return shader;
    };
    const buildProgram = name => {
        if (programs[name]) return programs[name];
        if (!vertex) vertex = compile(gl.VERTEX_SHADER, VERTEX);
        const program = gl.createProgram();
        gl.attachShader(program, vertex);
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, skySource(name === 'high')));
        gl.linkProgram(program);
        return (programs[name] = { program, uniforms: null });
    };
    const isBuilt = entry => !building || gl.getProgramParameter(entry.program, building.COMPLETION_STATUS_KHR);
    const finishProgram = entry => {
        if (!gl.getProgramParameter(entry.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(entry.program));
        entry.uniforms = {};
        for (const name of UNIFORMS) entry.uniforms[name] = gl.getUniformLocation(entry.program, name);
        gl.useProgram(entry.program);
        gl.uniform1i(entry.uniforms.uSky, 0);
        using = entry;
    };

    /* ---- What is near: comets, sparks, landers, and at High the war ---------------
       Drawn on a canvas of its own over the sky. Two kinds of ship, and neither of them
       ours: the Ash, hard and red-lit, and the Pale, dark crescents round a cold light.
       Fighters only; the great ships and the wrecks that drifted at the foot of the page
       were taken out, too big and too strange beside everything else. Each fighter hunts the nearest of the other kind, turns as hard as it can and fires
       when it has it in front, steering round the worlds and away from the holes, which
       pull at it and take it if it strays too close. A shot bends round a hole too, and one
       that hits a world flashes on it and knocks it. Landers, of either kind, come in to a
       world, set down on it, sit a while with a light blinking, and go. Comets cross, bent
       by the holes and by the cursor, and a hole catches the ones that pass too close. */
    const KINDS = {
        ash: { engine: '255,70,40', bolt: '255,90,60', speed: 150, turn: 2.6, size: 11, hp: 3 },
        pale: { engine: '150,210,255', bolt: '170,225,255', speed: 135, turn: 3.1, size: 12, hp: 3 }
    };
    // A point in the plane of a hole's disc, and back: things fall in along the disc.
    const intoDisc = (hole, dx, dy) => {
        const c = Math.cos(-hole.turn), s = Math.sin(-hole.turn);
        const u = dx * c - dy * s, v = (dx * s + dy * c) / hole.slant;
        return [Math.hypot(u, v), Math.atan2(v, u)];
    };
    const outOfDisc = (hole, r, a) => {
        const u = Math.cos(a) * r, v = Math.sin(a) * r * hole.slant;
        const c = Math.cos(hole.turn), s = Math.sin(hole.turn);
        return [hole.sx + u * c - v * s, hole.sy + u * s + v * c];
    };
    function makeNear(target) {
        const context = target.getContext('2d');
        let w = 1, h = 1, ratio = 1, armed = false, pointerX = -1e5, pointerY = -1e5, lastScroll = null, drew = true, time = 0;
        let nextComet = 3, nextLander = 9;
        const ships = [], bolts = [], blasts = [], bits = [], comets = [], landers = [];
        const pull = [0, 0];
        let fellInto = null;
        const glows = new Map();
        const glow = rgb => {
            if (glows.has(rgb)) return glows.get(rgb);
            const sprite = document.createElement('canvas');
            sprite.width = sprite.height = 64;
            const c = sprite.getContext('2d');
            const light = c.createRadialGradient(32, 32, 0, 32, 32, 32);
            light.addColorStop(0, `rgba(${rgb},1)`);
            light.addColorStop(.25, `rgba(${rgb},.45)`);
            light.addColorStop(1, `rgba(${rgb},0)`);
            c.fillStyle = light;
            c.fillRect(0, 0, 64, 64);
            glows.set(rgb, sprite);
            return sprite;
        };
        /* The craft, each drawn once, large, into a picture of its own and laid down turned
           from then on: hulls nearly black, caught by a little light along one edge, their
           own lights small and dim. The Ash build hard: a split prow like a pair of jaws, a
           spine down the back, wings raked to points, red slits glowing in the plating. The
           Pale grow theirs: a crescent of dark shell round a ring of cold light, a skin
           stretched between its horns, a row of pale lights along the leading edge. */
        const SPRITE_SCALE = 5;
        const sprites = new Map();
        const sprite = (kind, size) => {
            const key = `${kind}${size}`;
            if (sprites.has(key)) return sprites.get(key);
            const span = size * 2.8, px = Math.ceil(span * 2 * SPRITE_SCALE);
            const picture = document.createElement('canvas');
            picture.width = picture.height = px;
            const c = picture.getContext('2d');
            c.translate(px / 2, px / 2);
            c.scale(SPRITE_SCALE, SPRITE_SCALE);
            const s = size;
            const dot = (x, y, r, rgb, alpha) => {
                const light = c.createRadialGradient(x, y, 0, x, y, r);
                light.addColorStop(0, `rgba(${rgb},${alpha})`);
                light.addColorStop(.35, `rgba(${rgb},${alpha * .4})`);
                light.addColorStop(1, `rgba(${rgb},0)`);
                c.fillStyle = light;
                c.fillRect(x - r, y - r, r * 2, r * 2);
            };
            if (kind === 'ash') {
                const shape = () => {
                    c.beginPath();
                    c.moveTo(s * 1.65, -s * .12);
                    c.lineTo(s * .95, -s * .3);
                    c.lineTo(s * .35, -s * .5);
                    c.lineTo(-s * .55, -s * 1.12);
                    c.lineTo(-s * .4, -s * .52);
                    c.lineTo(-s * .95, -s * .4);
                    c.lineTo(-s * 1.2, -s * .2);
                    c.lineTo(-s * 1.2, s * .2);
                    c.lineTo(-s * .95, s * .4);
                    c.lineTo(-s * .4, s * .52);
                    c.lineTo(-s * .55, s * 1.12);
                    c.lineTo(s * .35, s * .5);
                    c.lineTo(s * .95, s * .3);
                    c.lineTo(s * 1.65, s * .12);
                    c.lineTo(s * 1.0, 0);
                    c.closePath();
                };
                shape();
                const metal = c.createLinearGradient(0, -s * 1.1, 0, s * 1.1);
                metal.addColorStop(0, '#2a1d1b');
                metal.addColorStop(.45, '#100a0a');
                metal.addColorStop(1, '#050304');
                c.fillStyle = metal;
                c.fill();
                c.strokeStyle = 'rgba(150,92,74,.5)';
                c.lineWidth = .35;
                c.stroke();
                // The spine, and the seams of the plating.
                c.strokeStyle = 'rgba(0,0,0,.7)';
                c.lineWidth = .5;
                c.beginPath();
                c.moveTo(s * .9, 0);
                c.lineTo(-s * 1.1, 0);
                c.moveTo(s * .2, -s * .45);
                c.lineTo(-s * .2, s * .45);
                c.stroke();
                for (const y of [-.32, .32]) {
                    c.fillStyle = 'rgba(255,70,40,.75)';
                    c.fillRect(-s * .35, y * s - s * .035, s * .45, s * .07);
                    dot(-s * .12, y * s, s * .35, '255,70,40', .35);
                }
                dot(s * .7, 0, s * .22, '255,110,80', .8);
                dot(-s * 1.25, 0, s * .55, '255,80,40', .55);
            } else {
                const shape = () => {
                    c.beginPath();
                    c.moveTo(s * 1.15, 0);
                    c.bezierCurveTo(s * 1.05, -s * .9, s * .1, -s * 1.25, -s * 1.05, -s * 1.0);
                    c.quadraticCurveTo(-s * .2, -s * .62, -s * .05, 0);
                    c.quadraticCurveTo(-s * .2, s * .62, -s * 1.05, s * 1.0);
                    c.bezierCurveTo(s * .1, s * 1.25, s * 1.05, s * .9, s * 1.15, 0);
                    c.closePath();
                };
                // The skin between the horns, barely there.
                c.fillStyle = 'rgba(70,110,130,.12)';
                c.beginPath();
                c.moveTo(-s * 1.05, -s * 1.0);
                c.quadraticCurveTo(-s * 1.5, 0, -s * 1.05, s * 1.0);
                c.quadraticCurveTo(-s * .45, 0, -s * 1.05, -s * 1.0);
                c.fill();
                shape();
                const shell = c.createLinearGradient(s * 1.1, 0, -s, 0);
                shell.addColorStop(0, '#16222a');
                shell.addColorStop(.5, '#090f13');
                shell.addColorStop(1, '#040608');
                c.fillStyle = shell;
                c.fill();
                c.strokeStyle = 'rgba(120,170,195,.42)';
                c.lineWidth = .35;
                c.stroke();
                // Ribs.
                c.strokeStyle = 'rgba(0,0,0,.6)';
                c.lineWidth = .45;
                for (const sign of [-1, 1]) {
                    c.beginPath();
                    c.moveTo(s * .55, sign * s * .25);
                    c.quadraticCurveTo(s * .15, sign * s * .75, -s * .55, sign * s * .82);
                    c.stroke();
                }
                c.strokeStyle = 'rgba(160,215,240,.6)';
                c.lineWidth = .5;
                c.beginPath();
                c.arc(s * .38, 0, s * .2, 0, TAU);
                c.stroke();
                dot(s * .38, 0, s * .5, '150,210,240', .4);
                for (let i = 1; i <= 5; i++) {
                    const a = i / 6;
                    for (const sign of [-1, 1]) dot(s * (1.12 - a * 1.9), sign * s * (Math.sin(a * Math.PI) * 1.02), s * .13, '170,225,250', .7);
                }
            }
            const made = { picture, half: span };
            sprites.set(key, made);
            return made;
        };
        // Any size from the one picture of each, so a lander shrinking on its way down asks
        // for no new ones.
        const hull = (kind, size) => {
            const made = sprite(kind, KINDS[kind].size);
            const span = made.half * size / KINDS[kind].size;
            context.drawImage(made.picture, -span, -span, span * 2, span * 2);
        };
        // How hard every hole on the screen pulls at a point, and which one it has fallen into.
        const gravity = (x, y, holeList, strength) => {
            let ax = 0, ay = 0;
            fellInto = null;
            for (const hole of holeList) {
                const dx = hole.sx - x, dy = hole.sy - y, d2 = dx * dx + dy * dy;
                if (d2 < hole.hr * hole.hr * 1.4) fellInto = hole;
                const f = strength * hole.hr / (d2 + hole.hr * hole.hr) / Math.sqrt(d2 + 1);
                ax += dx * f;
                ay += dy * f;
            }
            pull[0] = ax;
            pull[1] = ay;
        };
        // The Ash come in from the left and the Pale from the right.
        const spawn = kind => {
            const fromLeft = kind === 'ash';
            ships.push({
                kind, x: fromLeft ? -40 : w + 40, y: h * (.15 + Math.random() * .7), dx: 0, dy: 0,
                angle: fromLeft ? (Math.random() - .5) * .6 : Math.PI + (Math.random() - .5) * .6,
                hp: KINDS[kind].hp, cooldown: Math.random(), wobble: Math.random() * TAU, alive: true
            });
        };
        const blowUp = (x, y, size, rgb, count = 10) => {
            blasts.push({ x, y, age: 0, size, rgb });
            for (let i = 0; i < count; i++) {
                const a = Math.random() * TAU, speed = 40 + Math.random() * 160;
                bits.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: .6 + Math.random() * .8, rgb });
            }
        };
        const prune = list => {
            let keep = 0;
            for (const item of list) if ((item.alive ?? true) && (item.life ?? 1) > 0 && (item.age ?? 0) < .8) list[keep++] = item;
            list.length = keep;
        };
        const launchComet = () => {
            const side = Math.floor(Math.random() * 4), along = Math.random();
            const x = side === 0 ? -30 : side === 1 ? w + 30 : along * w;
            const y = side === 2 ? -30 : side === 3 ? h + 30 : h * (.1 + .8 * along);
            const tx = w * (.25 + Math.random() * .6), ty = h * (.2 + Math.random() * .6);
            const speed = armed ? 180 + Math.random() * 110 : 110 + Math.random() * 70;
            const d = Math.hypot(tx - x, ty - y) || 1;
            comets.push({ x, y, vx: (tx - x) / d * speed, vy: (ty - y) / d * speed, trail: [], life: 16, fall: null, size: 1 + Math.random() * 1.4, inside: false });
        };
        const launchLander = worldList => {
            const world = worldList[Math.floor(Math.random() * worldList.length)];
            if (!world) return false;
            const kind = Math.random() < .5 ? 'ash' : 'pale', fromLeft = Math.random() < .5;
            landers.push({ kind, x: fromLeft ? -30 : w + 30, y: h * (.15 + Math.random() * .7), angle: fromLeft ? 0 : Math.PI, world, stage: 'in', t: 0, stay: 4 + Math.random() * 4, scale: 1, alpha: 1, spotX: 0, spotY: 0, fromX: 0, fromY: 0, speed: 0 });
            return true;
        };
        const worldRadius = world => world.size * (world.kind === RINGED ? .42 : world.kind === ORB ? .5 : .4) * world.shrink;
        return {
            size(width, height, scaleBy, withShips) {
                w = width;
                h = height;
                ratio = scaleBy;
                armed = withShips;
                target.width = Math.max(1, Math.round(w * ratio));
                target.height = Math.max(1, Math.round(h * ratio));
                drew = true;
                if (!armed) ships.length = bolts.length = 0;
            },
            pointer(x, y) {
                pointerX = x;
                pointerY = y;
            },
            // A press among them breaks them up.
            press(x, y) {
                for (const ship of ships) {
                    if (ship.alive && Math.hypot(ship.x - x, ship.y - y) < 150) {
                        ship.alive = false;
                        blowUp(ship.x, ship.y, KINDS[ship.kind].size * 3, KINDS[ship.kind].engine);
                    }
                }
            },
            // Something has gone into a hole: a flash, and sparks thrown out that mostly fall back.
            eat(x, y, hr, power) {
                blasts.push({ x, y, age: 0, size: hr * (4 + power * 3), rgb: '255,150,90' });
                const count = Math.round((armed ? 18 : 10) * power + 4);
                for (let i = 0; i < count; i++) {
                    const a = Math.random() * TAU, speed = (50 + Math.random() * 150) * (.6 + power * .4);
                    bits.push({ x: x + Math.cos(a) * hr * 1.4, y: y + Math.sin(a) * hr * .7, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed * .6, life: .8 + Math.random() * 1.2, rgb: Math.random() < .5 ? '255,190,130' : '255,110,60' });
                }
            },
            // A piece torn off something going in, and the crack where it first gives.
            shed(x, y, vx, vy, spread, rgb) {
                if (bits.length > 400) return;
                const a = Math.random() * TAU, out = Math.random() * spread;
                bits.push({ x: x + Math.cos(a) * out, y: y + Math.sin(a) * out, vx: vx * .7 + (Math.random() - .5) * 110, vy: vy * .7 + (Math.random() - .5) * 110, life: .9 + Math.random() * 1.3, rgb, chunk: true });
            },
            crack(x, y, r) {
                blasts.push({ x, y, age: .2, size: r * 2.6, rgb: '255,170,110' });
                for (let i = 0; i < 8; i++) {
                    const a = Math.random() * TAU, speed = 60 + Math.random() * 120;
                    bits.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: .6 + Math.random() * .8, rgb: '255,190,140', chunk: true });
                }
            },
            // Only what is quick needs every frame: a lander comes in slowly enough without.
            busy: () => comets.length > 0 || bits.length > 0 || blasts.length > 0,
            update(dt, depthNow, scrolledBy, holeList, worldList, feed, knock) {
                time += dt;
                const by = lastScroll === null ? 0 : scrolledBy - lastScroll;
                lastScroll = scrolledBy;
                // Comets, now and then.
                nextComet -= dt;
                if (nextComet <= 0) {
                    const [low, high] = spec.comets;
                    nextComet = low + Math.random() * (high - low);
                    if (comets.length < 3) launchComet();
                }
                for (const comet of comets) {
                    if (comet.fall) {
                        const fall = comet.fall;
                        fall.t += dt / 1.1;
                        const t = Math.min(1, fall.t);
                        [comet.x, comet.y] = outOfDisc(fall.hole, fall.r0 * Math.pow(1 - t, 1.4), fall.a0 + fall.hole.sense * (1.4 * t + 2.2 * t * t) * Math.PI);
                        comet.trail.push(comet.x, comet.y, time);
                        if (t >= 1) {
                            comet.life = 0;
                            feed(fall.hole, .45);
                        }
                    } else {
                        gravity(comet.x, comet.y, holeList, 40000);
                        let ax = pull[0], ay = pull[1];
                        // The cursor has a little weight of its own.
                        const cx = pointerX - comet.x, cy = pointerY - comet.y, c2 = cx * cx + cy * cy;
                        const cf = 9e5 / ((c2 + 3600) * Math.sqrt(c2 + 1));
                        ax += cx * cf;
                        ay += cy * cf;
                        if (fellInto) {
                            const [r0, a0] = intoDisc(fellInto, comet.x - fellInto.sx, comet.y - fellInto.sy);
                            comet.fall = { hole: fellInto, r0, a0, t: 0 };
                        }
                        comet.vx += ax * dt;
                        comet.vy += ay * dt;
                        comet.x += comet.vx * dt;
                        comet.y += comet.vy * dt - by * .3;
                        comet.trail.push(comet.x, comet.y, time);
                        const inside = comet.x > -60 && comet.x < w + 60 && comet.y > -60 && comet.y < h + 60;
                        if (inside) comet.inside = true;
                        else if (comet.inside) comet.life = 0;
                        comet.life -= dt;
                    }
                    let drop = 0;
                    while (drop < comet.trail.length && comet.trail[drop + 2] < time - .6) drop += 3;
                    if (drop) comet.trail.splice(0, drop);
                    for (let i = 1; i < comet.trail.length; i += 3) comet.trail[i] -= by * .3;
                }
                // Landers come down on a world in view, sit a while, and go.
                nextLander -= dt;
                if (nextLander <= 0) {
                    const [low, high] = spec.landers;
                    nextLander = low + Math.random() * (high - low);
                    if (landers.length < (armed ? 2 : 1)) launchLander(worldList.filter(world => world.fade > .9 && !world.fall && worldRadius(world) > 14));
                }
                for (const lander of landers) {
                    const world = lander.world;
                    const lost = world.gone || world.fall || world.seen !== frameNumber;
                    if (lost && (lander.stage === 'down' || lander.stage === 'stay')) {
                        // Taken down with the world it was sitting on.
                        lander.alive = false;
                        continue;
                    }
                    if (lost && lander.stage === 'in') lander.stage = 'out';
                    const radius = lost ? 0 : worldRadius(world);
                    lander.t += dt;
                    if (lander.stage === 'in') {
                        const dx = world.sx - lander.x, dy = world.sy - lander.y, d = Math.hypot(dx, dy) || 1;
                        const turnBy = ((Math.atan2(dy, dx) - lander.angle + Math.PI * 3) % TAU) - Math.PI;
                        lander.angle += clamp(turnBy, -1.8 * dt, 1.8 * dt);
                        const speed = armed ? 95 : 80;
                        lander.x += Math.cos(lander.angle) * speed * dt;
                        lander.y += Math.sin(lander.angle) * speed * dt - by * .3;
                        if (d < radius * 2.4) {
                            lander.stage = 'down';
                            lander.t = 0;
                            lander.spotX = -dx / d;
                            lander.spotY = -dy / d;
                            lander.fromX = lander.x - world.sx;
                            lander.fromY = lander.y - world.sy;
                        }
                    } else if (lander.stage === 'down' || lander.stage === 'up') {
                        const t = Math.min(1, lander.t / 1.6), ease = t * t * (3 - 2 * t);
                        const k = lander.stage === 'down' ? ease : 1 - ease;
                        const surfaceX = lander.spotX * radius * .85, surfaceY = lander.spotY * radius * .85;
                        lander.x = world.sx + lander.fromX + (surfaceX - lander.fromX) * k;
                        lander.y = world.sy + lander.fromY + (surfaceY - lander.fromY) * k;
                        lander.scale = 1 - .7 * k;
                        lander.alpha = 1 - k;
                        lander.angle = Math.atan2(lander.spotY, lander.spotX) + (lander.stage === 'down' ? Math.PI : 0);
                        if (t >= 1) {
                            lander.stage = lander.stage === 'down' ? 'stay' : 'out';
                            lander.t = 0;
                        }
                    } else if (lander.stage === 'stay') {
                        lander.x = world.sx + lander.spotX * radius * .85;
                        lander.y = world.sy + lander.spotY * radius * .85;
                        if (lander.t > lander.stay) {
                            lander.stage = 'up';
                            lander.t = 0;
                            lander.fromX = lander.spotX * radius * 2.4;
                            lander.fromY = lander.spotY * radius * 2.4;
                        }
                    } else {
                        lander.speed = Math.min(220, lander.speed + dt * 120);
                        lander.x += Math.cos(lander.angle) * (60 + lander.speed) * dt;
                        lander.y += Math.sin(lander.angle) * (60 + lander.speed) * dt - by * .3;
                        lander.scale = 1;
                        lander.alpha = 1;
                        if (lander.x < -80 || lander.x > w + 80 || lander.y < -80 || lander.y > h + 80) lander.alive = false;
                    }
                }
                if (armed) {
                    const want = depthNow < .1 ? 0 : depthNow < .3 ? 3 : depthNow < .72 ? 10 : 2;
                    if (depthNow < .1 && Math.random() < dt * .08 && !ships.length) spawn(Math.random() < .5 ? 'ash' : 'pale');
                    for (const kind of ['ash', 'pale']) {
                        let have = 0;
                        for (const ship of ships) if (ship.alive && ship.kind === kind) have++;
                        if (have < want && Math.random() < dt * 1.5) spawn(kind);
                    }
                    for (const ship of ships) {
                        if (!ship.alive) continue;
                        const k = KINDS[ship.kind];
                        // The nearest of the other kind.
                        let prey = null, best = Infinity;
                        for (const other of ships) {
                            if (!other.alive || other.kind === ship.kind) continue;
                            const d = Math.hypot(other.x - ship.x, other.y - ship.y);
                            if (d < best) {
                                best = d;
                                prey = other;
                            }
                        }
                        let heading = prey ? Math.atan2(prey.y - ship.y, prey.x - ship.x) : ship.angle + Math.sin(time * 1.1 + ship.wobble) * .4;
                        // Round the worlds, not through them; the small orbs it flies over.
                        for (const world of worldList) {
                            const dx = ship.x - world.sx, dy = ship.y - world.sy, r = worldRadius(world);
                            if (r > 16 && dx * dx + dy * dy < r * r * 3) heading = Math.atan2(dy, dx) + .9;
                        }
                        // Away from the holes, which pull at it all the same.
                        gravity(ship.x, ship.y, holeList, 60000);
                        for (const hole of holeList) {
                            if (Math.hypot(hole.sx - ship.x, hole.sy - ship.y) < hole.hr * 6) heading = Math.atan2(ship.y - hole.sy, ship.x - hole.sx);
                        }
                        if (fellInto) {
                            ship.alive = false;
                            feed(fellInto, .4);
                            continue;
                        }
                        // And the cursor, which every one of them avoids.
                        if (Math.hypot(ship.x - pointerX, ship.y - pointerY) < 130) heading = Math.atan2(ship.y - pointerY, ship.x - pointerX);
                        const turnBy = ((heading - ship.angle + Math.PI * 3) % TAU) - Math.PI;
                        ship.angle += clamp(turnBy, -k.turn * dt, k.turn * dt);
                        ship.dx = (ship.dx + pull[0] * dt) * (1 - dt * .6);
                        ship.dy = (ship.dy + pull[1] * dt) * (1 - dt * .6);
                        ship.x += (Math.cos(ship.angle) * k.speed + ship.dx) * dt;
                        ship.y += (Math.sin(ship.angle) * k.speed + ship.dy) * dt;
                        // Where it has just been, for the faint wake behind it.
                        (ship.wake ||= []).push(ship.x, ship.y);
                        if (ship.wake.length > 18) ship.wake.splice(0, 2);
                        ship.cooldown -= dt;
                        if (prey && best < 280 && Math.abs(turnBy) < .25 && ship.cooldown <= 0) {
                            ship.cooldown = .35 + Math.random() * .6;
                            bolts.push({ x: ship.x, y: ship.y, vx: Math.cos(ship.angle) * 520, vy: Math.sin(ship.angle) * 520, life: .7, rgb: k.bolt, from: ship.kind });
                        }
                        if (ship.x < -200 || ship.x > w + 200 || ship.y < -200 || ship.y > h + 200) ship.alive = false;
                    }
                    for (const bolt of bolts) {
                        gravity(bolt.x, bolt.y, holeList, 220000);
                        if (fellInto) {
                            bolt.life = 0;
                            continue;
                        }
                        bolt.vx += pull[0] * dt;
                        bolt.vy += pull[1] * dt;
                        bolt.x += bolt.vx * dt;
                        bolt.y += bolt.vy * dt;
                        bolt.life -= dt;
                        for (const world of worldList) {
                            const r = worldRadius(world);
                            if ((bolt.x - world.sx) ** 2 + (bolt.y - world.sy) ** 2 < r * r) {
                                bolt.life = 0;
                                blasts.push({ x: bolt.x, y: bolt.y, age: .3, size: 14, rgb: bolt.rgb });
                                knock(world, bolt.vx * (world.kind === ORB ? .1 : .04), bolt.vy * (world.kind === ORB ? .1 : .04));
                                break;
                            }
                        }
                        if (bolt.life <= 0) continue;
                        for (const ship of ships) {
                            if (!ship.alive || ship.kind === bolt.from) continue;
                            if (Math.abs(ship.x - bolt.x) < 10 && Math.abs(ship.y - bolt.y) < 10) {
                                bolt.life = 0;
                                ship.hp -= 1;
                                bits.push({ x: bolt.x, y: bolt.y, vx: (Math.random() - .5) * 80, vy: (Math.random() - .5) * 80, life: .3, rgb: bolt.rgb });
                                if (ship.hp <= 0) {
                                    ship.alive = false;
                                    blowUp(ship.x, ship.y, KINDS[ship.kind].size * 2.6, KINDS[ship.kind].engine);
                                }
                                break;
                            }
                        }
                    }
                    // Going down the page, everything slides up past.
                    for (const ship of ships) {
                        ship.y -= by * .2;
                        if (ship.wake) for (let i = 1; i < ship.wake.length; i += 2) ship.wake[i] -= by * .2;
                    }
                }
                for (const blast of blasts) blast.age += dt;
                for (const bit of bits) {
                    gravity(bit.x, bit.y, holeList, 50000);
                    if (fellInto) bit.life = 0;
                    bit.vx = (bit.vx + pull[0] * dt) * (1 - dt * .8);
                    bit.vy = (bit.vy + pull[1] * dt) * (1 - dt * .8);
                    bit.x += bit.vx * dt;
                    bit.y += bit.vy * dt - by * .3;
                    bit.life -= dt;
                }
                prune(ships);
                prune(bolts);
                prune(bits);
                prune(blasts);
                prune(comets);
                prune(landers);
            },
            draw() {
                const any = comets.length || bits.length || blasts.length || landers.length || ships.length || bolts.length;
                if (!any && !drew) return;
                drew = !!any;
                context.setTransform(ratio, 0, 0, ratio, 0, 0);
                context.clearRect(0, 0, w, h);
                if (!any) return;
                // The fighters and the landers: a faint wake behind, then the craft.
                context.globalCompositeOperation = 'lighter';
                context.lineCap = 'round';
                for (const ship of ships) {
                    const wake = ship.wake;
                    if (!wake || wake.length < 4) continue;
                    const rgb = KINDS[ship.kind].engine;
                    for (let i = 2; i < wake.length; i += 2) {
                        const share = i / wake.length;
                        context.strokeStyle = `rgba(${rgb},${(share * .22).toFixed(3)})`;
                        context.lineWidth = share * 2.2;
                        context.beginPath();
                        context.moveTo(wake[i - 2], wake[i - 1]);
                        context.lineTo(wake[i], wake[i + 1]);
                        context.stroke();
                    }
                }
                context.globalCompositeOperation = 'source-over';
                const craft = (kind, x, y, turn, size, alpha) => {
                    context.save();
                    context.globalAlpha = alpha;
                    context.translate(x, y);
                    context.rotate(turn);
                    hull(kind, size);
                    context.restore();
                };
                for (const ship of ships) craft(ship.kind, ship.x, ship.y, ship.angle, KINDS[ship.kind].size, 1);
                for (const lander of landers) {
                    if (lander.stage === 'stay') {
                        // Down, with a light blinking where it sits.
                        const blink = .35 + .65 * Math.max(0, Math.sin(time * 5 + lander.stay));
                        context.globalCompositeOperation = 'lighter';
                        context.globalAlpha = blink;
                        context.drawImage(glow(KINDS[lander.kind].engine), lander.x - 5, lander.y - 5, 10, 10);
                        context.globalAlpha = 1;
                        context.globalCompositeOperation = 'source-over';
                    } else craft(lander.kind, lander.x, lander.y, lander.angle, KINDS[lander.kind].size * .8 * lander.scale, lander.alpha);
                }
                context.globalCompositeOperation = 'lighter';
                // Comets: a cold head and the path it has come by.
                for (const comet of comets) {
                    const trail = comet.trail;
                    for (let i = 3; i < trail.length; i += 3) {
                        const age = (time - trail[i + 2]) / .6;
                        context.strokeStyle = `rgba(200,215,235,${((1 - age) * .28).toFixed(3)})`;
                        context.lineWidth = comet.size * (1.6 - age);
                        context.beginPath();
                        context.moveTo(trail[i - 3], trail[i - 2]);
                        context.lineTo(trail[i], trail[i + 1]);
                        context.stroke();
                    }
                    const s = comet.size * 6;
                    context.drawImage(glow('210,228,255'), comet.x - s, comet.y - s, s * 2, s * 2);
                }
                context.lineWidth = 1.6;
                for (const bolt of bolts) {
                    context.strokeStyle = `rgba(${bolt.rgb},.9)`;
                    context.beginPath();
                    context.moveTo(bolt.x, bolt.y);
                    context.lineTo(bolt.x - bolt.vx * .03, bolt.y - bolt.vy * .03);
                    context.stroke();
                }
                for (const bit of bits) {
                    context.fillStyle = `rgba(${bit.rgb},${clamp(bit.life, 0, 1).toFixed(3)})`;
                    if (bit.chunk) context.fillRect(bit.x - 1.4, bit.y - 1.4, 2.8, 2.8);
                    else context.fillRect(bit.x - 1, bit.y - 1, 2, 2);
                }
                for (const blast of blasts) {
                    const t = blast.age / .8, s = blast.size * (.4 + t * 1.6);
                    context.globalAlpha = 1 - t;
                    context.drawImage(glow('255,240,220'), blast.x - s * .5, blast.y - s * .5, s, s);
                    context.drawImage(glow(blast.rgb), blast.x - s, blast.y - s, s * 2, s * 2);
                    context.globalAlpha = 1;
                }
                context.globalCompositeOperation = 'source-over';
            }
        };
    }

    const setUp = target => {
        canvas = target;
        gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
        if (!gl) throw new Error('no WebGL 2');
        // A graphics card the browser only imitates, on the processor, would spend the whole
        // machine on this. The page keeps the still sky instead.
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        const renderer = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
        if (/swiftshader|llvmpipe|software|basic render/i.test(renderer)) throw new Error('no graphics card');
        building = gl.getExtension('KHR_parallel_shader_compile');
        gl.bindVertexArray(gl.createVertexArray());
        nearCanvas = document.createElement('canvas');
        nearCanvas.className = 'cosmos cosmos-near';
        nearCanvas.setAttribute('aria-hidden', 'true');
        nearCanvas.hidden = true;
        canvas.after(nearCanvas);
        near = makeNear(nearCanvas);
        if (window.portfolioStillSky) takePicture(window.portfolioStillSky);
    };
    const size = () => {
        width = document.documentElement.clientWidth;
        height = window.innerHeight;
        const tall = height >= width * 1.1;
        // One large thing to begin with, and not so large it is the whole sky, standing where
        // this visit's still sky put its galaxy.
        const [spotX, spotY] = galaxySpot(tall);
        centerX = width * spotX;
        centerY = height * (spotY - (tall ? .02 : .08));
        radius = (tall ? Math.min(width * .8, height * .42) : Math.min(width * .34, height * .62)) * .5;
        // A machine the page has eased gets it a little softer.
        scale = Math.min(window.devicePixelRatio || 1, eased || root.dataset.effectsPace ? spec.eased : spec.sharp);
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        gl.viewport(0, 0, canvas.width, canvas.height);
        near.size(width, height, scale, spec.armed);
        mapSky();
        things = [];
        scatter();
        heart.nextFeed = clock + 3 + Math.random() * 4;
    };

    // Lub-dub: two beats close together, then a rest.
    const heartbeat = phase => {
        const lub = Math.exp(-Math.pow(phase / .07, 2)) + Math.exp(-Math.pow((phase - 1) / .07, 2));
        const dub = Math.exp(-Math.pow((phase - .2) / .07, 2)) * .65;
        return lub + dub;
    };
    // A hole as the rest of the sky sees it this frame. Kept on the hole, so anything
    // falling into it follows it as the page moves.
    const holeOf = (owner, sx, sy, hr, slant, turn) => {
        const lens = owner.lens || (owner.lens = { thing: owner, sense: owner.sense || 1 });
        lens.sx = sx;
        lens.sy = sy;
        lens.hr = hr;
        lens.slant = slant;
        lens.turn = turn;
        owner.seen = frameNumber;
        return lens;
    };
    const revive = (thing, inSight) => {
        thing.ox = thing.oy = thing.vx = thing.vy = 0;
        thing.gone = false;
        thing.fall = null;
        thing.pullBy = null;
        thing.shrink = 1;
        thing.heat = 0;
        thing.fade = inSight ? 0 : 1;
    };
    // Gone in: a flare on the hole, sparks, and in a while something drifts in again.
    let swallowed = 0;
    const feed = (hole, power) => {
        swallowed++;
        const owner = hole.thing;
        owner.flare = Math.min(1.6, owner.flare + power);
        near.eat(hole.sx, hole.sy, hole.hr, power);
    };
    const swallow = (thing, hole) => {
        thing.fall = null;
        thing.gone = true;
        thing.goneAt = clock;
        thing.away = 25 + Math.random() * 20;
        feed(hole, clamp(thing.size / (hole.hr * 4), .35, 1.2));
    };
    const knock = (thing, vx, vy) => {
        if (thing.fall) return;
        thing.vx += vx;
        thing.vy += vy;
    };
    const step = dt => {
        clock += dt;
        frameNumber++;
        flare = Math.max(0, flare - dt * .9);
        nearness += ((cursorSeen ? 1 : 0) - nearness) * Math.min(1, dt * 4);
        view.length = holes.length = worlds.length = 0;
        // ---- The galaxy at the top, at High.
        if (spec.galaxy) {
            const galaxyY = centerY - scrolled * .35;
            heart.flare = Math.max(0, heart.flare - dt * .55);
            spin += dt * (.16 + .12 * flare + .1 * heart.flare);
            const period = attention > .5 ? 1.05 : 1.5;
            beatPhase = (beatPhase + dt / period) % 1;
            const distance = Math.hypot(cursorX - centerX, (cursorY - galaxyY) * 1.6) / radius;
            attention += ((cursorSeen ? smooth(2.4, .3, distance) : 0) - attention) * Math.min(1, dt * 2.5);
            const lean = cursorSeen ? clamp((cursorY - galaxyY) / height, -.5, .5) * .25 + clamp((cursorX - centerX) / width, -.5, .5) * .1 : 0;
            angle += (baseAngle + lean * attention - angle) * Math.min(1, dt * 2);
            tilt += (baseTilt + .16 * attention + .08 * flare - tilt) * Math.min(1, dt * 2);
            if (galaxyY + radius * 1.6 > 0) holes.push(holeOf(heart, centerX, galaxyY, radius * .05, tilt, angle));
        } else {
            heart.flare = Math.max(0, heart.flare - dt * .55);
            heart.spinBy += dt * heart.flare * 2.2;
            holes.push(holeOf(heart, heart.sx, heart.sy, heart.size * .3, .42, -.42));
        }
        // ---- Where everything is.
        const margin = Math.max(width, height) * .15;
        fastThings = 0;
        for (const thing of things) {
            const homeX = thing.x + thing.drift * Math.sin(clock * thing.wobble + thing.own * TAU);
            const homeY = thing.y - scrolled * thing.speed + thing.drift * .7 * Math.cos(clock * thing.wobble * .8 + thing.own * 11);
            const off = homeY < -thing.size * 2.5 - margin || homeY > height + thing.size * 2.5 + margin;
            if (thing.gone) {
                // Back again once it is out of sight, or slowly out of the dark after a while.
                if (off || clock - thing.goneAt > thing.away) revive(thing, !off);
                else continue;
            }
            if (off && !thing.fall) {
                thing.ox = thing.oy = thing.vx = thing.vy = 0;
                thing.pullBy = null;
                continue;
            }
            if (!thing.fall) {
                thing.sx = homeX + thing.ox;
                thing.sy = homeY + thing.oy;
            }
            thing.fade = Math.min(1, thing.fade + dt / 3);
            thing.seen = frameNumber;
            view.push(thing);
            if (thing.kind === HOLE) {
                thing.flare = Math.max(0, thing.flare - dt * .55);
                thing.spinBy += dt * thing.flare * 2.2;
                holes.push(holeOf(thing, thing.sx, thing.sy, thing.size * .3, .25 + thing.slant * .35, thing.angle));
            } else if (isWorld(thing.kind) && !thing.fall) worlds.push(thing);
        }
        // ---- What acts on what. The worlds and stars float back to their places when let
        // go; the cursor pushes them aside, and the holes pull at them.
        const pushed = cursorSeen ? spec.push : 0;
        for (const thing of view) {
            if (!MOVES[thing.kind]) continue;
            if (thing.fall) {
                const fall = thing.fall, hole = fall.hole;
                fall.t += dt / spec.fall;
                const t = Math.min(1, fall.t);
                const wasX = thing.sx, wasY = thing.sy;
                [thing.sx, thing.sy] = outOfDisc(hole, fall.r0 * Math.pow(1 - t, 1.6) + hole.hr * .3 * (1 - t), fall.a0 + hole.sense * (1.2 * t + 2.6 * t * t) * Math.PI);
                thing.shrink = 1 - .82 * t;
                thing.heat = t;
                thing.spinBy += dt * (1 + 9 * t);
                // At High it comes apart on the way in: pieces torn off it, thrown along the
                // way it is going, that the hole takes after it.
                if (spec.breaks && dt > 0) {
                    thing.shedding += dt * (6 + 30 * t) * Math.min(2, thing.size / 30);
                    for (; thing.shedding >= 1; thing.shedding--) near.shed(thing.sx, thing.sy, (thing.sx - wasX) / dt, (thing.sy - wasY) / dt, thing.size * thing.shrink * .3, shardOf(thing));
                }
                fastThings++;
                if (t >= 1) swallow(thing, hole);
                continue;
            }
            const pulled = thing.pullBy && thing.pullBy.thing.seen === frameNumber && clock < thing.pullUntil ? thing.pullBy : null;
            if (!pulled) thing.pullBy = null;
            let ax = -thing.vx * DAMP, ay = -thing.vy * DAMP;
            if (!pulled) {
                // An orb pushed at High drifts a long way before it floats back.
                const spring = thing.kind === ORB ? spec.spring : Math.max(spec.spring, 1);
                ax -= thing.ox * spring;
                ay -= thing.oy * spring;
            }
            if (pushed) {
                const dx = thing.sx - cursorX, dy = thing.sy - cursorY, d = Math.hypot(dx, dy) || 1, reach = 180 + thing.size;
                if (d < reach) {
                    // The small ones go furthest.
                    const f = pushed * (1 - d / reach) ** 2 * clamp(40 / thing.size, .4, 1.6);
                    ax += dx / d * f;
                    ay += dy / d * f;
                }
            }
            for (const hole of holes) {
                const dx = hole.sx - thing.sx, dy = hole.sy - thing.sy, d2 = dx * dx + dy * dy, d = Math.sqrt(d2) || 1;
                const isPulling = pulled === hole;
                if (!isPulling && d > hole.hr * 14) continue;
                const f = (isPulling ? spec.reach : 0) + 26000 * hole.hr / (d2 + hole.hr * hole.hr) * (isPulling ? 1 : .25);
                ax += (dx - dy * .35 * hole.sense) / d * f;
                ay += (dy + dx * .35 * hole.sense) / d * f;
                // Caught: it goes round the hole along its disc, faster and smaller, and in.
                if (d < hole.hr * 2.6 + thing.size * .2 && thing.size < hole.hr * 6) {
                    const [r0, a0] = intoDisc(hole, -dx, -dy);
                    thing.fall = { hole, r0, a0, t: 0 };
                    thing.pullBy = null;
                    if (spec.breaks) near.crack(thing.sx, thing.sy, thing.size * .5);
                    break;
                }
            }
            if (thing.fall) continue;
            thing.vx += ax * dt;
            thing.vy += ay * dt;
            const speed = Math.hypot(thing.vx, thing.vy);
            if (speed > 420) {
                thing.vx *= 420 / speed;
                thing.vy *= 420 / speed;
            }
            thing.ox += thing.vx * dt;
            thing.oy += thing.vy * dt;
            thing.sx += thing.vx * dt;
            thing.sy += thing.vy * dt;
        }
        // ---- Feeding: every so often a hole takes hold of the nearest thing it can swallow.
        for (const hole of holes) {
            const owner = hole.thing;
            if (clock < owner.nextFeed) continue;
            const [low, high] = spec.feed;
            owner.nextFeed = clock + low + Math.random() * (high - low);
            let prey = null, best = Math.max(hole.hr * 16, Math.min(width, height) * .32);
            for (const thing of view) {
                if (!MOVES[thing.kind] || thing.fall || thing.pullBy || thing.fade < 1 || thing.size > hole.hr * 6) continue;
                const d = Math.hypot(thing.sx - hole.sx, thing.sy - hole.sy);
                if (d < best) {
                    best = d;
                    prey = thing;
                }
            }
            if (prey) {
                prey.pullBy = hole;
                prey.pullUntil = clock + 12;
            } else owner.nextFeed = clock + 1.5;
        }
        // ---- Light: every world and orb is lit from the side of whatever burns nearest it.
        for (const world of worlds) {
            let amount = world.kind === ORB ? .5 : .4, lx = -.6, ly = -.45, tint = 3;
            for (const source of view) {
                const light = LIGHTS[source.kind];
                if (!light || source === world || source.fall) continue;
                const dx = source.sx - world.sx, dy = source.sy - world.sy, d = Math.hypot(dx, dy) || 1;
                const lit = light[0] * Math.min(1.6, source.size * 2.4 / d) * source.fade;
                if (lit > amount) {
                    amount = lit;
                    lx = dx / d;
                    ly = dy / d;
                    tint = light[1];
                }
            }
            for (const hole of holes) {
                if (hole.thing !== heart) continue;
                const dx = hole.sx - world.sx, dy = hole.sy - world.sy, d = Math.hypot(dx, dy) || 1;
                const lit = .85 * Math.min(1.6, hole.hr * 9 / d) * (1 + heart.flare);
                if (lit > amount) {
                    amount = lit;
                    lx = dx / d;
                    ly = dy / d;
                    tint = 2;
                }
            }
            const k = Math.min(1, dt * 5);
            world.lit += (amount - world.lit) * k;
            world.lx += (lx - world.lx) * k;
            world.ly += (ly - world.ly) * k;
            world.tint = tint;
        }
        near.update(dt, depth, spec.fixed ? 0 : scrolled, holes, worlds, feed, knock);
    };

    const draw = now => {
        if (using !== prog) {
            gl.useProgram(prog.program);
            using = prog;
        }
        const u = prog.uniforms;
        gl.uniform2f(u.uRes, canvas.width, canvas.height);
        gl.uniform1f(u.uScale, scale);
        gl.uniform1f(u.uTime, clock);
        gl.uniform1f(u.uScroll, spec.fixed ? 0 : scrolled);
        gl.uniform3f(u.uCursor, cursorX, cursorY, spec.cursorLens * nearness);
        gl.uniform1f(u.uSkyOn, skyReady ? 1 : 0);
        gl.uniform1f(u.uDim, spec.dim);
        gl.uniform1f(u.uMono, spec.mono);
        gl.uniform4f(u.uSkyMap, skyMap[0], skyMap[1], skyMap[2], skyMap[3]);
        const age = shockAt < 0 ? -1 : (now - shockAt) / 1000;
        gl.uniform4f(u.uShock, shockX, shockY, age >= 0 && age < 2.4 ? age : -1, shockStrength);
        // Each hole bends the light round it, the biggest first.
        holes.sort((a, b) => b.hr - a.hr);
        let lenses = 0;
        for (const hole of holes) {
            if (lenses >= 8) break;
            if (hole.sy < -hole.hr * 8 || hole.sy > height + hole.hr * 8) continue;
            lensData.set([hole.sx, hole.sy, hole.hr, (hole.thing.fade ?? 1) * (1 + hole.thing.flare * .35)], lenses * 4);
            lenses++;
        }
        gl.uniform4fv(u.uLens, lensData);
        gl.uniform1i(u.uLensCount, lenses);
        // Only what is on the screen now goes to the graphics card, at most two dozen.
        let count = 0;
        const put = (thing, x, y, sizeNow) => {
            objectData.set([x, y, sizeNow, thing.kind], count * 4);
            objectMore.set([thing.angle, thing.slant, thing.own, thing.pace], count * 4);
            objectLight.set([thing.lx ?? -.6, thing.ly ?? -.45, thing.lit ?? .45, thing.tint ?? 3], count * 4);
            objectState.set([thing.fade, thing.kind === HOLE ? thing.flare : thing.heat || 0, thing.spinBy || 0, 0], count * 4);
            count++;
        };
        if (!spec.galaxy) put(heart, heart.sx, heart.sy, heart.size);
        for (const thing of view) {
            if (count >= LIMIT) break;
            const sizeNow = thing.size * thing.shrink;
            if (thing.sy < -sizeNow * 2.5 || thing.sy > height + sizeNow * 2.5) continue;
            put(thing, thing.sx, thing.sy, sizeNow);
        }
        gl.uniform4fv(u.uObj, objectData);
        gl.uniform4fv(u.uObjB, objectMore);
        gl.uniform4fv(u.uObjC, objectLight);
        gl.uniform4fv(u.uObjD, objectState);
        gl.uniform1i(u.uCount, count);
        if (spec.galaxy) {
            const galaxyY = centerY - scrolled * .35;
            gl.uniform2f(u.uCenter, centerX, galaxyY);
            gl.uniform1f(u.uSpin, spin);
            gl.uniform1f(u.uRadius, radius);
            gl.uniform1f(u.uTilt, tilt);
            gl.uniform1f(u.uAngle, angle);
            gl.uniform1f(u.uBeat, heartbeat(beatPhase));
            gl.uniform1f(u.uFlare, Math.max(flare, heart.flare));
            const orbit = clock * .045;
            gl.uniform2f(u.uMoonA, Math.cos(orbit) * 1.42, Math.sin(orbit) * 1.42);
            gl.uniform2f(u.uMoonB, Math.cos(-orbit * .7 + 2.4) * 1.78, Math.sin(-orbit * .7 + 2.4) * 1.78);
            // The galaxy at the top, until it has gone off the top of the screen.
            gl.uniform1f(u.uMain, galaxyY + radius * 1.6 > 0 ? 1 : 0);
        }
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        near.draw();
    };

    const stopLoop = () => {
        if (frame) cancelAnimationFrame(frame);
        if (waitFrame) cancelAnimationFrame(waitFrame);
        frame = waitFrame = 0;
    };
    const tick = now => {
        frame = requestAnimationFrame(tick);
        // Medium draws thirty times a second while nothing is moving fast, and so does High
        // on a machine the page has eased; a scroll, the cursor moving, a comet, a world
        // going in or sparks flying take either to every frame. Every frame redrawn is the
        // glass over it filtered again, which is most of what a frame of this costs.
        // On an eased machine High keeps every frame for while someone is scrolling or moving;
        // what moves fast on its own there is never far from moving, and the frames are dear.
        const rest = spec.rest || (eased || root.dataset.effectsPace ? 30 : 0);
        const quick = !rest || now - lastScrollAt < 450 || now - lastPointerAt < 600 || (spec.rest && (fastThings > 0 || near.busy()));
        if (lastFrame && !quick && now - lastFrame < 1000 / rest - 4) return;
        const dt = lastFrame ? Math.min(.1, (now - lastFrame) / 1000) : 1 / 60;
        lastFrame = now;
        step(dt);
        draw(now);
    };
    // The first time it is shown it comes up out of the dark rather than appearing.
    const arrive = () => {
        size();
        measureDepth();
        for (const layer of [canvas, nearCanvas]) {
            layer.hidden = false;
            layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1200, easing: 'cubic-bezier(.16, .85, .3, 1)' });
        }
        // The other level's sky is built on the side meanwhile, so a change of level is at once.
        const other = level === 'high' ? 'medium' : 'high';
        (window.requestIdleCallback || (callback => window.setTimeout(callback, 1)))(() => {
            if (gl && !broken) buildProgram(other);
        }, { timeout: 3000 });
    };
    const startLoop = () => {
        if (frame || waitFrame || !shown || dark || document.hidden || underProject) return;
        // Still being built: looked in on once a frame until it is, then begun.
        if (!prog.uniforms) {
            if (!isBuilt(prog)) {
                waitFrame = requestAnimationFrame(() => {
                    waitFrame = 0;
                    startLoop();
                });
                return;
            }
            try {
                finishProgram(prog);
            } catch (error) {
                broken = true;
                window.portfolioCosmos.hide();
                document.dispatchEvent(new Event('portfolio:cosmos-failed'));
                return;
            }
        }
        if (canvas.hidden) arrive();
        lastFrame = 0;
        if (reducedMotion.matches) {
            step(1 / 60);
            draw(performance.now());
            return;
        }
        frame = requestAnimationFrame(tick);
    };
    const onPointerMove = event => {
        if (event.pointerType === 'touch') return;
        cursorX = event.clientX;
        cursorY = event.clientY;
        cursorSeen = true;
        lastPointerAt = performance.now();
        near.pointer(cursorX, cursorY);
    };
    const onPointerOut = event => {
        if (event.relatedTarget) return;
        cursorSeen = false;
        near.pointer(-1e5, -1e5);
    };
    // A finger on the glass is a cursor for as long as it is down.
    const onTouch = event => {
        const touch = event.touches[0];
        if (touch) {
            cursorX = touch.clientX;
            cursorY = touch.clientY;
            cursorSeen = true;
            lastPointerAt = performance.now();
            near.pointer(cursorX, cursorY);
        } else {
            cursorSeen = false;
            near.pointer(-1e5, -1e5);
        }
    };
    const shake = (x, y, strength) => {
        shockX = x;
        shockY = y;
        shockAt = performance.now();
        shockStrength = strength;
        for (const thing of view) {
            if (!MOVES[thing.kind] || thing.fall) continue;
            const dx = thing.sx - x, dy = thing.sy - y, d = Math.hypot(dx, dy) || 1;
            if (d < 600) knock(thing, dx / d * spec.shock * (1 - d / 600), dy / d * spec.shock * (1 - d / 600));
        }
    };
    const onPointerDown = event => {
        if (event.button || event.target.closest?.(ANSWERS)) return;
        shake(event.clientX, event.clientY, level === 'high' ? 1 : .5);
        flare = Math.max(flare, .6);
        near.press(event.clientX, event.clientY);
    };
    const onScroll = () => {
        measureDepth();
        lastScrollAt = performance.now();
        // The page grows as its projects open; there is more of it to scatter things down.
        scatter();
    };
    const onVisibility = () => {
        if (document.hidden) stopLoop();
        else startLoop();
    };
    const onModalOpen = () => {
        underProject = true;
        stopLoop();
    };
    const onModalClose = () => {
        underProject = false;
        startLoop();
    };
    const onResize = () => {
        clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
            if (!shown || canvas.hidden) return;
            size();
            measureDepth();
            draw(performance.now());
        }, 200);
    };
    // The page lets the backdrop go dark when nobody is there (portfolio.js); once it has
    // faded out there is nothing to draw. Moving brings it back with a flare.
    const onIdle = () => {
        clearTimeout(darkTimer);
        darkTimer = window.setTimeout(() => {
            dark = true;
            stopLoop();
        }, 1500);
    };
    const onWake = () => {
        clearTimeout(darkTimer);
        if (!dark) return;
        dark = false;
        flare = 1;
        heart.flare = Math.max(heart.flare, .8);
        if (cursorSeen) shake(cursorX, cursorY, .6);
        startLoop();
    };
    document.addEventListener('portfolio:sky-picture', event => takePicture(event.detail));

    window.portfolioCosmos = {
        // False where there is no graphics card for it; the page keeps the still sky.
        show(target, wantedLevel) {
            if (broken) return false;
            try {
                if (!gl) setUp(target);
            } catch (error) {
                gl = null;
                broken = true;
                return false;
            }
            reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
            const changed = wantedLevel !== level;
            level = wantedLevel;
            spec = LEVELS[level];
            prog = buildProgram(level);
            if (shown) {
                if (!changed) return true;
                stopLoop();
                if (!canvas.hidden) {
                    size();
                    measureDepth();
                }
                startLoop();
                return true;
            }
            shown = true;
            dark = false;
            if (!canvas.hidden || prog.uniforms) {
                canvas.hidden = false;
                nearCanvas.hidden = false;
                size();
                measureDepth();
            }
            // Arrives awake, with a flare, as it would on being woken.
            flare = .8;
            document.addEventListener('visibilitychange', onVisibility);
            document.addEventListener('portfolio:modal-open', onModalOpen);
            document.addEventListener('portfolio:modal-close', onModalClose);
            document.addEventListener('portfolio:backdrop-idle', onIdle);
            document.addEventListener('portfolio:backdrop-wake', onWake);
            window.addEventListener('pointermove', onPointerMove, { passive: true });
            window.addEventListener('pointerdown', onPointerDown, { passive: true });
            document.addEventListener('pointerout', onPointerOut, { passive: true });
            window.addEventListener('touchstart', onTouch, { passive: true });
            window.addEventListener('touchmove', onTouch, { passive: true });
            window.addEventListener('touchend', onTouch, { passive: true });
            window.addEventListener('touchcancel', onTouch, { passive: true });
            window.addEventListener('scroll', onScroll, { passive: true });
            window.addEventListener('resize', onResize, { passive: true });
            startLoop();
            return true;
        },
        hide() {
            if (!shown) return;
            shown = false;
            dark = false;
            stopLoop();
            clearTimeout(resizeTimer);
            clearTimeout(darkTimer);
            document.removeEventListener('visibilitychange', onVisibility);
            document.removeEventListener('portfolio:modal-open', onModalOpen);
            document.removeEventListener('portfolio:modal-close', onModalClose);
            document.removeEventListener('portfolio:backdrop-idle', onIdle);
            document.removeEventListener('portfolio:backdrop-wake', onWake);
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('pointerout', onPointerOut);
            window.removeEventListener('touchstart', onTouch);
            window.removeEventListener('touchmove', onTouch);
            window.removeEventListener('touchend', onTouch);
            window.removeEventListener('touchcancel', onTouch);
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onResize);
            // Down to nothing, so their pictures' memory goes back; what was compiled is kept.
            canvas.width = canvas.height = 1;
            nearCanvas.width = nearCanvas.height = 1;
            canvas.hidden = true;
            nearCanvas.hidden = true;
        },
        // For the perf tools and the smoke test: what it is doing.
        stats: () => ({ level, shown, dark, ready: !!prog?.uniforms, frames: frameNumber, things: view.length, holes: holes.length, swallowed, sky: skyReady,
            // Where things stand across the screen, in hundredths: kinds, the galaxy, the heart.
            across: things.map(thing => [thing.kind, Math.round(thing.x / width * 100)]), galaxyAt: Math.round(centerX / width * 100), heartAt: Math.round(heart.sx / width * 100) }),
        // Softer, on a machine the page has found struggling: drawn nearer the screen's
        // own pixels. Nothing is taken out.
        ease() {
            if (eased) return;
            eased = true;
            if (shown && !canvas.hidden) {
                size();
                measureDepth();
            }
        }
    };
})();
