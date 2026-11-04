# Angelo Demetroulakos: Engineering Portfolio

Source for my portfolio at [aloeveraz.github.io](https://aloeveraz.github.io/), covering my robotics, CAD, controls, manufacturing and 3D printing work. Every project card is built from one JSON file, so adding a project doesn't touch the page layout.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure and the project sheet |
| `portfolio.css` | Layout, responsive rules and visual effects |
| `portfolio.js` | Renders the profile, projects, carousels and project sheet |
| `cosmos.js` | The living sky over Medium and High: what is near, acting on each other, and at High its galaxy and the war across it. Fetched once the page has settled, never for Low |
| `navbar.css` | The floating navigation bar |
| `glass.js` | The liquid glass on the bar, cards and buttons (the modes are explained at the top of the file) |
| `y2k.js`, `y2k.css`, `iris.js`, `iris.css`, `vapor.js`, `vapor.css`, `ego.js`, `ego.css` | Each level's hidden other looks (see Visual effects). Fetched only once a visitor finds them |
| `portfolio-data.json` | Every word and link on the page: the hero, each section's headings, the About cards, skills, archive folders and projects |
| `portfolio-template.json` | One of each kind of object in `portfolio-data.json`, filled in as an example |
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

## Edit the site

Everything a visitor reads about you and your work is in `portfolio-data.json`, and it is the only place to change it. Every effects level and every hidden look shows the same page, so an edit there shows at Low, Medium and High, behind the eyes and on Medium's desk, whose pop-ups are made from the page's own projects, folders and links.

Every object of a kind is written the same way: the same fields, in the same order, with `""`, `[]`, `0` or `false` where it has nothing. An empty field is left off the page. `portfolio-template.json` has one of each to copy.

| In the data | On the page | Fields |
| --- | --- | --- |
| `profile` | The hero | `name`, `title` (shown only if `tagline` is empty), `badge`, `tagline`, `actions` (the hero's buttons) and `links` (the hero's icons and the Contact buttons, in this order; the hero puts the résumé last) |
| `sections` | Each section's heading: `about`, `skills`, `projects`, `archive` and `contact` | `menu` (its word in the navigation bar), `label`, `title`, `summary` (the paragraph under it; About's is the bio) |
| `about` | The About cards | `label`, `title`, `summary`, `roles` (each `title`, `position`, `period`), `subline`, `link` |
| `skills` | The skill groups | `title`, `items` |
| `collections` | The archive's folders | `id` (its address, `#id`), `title`, `summary`, `itemNoun` and `itemNounPlural` (what the count calls them), `carousel`, `categories` (the projects it holds) |
| `projects` | Each card and its project sheet | See below |

Every link, anywhere, is `{ "type", "label", "url" }`, and the type picks its icon: `github`, `linkedin`, `cad`, `video`, `resume`, `email` (`url` is `mailto:` and the address), `link` (another site), and for places on the page `projects`, `contact` and `section`. A link with no `url` is left off, except the résumé, which shows as coming soon.

A project's fields, in order: `id`, `title`, `category` and `additionalCategories` (which folders it is in), `period` (`Started September 2026` while it goes on, `June 2024 to June 2025` once done, the semester for classes and clubs), `collectionOrder` (its place in its folder), `featured` and `featuredOrder` (its place in the top row, which shows the first three; `0` when not featured), `summary` (top of the sheet), `cardSummary` (the card), `programSummary` (a line about the program, for internships), `image`, `imageAlt`, `imageSrcset` (written by `tools/link-thumbnails.py`), `imagePresentation` (`photo` or `certificate`), `motionImage` and `motionImageAlt` (played when the card is pointed at), `tags`, `quickLink` (the link at the top of the sheet), `featureVideo` (`src`, `label`), `overview` (`problem`, `method`, `result`, and three `headings` or none for the usual ones; left empty, the sheet shows the first three `sections` in its place, and its "How I Built It" goes on from the fourth), `sections` (each `heading`, `body`), `media` (each `type` of `image`, `gif` or `video`, `src`, `label`, `alt`, and `fit` of `cover` or `contain`; a video leaves `alt` and `fit` empty) and `links`.

To add a project:

1. Put the images in `assets/`.
2. Copy the project in `portfolio-template.json` into `projects` in `portfolio-data.json` and fill it in. Write `imageAlt` to say what the picture shows, not the project's name.
3. Run the media scripts below, then `python tools/check-data.py`.
4. Check the card, project sheet, links and phone layout locally.

A project whose `category` is `Coursework` gets a class's sheet: its overview headed "What I Did in Class", with its own three headings, and a note pointing to the class README where other projects have "How I Built It". Rename that category and its classes get the ordinary sheet.

`python tools/check-data.py` says anything in the data that is off the format and what it would get wrong on the page: a field missing or out of order, a link type it does not know, a project in a category no folder holds, a picture that is not in `assets/`. `--fix` puts fields in order and adds missing ones empty. `index.html` keeps a copy of the hero's and the headings' words (its `data-content` elements) so they are there before the data loads; `--fix` copies them from the data too. The page's `<head>` (its title, description and link previews) is not in the data, and neither is the page's own furniture: the sheet's fixed headings ("Quick Overview", "How I Built It", "Watch It Run"), the class note, the placeholders, the carousels' labels, the footer and the load-failure message, which are in `index.html` and `portfolio.js`. The hero's two buttons are drawn from `profile.actions`, but their first-paint copy in `index.html` is not one `--fix` keeps, so after changing them, change it by hand.

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

After changing a CSS or JS file, bump its `?v=` suffix in the HTML so returning visitors don't get a stale copy. A local pre-commit hook does this for `portfolio.css` and `portfolio.js` on machines where it is installed. `cosmos.js` has no `?v=` of its own: it is fetched with `portfolio.js`'s, so a change to it alone needs that one bumped. The other skies' files carry `SKY_VERSION` in `portfolio.js`; bump it when one of those files changes. `portfolio-data.json` needs no bump: it is fetched with `cache: 'no-cache'`, so the browser checks for a newer copy on every visit.

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
| Low (left) | The clear glass over the same near-black, nearly colourless still sky as the other two, a little dimmer, built for Windows' own minimum machine. Deep space, faint nebulae, a band of stars and thousands more are drawn once, off the page's thread, into one picture on one fixed layer, so a scroll never draws them again. On it only four stars that brighten and fade over half a minute, a step at a time, and a slow shooting star now and then, all the compositor's. No card tilt, no cursor light and no 3D rings. |
| Medium (middle, the default) | Low's sky, sharper, darker and nearly without colour, with one great dark spiral painted into it, standing somewhere new across the screen each visit, far galaxies and clouds of dust. Over it, on the graphics card (`cosmos.js`), nine things hold still on the screen as the page scrolls over them and act on what is round them: the spiral's heart is a black hole that feeds, with matter streaming round it and in, and another hole, worlds with rings and one with a moon, two dying stars, a cloud of dust and two far spirals, spread across the whole screen. A hole now and then takes hold of something near it and it goes round and round, smaller and hotter, and in, with a flare and sparks; the holes bend the stars behind them into rings; every world is lit from the side of whatever burns nearest it; comets cross, bent by the holes and caught by them; a lander comes down on a world now and then. The cursor bends the light under it. Thirty frames a second, every frame while something moves fast. The cards lean toward the cursor, a light follows it, and the 3D rings turn. Held to an ordinary 11th or 12th generation laptop. |
| High (right) | Everything, with no ceiling, all of it moving on every frame, and dark: near black, nearly without colour, the light in it cold and grey. Far off, the still sky's stars and far galaxies as points of light; near, the living sky: a dark galaxy at the top of the page whose heart is a black hole that beats like a heart and feeds, its inside turning faster than its edge, two small galaxies on their orbits round it and jets when it flares, and down the page, spread evenly across the screen and down it rather than left to chance, dark orbs of every size -- rock, ice, fire under a black crust, balls of pale light -- lit at their rims, drawn soft at the edge by a pixel and at up to twice the screen's pixels so they stay round however close they are looked at, that wander and can be pushed a long way by the cursor, among holes, worlds with rings and moons, dying stars, clusters and far spirals. Push an orb into a hole and it goes round, cracks open and comes apart on the way in, the pieces following it down; the holes take things on their own too. Two kinds of ship that are not ours fight across it, each drawn once, large, with a look of its own -- the Ash's split prows, spines and raked wings with red slits glowing in the plating, the Pale's dark crescents round a ring of cold light with a row of lights along the edge -- each with a faint wake, steering round the worlds, knocking orbs about with their shots and taken by the holes when they stray, with landers setting down on worlds. A press sends a shock through all of it. Lightly frosted glass bent at the rim, the custom cursor and touch effects. A graphics card the browser only imitates on the processor gets the still sky with Medium's things painted in. |

- **Where it lives.** A small script in `index.html`'s head picks the level before anything is drawn and writes it to `html[data-effects]`. `portfolio.js` drives the slider, the still sky and the frame monitor, `cosmos.js` is the living sky over Medium and High, `glass.js` decides how the glass is drawn, and the stylesheets key off `data-effects`.
- **Every visit starts Medium.** On every machine, whatever its hardware. High is only ever chosen on the slider.
- **Remembered for the visit.** Within a tab (`sessionStorage`) a reload or a trip to the policy pages carries on at the level the visit was at: the one last chosen on the slider (`portfolio-effects-level`), or the one the page stepped down to after it (`portfolio-effects-lag`). A new visit starts Medium again. Levels saved across visits by older versions of the site are cleared.
- **Stepped down when slow, one stop at a time.** A monitor eases the sky (drawn softer), then the glass. If the page still stutters it steps High to Medium, then Medium to Low, never two stops at once, and the thumb slides to show it. A page crawling at ten frames a second or less skips the easing but still drops only one stop.
- **The visitor gets the last word.** A level chosen by hand is stepped down like any other. Each time the visitor puts it back up after the page lowered it is counted (`portfolio-effects-overrides`), and the third time the page stops stepping it down for the rest of the visit. Only the sky's softness is still eased after that, which changes how finely it is drawn and nothing in it.
- **The sky goes out when nobody is there.** Five seconds after the last move of the cursor, a scroll, a key or a touch, the whole backdrop goes dark together at every level and the living sky stops drawing; the next move brings it back, with a flare. The eyes and the desk keep watching. Leaving Medium or High for Low stops the living sky and hands back its canvases' memory; its script is fetched once the first page has settled and never for a visit that stays at Low, and in Medium and Low `glass.js` watches nothing.

### The other skies

Each stop of the slider hides other looks: every level has its usual sky and one great eye, built for what that level can spend, and Medium has a pink desktop as well, last of all. Two quick presses on any stop go round them, so anyone pressing about finds them. The choice is one choice: an eye turned on at one level is on at all three, and leaving Medium's desk the other two show whichever of the stars and the eye was on. Low's eye is simply there, already looking. Medium's and High's build themselves over five seconds from the bones out, like a drawing of the body taken apart in layers, done by a machine: a wire skeleton of the ball drawn in line by line with its measurements marked; its pieces, laid out round it, coming in one by one with their cut edges lit and locking together; veins growing over the white from the rim; the iris winding in; the skin closing over it from the edges into lids; and the seams sealing in a ring of light. Then the screen fills with the eye's own dots, dithered in its colours, wheeling round its iris off to one side, and the whole of it is drawn in and swallowed by the iris; the eye starts out at the viewer with a flash and goes wild for a second or two -- darting everywhere, tearing, its pupil throbbing, rings going out -- before it settles. Going from one level's eye to another's, the new one is simply there, awake, where the old one was. A gap of half a second or more starts the count again, and a reload goes back to the page's usual look. Each changes what the page looks like and nothing about how it works: the lean, the lift, the rings, the frost and the cursor behave as they did.

| Stop | Going round |
| --- | --- |
| Low | Its usual sky, then the eye. The dark web of about 2000: dialogs with title bars and wet gel buttons after Apple's site of the time, over one great eye in hard dither, in a violet aura. It is a ball: it turns to follow the cursor, its iris narrowing as it comes round to the edge, and it blinks. Everything that can be seen through is seen through by the same amount. `y2k.js`, `y2k.css`. |
| Medium | The still stars, then the eye (`iris.js`, `iris.css`), then the desktop (`vapor.js`, `vapor.css`), then the stars again. The eye: Low's look on the page, with the eye drawn on the graphics card and only while something is moving, so a switch to it is answered at once: a ball that turns, veins that go round with it, a lit rim, lids that follow and a soft light under the dither. Awake, it follows the cursor (on a touch screen, with no cursor, it looks about for itself), and pressed twice, anywhere the page does not answer a press, it fixes on it for fifteen seconds, its pupil pinned and its iris flushed. The desktop: pink, about 1999, and it comes down with what looks like a virus. The desk's own robot has gone bad (`ALWAYS_BREAK.EXE`), and it moves the way the AI in the second season of Cyberpunk: Edgerunners does, in fits: dead still, then all at once. It glares at the cursor, bares its teeth and laughs; eyes open all over its screen; it splits into a red husk while a green outline of it jumps about; its face turns to a green box that grows twitching limbs; it skitters round its screen and breaks up among blocks of flickering static, typing out what it is doing to your machine as a bar fills. It does not stay in its window: green outlines of it flicker up all over the desk, its window jumps to another place or hangs off the top of the screen, and red pulses go through everything. STOP IT only makes it worse, and closing it brings it back with a friend. In the first seven seconds or so it comes down in hundreds of windows. At the back, three depths of the ones that do nothing, the printer's grumbles and jobs that never finish, are scattered over the whole screen, smaller and paler the further back, painted once and never pressed. In front, three depths of pop-ups each lead somewhere: every project, which opens as its card does, About, Skills, the projects and each folder of the archive, Contact, and the page's own links. After that one comes every five to thirty seconds, a place not yet out or one out a long while popping up again, all on a fixed layer behind the page, so they stay with the visitor down it. The infill window's slider takes a labyrinth from 1% to solid, the print job prints it (denser takes longer) and reports back, the robot in its own window pulls a face when poked, holding the torque window winds it up, and the hearts and `ROBOT.STL` answer too. Press and hold any of it for a moment and it lifts off the desk and goes anywhere on the screen, over the page, until it is let go and sinks back behind; a quick press is only a press and a swipe still scrolls. Words loose on the desk are outlined in its own pink under every letter, so they read clearly over whatever has popped up behind them without standing on blocks of colour; the big headings keep their hard teal offset. |
| High | The stars, then the eye (`ego.js`, `ego.css`), then the stars again. Low's look and Low's eye, drawn on the graphics card on every frame, with moving fibres, waves from the pupil, flaring veins, sparks going round it, shafts of light and a picture that tears now and then. It is a ball that moves by turning: the iris narrows toward the edge, the veins go round with it, its light and the window it reflects stay put, and the lids go a little way with it. Awake, it follows the cursor (on a touch screen it looks about for itself). Pressed twice, anywhere the page does not answer a press, it fixes on it for fifteen seconds, its pupil pinned and its iris flushed. |

- **Every switch has a transition, and the higher the level the more happens.** A change of level or of look is never a cut and never a bare pause. Going up to Medium the page spreads out from the slider; going up to High it bursts out of it, blinding at first and swelling, while the old page falls away into the dark; going down it draws back into the slider. Between the stars and the eye only the backdrop moves, behind the page. At Low the old one swells, swirls down to a point and is gone in a flash, the screen behind the page goes black, and the new one climbs up out of the deep from behind and overshoots. At Medium and High alike, leaving the stars, the galaxy falls in on itself to a point with streaks of it dragged after, and goes off like the first moment of everything -- a flash, a ring going out, sparks thrown everywhere -- burning down to black, out of which the eye builds itself; then light pours into its iris and it starts out at the viewer and wakes. Leaving the eye, it dies -- its pupil blows, it rolls up and away, its lids come down -- tearing and jumping, and comes apart into blocks from the iris out, its dots lifting off and evaporating, down to pitch black, and the stars burst back through the dark torn open from the middle. The desk breaks in torn across and leaving it switches off like an old screen. Reduced motion skips them. `shift` and `warp` in `portfolio.js`, `html[data-shift]` in `portfolio.css`, and the rule is written down in `CLAUDE.md` for whoever works here next.
- **They cost the other levels nothing.** None of these files is requested until the first two quick presses find them; then all of them are fetched, so every switch after is at once. Until then all the page carries for them is a counter in the slider's press handler.
- **They keep their shape on any screen.** Each eye eases from wide to tall with no jump and draws about 100,000 cells at any size, so a phone, a MacBook and a very wide monitor all get the same picture for the same work. Everything on Medium's desk is measured in one size that follows the screen's shorter way, and on a touch screen its small controls answer beyond their edges.
- **Each lives and dies with its level.** Leaving the level, by hand or because the frame monitor stepped down, puts it away at once, and coming back brings the choice back. While one is showing that level's own backdrop is put away, so the two never run together.
- **Each holds to its level's budget.** Low's eye's colour is a few gradients on the backdrop's fixed layer, painted once, and its eye is a very small canvas shown with its pixels large: a frame only looks up what it needs and draws the cells that changed, and there are no frames unless the eye is moving, so a still cursor between blinks asks for nothing. There is no crossfade on the way in. Medium's eye draws thirty times a second only while something is moving, and asks for nothing between one movement and the next. Its desktop's windows are plain elements on one fixed layer behind the page, and what keeps running is the newest three robots, on very small canvases, eight times a second, resting with the tab hidden and under an open project. High's eye runs on every frame under the same rules as the space sky: they rest with the tab hidden and under an open project, draw half as often on a machine the page has eased (`data-effects-pace`), and hold still for anyone who prefers reduced motion.

## Privacy

Fonts, icons and images are all served from this domain, and the site sets no cookies and runs no analytics. The only outside request is YouTube: the player loads from `youtube-nocookie.com` when someone opens a project with a video. If that changes, update `privacy.html` to match.

## Hosting

GitHub Pages serves the repository root. HTTPS needs no setup, since `*.github.io` is on the HSTS preload list and GitHub redirects `http://` itself, and each page's `upgrade-insecure-requests` tag covers subresources. On a custom domain, turn on **Settings → Pages → Enforce HTTPS**.
