# Performance report

What was changed to make the site run better on modest hardware without
changing how it looks, what was measured, and what is left. The starting
point is in [PERFORMANCE_BASELINE.md](PERFORMANCE_BASELINE.md), every
experiment with its numbers in [OPTIMIZATION_LOG.md](OPTIMIZATION_LOG.md), and
the tools that took the measurements in [tools/perf/](tools/perf/README.md).

## In short

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
  name in the bar and the iPad section links were given room).
- A separate high-effort review of everything changed found three problems,
  fixed before the last runs (see the end of the optimization log).
- `tools/perf/smoke.ps1` clicks through the page as a visitor would, with and
  without graphics acceleration: 22 of 22 checks pass with it and 20 of 20
  without (the two that watch the sky rest behind a project and wake after
  need it). No script errors, console errors or failed requests.

## Checking on a Mac

The scripts in `tools/perf/` are Windows-only, so a MacBook has to be checked
by hand, in Chrome:

1. Open the site, wait 15 seconds, and look at the `<html>` element in
   DevTools (Elements). `data-effects="high"` with no `data-effects-pace`
   means the page's own frame monitor is satisfied; `eased` or `lighter`
   means it has stepped the sky or the glass down, and `data-effects="low"`
   with `data-effects-reason="lag"` that it gave up on High FX.
2. In DevTools, Rendering, turn on Frame Rendering Stats, then scroll the
   page, hover the featured cards, open a project and turn an archive ring.
   The overlay's dropped-frame count is Chrome's own.
3. For more, record the same in the Performance panel and look at the
   Frames track for red (dropped) frames and the GPU track for long tasks.

## Decisions left to you

- Whether to serve the three short autoplaying clips from the site (MP4 or
  WebM) instead of YouTube, which removes the first freeze for those projects
  and one third-party request.
- Whether to keep the denser sheet in Low FX on computers with no graphics
  acceleration (cycle 13). It is two short rules, one in `portfolio.css` and
  one in `navbar.css`, if you would rather they frost as before.
- The commits are local: pushing them publishes the site.
