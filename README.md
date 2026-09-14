# Angelo Demetroulakos: Engineering Portfolio

Source for my portfolio at [aloeveraz.github.io](https://aloeveraz.github.io/), covering my robotics, CAD, controls, manufacturing and 3D printing work. Every project card is built from one JSON file, so adding a project doesn't touch the page layout.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure and the project sheet |
| `portfolio.css` | Layout, responsive rules and visual effects |
| `portfolio.js` | Renders the profile, projects, carousels and project sheet |
| `navbar.css` | The floating navigation bar |
| `glass.js` | The liquid glass on the bar, cards and buttons (the modes are explained at the top of the file) |
| `portfolio-data.json` | Profile, skills, project write-ups, media and links |
| `project-example.json` | Template for a new project |
| `assets/` | Photos, GIFs, graphics and self-hosted fonts |
| `tools/` | Scripts that rebuild images, icons and fonts |

Also: `privacy.html`, `terms.html`, `updates.html` (the site's major versions) and `404.html` (styled by `page.css`, with `page.js` setting the zoom-aware font size), `fonts.css`, `icons.css`, `robots.txt`, `sitemap.xml` and `site.webmanifest`.

## Run locally

The page loads its data with `fetch`, so it needs a local server:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>.

## Add a project

1. Put the images in `assets/`.
2. Copy the record in `project-example.json` into the `projects` array in `portfolio-data.json` and fill it in, including `category` and `collectionOrder`.
3. Write `imageAlt` to describe what the picture shows, not the project's name.
4. To put it in the top row, set `featured` to `true` and give it a `featuredOrder`.
5. Run the media scripts below, then check the card, project sheet, links and mobile layout locally.

Empty link and media fields are skipped, so unfinished work stays off the site.

## Media and assets

The scripts in `tools/` need Python with `pillow`, `fonttools` and `brotli`:

```bash
python tools/build-images.py      # source photos/GIFs -> WebP
python tools/build-thumbnails.py  # 900px card versions of each image
python tools/link-thumbnails.py   # write each card's srcset into the JSON
python tools/build-icons.py       # subset Font Awesome to the icons in use
python tools/build-fonts.py       # download and self-host Inter and Barlow Condensed
python tools/build-brand.py       # favicons and the social preview image
```

Run `build-icons.py` again after using a new `fa-` icon, or it will show up as a blank box. `tools/measure-faces.js` runs in the browser console and prints the font metrics the text trimming below depends on.

## Caching

After changing a CSS or JS file or `portfolio-data.json`, bump its `?v=` suffix in the HTML (the data file's is on its `fetch` in `portfolio.js`) so returning visitors don't get a stale copy. A local pre-commit hook does this for `portfolio.css` and `portfolio.js` on machines where it is installed.

## Spacing and type

Spacing and type sizes come from tokens at the top of `portfolio.css`, copied into `page.css`. New elements should use a token, not a raw value.

| Spacing token | Value | Used between |
| --- | --- | --- |
| `--rhythm-label` | 12px | a label and its heading; list items |
| `--rhythm-heading` | 16px | a heading and the text under it; paragraphs |
| `--rhythm-rule` | 16px | a rule inside a card and what's on either side |
| `--rhythm-block` | 24px | blocks inside a section |
| `--rhythm-header` | 48px | a section header and its content |
| `--rhythm-section` | 48–96px | one section and the next |

Text blocks are leading-trimmed, so these are the gaps you actually see between letters rather than between line boxes. To trim a new block, set `--lh` to its line-height, use `line-height: var(--lh)`, and add it to the list for its typeface at the end of `portfolio.css`.

| Type token | Size | Used for |
| --- | --- | --- |
| `--type-section` | 44–112px | section titles |
| `--type-subsection` | 38–72px | titles inside a section |
| `--type-sheet-title` | 36–56px | a project's name in its sheet |
| `--type-sheet-heading` | 26–40px | headings in the sheet |
| `--type-card-title` | 19–22px | card titles |
| `--type-eyebrow` | 16–20px | labels over section titles |
| `--type-eyebrow-sm` | 15px | labels over card and sheet headings |
| `--type-intro` | 16–18px | section intros |
| `--type-small` | 15px | card copy |
| `--type-meta` | 14px | dates, captions, nav links, fine print |
| `--type-label` | 13px | buttons, tags and other controls |

Barlow Condensed, in capitals, is for names; Inter is for sentences. Letter spacing uses `--tracking-display`, `--tracking-title`, `--tracking-eyebrow` and `--tracking-caps`, and text color uses `--ink`, `--muted`, `--blue-light` (labels) and `--blue-soft` (dates and tags). A few pieces keep their own sizes: the hero name and tagline, the bio, project card titles and summaries, the category chip, archive row names, and the sheet's summary and numbered parts. Nothing a visitor has to read is smaller than 13px, or 14px in the condensed face, and text keeps at least 7:1 contrast.

## Privacy

Fonts, icons and images are all served from this domain, and the site sets no cookies and runs no analytics. The only outside request is YouTube: the player loads from `youtube-nocookie.com` when someone opens a project with a video. If that changes, update `privacy.html` to match.

## Hosting

GitHub Pages serves the repository root. HTTPS needs no setup, since `*.github.io` is on the HSTS preload list and GitHub redirects `http://` itself, and each page's `upgrade-insecure-requests` tag covers subresources. On a custom domain, turn on **Settings → Pages → Enforce HTTPS**.
