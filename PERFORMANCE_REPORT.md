# Performance report

What was changed to make the site run better on modest hardware without
changing how it looks, what was measured, and what is left. The starting
point is in [PERFORMANCE_BASELINE.md](PERFORMANCE_BASELINE.md), every
experiment with its numbers in [OPTIMIZATION_LOG.md](OPTIMIZATION_LOG.md), and
the tools that took the measurements in [tools/perf/](tools/perf/README.md).

## Medium as the default (25 October 2026, later)

Medium no longer frosts or bends anything: its glass is painted as the flat
sheet a blur of the still lattice comes out as, with the rim, sheen, lean,
light and rings kept, and the blue and warm washes behind it removed. New
visitors start there, including computers without graphics acceleration;
High is only chosen on the slider. Below High the glass rims are drawn
without a mask, the scroll indicator no longer repaints on every scrolled
frame, and nothing of a higher level is left running or held after a
switch (cycles 21-24 in the optimization log). The Medium numbers in the
tables further down are from before this change.

| | Medium before | Medium now | Low now |
| --- | --- | --- | --- |
| This laptop (3x), scroll: frames dropped | 27.6% | 6.0% | 5.9% |
| This laptop (3x), cursor over the cards: dropped | 18.6% | 1.8% | 1.5% |
| No graphics acceleration, scroll: dropped | 26.3% | 1.0% | 0.5% |
| No graphics acceleration, cursor over the cards: dropped | 48.5% | 0.7% | 7.5% |
| At rest after leaving High: frames asked for | - | 0 | 0 |

## Three effects levels (25 October 2026)

The High/Low FX switch became a slider with three stops: Low on the left,
Medium in the middle, High on the right. Cycles 14-19 in the optimization log
have the detail; the summary is here.

- **High is unchanged.** With a fixed test pattern in place of the sky,
  every High FX screenshot on a MacBook-sized screen, a tablet and a phone
  equals the original's, apart from the slider's own 188 x 56 px and the open
  project's animated picture (which differs between two captures of the
  original too). Its costs match the original's, or come in under them, in
  every measured scenario (tables below); the one clear difference, less of
  the page's main thread at rest at MacBook size, held in both rounds and
  was not looked into further.
- **Medium is the glass without the sky.** Frost, rim, the bend at the rim,
  the cards leaning and the rings turning, over a still backdrop: the
  lattice, soft light in the sky's colours, a few faint stars and the veil.
  Nothing is drawn while nothing moves.
- **Low is the page at its plainest.** The lattice, the glass as a denser
  sheet with no frost, a solid bar, no lean and no rings. It is the cheapest
  level everywhere it was measured, and the only one that scrolls at 60 fps
  on this laptop.
- **The level is picked before the first paint** by a short script in the
  head of `index.html`, so a saved Low or Medium never sets the sky up.
  New visitors: High, or Medium if they ask for reduced motion, or Low on
  under four threads, under 4 GB or Data Saver, and Low once the page finds
  no graphics acceleration. A choice on the slider is saved and never
  changed for the visitor. When the page picked the level, the frame monitor
  eases the sky, then the glass, then steps High to Medium to Low, and says
  so under the slider.
- **Leaving High stops the sky at once** (no frame asked for, nothing
  composited) and hands its memory back 15 seconds later: 78 MB of canvases
  at 2x down to 0.2 MB, and the page's heap from 12 to 2 MB. Coming back
  within those 15 seconds costs no dropped frames; after them, one rebuild of
  about a tenth of a second while the sky is still invisible. Twenty round
  trips left heap, canvases, nodes and listeners where they were.
- **No Mac or phone was measured.** As before, "mac" is this Intel laptop at
  a MacBook's size and scale and "phone" a phone-sized window with the
  processor slowed; neither says what the real hardware does, and nothing
  here claims 60 fps on it.

What was measured, as medians of interleaved rounds (three on this laptop's
own screen, two elsewhere). The machine was carrying other work through
most of these, so compare columns within a table, not across tables:

**This laptop as it is** (1280 x 720 at 3x, Intel Iris Xe; High's sky runs
eased here):

| | Original | High | Medium | Low |
| --- | --- | --- | --- | --- |
| At rest, top of page: page's main thread | 110 ms/s | 106 ms/s | 0.2 ms/s | 0.2 ms/s |
| At rest, top of page: GPU 3D engine | 14% | 13% | 0% | 0% |
| At rest, projects: GPU 3D engine | 29.5% | 29.5% | 0% | 0% |
| Scroll: frames dropped | 19.4% | 15.1% | 20.3% | 0% |
| Scroll: frames shown a second | 45.5 | 48.3 | 43.9 | 59.4 |
| Scroll: graphics process, share of a core | 169% | 160% | 173% | 38% |
| Cursor over the cards: frames dropped | 8.6% | 8.4% | 16.0% | 10.7% |
| Cursor over the cards: GPU 3D engine | 90% | 91% | 96% | 17% |

Low's cursor row is a few frames out of a dozen a second: nothing leans or
lights up there, so there is little to draw. Medium's cursor row is the one
result that runs the wrong way; see "What is left" below.

**MacBook-sized** (1470 x 860 at 2x, the page told it has Apple graphics, so
High's sky runs at its full rate):

| | Original | High | Medium | Low |
| --- | --- | --- | --- | --- |
| At rest, projects: page's main thread | 187 ms/s | 127 ms/s | 5.5 ms/s | 2.8 ms/s |
| At rest, top of page: graphics process | 34% | 31% | 0.1% | 0.1% |
| Scroll: frames dropped | 17.0% | 29.9%* | 24.4% | 0% |
| Scroll: frames shown a second | 48.0 | 39.8* | 42.0 | 59.2 |
| Cursor over the cards: frames dropped | 24.7% | 26.5% | 22.6% | 5.9% |
| Cursor over the cards: frames shown a second | 36.4 | 34.9 | 38.0 | 13.0 |

\* One round of 18.1% and one of 41.7%, with four long tasks on the page's
main thread. Three more rounds of High against the original alone, on a
machine busy with other work, came out level: High dropped 30.0, 44.3 and
41.4% where the original dropped 33.6, 46.5 and 33.8%.

**No graphics acceleration** (software compositing, processor slowed 4x).
The original and the new page both start in Low here, so what matters is
what a visitor gets by choosing Medium by hand:

| | Original (starts Low) | New (starts Low) | Medium, chosen |
| --- | --- | --- | --- |
| Scroll: frames dropped | 2.2% | 4.3% | 34.5% |
| Cursor over the cards: frames dropped | 12.4% | 12.5% | 65% |

**Phone-sized** (390 x 844 at 3x, processor slowed 4x). The harness's frame
counts for Low and Medium here are not usable (it saw under one frame a
second presented while the page drew fifty), so only the page's main thread
is given:

| | Original | High | Medium | Low |
| --- | --- | --- | --- | --- |
| At rest: page's main thread | 446 ms/s | 444 ms/s | 2.3 ms/s | 2.4 ms/s |
| Scroll: page's main thread | 960 ms/s | 971 ms/s | 713 ms/s | 688 ms/s |

**What is left**

- **Medium under the cursor on this laptop's own screen** drops about twice
  High's share of frames, though it draws no sky. At MacBook size it does
  not (it is level with High or ahead). Twelve experiments and a trace did
  not find the cause (cycle 19): the same layers, passes and damage, with
  Medium's root pass taking about 1.5 ms longer a frame. Frost-only glass
  would make Medium the lightest of the three under the cursor (51 frames a
  second against High's 40 at MacBook size) at the cost of the bend.
- **Medium chosen by hand on a computer with no graphics acceleration** is
  slow (a third of frames dropped scrolling). Such computers start in Low
  and are only in Medium if their visitor puts them there.
- **The first return to High** after 15 seconds below it rebuilds the sky:
  one or two frames of about 100 ms, while the sky is still faded out.

## In short (the earlier performance work)

- **The look is unchanged.** Glass, the bend at its rim, the sky and its
  motion, type and layout are what they were. Screenshots of the main states on
  a MacBook-sized screen, a tablet and a phone, with a fixed test pattern in
  place of the sky, match the original's to within 2/255, apart from the open
  project's animated picture (which differs between any two captures). The
  one other
  difference has to be looked for: the sky no longer moves behind an open
  project, where it shows through at a sixteenth of its light (at most 7/255
  between two frames a second apart).
- **No Mac was measured.** There was no Apple hardware to test on. The "mac"
  numbers are this Windows laptop (Intel Iris Xe) at a 13-inch MacBook Air's
  screen size and 2x scale, with the page told it runs on Apple graphics. They
  show the shape of the load, not what a MacBook Neo or Air does, and nothing
  here claims 60 fps on one.
- **What measurably improved** (each from an interleaved A/B on this laptop):
  - A computer with no graphics acceleration now starts in Low FX instead of
    spending ten seconds or more as a slideshow on every visit (dropped
    frames while scrolling 39% -> 10%, the page's main thread at rest 281 ->
    2 ms a second), and its Low FX uses the denser sheet in place of frost,
    which takes a scroll from 8.5% to 0.5% dropped and the cursor across the
    cards from 29% to 8%. This is the one place anything looks different on
    purpose: Low FX, on computers that cannot draw frost.
  - A first visit downloads 3 card pictures instead of 28 (on a phone, 19
    requests and 642 KB instead of 44 and 3.6 MB).
  - The phone layout no longer jumps as the page loads (CLS 0.34 -> 0).
  - Only the first project with a video freezes the screen, once a visit,
    instead of every one (two projects opened and scrolled: 32% -> 25% of
    frames dropped at 3x).
  - A project left open costs nothing: no frames drawn, the GPU idle, where
    the sky behind it used to keep 16% of the GPU and a tenth of the page's
    main thread busy. Scrolling a project takes half the GPU work it did.
  - On touch screens the name in the bar is now 44 px tall and the short
    section links on an iPad 44 px wide, like every other control, with
    nothing moved.
- **What still limits the site** on this laptop is the graphics process
  during a scroll and a card hover at 3x, the burst of raster when a project
  opens or closes, and the first video of a visit (ranked below).

## The hardware, and what the numbers can stand for

| Config | Screen | Stands in for |
| --- | --- | --- |
| `mac` | 1470 x 860 at 2x | A 13-inch MacBook Air (a guess at the shape of the load) |
| `native` | 1280 x 720 at 3x | This laptop as it is: Intel Iris Xe, a 3840 x 2400 screen |
| `lowend` | 1366 x 650 at 1x | No graphics acceleration, CPU slowed 4x |
| `phone` | 390 x 844 at 3x | A phone's main thread (CPU slowed 4x); says nothing about a phone's GPU |

Other load on the machine moved results by 10-30% between runs, and more over
a day: by the evening, with other apps busier, the untouched original page
dropped 20% of frames scrolling on the `mac` config against 2.4% that morning
(and the changed page the same 22%, side by side with it). So every
comparison was run as an A/B, the two versions alternating round by round,
and is quoted as medians; numbers taken at different times do not compare. Iris Xe is in the class of a base M1 GPU for raw
throughput, but Chrome on macOS draws through Metal with less driver overhead
than Direct3D here, and an M-series CPU is faster per core: on a MacBook the
same page should have more headroom, not less, but that is an expectation,
not a measurement.

## What changed

| Change | Where | Measured |
| --- | --- | --- |
| A browser with no graphics acceleration starts in Low FX (asked of WebGL with `failIfMajorPerformanceCaveat`), and a drop to Low FX for lag is kept for the tab | `portfolio.js` | lowend: scroll dropped 39.0% -> 9.8%, main frames 3.3 -> 33.8/s; at rest 281 -> 2 ms/s on the main thread |
| Cards in closed collections hold their pictures back until the collection opens | `portfolio.js` | first visit 28 -> 3 pictures; mac 2,036 -> 535 KB; phone 3,572 -> 642 KB |
| The tagline matches the data, the icon row has its height from the first paint, and the sections below About wait (laid out, hidden) for the data | `index.html`, `portfolio.css`, `portfolio.js` | CLS 0.342 -> 0 (phone), 0.012 -> 0 (mac) |
| The name in the bar is 44 px tall on touch screens, and the section links on a touch screen wide enough for the desktop bar are at least 44 px wide | `navbar.css` | name 21-25 -> 44 px tall; "About" and "Skills" on an iPad 39 and 34 -> 49 and 44 px wide; no pixel moved |
| The page holds a graphics adapter once the first YouTube player has loaded, so later players do not rebuild Chrome's Direct3D 12 device | `portfolio.js` | three video projects opened in a row: three ~400 ms freezes -> one; `modal` dropped 32.5% -> 24.8% (native), 19.7% -> 15.8% (mac) |
| The sky parks behind an open project once its overlay has faded in, and wakes as it closes | `portfolio.js` | project left open: 25 frames/s -> 0, GPU 3D 16% -> 0%; project scrolled: GPU main thread 30% -> 16% (native), 27% -> 15% (mac) |
| Low FX on a computer with no graphics acceleration uses the denser sheet the site gives browsers that cannot frost, instead of frost | `portfolio.css`, `navbar.css` | lowend: scroll dropped 8.5% -> 0.5%, cursor across cards 29.0% -> 7.9% |

## What was tried and not kept

| Idea | Result |
| --- | --- |
| Cheaper recipes for the glass (one full-size displacement map, colour before the blur, no overlay blend) | none cheaper for the same pixels; the bend is about half of the glass's cost and it is the High FX look |
| Cursor glow properties registered as non-inherited, to stop a card restyling all it holds | inside the noise: the cost was the cursor's sparks and the tilt transition, and hover is GPU-bound at 3x anyway |
| `content-visibility: visible` on the sections | no measurable effect |
| Star tiles cut ahead of a scroll | inside the noise; a fast scroll outruns any buffer worth its memory |
| Star tiles cut on a software canvas, so the GPU process gets one picture instead of a thousand fills | the GPU process's canvas time fell, its tile raster rose as much; no fewer dropped frames |
| No reveal transform on the sections | worse without it: the leftover transform keeps each section on a layer of its own |
| Glass left on under an open project (no toggling at the open and close) | no measurable difference to the bursts |
| Baking the distant smudges into bands like the dust | not exact: each fades in screen space under the bar, which a baked band cannot follow |

## What still costs the most

Ranked by how many visitors meet it and how much it shows, against how much
it would take to fix. None of these was left for lack of time: each is either
a trade the look does not allow, a decision for the owner, or a rewrite.

1. **Scrolling, at 3x on an integrated GPU.** The graphics process is the
   bottleneck (glass ~340 ms a second, sky ~170, page tiles ~170), so the
   page gets a main frame only 12-25 times a second and the sky's parallax,
   which moves only on main frames, steps while the page glides. The page
   drops few frames (2-10%); the steps are in the sky. A fix that keeps the
   look would move the parallax onto the compositor (each depth of the sky on
   a layer of its own, moved by a scroll-driven animation), a rewrite of the
   sky's renderer. On a MacBook at 2x the load is about half the pixels.
2. **Opening or closing a project** drops frames for ~0.75 s at 3x while the
   sheet's content (opening) or the page (closing) is rasterized. Raster of
   content the page shows; no change found that would not alter it.
3. **The cursor over the featured cards** at 3x: the tilted card's glass is
   re-filtered every frame (91% of the 3D engine). Inherent to the glass.
4. **The first project with a video**, once a visit, on Windows: ~400 ms
   frozen while Chrome builds a Direct3D 12 device for Google's anti-abuse
   script in the player. Gone if the three autoplaying clips were served from
   the site and the other videos only loaded when pressed (both change how
   the videos are hosted or behave, so they are your call).
5. **Small layers at rest.** A feeding black hole under the bar and a
   shooting star elsewhere are drawn on small layers of their own, but the
   compositor redraws one rectangle around everything that changed, so the
   two together make it re-filter most of the glass on the screen. A fix
   splits the hole's drawing between its layer and the sky.
6. **The cursor over the cards on a computer with no graphics acceleration**
   still drops 8% of frames in Low FX: what is left is the page's own drawing
   of the hover, on a processor slowed four times.

## How the look and behaviour were checked

- `tools/perf/capture.ps1 -TestPattern` photographs the hero, About, Skills,
  the projects, a hovered card, an open ring, Contact and an open project on
  each screen, with a sharp fixed pattern in place of the sky, and diffs them
  pixel by pixel against the same shots of the original commit.
- `tools/perf/layout-audit.ps1` loads the page on 24 screens, from folding
  phones to 4K: no sideways scrolling, clipped text, type below 13 px or tap
  target under 44 x 44 px on any of them (0 of 24 with problems, after the
  name in the bar and the iPad section links were given room). Run again at
  each of the three effects levels: 0 of 24 at each, the slider included
  (the audit now skips text meant only for screen readers).
- A separate high-effort review of everything changed found three problems,
  fixed before the last runs (see the end of the optimization log).
- `tools/perf/smoke.ps1` clicks through the page as a visitor would, with and
  without graphics acceleration: 24 of 24 checks pass with it and 22 of 22
  without (the two that watch the sky rest behind a project and wake after
  need it), each of the slider's three levels among them. No script errors,
  console errors or failed requests.
- The three levels were checked further with scratch scripts against a
  private Chrome (cycles 14-19 in the optimization log): what each level
  draws and allocates, the sky fading out and in, its memory released, 20
  round trips with no growth, a dozen switches in a row, the level kept
  across reloads and pages, corrupted and blocked storage, the old switch's
  saved choice, reduced motion, and the frame monitor's step-downs under a
  slowed processor. 32 of 32 pass.

## Checking on a Mac

The scripts in `tools/perf/` are Windows-only, so a MacBook has to be checked
by hand, in Chrome:

1. Open the site in a fresh private window, wait 15 seconds, and look at the
   `<html>` element in DevTools (Elements). `data-effects="high"` with no
   `data-effects-pace` means the page's own frame monitor is satisfied;
   `eased` or `lighter` means it has slowed the sky or taken the bend off the
   glass, and `data-effects="medium"` or `"low"` with
   `data-effects-reason="lag"` that it stepped a level down. A level chosen on
   the slider shows `data-effects-reason="manual"` and is never changed.
2. In DevTools, Rendering, turn on Frame Rendering Stats, then scroll the
   page, hover the featured cards, open a project and turn an archive ring.
   The overlay's dropped-frame count is Chrome's own.
3. For more, record the same in the Performance panel and look at the
   Frames track for red (dropped) frames and the GPU track for long tasks.

## Decisions left to you

- Whether to serve the three short autoplaying clips from the site (MP4 or
  WebM) instead of YouTube, which removes the first freeze for those projects
  and one third-party request.
- Low FX now frosts nothing on any computer, and its bar is solid (cycles 14
  and 18), as the brief for the three levels asked. It is two short rules in
  `portfolio.css` and two in `navbar.css` if you would rather Low kept the
  frost on computers that can draw it.
- Whether Medium should keep the bend at the rim of its glass. It does now,
  as the brief for the levels asked. Frost alone made it the lightest level
  under the cursor (cycle 19) and is one line in `glass.js` (`pickMode`).
- Whether the slider is worth a line on the Updates page (V1.1 there
  announced the High/Low FX switch it replaces).
- The commits are local: pushing them publishes the site.
