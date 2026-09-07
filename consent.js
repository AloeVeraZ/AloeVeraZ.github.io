/*
 * Embed consent.
 *
 * The site sets no cookies of its own and runs no analytics -- fonts, icons and
 * images are all served from this origin. The single third party is YouTube,
 * which is only reached when a project video is played. So rather than a banner
 * that asks permission for tracking that does not exist, this gates the one
 * thing that genuinely leaves the origin: every video renders as a local
 * placeholder until a visitor asks for it, and the choice is remembered.
 *
 * Nothing here is loaded from a third party, and the stored value never leaves
 * the browser.
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'portfolio-embed-consent';
    var GRANTED = 'granted';
    var DENIED = 'denied';
    var listeners = [];
    var state = read();

    function read() {
        try {
            var value = localStorage.getItem(STORAGE_KEY);
            return value === GRANTED || value === DENIED ? value : '';
        } catch (error) {
            // Private mode, or storage blocked entirely. Treat as undecided and
            // keep working -- the placeholder still plays on a second click.
            return '';
        }
    }

    function write(value) {
        try {
            localStorage.setItem(STORAGE_KEY, value);
        } catch (error) {
            /* nothing to do: the choice just will not survive a reload */
        }
    }

    function set(value) {
        if (state === value) return;
        state = value;
        write(value);
        document.documentElement.dataset.embedConsent = value;
        dismissBanner();
        if (value === GRANTED) hydrate(document);
        listeners.forEach(function (fn) {
            try { fn(value); } catch (error) { /* a bad listener must not break the rest */ }
        });
    }

    function escapeAttribute(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
            .replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /* YouTube's privacy-enhanced host: no cookie is written unless the visitor
       actually starts playback. */
    function harden(src) {
        return String(src || '').replace(
            /^https?:\/\/(?:www\.)?youtube\.com\//,
            'https://www.youtube-nocookie.com/'
        );
    }

    /* Markup for one video slot: a real iframe once consent exists, otherwise a
       button that looks like a player and asks first. */
    function embed(src, title, options) {
        options = options || {};
        var hardened = harden(src);
        var label = title || 'Project video';
        if (!hardened) return '';
        if (state === GRANTED) {
            return '<iframe src="' + escapeAttribute(hardened) + '" title="' + escapeAttribute(label) + '"'
                + (options.lazy ? ' loading="lazy"' : '')
                + ' allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
        }
        return '<button type="button" class="embed-facade" data-embed-src="' + escapeAttribute(hardened) + '"'
            + ' data-embed-title="' + escapeAttribute(label) + '"'
            + (options.lazy ? ' data-embed-lazy="1"' : '')
            + ' aria-label="Load and play ' + escapeAttribute(label) + ' from YouTube">'
            + '<span class="embed-facade-play" aria-hidden="true"><i class="fa-solid fa-play"></i></span>'
            + '<span class="embed-facade-title">' + escapeAttribute(label) + '</span>'
            + '<span class="embed-facade-note">Plays from YouTube. Loading it lets Google set cookies.</span>'
            + '</button>';
    }

    /* Swap any placeholder inside `root` for the real player. */
    function hydrate(root) {
        var scope = root || document;
        var facades = scope.querySelectorAll ? scope.querySelectorAll('.embed-facade') : [];
        Array.prototype.forEach.call(facades, function (facade) {
            play(facade);
        });
    }

    function play(facade) {
        var src = facade.getAttribute('data-embed-src');
        if (!src) return;
        var frame = document.createElement('iframe');
        frame.src = src;
        frame.title = facade.getAttribute('data-embed-title') || 'Project video';
        if (facade.getAttribute('data-embed-lazy')) frame.loading = 'lazy';
        frame.allow = 'autoplay; encrypted-media; picture-in-picture';
        frame.allowFullscreen = true;
        facade.replaceWith(frame);
    }

    /* One click on a placeholder both loads that video and records the choice,
       so the rest of the site stops asking. */
    document.addEventListener('click', function (event) {
        var facade = event.target.closest && event.target.closest('.embed-facade');
        if (!facade) return;
        event.preventDefault();
        if (state !== GRANTED) set(GRANTED);
        else play(facade);
    });

    /* ---------------------------------------------------------------- banner */
    var banner = null;

    function dismissBanner() {
        if (!banner) return;
        banner.remove();
        banner = null;
    }

    function showBanner() {
        if (banner || state) return;
        banner = document.createElement('div');
        banner.className = 'consent-banner';
        banner.setAttribute('role', 'region');
        banner.setAttribute('aria-label', 'Privacy notice');
        banner.innerHTML =
            '<p class="consent-copy">'
            + 'This site sets no cookies and runs no analytics. Project videos are hosted on '
            + 'YouTube, and playing one lets Google set cookies in your browser. '
            + '<a href="/privacy.html">Privacy policy</a>.'
            + '</p>'
            + '<div class="consent-actions">'
            + '<button type="button" class="btn consent-accept" data-consent="granted">Allow videos</button>'
            + '<button type="button" class="btn consent-decline" data-consent="denied">Keep them blocked</button>'
            + '</div>';
        banner.addEventListener('click', function (event) {
            var choice = event.target.getAttribute && event.target.getAttribute('data-consent');
            if (choice) set(choice);
        });
        document.body.appendChild(banner);
    }

    window.PortfolioConsent = {
        GRANTED: GRANTED,
        DENIED: DENIED,
        state: function () { return state; },
        granted: function () { return state === GRANTED; },
        set: set,
        embed: embed,
        hydrate: hydrate,
        subscribe: function (fn) { if (typeof fn === 'function') listeners.push(fn); }
    };

    document.documentElement.dataset.embedConsent = state || 'undecided';

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', showBanner);
    } else {
        showBanner();
    }
}());
