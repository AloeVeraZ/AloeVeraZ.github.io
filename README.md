# Angelo Demetroulakos: Engineering Portfolio

Source for my portfolio at [aloeveraz.github.io](https://aloeveraz.github.io/), covering my robotics, CAD, controls, manufacturing and 3D printing work. Every project card is built from one JSON file, so adding a project doesn't touch the page layout.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure and the project sheet |
| `portfolio.css` | Layout, responsive rules and visual effects |
| `portfolio.js` | Renders the profile, projects, carousels and project sheet |
| `galaxy.js` | High's living sky, fetched the first time High is wanted |
| `navbar.css` | The floating navigation bar |
| `glass.js` | The liquid glass on the bar, cards and buttons (the modes are explained at the top of the file) |
| `y2k.js`, `y2k.css`, `vapor.js`, `vapor.css`, `aero.js`, `aero.css`, `ego.js`, `ego.css` | Each level's hidden other looks (see Visual effects). Fetched only when a visitor asks for one |
| `portfolio-data.json` | Profile, skills, project write-ups, media and links |
| `project-example.json` | Template for a new project |
| `assets/` | Photos, GIFs, graphics and self-hosted fonts |
| `tools/` | Scripts that rebuild images, icons and fonts |
| `tools/perf/` | Windows scripts that serve the site locally and measure it in Chrome (see its README) |

Also: `privacy.html`, `terms.html`, `updates.html` (the site's major versions) and `404.html` (styled by `page.css`, with `page.js` setting the zoom-aware font size), `fonts.css`, `icons.css`, `robots.txt`, `sitemap.xml` and `site.webmanifest`.

## Run locally

The page loads its data with `fetch`, so it needs a local server:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>. On Windows without Python, `powershell -NoProfile -ExecutionPolicy Bypass -File tools/perf/serve.ps1` serves it at <http://localhost:8862>.

`PERFORMANCE_BASELINE.md`, `OPTIMIZATION_LOG.md` and `PERFORMANCE_REPORT.md` record what the site costs to run and what was changed to make it cheaper; `tools/perf/smoke.ps1` clicks through the page and checks it still works.

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

After changing a CSS or JS file, bump its `?v=` suffix in the HTML so returning visitors don't get a stale copy. A local pre-commit hook does this for `portfolio.css` and `portfolio.js` on machines where it is installed. `galaxy.js` has no `?v=` of its own: it is fetched with `portfolio.js`'s, so a change to it alone needs that one bumped. The other skies' files carry `SKY_VERSION` in `portfolio.js`; bump it when one of those files changes. `portfolio-data.json` needs no bump: it is fetched with `cache: 'no-cache'`, so the browser checks for a newer copy on every visit.

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

## Visual effects

A slider at the right of the navigation bar sets one of three levels. On a phone it is the last row of the menu. No word names the level on screen, even while it is moved: the thumb's place and the track's blue say it. Screen readers still hear Low, Medium or High.

Every level wears the same clear glass, modelled on Apple's Liquid Glass at its Clear setting: the cards and buttons all but invisible, so the backdrop shows straight through, told apart by a bright specular edge along the top and left, a fainter one along the foot and right, a soft glow inside the rim and a band of light down the face. In Medium and High the bar has a light frost of its own, so headings scrolling under it do not cross its links; in Low it is shaded instead, which keeps Low as quick as it was.

| Level | What draws |
| --- | --- |
| Low (left) | The clear glass over the still lattice. No sky, no card tilt, no cursor light and no 3D rings. Nothing animates at rest. |
| Medium (middle, the default) | Low plus a still starry sky under the lattice, the cards leaning toward the cursor, the light that follows it, and the 3D rings. The sky is drawn once into a picture on the lattice's own layer, so scrolling never redraws it, and the cards are still neither frosted nor bent, so the browser never re-blurs what is behind them. |
| High (right) | Everything: the sky set moving behind the glass, lightly frosted and bent at the rim, the custom cursor and touch effects. |

- **Where it lives.** A small script in `index.html`'s head picks the level before anything is drawn and writes it to `html[data-effects]`. `portfolio.js` drives the slider, Medium's still sky and the frame monitor, `galaxy.js` is High's sky, `glass.js` decides how the glass is drawn, and the stylesheets key off `data-effects`.
- **Every visit starts Medium.** On every machine, whatever its hardware. High is only ever chosen on the slider.
- **Remembered for the visit.** Within a tab (`sessionStorage`) a reload or a trip to the policy pages carries on at the level the visit was at: the one last chosen on the slider (`portfolio-effects-level`), or the one the page stepped down to after it (`portfolio-effects-lag`). A new visit starts Medium again. Levels saved across visits by older versions of the site are cleared.
- **Stepped down when slow, one stop at a time.** A monitor eases the sky, then the glass. If the page still stutters it steps High to Medium, then Medium to Low, never two stops at once, and the thumb slides to show it. A page crawling at ten frames a second or less skips the easing but still drops only one stop.
- **The visitor gets the last word.** A level chosen by hand is stepped down like any other. Each time the visitor puts it back up after the page lowered it is counted (`portfolio-effects-overrides`), and the third time the page stops stepping it down for the rest of the visit. Only the sky's pace is still eased after that, which changes how often it is drawn and nothing in it.
- **Nothing left running below High.** Leaving High stops the sky at once and hands back its memory (about 80 MB at 2x) as soon as it has faded out, takes down the glass's bend filters and the custom cursor, and stops the frame monitor's checks at rest. At rest in Low or Medium the page asks for no frames at all. Going back up to High builds the sky again, about a tenth of a second while it is still faded out. The sky's script is not even fetched until High is first wanted, and in Medium and Low `glass.js` watches nothing.

### The other skies

Each stop of the slider hides other looks. Ten quick presses on a stop find them, and from then on two quick presses go round them. A gap of 400 ms or more starts the count again, and a reload forgets it all: the page starts as it always does and the ten presses are needed again. Each changes what the page looks like and nothing about how it works: the lean, the lift, the rings, the frost and the cursor behave as they did.

| Stop | What comes up |
| --- | --- |
| Low | The dark web of about 2000: dialogs with title bars and wet gel buttons after Apple's site of the time, over one great eye in hard dither, in a violet aura. It follows the cursor and blinks. Everything that can be seen through is seen through by the same amount. `y2k.js`, `y2k.css`. |
| Medium | A pink desktop of about 1999 that can be used, with nothing on it that cannot. The cards become windows with title bars and hard shadows. In the empty places beside the name, the infill window's slider takes a labyrinth from 1% to solid, the print job prints it (denser takes longer) and reports back, the robot pulls a face when poked, holding the torque window winds it up, and the hearts and `ROBOT.STL` answer too. All of it can be picked up and moved, and the windows grow. Of a window's three dots, the first closes it, and it comes back on its own later, the second minimises it to the bar at the foot, and the third sends it across the desk. On a tall screen they all start on that bar. `vapor.js`, `vapor.css`. |
| High | The stars, then a bright Frutiger Aero sky (`aero.js`, `aero.css`), then its opposite (`ego.js`, `ego.css`), then the stars again. Bright: a robot arm blows bubbles at a glass orb holding New York, the bubbles carry gears, a swerve module, a 3D printer, a robot and a controller board, and a press on one bursts it. Dark: black water, thin currents of light, robot jellyfish, a kiwi drive with one headlamp and specks that wake near the cursor. Bubbles carry up this portfolio's own CAD and projects. A great lens with a coal in it breathes and turns to look at the cursor; as the page scrolls it drifts away to the left, and the arm that blew the bubbles sinks out of sight. |

- **They cost the other levels nothing.** None of these files is requested until the press that asks for it. All the page carries for them is a counter in the slider's press handler.
- **Each lives and dies with its level.** Leaving the level, by hand or because the frame monitor stepped down, puts it away at once, and coming back brings the choice back. While one is showing that level's own backdrop is put away, so the two never run together.
- **Each holds to its level's budget.** Low's colour is a few gradients on the lattice's fixed layer, painted once, and its eye is a very small canvas shown with its pixels large: a frame only looks up what it needs and draws the cells that changed, and there are no frames unless the eye is moving, so a still cursor between blinks asks for nothing. There is no crossfade on the way in. Medium's backdrop is only the lattice. Its windows are plain elements lying on the page at its top, which run only while someone has a hand on them, so at rest it asks for no frames either. High's two are animated scenes under the same rules as the space sky: they rest with the tab hidden and under an open project, draw half as often on a machine the page has eased (`data-effects-pace`), and hold still for anyone who prefers reduced motion.

## Privacy

Fonts, icons and images are all served from this domain, and the site sets no cookies and runs no analytics. The only outside request is YouTube: the player loads from `youtube-nocookie.com` when someone opens a project with a video. If that changes, update `privacy.html` to match.

## Hosting

GitHub Pages serves the repository root. HTTPS needs no setup, since `*.github.io` is on the HSTS preload list and GitHub redirects `http://` itself, and each page's `upgrade-insecure-requests` tag covers subresources. On a custom domain, turn on **Settings → Pages → Enforce HTTPS**.
