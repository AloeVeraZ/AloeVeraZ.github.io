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

## Cycle 10: only the first video of a visit freezes the screen (adopted)

**Identified bottleneck:** every project opened with a YouTube video froze
the screen once, 1.0-1.4 s after the click: 452, 404 and 421 ms of the GPU
process's main thread (45-56 ms of it on the CPU) for three opens in a row,
the same project the second time as much as the first. A project without a
video opened with no freeze.

**Root-cause hypothesis (measured):** a DevTools probe attached to the
players' frames found the caller: every player loads Google's anti-abuse
script (`google.com/js/th/...`), which calls
`navigator.gpu.requestAdapter({ powerPreference: 'low-power' })` and reads the
adapter's name, and nothing more. Chrome answers by building a Direct3D 12
device on the thread that draws every frame. When the sheet closes, the
players' process goes, nothing holds the device, and the next player builds
it again. Two players in one sheet freeze once, not twice (their requests
wait on the same build). With the page itself holding an adapter from the
start, no open froze: four in a row 2 s apart, or three 15 s apart.

**Proposed modification:** when the first YouTube player of a visit loads
while its project is open, the page asks for an adapter itself, with the same
low-power preference, and keeps it. The first video still pays, at the moment
it paid before; every one after it is answered at once.

**Implementation:** `portfolio.js` (`holdGraphicsAdapter`, called from each
sheet iframe's `load`).

**Before / after:** three projects with videos and one without, opened in a
row (native): three freezes -> one, 383 ms, on the first open. Two projects
opened, scrolled and closed (`modal`, three rounds, every run with the change
better than every run without):

| | native before | native after | mac before | mac after |
| --- | --- | --- | --- | --- |
| Dropped frames | 32.5% | 24.8% | 19.7% | 15.8% |
| Frames presented | 260 | 337 | 322 | 337 |
| Frame time, 99th percentile | 413 ms | 133 ms | 109 ms | 103 ms |
| GPU main thread busy | 70.7% | 66.7% | 60.5% | 53.6% |

The page still comes back whole from the back/forward cache with the adapter
held (checked by going to the privacy page and back).

**Visual regression:** Pass (nothing drawn changes).
**Functional regression:** Pass.

**Result:** Improved. The first video of each visit still freezes once (see
the open findings).

---

## Cycle 11: the sky rests behind an open project (adopted)

**Identified bottleneck:** with a project open and nobody touching anything
(the new `modal-idle` scenario), the page still put 14-28 frames a second on
the screen, with the GPU's 3D engine 9-24% busy and the page's main thread
70-115 ms a second, for as long as the reader stayed.

**Root-cause hypothesis:** the sky went on drawing itself under the overlay.
The overlay is 94% opaque, and glass.js already takes the glass off under it
once it has faded in, so each of those frames composited the whole screen
for a sixteenth of the sky's light.

**Proposed modification:** once the overlay has faded in (260 ms, the same
moment glass.js uses), park the sky's loop with its last frame in place, and
wake it the moment the project closes, so it is moving again, from where it
stopped, before the overlay has faded out.

**Implementation:** `portfolio.js` (`underProject` in the sky).

**Before / after (three or four rounds, against the page with cycle 10
only):**

| | native before | native after | mac before | mac after |
| --- | --- | --- | --- | --- |
| Project left open: frames drawn | 25.5/s | 0 | 22.7/s | 0 |
| Project left open: GPU 3D engine | 15.7% | 0% | 15.9% | 0% |
| Project left open: GPU process CPU | 17.1% | 1.8% | 19.3% | 0.4% |
| Project left open: page main thread | 106 ms/s | 7 ms/s | 96 ms/s | 9 ms/s |
| Project scrolled: dropped frames | 0 | 0 | 0 | 0 |
| Project scrolled: GPU main thread busy | 30.5% | 15.7% | 27.0% | 14.8% |
| Project scrolled: page main thread | 182 ms/s | 64 ms/s | 154 ms/s | 70 ms/s |

The open-scroll-close scenario (`modal`) reads worse as a percentage (36.5%
-> 50.3% native, 24.0% -> 29.6% mac) because the screen is no longer redrawn
while nothing changes: the frames that were dropped are the same ones (a
median of 169 vs 193 native, 106 vs 106 mac, inside run-to-run spreads of
117-284), out of fewer frames drawn. Both versions burst the same way at the
open and the close (below).

**Visual regression:** Pass, with one difference that has to be looked for.
Any single frame is unchanged; what stops is the sky's motion seen through
the overlay. Two screenshots of an open project a second apart (mac screen)
differed before in 0.6% of the pixels, by at most 7/255 (twinkling stars, a
shooting star's trail, the edge of a nebula, all outside the sheet), and
after by at most 1/255.
**Functional regression:** Pass. `smoke.ps1` now checks that the sky's canvas
is still behind an open project and changes again once it closes (22/22).

**Result:** Improved.

---

## Cycle 12: star tiles cut on a software canvas (rejected)

**Identified bottleneck:** cutting a band of deep-field stars hands the GPU
process a thousand separate fills, on the thread a scroll is waiting on
(cycle 4).

**Root-cause hypothesis:** cut on a canvas the browser keeps in memory
(`willReadFrequently`), the fills would be drawn by the page's own process
and the GPU process would only receive the finished band.

**Before / after (scroll, four rounds):** mac dropped 21.5% -> 27.4% (31 ->
39.5 frames), native 22.3% -> 21.8%. The GPU process's canvas time fell as
expected (121 -> 86 ms/s mac, 96 -> 66 native), but its tile raster rose by
about as much and the page's own main thread by 10-15 ms/s.

**Result:** Rejected; not applied.

---

## Cycle 13: Low FX without frost where nothing can draw it (adopted)

**Identified bottleneck:** on a computer with no graphics acceleration, which
since cycle 6 starts in Low FX, a scroll still dropped one frame in twelve
and the cursor crossing the cards one in three, with the GPU process (doing
its work on the processor) at 70% of a core while scrolling.

**Root-cause hypothesis:** Low FX still frosts every sheet of glass, and a
software compositor works out each blur again on every frame that moves.

**Proposed modification:** there, and only in Low FX, give the glass the
denser sheet the site already gives a browser that cannot frost at all
(`--glass-surface-dense`, 84% opaque), with no backdrop filter, and the bar
the same sheet the open menu uses. High FX switched on by hand frosts as
before, and no machine with working graphics acceleration is affected.

**Implementation:** `portfolio.css`, `navbar.css`
(`html[data-effects="low"][data-effects-renderer="software"]`).

**Before / after (lowend, three rounds; the same rules laid over the page as
a stylesheet):**

| | Before | After |
| --- | --- | --- |
| Scroll: dropped | 8.5% (17 frames) | 0.5% (1) |
| Scroll: GPU process CPU | 71.7% | 35.8% |
| Cursor across cards: dropped | 29.0% (36) | 7.9% (9) |

**Visual regression:** a change, by design, in Low FX on those machines only:
the cards become the denser dark sheet instead of frosted glass, and what
scrolls under the bar shows through faintly instead of blurred (the look
such a browser always had). High FX, and Low FX anywhere with graphics
acceleration, unchanged.
**Functional regression:** Pass (`smoke.ps1 -Software`, 20/20).

**Result:** Improved.

---

## Final checks and review

- **The iPad nav links (cycle 9's leftover).** On touch screens wide enough
  for the desktop bar the section links now take five pixels more on each
  side, lent back by their margins (`navbar.css`). The 24-screen audit passes
  everywhere (0 of 24 with problems), and captures of a sideways iPad match
  the version before to the pixel. The audit's text-overflow check now
  measures the words themselves, not the element's box, which the borrowed
  margin had tripped.
- **Look.** Every High FX shot (test pattern, mac, tablet and phone) and
  every Low FX shot matches the original commit, re-captured the same day,
  to within 2/255, except the open project's animated picture. Single
  captures do vary: two captures of the unchanged original differed by up
  to 22/255 inside one photo, and one hover shot taken while the machine was
  busy caught the card mid-lean, so a difference is re-taken before it is
  believed. The 30 x 2 px sliver noted in cycle 8 was one of those.
- **Independent review** (a separate high-effort pass over everything since
  `47e16a0`) found three things, fixed: the no-graphics check only ran on
  machines that started in High FX, so one that started in Low FX for
  another reason kept its frost (it is asked in Low FX too now); a video's
  frame loading the browser's offline error page held an adapter for no
  player (skipped while offline); and the four-second cap on the hidden
  sections let a slow connection's layout shift back (it now waits up to ten
  seconds while the data is on its way). Left as they are: an adapter held
  across a GPU process crash is not renewed (rare, and the cost is only the
  old behaviour), and the glass selector list now appears four times in
  `portfolio.css` (folding them together would rewrite the High FX rules).

---

## Open findings, not yet acted on

- **The first project with a video, in each visit, still freezes the screen
  for ~400 ms** (cycle 10). Chrome has no permissions-policy switch for WebGPU
  (79 features, none for it), so the players cannot be kept from asking.
  Removing the last freeze needs players that are not YouTube's: the three
  short silent clips that autoplay could be served from the site as MP4/WebM
  (which also removes a third-party request), but the other embedded videos
  would still be YouTube players unless they loaded only when pressed, which
  changes how they behave (and on iPhones takes a second tap).
- **Opening or closing a project drops frames for about three quarters of a
  second** at 3x on this laptop (20-40 at the open, 10-16 at the close, with
  or without a video). The GPU process's main thread spends 380-700 ms a
  second rasterizing tiles (the sheet's own content as it opens, the page
  under it as it closes) on top of compositing the fade. Leaving the glass on
  under the sheet, so glass.js toggles nothing, made no measurable difference
  in two runs each, so the toggling is not the cost; the raster is of content
  the page shows. Not acted on.
- **Glass re-filtered by small layers at rest.** A feeding black hole under the
  bar (which the open-sky test does not count as glass) and a passing shooting
  star made the compositor redraw nearly the whole screen ~24 times a second.
  A correct fix splits the hole between its layer and the sky.
- **Scroll parallax still steps** on this laptop: the GPU process stays the
  bottleneck while scrolling (glass ~340 ms/s, sky ~170, tiles ~170).
