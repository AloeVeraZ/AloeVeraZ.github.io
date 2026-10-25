# Optimization log

One entry per cycle, in the order they were run. Baseline numbers are in
[PERFORMANCE_BASELINE.md](PERFORMANCE_BASELINE.md), the overall picture in
[PERFORMANCE_REPORT.md](PERFORMANCE_REPORT.md). Every "before / after" here is
from one interleaved A/B run (`tools/perf/ab.ps1`), medians of the rounds
stated, on the hardware described in the baseline. "mac" is this Intel laptop
set up like a MacBook Air, not a MacBook.

Glossary: *dropped* is Chrome's own count of frames the page meant to show
and missed; *main frames* is how often the page's main thread got a frame,
which is how often the starfield can move; *composite* is the GPU process's
time spent drawing the screen, glass filters included.

---

## Cycle 0: tooling, audit and baseline

**Identified bottleneck:** none yet; nothing in the repository could measure
the site. The in-app browser pane suspends `requestAnimationFrame` when it is
not in front, so earlier sessions' numbers from it are unreliable.

**Implementation:** `tools/perf/` (PowerShell 5.1 and two small C# helpers,
nothing to install): a static server that answers like GitHub Pages, a
DevTools-protocol client that drives a private off-screen Chrome, a trace
reader, an A/B runner, screenshot capture with pixel diffs, a 24-screen layout
audit and a functional smoke test. `.claude/launch.json` (ignored) now points
at `tools/perf/serve.ps1`; the old server script had been deleted with the
temp folder it lived in.

**Result:** baseline recorded. Harness bugs found and fixed on the way: the
browser profile used to persist between runs, so a run that pressed the High
FX switch left a "manual" choice that every later run inherited; a cross-site
iframe's requests cannot be blocked from the page's session; Resource Timing
and the network log disagree on image counts (the network log is right about
requests, Resource Timing about what the page received).

**Next autonomous task:** find what the GPU process is doing.

---

## Cycle 1: what does each layer of the glass cost? (investigation)

**Identified bottleneck:** during a scroll the GPU process's main thread is
75-85% busy (84% of it on-CPU) and compositing is its largest item.

**Root-cause hypothesis:** the backdrop filters on every sheet of glass, and
within them the SVG displacement at the rim.

**Proposed modification:** ablations (each removes a piece of work, ignoring
looks) and cheaper recipes for the same look.

**Before / after (native, 2 rounds, scroll):**

| Arm | Late frames | Composite ms/s | GPU main thread |
| --- | --- | --- | --- |
| baseline | 10.3% | 383 | 80.8% |
| no glass at all | 3.9% | 132 | 62.2% |
| no rim bend (frost only) | 8.1% | 312 | 75.2% |
| no overlay blend on the rim | 9.3% | 402 | 79.4% |
| no shadows | 10.3% | 375 | 75.9% |

Idle on the projects: GPU 3D 42% with glass, 10% without. On the mac config
the bend was ~half of the glass cost (frost everywhere: composite 131 -> 42
ms/s at idle, 356 -> 231 while scrolling). A deterministic lab page
(`tools/perf/lab/glass-lab.html`, three cards and the bar over a background
redrawn every frame) put the recipes side by side, in GPU-main-thread ms per
frame: none 0.3, frost 1.5-1.8, an empty reference filter 1.5-2.4, the
current strips 3.0-3.7, one full-size map 2.3-2.5 (cheaper on the CPU, more
GPU fill: 71% vs 67%). Colour before the blur made it worse (8.3 vs 6.1 ms per
frame).

**Visual regression:** not applicable (no change adopted).

**Result:** Inconclusive for a change: no recipe is clearly cheaper for the
same pixels, so the strips stay. The bend is expensive but it is the High FX
look.

**Remaining opportunities:** fewer frames that need the glass re-filtered
(cycle 9); a smaller filtered area under each card's opaque picture.

**Next autonomous task:** the hover scenario's main-thread cost.

---

## Cycle 2: cursor glow restyling the whole card (rejected)

**Identified bottleneck:** style recalculation at ~122 ms/s while the cursor
moves over cards.

**Root-cause hypothesis:** `--card-glow-x/-y` and `--card-glow` are set on the
card as inherited custom properties, so each pointer move restyles all ~33
elements inside it.

**Proposed modification:** register them as non-inherited (`@property`,
initial values matching what shows at rest) and inherit them explicitly into
the card's `::after` glow.

**Before / after (hover, 3 rounds):** style 122 -> 107 ms/s (mac), 122 -> 115
(native); dropped 1.97% -> 1.82% (mac), 9.22% -> 10.41% (native).

**Visual regression:** not verified (rejected first).

**Result:** Reverted (never applied). Invalidation tracking showed the real
sources: the cursor's trail sparks (1,764 animation restyles in 5 s) and the
card's tilt transition restarting every frame. And on the native config hover
is GPU-bound (3D engine 91%), so main-thread savings would not have moved the
dropped frames.

**Next autonomous task:** the scroll pipeline.

---

## Cycle 3: content-visibility on the sections (rejected)

**Identified bottleneck:** the page gets only 12-25 main frames a second
while scrolling, with gaps up to 0.24-0.5 s, so the starfield's parallax
steps; 9-43 frames per scroll show content not yet rastered.

**Root-cause hypothesis:** `content-visibility: auto` keeps sections more than
about a screen away from being painted, so they can only be rastered just in
time, while the GPU process is busiest.

**Proposed modification:** `content-visibility: visible` (ablation).

**Before / after (mac, 3 rounds):** scroll dropped 7.95% -> 6.34%,
collections 18.0% -> 19.75%, missing-content frames unchanged.

**Result:** Rejected, no measurable effect.

**Next autonomous task:** what the sky draws during a scroll.

---

## Cycle 4: star tiles cut during the scroll (inconclusive)

**Identified bottleneck:** a full-page scroll handed the GPU process 13,182
canvas calls for the sky itself and 10,817 more to cut star tiles as they
came into view (1,000 stars per tile, one fill each), plus 2,980 for dust and
cluster bands. The GPU process's main thread is CPU-bound on exactly this kind
of work (canvas replay 98% on-CPU).

**Proposed modification:** cut two tiles ahead at each end while the page is
still, one per draw, so a scroll arrives at tiles that are ready.

**Before / after (mac, 4 rounds, scroll):** main frames 25.2 -> 26.2/s, p90
gap 92 -> 78 ms, worst gap 244 -> 210 ms, dropped 3.8% -> 4.5%. Tile fills
during the scroll fell 10,817 -> 7,661 and the sky got 48% more calls, i.e.
more frames.

**Result:** Inconclusive: a two-tile buffer runs out in a fast scroll, and the
gain is inside the noise. Not adopted; a larger buffer costs ~2.4 MB a tile.

**Remaining opportunities:** bake the tinyDistant tier (111 sprite draws a
live frame) into bands the way dust and clusters are; defer band rebakes
while scrolling.

---

## Cycle 5: the sections' reveal transform (inconclusive)

**Hypothesis:** each section keeps `transform: translateY(0)` after its reveal,
and the reveal's opacity animation re-layers the section mid-scroll.

**Before / after (mac, 3 rounds):** no reveal at all made scrolling worse
(dropped 5.85% -> 20.1%, main frames 22 -> 17/s): the leftover transform keeps
each section on a layer of its own, which spares Chrome re-layering. Dropping
only the leftover transform: 5.85% -> 3.01%, main frames 22.4 -> 25.3/s, inside
the noise.

**Result:** Inconclusive; nothing changed.

---

## Cycle 6: machines with no graphics acceleration start in Low FX (adopted)

**Identified bottleneck:** with no usable GPU (software compositing), High FX
ran with the page's main thread at 100%, 38-77% of frames dropped, for the
10-14 s the frame monitor takes to give up on it; and because that drop was
never remembered, every reload and every return from the policy pages did it
again.

**Root-cause hypothesis:** nothing told the page it was drawing in software.

**Proposed modification:** in the idle-time probe that already asks WebGL for
the renderer, ask with `failIfMajorPerformanceCaveat: true`; a refusal means
the browser would draw in software (or not at all), so start Low FX unless the
visitor chose High FX themselves. Ask within 0.5 s rather than 2 s. Remember a
lag downgrade in `sessionStorage` for the tab; switching High FX back on by
hand forgets it.

**Implementation:** `portfolio.js` (effects setup and `easeForIntegratedGraphics`).

**Before / after (lowend config, 2 rounds):**

| | Before | After |
| --- | --- | --- |
| Idle: main thread | 281 ms/s, 12.5 long tasks | 2 ms/s, 0 |
| Scroll: dropped | 39.0% | 9.8% |
| Scroll: main frames | 3.3/s | 33.8/s |
| Hover: dropped | 57.1% | 32.4% |
| Hover: long tasks | 53.5 | 2.5 |

Native (capable machine): identical behaviour, still eased for Intel graphics.

**Visual regression:** Pass (High FX unaffected; Low FX is the existing Low FX).
**Functional regression:** Pass (`smoke.ps1`, 20/20, with and without a GPU;
a manual High FX choice is honoured on a software machine).

**Result:** Improved.

**Remaining opportunities:** Low FX still frosts every sheet of glass, which a
software compositor pays for on every scrolled frame (9.8% dropped, hover
32%); a lighter Low FX for software-only machines would change its look.

---

## Cycle 7: a first visit no longer downloads hidden pictures (adopted)

**Identified bottleneck:** a cold load fetched 28 card pictures (1,745 KB at
2x, 3.6 MB at 3x) although the first screen shows none; 25 of them belong to
cards in collections that are closed.

**Root-cause hypothesis:** `loading="lazy"` did not hold back pictures inside
the collections' `hidden` content, so every card picture was requested the
moment the cards were built.

**Proposed modification:** cards in a collection carry their picture's address
as `data-src`/`data-srcset` until the collection is first opened, and then all
of that collection's pictures load at once (eagerly), so a turning ring never
shows a picture arriving, exactly as before.

**Implementation:** `portfolio.js` (`showDeferredPictures`, `createProjectCard`,
`renderProjectCollections`).

**Before / after:**

| First visit | Before | After |
| --- | --- | --- |
| mac: images / transferred | 28 images, 2,036 KB in total | 3 images, 535 KB in total |
| phone: requests / transferred | 44, 3,572 KB | 19, 642 KB |

Opening each collection now fetches its own pictures; with every collection
open the totals match the baseline (28 images, 1,745 KB).

**Visual regression:** Pass (pixel-identical captures; every visible card in
an opened ring had its picture within 1.5 s locally).
**Functional regression:** Pass.

**Result:** Improved.

---

## Cycle 8: the phone layout no longer jumps on load (adopted)

**Identified bottleneck:** CLS 0.34 on a phone's first load (desktop 0.011).

**Root-cause hypothesis (measured):** when the JSON arrived, (1) the hero
tagline in `index.html` was stale ("Robotics • CAD Design • Prototyping •
Autonomous Systems", two lines on a phone, against the JSON's one-line
"Robotics • CAD • 3D Printing • Programming") while the social icon row grew
from 0 to 44 px: everything below moved 19 px; (2) the About cards rendered
into an empty container (+462 px), pushing the visible top of Skills off the
screen. The cards' height varies from 314 to 512 px with the width, so no
fixed reservation could match it.

**Proposed modification:** sync the tagline; give the icon row its final 44 px
from the first paint; keep the sections below About (and the footer) hidden,
but laid out, until the data has rendered. An inline script sets the class
before the first paint (so nothing is hidden without JavaScript), and it
clears itself after 4 s whatever happens.

**Implementation:** `index.html`, `portfolio.css`, `portfolio.js`.

**Before / after:** CLS 0.342 -> 0 on the phone (two runs), 0.012 -> 0 on mac.

**Visual regression:** Pass. Document geometry is identical to the pixel at
1470x860 (height 4204, every section at the same offset), and the captures
match the baseline everywhere except a 30x2 px anti-aliasing variation
(<= 17/255) on the scroll indicator's 1 px bottom cap, whose geometry is
identical.
**Functional regression:** Pass.

**Result:** Improved.

---

## Cycle 9: the name in the bar was too small to tap (adopted)

**Identified bottleneck:** the layout audit (24 screens) found no overflow,
clipped text or type under 13 px anywhere, but on every touch screen the name
link at the left of the bar was 21-25 px tall, against the site's own rule
that everything pressed on a touch screen stands 44 px tall.

**Proposed modification:** on touch screens the link is `inline-flex`,
centred, 44 px tall. Its row already holds the 44 px menu button, so the bar
does not change size.

**Implementation:** `navbar.css`.

**Visual regression:** Pass (phone and tablet captures identical).
**Functional regression:** Pass.

**Result:** Improved. The audit's remaining note, the About and Skills links
on an iPad in landscape at 34-39 px wide, stays: they are 44 px tall and two
rems apart, which meets WCAG 2.5.8.

---

## Open findings, not yet acted on

- **YouTube player stalls the GPU thread for ~400 ms on every project open
  with a video.** As it starts, the player creates a WebGPU device; on this
  laptop's Direct3D 12 that holds Chrome's GPU main thread (402 ms wall, 29.5
  ms of CPU), and the page drops every frame meanwhile. Without the iframe the
  open/scroll/close drops 4-5% instead of 16-20%. Chrome has no
  permissions-policy switch for WebGPU (79 features, none for it). The feature
  videos autoplay muted on open, so a click-to-play stand-in would change the
  behaviour. Best fix: host those short silent clips as MP4/WebM files on the
  site (also removes the third-party request); next best: keep one player and
  switch videos in it, so the stall is paid once a visit.
- **Glass re-filtered by small layers at rest.** A feeding black hole under the
  bar (which the open-sky test does not count as glass) and a passing shooting
  star made the compositor redraw nearly the whole screen ~24 times a second.
  A correct fix splits the hole between its layer and the sky.
- **Scroll parallax still steps** on this laptop: the GPU process stays the
  bottleneck while scrolling (glass ~340 ms/s, sky ~170, tiles ~170).
