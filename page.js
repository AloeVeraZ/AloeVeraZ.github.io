/* Shared behaviour for the standalone pages -- privacy, terms and 404.

   The portfolio pins its layout to the browser frame rather than to the CSS
   pixel: when a visitor zooms out, the CSS viewport grows, so the root font
   size is scaled by the same factor and the page stays the same physical size
   on the glass. These pages are built from the same rem-and-vw tokens, so they
   only need the same root-size compensation to match. The measurement and the
   thresholds are deliberately identical to updateViewportScale() in
   portfolio.js -- if one changes, change both, or the policy pages will drift
   away from the site they belong to.

   Zooming *in* is left alone on purpose. That is someone asking for larger
   text, and the portfolio honours it; only zoom-out is compensated. */
(() => {
    'use strict';

    const root = document.documentElement;

    const updateViewportScale = () => {
        const browserFrameWidth = window.outerWidth || window.screen?.availWidth || window.innerWidth;
        const measuredScale = browserFrameWidth > 0 ? window.innerWidth / browserFrameWidth : 1;
        // 1.08 is slack for the scrollbar and for browsers that round
        // outerWidth, so an unzoomed window is never mistaken for a zoomed one.
        const layoutScale = measuredScale > 1.08
            ? Math.min(Math.max(measuredScale, 1), 4)
            : 1;
        root.style.fontSize = `${(16 * layoutScale).toFixed(2)}px`;
        root.dataset.viewportScale = layoutScale.toFixed(3);
    };

    updateViewportScale();
    window.addEventListener('resize', updateViewportScale, { passive: true });
    // Pinch-zoom on a phone moves the visual viewport without touching
    // innerWidth, so this resolves to a scale of 1 there and leaves the pinch
    // alone -- it is here for the desktop case, where a zoom step can settle
    // after the window resize event.
    window.visualViewport?.addEventListener('resize', updateViewportScale, { passive: true });

    const stampYear = () => {
        const year = document.getElementById('current-year');
        if (year) year.textContent = new Date().getFullYear();
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', stampYear);
    } else {
        stampYear();
    }
})();
