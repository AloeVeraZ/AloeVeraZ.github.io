/*
 * Reads the vertical metrics of the two shipped typefaces, which is where the
 * --face-* numbers at the top of portfolio.css and page.css come from.
 *
 * The leading trim needs three numbers per face, all in em:
 *
 *   ascent   the top of the box a line box is built from (hhea ascender)
 *   descent  the bottom of that box
 *   cap      the top of a capital letter, which is where a heading looks
 *            like it starts
 *
 * Run it in the browser console on any page of the site -- the fonts have to
 * be loaded, and canvas will not load them for you, which is why this measures
 * in a page rather than from the woff2 files directly. Paste the output back
 * into the :root block if a font is ever swapped or resubset.
 *
 *   1. open https://aloeveraz.github.io/ (or the local server)
 *   2. paste this file into the console
 *   3. copy the printed declarations
 */
(async () => {
    // Canvas takes whatever is already loaded and silently falls back
    // otherwise, so ask for the faces first and check we got them.
    // 1000px, not 100: Chrome quantises the ink box, and at 100px the cap
    // height comes back as a flat .7 instead of the .7031 it really is.
    const faces = [
        { token: 'display', css: '700 1000px "Barlow Condensed"' },
        { token: 'text', css: '400 1000px Inter' }
    ];

    const measure = css => {
        const context = document.createElement('canvas').getContext('2d');
        context.font = css;
        // 'H' has no overshoot, so its ink top is the cap height exactly.
        const capital = context.measureText('H');
        return {
            ascent: capital.fontBoundingBoxAscent / 1000,
            descent: capital.fontBoundingBoxDescent / 1000,
            cap: capital.actualBoundingBoxAscent / 1000
        };
    };

    const lines = [];
    for (const face of faces) {
        if (!document.fonts.check(face.css)) await document.fonts.load(face.css);
        if (!document.fonts.check(face.css)) {
            lines.push(`/* ${face.css} is not loaded on this page -- measured a fallback */`);
        }
        const metrics = measure(face.css);
        // Four places is under a tenth of a pixel on the largest heading the
        // site sets, and it keeps the stylesheet readable.
        lines.push(`    --face-${face.token}-ascent: ${+metrics.ascent.toFixed(4)};`);
        lines.push(`    --face-${face.token}-descent: ${+metrics.descent.toFixed(4)};`);
        lines.push(`    --face-${face.token}-cap: ${+metrics.cap.toFixed(4)};`);
    }
    console.log(lines.join('\n'));
})();
