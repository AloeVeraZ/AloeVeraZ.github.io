# Angelo Demetroulakos · Engineering Portfolio

**Live site: [aloeveraz.github.io](https://aloeveraz.github.io/)**

I built this site to show what I've made and achieved as a Mechanical Engineering Technology student at City Tech in New York City. It covers my robotics, CAD, controls, manufacturing and 3D printing work: competition robots, swerve drives, a 3D printer built from scratch, my internship at the NYC FIRST STEM Center, research, awards and the classes behind it all. Each project opens into a write-up of the problem, how I built it and how it turned out, with photos, video and the files.

I designed and built the site myself, from scratch: plain HTML, CSS and JavaScript, no framework and no build step, hosted on GitHub Pages.

## Contents

- [What's on the site](#whats-on-the-site)
- [How it works](#how-it-works)
- [Visual effects](#visual-effects)
- [Files](#files)
- [Run it locally](#run-it-locally)
- [Edit the content](#edit-the-content)
- [Images, icons and fonts](#images-icons-and-fonts)
- [Caching](#caching)
- [Design system](#design-system)
- [Performance and testing](#performance-and-testing)
- [Privacy and hosting](#privacy-and-hosting)

## What's on the site

| Section | What it shows |
| --- | --- |
| **Hero** | My name, focus and links to my GitHub, résumé and email |
| **About** | Who I am, where I study and the roles I've held |
| **Skills** | CAD and design, manufacturing and fabrication, software and controls |
| **Featured Projects** | My top projects as cards; each opens a full project sheet |
| **My Projects** | The archive, in folders: personal projects, internship and work, clubs, awards and research, and classes |
| **Contact** | Every way to reach me and find my code and CAD files |

A project sheet has a quick overview (problem, method, result), a step-by-step "How I Built It", a video if there is one, a gallery and the project's links.

## How it works

- **One data file.** Every word and link a visitor reads lives in `portfolio-data.json`. `portfolio.js` fetches it and renders the hero, headings, About cards, skills, project cards, archive folders and project sheets from it, so adding a project never touches the layout.
- **Fast first paint.** `index.html` carries a copy of the hero and heading text so the page reads before the data arrives. `tools/check-data.py --fix` keeps that copy in step with the data.
- **Everything self-hosted.** Fonts, icons and images are all served from this domain. Images are WebP with smaller card-sized versions, and the icon font is cut down to just the icons in use.
- **Static hosting.** GitHub Pages serves the repository root as is.

## Visual effects

A slider at the right of the navigation bar (the last row of the menu on a phone) sets one of three effects levels. Every visit starts at **Medium**. The choice holds for the rest of the visit, and if the page starts to stutter it steps down one level at a time.

| Level | What you get | Built to run on |
| --- | --- | --- |
| **Low** | Clear glass over a still, dark starfield painted once, with a few twinkling stars and the odd shooting star | Windows' minimum spec: a ~1 GHz dual-core with basic graphics |
| **Medium** (default) | A living space backdrop on the GPU (`cosmos.js`): black holes that feed and bend light, lit worlds, comets and landers, plus cards that lean toward the cursor | An ordinary 11th or 12th gen laptop |
| **High** | Everything, every frame: a galaxy with a beating black-hole heart, orbs you can push into holes, two alien fleets fighting across the page, frosted glass and a custom cursor | No ceiling |

All three share the same look: near black, almost colourless, lit at the rims, with glass cards modelled on Apple's Liquid Glass. The sky goes dark a few seconds after the last input and comes back when you move. Every change of level or look plays a transition (`shift` and `warp` in `portfolio.js`), and reduced-motion settings skip them.

<details>
<summary><b>Hidden looks</b> (spoilers)</summary>

Press any stop of the slider twice quickly to cycle through that level's hidden looks. A reload goes back to normal.

| Level | Looks | Files |
| --- | --- | --- |
| Low | Stars → a dithered eye in the style of the web around 2000, with glossy dialog windows | `y2k.js`, `y2k.css` |
| Medium | Stars → a GPU-drawn eye → a pink late-90s desktop overrun by a broken robot and hundreds of pop-ups that link to the site's own projects and sections | `iris.js`, `iris.css`, `vapor.js`, `vapor.css` |
| High | Stars → a fully animated eye with moving fibres, flaring veins and sparks | `ego.js`, `ego.css` |

The eyes at Medium and High build themselves from the bones out over five seconds, then follow the cursor; press twice to make one stare. None of these files load until someone finds them, so they cost the normal page nothing.

</details>

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure and the project sheet |
| `portfolio-data.json` | Every word and link on the page |
| `portfolio-template.json` | One example of each kind of object in the data, to copy |
| `portfolio.js` | Renders the page from the data; runs the slider, still sky, transitions and frame monitor |
| `portfolio.css` | Layout, responsive rules, design tokens and effects |
| `cosmos.js` | The living sky for Medium and High (never loaded at Low) |
| `glass.js` | The liquid glass on the bar, cards and buttons |
| `navbar.css` | The floating navigation bar |
| `y2k.*`, `iris.*`, `vapor.*`, `ego.*` | The hidden looks, loaded only on demand |
| `privacy.html`, `terms.html`, `updates.html`, `404.html` | Other pages, styled by `page.css` and `page.js` (`updates.html` lists the site's major versions) |
| `fonts.css`, `icons.css` | Self-hosted Inter, Barlow Condensed and Font Awesome subset |
| `assets/` | Photos, GIFs, graphics and fonts |
| `tools/` | Scripts that check the data and rebuild images, icons and fonts |
| `tools/perf/` | Windows scripts that serve the site locally and measure it in Chrome ([README](../tools/perf/README.md)) |
| `CLAUDE.md` | Rules for anyone (or any AI agent) working on the site |
| `OPTIMIZATION_LOG.md`, `PERFORMANCE_*.md` | What the site costs to run and what was done to make it cheaper |

## Run it locally

The page loads its data with `fetch`, so it needs a local server:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>. On Windows without Python:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File tools/perf/serve.ps1
```

That serves it at <http://localhost:8862>, answering the way GitHub Pages does.

## Edit the content

Everything a visitor reads is in `portfolio-data.json`, and that's the only place to change it. Every effects level and hidden look shows the same page, so one edit shows everywhere.

Every object of a kind has the same fields in the same order, with `""`, `[]`, `0` or `false` where it has nothing. Empty fields are left off the page.

| In the data | On the page | Fields |
| --- | --- | --- |
| `profile` | The hero | `name`, `title` (shown only if `tagline` is empty), `badge`, `tagline`, `actions` (the hero's buttons), `links` (hero icons and Contact buttons) |
| `sections` | Headings for `about`, `skills`, `projects`, `archive`, `contact` | `menu` (nav bar word), `label`, `title`, `summary` (About's is the bio) |
| `about` | The About cards | `label`, `title`, `summary`, `roles` (`title`, `position`, `period`), `subline`, `link` |
| `skills` | The skill groups | `title`, `items` |
| `collections` | The archive folders | `id` (its `#id` address), `title`, `summary`, `itemNoun`, `itemNounPlural`, `carousel`, `categories` |
| `projects` | Each card and its project sheet | See below |

**Links** are always `{ "type", "label", "url" }`. The type picks the icon: `github`, `linkedin`, `cad`, `video`, `resume`, `email` (a `mailto:` url), `link`, and for places on the page `projects`, `contact` and `section`. A link with no `url` is hidden, except the résumé, which shows as coming soon.

<details>
<summary><b>Project fields</b></summary>

In order:

| Field | Meaning |
| --- | --- |
| `id`, `title` | Its address and name |
| `category`, `additionalCategories` | Which archive folders it appears in |
| `period` | `Started September 2026` while ongoing, `June 2024 to June 2025` once done, the semester for classes and clubs |
| `collectionOrder` | Its place in its folder |
| `featured`, `featuredOrder` | Whether and where it sits in the top row (the first three show; `0` when not featured) |
| `summary`, `cardSummary`, `programSummary` | Top of the sheet, the card, and a line about the program (internships) |
| `image`, `imageAlt`, `imageSrcset`, `imagePresentation` | Card picture; `imageSrcset` is written by `tools/link-thumbnails.py`; presentation is `photo` or `certificate` |
| `motionImage`, `motionImageAlt` | Plays when the card is hovered |
| `tags` | Tags on the card |
| `quickLink` | The link at the top of the sheet |
| `featureVideo` | `src`, `label` |
| `overview` | `problem`, `method`, `result`, and optional three `headings`. Left empty, the first three `sections` fill it and "How I Built It" starts at the fourth |
| `sections` | Each `heading`, `body` |
| `media` | Each `type` (`image`, `gif`, `video`), `src`, `label`, `alt`, `fit` (`cover` or `contain`; videos leave `alt` and `fit` empty) |
| `links` | The project's links |

Projects in the `Coursework` category get a class sheet: "What I Did in Class" with its own headings, and a note pointing to the class README.

</details>

### Add a project

1. Put the images in `assets/`.
2. Copy the project from `portfolio-template.json` into `projects` in `portfolio-data.json` and fill it in. Write `imageAlt` to describe the picture, not the project's name.
3. Run the [media scripts](#images-icons-and-fonts), then `python tools/check-data.py`.
4. Check the card, project sheet, links and phone layout locally.

### Check the data

```bash
python tools/check-data.py        # report anything off-format
python tools/check-data.py --fix  # reorder fields, add missing ones, sync index.html's first-paint text
```

It catches missing or out-of-order fields, unknown link types, projects in a category no folder holds, and pictures missing from `assets/`.

Not in the data: the page's `<head>` (title, description, link previews) and fixed interface text such as the sheet's headings, placeholders, carousel labels, footer and load-error message, which live in `index.html` and `portfolio.js`. The hero buttons' first-paint copy in `index.html` also needs updating by hand.

## Images, icons and fonts

The scripts need Python with `pillow`, `fonttools` and `brotli`:

```bash
python tools/build-images.py      # source photos/GIFs -> WebP
python tools/build-thumbnails.py  # 900px card versions of each image
python tools/link-thumbnails.py   # write each card's srcset into the JSON
python tools/build-icons.py       # subset Font Awesome to the icons in use
python tools/build-fonts.py       # download and self-host Inter and Barlow Condensed
python tools/build-brand.py       # favicons and the social preview image
```

Run `build-icons.py` again after using a new `fa-` icon, or it shows as a blank box. `tools/measure-faces.js` runs in the browser console and prints the font metrics the text trimming relies on.

## Caching

- After changing a CSS or JS file, bump its `?v=` suffix in the HTML so returning visitors don't get a stale copy. A local pre-commit hook does this for `portfolio.css` and `portfolio.js` where it's installed.
- `cosmos.js` is fetched with `portfolio.js`'s version, so a change to it alone needs that one bumped.
- The hidden looks' files use `SKY_VERSION` in `portfolio.js`; bump it when one changes.
- `portfolio-data.json` needs nothing: it's fetched with `cache: 'no-cache'`.

## Design system

Spacing and type sizes are tokens at the top of `portfolio.css`, copied into `page.css`. New elements should use a token, not a raw value. Barlow Condensed in capitals is for names; Inter is for sentences. Nothing a visitor has to read is smaller than 13px (14px in the condensed face), and text keeps at least 7:1 contrast.

<details>
<summary><b>Tokens</b></summary>

| Spacing | Value | Between |
| --- | --- | --- |
| `--rhythm-label` | 12px | a label and its heading; list items |
| `--rhythm-heading` | 16px | a heading and its text; paragraphs |
| `--rhythm-rule` | 16px | a rule inside a card and what's around it |
| `--rhythm-block` | 24px | blocks inside a section |
| `--rhythm-header` | 48px | a section header and its content |
| `--rhythm-section` | 48–96px | one section and the next |

Text blocks are leading-trimmed, so these are the gaps you actually see. To trim a new block, set `--lh` to its line-height, use `line-height: var(--lh)`, and add it to its typeface's list at the end of `portfolio.css`.

| Type | Size | For |
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

Letter spacing: `--tracking-display`, `--tracking-title`, `--tracking-eyebrow`, `--tracking-caps`. Colour: `--ink`, `--muted`, `--blue-light` (labels), `--blue-soft` (dates and tags).

</details>

## Performance and testing

Each effects level has a hardware budget (see [Visual effects](#visual-effects)), and the scripts in `tools/perf/` check it in a private copy of Chrome:

- `bench.ps1` records traces of scripted scenarios; `-Config minimum` stands in for Low's target machine, `-Config native` for Medium's.
- `smoke.ps1` clicks through the page and checks it still works.
- `layout-audit.ps1` loads the page on 24 screen sizes, from folding phones to 4K, and checks for sideways scrolling, clipped text and small tap targets.

`PERFORMANCE_BASELINE.md`, `OPTIMIZATION_LOG.md` and `PERFORMANCE_REPORT.md` record the measurements and what was changed.

## Privacy and hosting

- **Privacy.** No cookies and no analytics. The only outside request is YouTube's player, loaded from `youtube-nocookie.com` when someone opens a project with a video. If that changes, update `privacy.html` to match.
- **Hosting.** GitHub Pages serves the repository root. HTTPS needs no setup on `*.github.io`; each page's `upgrade-insecure-requests` tag covers subresources. On a custom domain, turn on **Settings → Pages → Enforce HTTPS**.
