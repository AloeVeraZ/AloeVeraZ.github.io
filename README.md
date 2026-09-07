# Angelo Demetroulakos — Engineering Portfolio

This is the source for my personal engineering portfolio: [aloeveraz.github.io](https://aloeveraz.github.io/).

I use the site to keep my robotics, CAD, controls, manufacturing, and 3D-printing work in one place. The project cards come from one JSON file, so I can add a build without rewriting the page layout each time.

## Files

- `index.html` contains the page structure and project modal.
- `portfolio.css` handles the layout, responsive styles, and visual effects.
- `portfolio.js` renders the profile, project collections, carousels, and modal content.
- `portfolio-data.json` holds the profile, skills, project write-ups, media, and links.
- `consent.js` keeps YouTube embeds from loading until a visitor asks for them.
- `assets/` contains the project photos, GIFs, graphics, and the self-hosted fonts.
- `project-example.json` is a project record I can copy when adding something new.

Supporting pages and files: `privacy.html`, `terms.html`, `404.html`, `page.css`
(shared styling for those three), `fonts.css`, `icons.css`, `robots.txt`,
`sitemap.xml`, and `site.webmanifest`.

## Nothing loads from a third party

Fonts, icons, and every project image are served from this domain. Opening the
page makes no request to Google, a CDN, or an analytics service, and the site
sets no cookies. The only outside request is YouTube, and a project video stays
a local placeholder until someone clicks it. `privacy.html` explains this to
visitors; keep the two in step if that ever changes.

## Run locally

The portfolio is a static site, but it needs a local server so the browser can load the JSON file.

```bash
python -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

## Add a project

1. Add the project images to `assets/`.
2. Copy the record in `project-example.json` into the `projects` array in `portfolio-data.json`.
3. Replace the example values and set `category` and `collectionOrder`.
4. Write an `imageAlt` describing what is actually in the picture — not the project name, which the heading beside it already says.
5. Set `featured` to `true` and add a `featuredOrder` when the project belongs in the first row.
6. Run the media scripts below, then check the card, project modal, links, and mobile layout locally.

Empty links and media fields are skipped by the page, so unfinished material can stay out of the public portfolio until it is ready.

## Rebuilding media and assets

The scripts in `tools/` regenerate the files that are not written by hand. They
need Python with `pillow`, `fonttools`, and `brotli`.

```bash
python tools/build-images.py      # source photos/GIFs -> compressed WebP
python tools/build-thumbnails.py  # 900px card variants next to each image
python tools/link-thumbnails.py   # record each card's srcset in the JSON
python tools/build-icons.py       # subset Font Awesome to the icons in use
python tools/build-fonts.py       # download and self-host Inter + Barlow Condensed
python tools/build-brand.py       # favicon set and the social preview card
```

Run `build-icons.py` again whenever the markup starts using a new `fa-` icon,
otherwise that glyph will not be in the subset and will render as a blank box.

After changing `portfolio.css`, `portfolio.js`, or `portfolio-data.json`, bump
the `?v=` cache-busting suffix in the HTML files (and the one on the
`portfolio-data.json` fetch inside `portfolio.js`) so returning visitors do not
get a stale copy.

## Hosting notes

GitHub Pages serves this from the repository root. HTTPS needs no action: a
`*.github.io` host is on the HSTS preload list and GitHub redirects `http://`
to `https://` on its own — verified against the live site. The
`upgrade-insecure-requests` meta tag in each page covers subresources. If this
ever moves to a custom domain, that stops being automatic and **Settings → Pages
→ Enforce HTTPS** has to be switched on for the new domain.
