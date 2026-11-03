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

---

# Three effects levels (25 October 2026)

The two-position High/Low FX switch became a three-stop slider: Low, Medium
(the liquid glass over a still backdrop, no sky) and High. The cycles below
are the build of it and what checking it turned up, in the order they ran.
Tools: `tools/perf/` as before, plus scratch scripts that drove a private
Chrome the same way (switching, memory, the frame monitor).

---

## Cycle 14: three levels, chosen before the first paint (adopted)

**Identified bottleneck:** the switch had two settings, so a visitor who
wanted the glass had to take the sky with it, and the sky is the continuous
cost: it draws 15-60 times a second and every sheet of glass over it is
filtered again each time it does.

**Proposed modification:** a middle level that keeps the glass whole (frost,
rim, the bend at the rim, card tilt, the 3D rings) over a still backdrop, and
puts the sky away entirely rather than hiding it. The level is decided by a
script in `index.html`'s head and written to `html[data-effects]` before
anything is drawn, so a saved Low or Medium never sets the sky up at all.
Every glass and ring rule that was `html[data-effects="high"]` became
`html:is([data-effects="medium"], [data-effects="high"])` (the same
specificity, so the cascade is unchanged); the sky, the cursor's dot and
sparks and the touch physics stay High-only. Low lost its frost everywhere
(it had already lost it on machines without graphics acceleration in cycle
13) and the bar went solid. The frame monitor steps a level the page picked
down High to Medium to Low; a level chosen on the slider is never changed,
apart from the sky's pace on built-in graphics.

**Implementation:** `index.html` (head script, slider markup), `portfolio.js`
(level model, slider, monitor ladder, sky fade and release), `glass.js`
(Medium refracts in Chromium and frosts elsewhere), `portfolio.css`
(Medium backdrop, Low sheet), `navbar.css` (the slider, Low's bar).

**Result:** see cycles 15-19 for what checking it found.

---

## Cycle 15: High's bar lost its bend (regression, fixed)

**Identified bottleneck:** `capture.ps1 -TestPattern` against the original
commit: every High FX shot matched except a band along the top and foot of
the bar, up to 228/255 apart.

**Root-cause hypothesis:** with the level set in the head, `glass.js` sees
High the moment it runs and hangs the bar's filter before it has tracked the
bar as on screen; the filter is only shown on something in view, and is not
offered again until the bar changes size. Before, the page set the level
later, so the bar was tracked first.

**Proposed modification:** track the bar before the mode is first applied.

**Before / after:** the bar's `backdrop-filter` read `blur(4px) saturate(1.4)
brightness(1.06)` with no `url(#liquid-glass-1)`; after, the same filter and
map (1430 x 56, scale 18.12) as the original. Re-captured: every mac, tablet
and phone shot equals the original except the slider's own 188 x 56 px, and
the open project's animated picture (the original differs from itself there
by the same 15-16%).

**Result:** Fixed.

---

## Cycle 16: Medium kept 17 MB of the sky (fixed)

**Identified bottleneck:** after leaving High, 166 canvases holding 17.4 MB
stayed alive (a `createElement` hook with weak references, read after a
forced garbage collection): the sky's galaxy, light and black-hole sprites.

**Root-cause hypothesis:** each tier keeps lists cut from its objects
(`liveObjects`, `baseObjects`, `restObjects`), and the event and spark pools
keep their last targets; emptying `tier.objects` freed none of them.

**Proposed modification:** empty those lists and replace the pool entries
when the sky is released.

**Before / after (mac size, 2x):** canvases alive in Medium 166 / 17.4 MB to
4 / 0.17 MB (the empty sky canvas and its two layers, and glass.js's spare
300 x 150 buffer); JS heap 11.9 to 1.9 MB.

**Result:** Fixed.

---

## Cycle 17: coming back to High rebuilt the sky (adopted)

**Identified bottleneck:** with everything released on the way out, each
return to High dropped two or three frames of 60-100 ms (in-page frame gaps
and Long Animation Frames), where the original's switch dropped none.

**Root-cause hypothesis:** a profile of the switch: `buildScene` 92 ms of
script (segments 66, galaxy sprites 39), then the first frames re-cutting the
full-screen sheets and star tiles.

**Proposed modification:** put the sky away at once (no frame asked for, the
canvas not composited) but keep what it is made of for 15 seconds, then
release it all. The slider's fill moves by transform, like its thumb, so
neither stalls if the page is busy as a level is chosen.

**Before / after (in-page frame gaps, mac size):**

| Switch | Released at once | Kept 15 s |
| --- | --- | --- |
| Medium to High, within 15 s | 67-83 ms, 2-3 late frames | 17 ms, none late |
| Medium to High, after 15 s | 67-83 ms, 2-3 late frames | 100 ms and 67 ms (one rebuild, behind the fade-in) |
| 20 High/Medium round trips | - | heap 12.5 to 12.3 MB, canvases 196 to 196, nodes and listeners unchanged |

**Result:** Improved. The sky's memory (78 MB at 2x) is back 15 seconds after
leaving High.

---

## Cycle 18: Low's bar showed what scrolled under it (fixed)

**Identified bottleneck:** with no frost in Low, the cards' labels sliding
under the bar showed through its 84% sheet and crossed the links.

**Proposed modification:** the bar solid in Low (`#111317`), as it already is
for visitors who ask for less transparency. The cards keep the 84% sheet:
they only ever lie over the lattice.

**Result:** Fixed.

---

## Cycle 19: Medium cost more than High under the cursor (investigated, not resolved)

**Identified bottleneck:** on this laptop's own screen (3x, Intel Iris Xe),
Medium dropped more frames than High with the cursor moving over the
featured cards in every one of nine interleaved runs -- nearly twice
High's share on a quiet machine, a fifth more on a loaded one -- though it
draws no sky. Scrolling cost the same at both levels, and at rest Medium
costs nothing.

**What was tried** (hover, two interleaved rounds each; the High and Medium
arms in each row ran beside it):

| Change | Dropped | High / Medium alongside |
| --- | --- | --- |
| Medium's backdrop one opaque layer | 14.2% | 8.2 / 16.4 |
| No backdrop at all | 13.6% | 8.4 / 15.9 |
| The lattice without its light | 15.6% | 8.4 / 15.9 |
| A still canvas behind the glass, as the sky is | 15.8% | 8.6 / 15.9 |
| The backdrop forced onto a layer of its own | 14.7% | 8.6 / 15.9 |
| High without its cursor dot | 10.3% | 9.3 / 17.0 |
| High with its sky hidden (still running) | 12.0% | 9.3 / 17.0 |
| Medium with the system cursor hidden | 16.6% | 9.6 / 16.5 |
| High with the system cursor shown | 8.9% | 9.6 / 16.5 |
| Medium asking for every frame (an empty loop) | 16.0% | 9.3 / 16.2 |
| Medium with steady GPU work added* | 46.8% | 37.7 / 46.8 |
| Medium without the card lean* | 41.7% | 37.2 / 45.0 |

\* The machine was carrying heavy outside load for these two (every arm two
to five times worse); only the comparison within the run counts.

A trace of one hover at each level: the same five render passes a frame,
the same full-screen damage, the same overlay handling and the same layer
tree (the sky's canvas in High where Medium has its backdrop). Medium's
root pass draws fewer quads (27 against 29) and takes longer (5.8 against
4.3 ms a frame); every glass pass is identical.

**At MacBook size** (2x, the page told it runs on Apple graphics, so High's
sky runs at its full rate): Medium shows 42.3 frames a second under the
cursor against High's 39.9, and drops 21.0% scrolling against 18.4%, inside
the noise. Medium with frost and no bend (`window.__glassForce = 'frost'`)
shows 51.1 frames a second and drops 15.5%.

**Result:** not resolved. The gap belongs to this laptop's 3x screen, where
High's sky is eased for Intel graphics; at MacBook size Medium matches or
beats High. Medium keeps the bend the brief asks for. Frost alone is the
lightest Medium measured, and is what the frame monitor already falls back
to on a struggling machine whose level the page picked.

---

## Cycle 20: each level against the original (measured)

**Before / after:** the original commit against the new page at each level,
interleaved round by round (three rounds on this laptop's own screen, two on
the other configs). The tables are in the performance report. In short:

- **High** matches the original in every scenario, or comes in under it.
  At MacBook size the page's main thread at rest on the projects came in
  lower in both rounds (127 against 187 ms a second); not looked into.
  One MacBook-size scroll round of 41.7% dropped (four long tasks) was
  re-run as three more rounds of High against the original alone, which
  came out level (30.0, 44.3, 41.4 against 33.6, 46.5, 33.8%).
- **Medium** costs nothing at rest (0.2-5.5 ms a second of main thread, no
  frames, the GPU idle, against 14-30% of the GPU for High), scrolls level
  with High, and under the cursor is level with High at MacBook size and
  behind it on this laptop's own screen (cycle 19).
- **Low** scrolls at 59 frames a second with nothing dropped on this laptop
  (High 15-20% dropped), with the graphics process at 38% of a core against
  160-170%.
- **No graphics acceleration:** both pages start in Low there, as before.
  Medium chosen by hand drops a third of its frames scrolling.
- **Phone-sized, processor slowed 4x:** Low and Medium take the page's main
  thread at rest from 444 to 2.3 ms a second. The harness's frame counts for
  them were unusable there (under one frame a second presented while the
  page drew fifty), so only main-thread time is reported.

**Result:** Low and Medium improved everywhere they were measured, except
Medium under the cursor on this laptop's own screen; High unchanged.

---

## Final checks (three levels)

- `smoke.ps1`: 24 of 24 with graphics acceleration, 22 of 22 without, the
  slider's three levels, its saved choice and a slow visit's lower level
  among them.
- `layout-audit.ps1 -Level low|medium|high`: 0 of 24 screens with problems
  at each level, the slider measured as a control (the audit now skips text
  meant only for screen readers).
- `capture.ps1 -TestPattern` against the original: every High shot on a
  MacBook-sized screen, a tablet and a phone equal apart from the slider's
  188 x 56 px and the open project's animated picture.
- A scratch script against a private Chrome, 42 of 42: what each level draws
  and allocates, the sky fading out and in, its memory released after 15 s,
  20 round trips with no growth, a dozen switches in a row, the level kept
  across reloads, pages and tabs, corrupted and blocked storage, the old
  switch's choice carried over, reduced motion, and the pointer itself (a
  click on a stop, a drag that waits for the release, a tap that leaves
  focus alone, a press on the sparkle that does nothing, the word under it
  on hover). The frame monitor's step-downs were watched under a processor
  slowed 4x to 12x: High eased, then lighter, then Medium (8x, 10x) or
  straight to Low at the crawling floor (12x), each said under the slider
  and kept for the tab; under High chosen by hand it only slowed the sky.
- No script errors or console errors in any run. One console warning,
  that the preloaded Inter font was not used within a few seconds of load,
  appears with a phone-sized screen; the original commit gives the same
  one there (checked side by side), so it is not from this change.

---

# Medium made light enough for any machine (25 October 2026)

## Cycle 21: Medium frosts nothing, and is the default (adopted, not yet measured)

**Identified bottleneck:** the site felt laggy on this laptop at its default
(High), and Medium was no refuge: it dropped a fifth of a scroll's frames
here (20.3%, more than High's 15.1%), 16% under the cursor, and on a
computer without graphics acceleration a third of a scroll and two thirds
of a hover (cycles 19-20). Every card, button and the bar still re-blurred
and re-bent what lay behind it on every frame of a scroll, a lean or a ring
turning -- over a backdrop that never moves.

**Proposed modification:** Medium paints the glass instead of computing
it. A blur of the still lattice is a flat dark sheet, so the glass gets
that sheet (`rgba(11, 13, 16, .7)`: the colour the frosted glass came out as,
laid on thicker so the lattice only just shows through), with no
`backdrop-filter`, no SVG bend (`glass.js` gives Medium the `frost` mode and
hangs no filters), the bar solid as in Low, and the rim laid on with normal
blending at the brightness the overlay blend gave it. The rim, sheen, the
cards' lean and light and the 3D rings stay. The soft washes behind Medium
(a blue one behind the hero, a warm one low on the right), the faint stars
and the darkened edge go: they were there for the frost to catch, and
without it they only read as a blue tint over the page. New visitors start
in Medium; High is only ever chosen on the slider. Low is unchanged.

**Result:** measured in cycle 24, with what cycles 22 and 23 added.

---

## Cycle 22: a rim and a progress bar drawn again on every scroll (adopted)

**Identified bottleneck:** with Medium fixed, Low and Medium still dropped
frames scrolling at 3x. An A/B in Low with one suspect taken out per arm
(pictures, the lattice, shadows, the glass rims, the whole page) was too
noisy to rank them on a busy machine (an empty page dropped 11-29%), but
taking the rims out cut the page's main thread through a scroll from 310
to 110 ms a second. A trace of the paints and of the raster work, grouped
by layer, then showed one layer drawn again on 91 of a scroll's 91 frames,
on every arm, the empty page's included.

**Root-cause hypothesis:** that layer is the scroll indicator's fill. Its
transform is set on every scrolled frame, it had no layer of its own, so
each frame painted it and its 8px glow again and the graphics process drew
the layer anew, at every effects level. The rims were a mask on every
card, painted again as each section came into view.

**Proposed modification:** `will-change: transform` on `.page-scroll-fill`.
Below High, each rim is drawn as hard-edged inner shadows (bright along the
top and left, faint along the foot and right, a faint ring all round) with
no mask, no blend and no blur; hover, focus and a press still turn it blue
through `--glass-edge-paint`. High keeps the masked, blended rim.

**Before / after (raster tasks over one full scroll in Low, from the
trace):** 159 to 72, and no layer drawn more than 13 times.

**Result:** Improved; see cycle 24.

---

## Cycle 23: nothing of a higher level left running below it (adopted)

**Identified bottleneck:** asked to make sure a lower level stops what it
does not use. A check in a private Chrome after each switch: the sky's
canvas and filters were already put away, but its memory was kept for 15
seconds; a fresh load in Medium asked for a frame on every display frame
(121 in two seconds), the frame monitor's warm-up and its looks every eight
seconds, though nothing below High moves at rest; Low still worked out and
wrote the cursor's light and lean on every move of the mouse, though it
shows neither; and glass.js still marked cards on and off screen for a
frost only High has.

**Proposed modification:** the sky is handed back as soon as it has faded
out (`SKY_KEEP_MS` 0); the monitor's warm-up and its looks at rest run in
High only (it still watches Low and Medium while they are being used);
the pointer surfaces do nothing in Low; the off-screen marks are High only,
and come off when the level drops.

**Before / after (two seconds after each switch):** Medium at load asked
for 121 frames in two seconds, now 0. After High: canvas 0 px, no bend
filters, no custom cursor, no off-screen marks, heap 2.3 MB (13.6 in High),
0 frames asked, in Medium and in Low alike.

**Result:** Adopted. Going back up to High now always builds the sky again
(about a tenth of a second, behind its fade-in).

---

## Cycle 24: each level against the uncommitted three-level build (measured)

Medians of interleaved arms against the build before cycle 21 (served from
copies of its files), on this laptop's own screen (3x, three rounds, the
machine quieter than in cycle 22's runs) and with no graphics acceleration
(software compositing, processor slowed 4x, two rounds):

| | Low before | Low now | Medium before | Medium now |
| --- | --- | --- | --- | --- |
| 3x, scroll: frames dropped | 3.0% | 5.9% | 27.6% | 6.0% |
| 3x, scroll: frames a second | 56.8 | 53.7 | 39.5 | 54.3 |
| 3x, scroll: graphics process | 79% | 80% | 171% | 110% |
| 3x, cursor over the cards: frames dropped | 5.2% | 1.5% | 18.6% | 1.8% |
| 3x, cursor over the cards: GPU 3D engine | 17% | 10% | 96% | 32% |
| No graphics, scroll: frames dropped | 0.5% | 0.5% | 26.3% | 1.0% |
| No graphics, cursor over the cards: dropped | 8.8% | 7.5% | 48.5% | 0.7% |

Low's two scroll figures are inside this laptop's noise (an earlier round
had them the other way round). With Medium keeping up without graphics
acceleration, such a machine no longer starts in Low: it starts in Medium
like everyone else, and the frame monitor steps it down if it must.

**Checks:** `smoke.ps1` 24 of 24 with graphics acceleration and 22 of 22
without (the first check now expects Medium, and the sky checks choose
High for themselves); no script or console errors.

---

# Clear glass at every level (25 October 2026)

## Cycle 25: a card met from below flickered along its foot (fixed)

**Identified bottleneck:** reported as ghosting along the bottom of a card
when the cursor comes up onto it from below.

**Root-cause hypothesis:** the lift was driven by `:hover`. A card met at
its foot rose 6px, its foot climbed past the cursor, the hover ended, the
card dropped back onto the cursor and rose again; every small movement of
the hand started the cycle over. A button's 3px lift did the same.

**Proposed modification:** with a mouse, the lift follows `.is-raised`,
set by `setupSteadyLift` in `portfolio.js` when the cursor reaches a card
or control and held for as long as the cursor is anywhere over the place it
rests (8px below where it is drawn). Cards and controls are tracked apart,
so a card stays up while the cursor is on a button inside it; a scroll or a
carousel step asks once a frame what is now under the cursor. Touch keeps
the `:hover` lift.

**Before / after (Low, cursor held 3px inside a featured card's foot, the
card's foot sampled every 33ms for a second):** before, up 6px and back
down to 0 within a fifth of a second, waiting for the next movement to
rise again; after, up 6px and held.

**Result:** Fixed, at every level.

---

## Cycle 26: Apple's clear glass at every level (adopted)

**Proposed modification:** asked for the glass to look like Apple's Liquid
Glass at its clearest setting, on Low, Medium and High alike. The sheet is
`rgba(255, 255, 255, .025)` at every level (High a breath of shade instead,
over a frost of 1.5px rather than 4px, still bent at the rim), so what is
behind shows straight through. Below High the rim is hard-edged inner
shadows: a bright specular line along the top and left, a fainter one along
the foot and right, a faint ring, and two soft glows just inside the top
and foot for the sheet's thickness; the face carries a band of light down
from the top and a faint diagonal sheen. The bar is the same clear glass
with a third of its light shaded off and a 5px frost of its own at every
level, so a heading scrolling under it is softened rather than crossing the
links (Low keeps its bar unfrosted, cycle 27); Low and Medium had dropped
the bar's frost for a solid bar, which no longer fits.

**Result:** checked in screenshots at all three levels (About, the featured
row, an open ring). Costs in cycle 27.

---

## Cycle 27: what the clear glass costs (measured, two fixes)

**Identified bottleneck:** the first build of cycle 26, against the build
before it, with no graphics acceleration: Medium scrolling 1.0% to 6.7%
dropped, under the cursor 0.7% to 13.2%. On this laptop at 3x, Low's
graphics process spent three times as long putting each scrolled frame
together (about 50 to 150-185 ms a second) and dropped 13% where it had
dropped 6%.

**Root-cause hypothesis:** the two soft glows inside the rim were blurred
shadows on the rim's layer, and the rim fades to blue under the cursor, so
every frame of that fade painted them again; and the bar's new frost is
blurred again on every scrolled frame, by the processor where there is no
graphics acceleration.

**Proposed modification:** the glows move into the face's gradients, which
never change under the cursor, and the rim is hard lines only again. The
bar keeps its frost in Medium and High; in Low, and on a computer drawing
without graphics acceleration, it is unfrosted and shaded to 66% instead.

**Before / after:**

| | first build | now |
| --- | --- | --- |
| No graphics, Medium, scroll: dropped | 6.7% | 0% |
| No graphics, Medium, cursor over the cards: dropped | 13.2% | 0.7% |
| No graphics, Low, scroll: dropped | 3.5% | 0% |
| 3x, Low, scroll: dropped (the build before cycle 26: 5.0%) | 13% | 3.9% |
| 3x, Low, scroll: graphics process composite | 150-185 ms/s | 60 ms/s |
| 3x, Medium, scroll: dropped | 8.2% | 7.3% |

**Result:** Adopted. Medium on this laptop pays for its frosted bar (about
175 ms a second of compositing against Low's 60) and drops a few more
frames than Low; High drops a third of a scroll's frames here, as before.
`smoke.ps1` 24 of 24 and 22 of 22.

---

## Cycle 28: a lit rim left hanging above a card (fix adopted, not reproduced here)

**Identified bottleneck:** reported with a phone video of the About cards
in Medium. The cursor slides off a card's top edge, the card settles back,
and a copy of its lit (blue) top rim stays on screen about 8px above it,
where the raised and leaning card's top had been, for as long as nothing
else draws there. Each pass leaves another, so two or three lines stack up.
The text and the rest of the card are clean: only the strip the card had
just left is never drawn again.

**Root-cause hypothesis:** below High a card is not a layer of its own. The
browser makes it one for exactly as long as its lift and lean are moving
and folds it back into the page the moment it lands, and on that screen the
strip it left was not redrawn. (In High every card is a layer all the time,
for its frost.) It did not reproduce in the bench Chrome, on screen or off,
maximized or not, with the real cursor, with DevTools detached or with
software compositing: screenshots and screen grabs were clean every time,
so the cause is in that machine's own Chrome (its flags or field trials)
rather than in the page's painting.

**Proposed modification:** `setupSteadyLift` gives a surface a layer of its
own (`.is-steady`, `will-change: transform`) as it rises and takes it away
a second after it has landed, so it is never folded back mid-move. Only the
surfaces under the cursor are ever raised, so it is a layer or two at a
time, where a permanent layer for every lifting surface would be about two
hundred with every collection open in Low.

**Result:** Adopted, to be confirmed on the machine that showed it.

---

## Cycle 29: Medium looked the same as Low (adopted)

**Identified bottleneck:** reported: Low and Medium could not be told apart.
Since cycle 21 Medium frosts nothing and since cycle 26 both wear the same
clear glass over the same lattice, so at rest the only differences were a
faint shadow under the cards; the lean and the turning rings only show
once the cursor is on something.

**Proposed modification:** Medium gets a still sky (`setupStillSky` in
`portfolio.js`): stars in High's colours, a band where they crowd, two
clusters, a few soft clouds and the grey haze between them, faded toward
the edges. It is drawn once, seeded once a visit, turned into a picture off
the page's thread, and laid on the lattice's own fixed layer as
`.background-grid::before`, so it adds no layer and a scroll never draws it
again. It is drawn again only when the window changes shape or zoom, fades
in once ready and out on the way down to Low, and High's moving sky fades
in over it. Its memory is handed back 0.7s after leaving Medium.

**Before / after (Medium, with the sky against the same build with it
hidden, three alternating runs, medians):**

| | with the sky | without |
| --- | --- | --- |
| 3x, scroll: dropped | 7.2% | 6.5% (runs 5.0 to 16.3%) |
| 3x, scroll: graphics process tiles | 340 ms/s | 338 ms/s |
| 3x, cursor over the cards: dropped | 2.1% | 2.3% |
| No graphics, scroll: dropped | 0.5% (1 frame) | 0% |
| No graphics, scroll: page CPU | 139% | 138% |

**Result:** Adopted: the difference is inside the runs' own spread.
`smoke.ps1` 24 of 24 and 22 of 22.

---

# Every level on any machine (1 November 2026)

Medians of interleaved rounds as before. New in these: first loads compared
from two local servers (the commit before against the working copy), the same
Chrome and a warm cache, with the busy time and long tasks of the page's main
thread read from a trace of the first six seconds. Two servers with the same
files, as a check on the method, came out at 1178 and 1176 ms busy, with single
runs from 998 to 1434 ms and total blocking time from 318 to 629 ms. No
graphics here means software compositing and a main thread slowed 4x; the slowed
thread is the page's alone, so a worker there is measured at full speed.

## Cycle 30: the still sky drawn off the page's thread (adopted)

**Identified bottleneck:** a first load in Medium asks the page's main thread
for about twice what one in Low does. A trace of it by task, on this laptop at
3x: drawing the still sky 35 ms, `toBlob` reading it back 38 ms, then four or
more `IdleEncodeRows` tasks of 6-14 ms. The comment over it said the encoding
happened off the page's thread; for a PNG, Chromium encodes on the main thread
in idle time, a few rows at a go. With no graphics each step is 40-300 ms, and
Medium is where every visit starts.

**Root-cause hypothesis:** nothing about the sky needs the page's thread.

**Proposed modification:** the same drawing, in a worker written out inline
(`paintStillSky` stands alone and its source text is the worker's), on an
`OffscreenCanvas`, with `convertToBlob`. The blob comes back and is laid on the
lattice's layer as before. No `OffscreenCanvas` or no worker falls back to the
old way on the page's thread (each path checked by breaking it).

**Implementation:** `portfolio.js` (`paintStillSky`, `setupStillSky`).

**Before / after (Medium, five rounds):**

| | Before | After |
| --- | --- | --- |
| 3x: main thread busy in the first 6 s | 316 ms | 194 ms |
| 3x: still sky on screen | 352 ms | 285 ms |
| No graphics: main thread busy | 1441 ms | 1239 ms |
| No graphics: still sky on screen | 1480 ms | 1075 ms |
| No graphics: long tasks / total blocking | 5 / 427 ms | 5 / 511 ms (inside the spread) |

**Visual regression:** Pass. One seed drawn by the page's canvas and by the
worker's comes out the same to the byte (3x, 1470 x 860). Tried first with the
worker's canvas kept in memory, which spares the graphics process the drawing
but moves the faintest stars: mean 0.77/255, up to 79/255 on 202 pixels. Not
visible beside a sky that is different on every visit, but not the same either,
so the canvas stays on the graphics card.
**Functional regression:** Pass: the sky arrives by the worker, with no
`OffscreenCanvas`, with a worker that cannot be built and with one that fails,
goes on the way down to Low, comes back, and is drawn again for a new window
shape.

**Result:** Improved.

---

## Cycle 31: the graphics question asked off the page's thread (adopted)

**Identified bottleneck:** every load asks WebGL what it is drawing on
(`askAboutGraphics`), and opening the context holds the page's main thread until
the graphics process has built it: 10-40 ms in Medium, and in High, with the sky
being set up behind it, 85 and 217 ms in two of five reloads and 579 ms in one
profile, the longest task of the load.

**Proposed modification:** the same question in an inline worker, on an
`OffscreenCanvas`. Its answer counts only when it gets a context: a refusal could
mean no graphics, or only a browser that gives its workers no WebGL, so a refusal
is asked again on the page's thread, where refusing costs nothing. No worker, or
a worker that fails, asks there too. `window.__graphicsForce` tells the page what
it is drawing on for the perf tools, whose patch of WebGL cannot reach a worker
(`mac` still reads Apple graphics and keeps its sky at full rate).

**Implementation:** `portfolio.js` (`askAboutGraphics`), `tools/perf/bench.ps1`.

**Before / after (first load, five rounds, 3x):**

| | Before | After |
| --- | --- | --- |
| High: longest task | 119 ms (runs 96-217) | 98 ms (runs 91-109) |
| High: total blocking | 83 ms (runs 53-389) | 49 ms (runs 41-81) |
| Medium: main thread busy | 215 ms | 197 ms |
| Medium: long tasks | 1 | 0 |

**Visual regression:** none possible: nothing drawn changes.
**Functional regression:** Pass: Intel found with graphics and software without,
by the worker and by each way of falling back.

**Result:** Improved: not a large saving on average, but the one stall of up to
half a second that had nothing to do with what the page draws is gone.

---

## Cycle 32: a ring turning restyled every card it holds (adopted)

**Identified bottleneck:** turning a ring in Medium: the page's main thread at
370-445 ms a second, 255 of it style, 408 elements restyled on every frame. On a
computer with no graphics acceleration that is 35 long tasks in four and a half
seconds. (The `ring` scenario in `bench.ps1` had been measuring nothing: the bar
took its click on the row, so no collection opened. Fixed. Its older numbers
above are of an arrow press at most.)

**Root-cause hypothesis:** `updateCardDepth` writes eight inherited custom
properties on all of a ring's cards on every frame, twenty-two of them on a ring
of sixteen with its clones, though about six show. Each card's own style is
worked out from nothing after an inline write (about 400 microseconds apiece on
this laptop, far more than its contents' restyle), and the contents go along for
the inheritance.

**Proposed modification:** two things. The properties are registered as not
inherited, since only the card reads them. And below High a card too far round
the ring for anything of it to show is parked: its opacity is written as none,
and nothing more until it comes round (`ringFade`, `RING_PARKED_FADE`).

**Implementation:** `portfolio.js` (`updateCardDepth`), `portfolio.css`.

**Before / after (`ring`, three rounds, High five):**

| | Before | After |
| --- | --- | --- |
| Medium, 3x: main thread | 366 ms/s | 237 ms/s |
| Medium, 3x: style | 230 ms/s | 95 ms/s |
| Medium, 3x: dropped | 1.0% | 0.5% |
| Medium, no graphics: dropped | 13.7% | 5.3% |
| Medium, no graphics: long tasks | 35 | 13 |
| Low, no graphics: frames a second | 27.5 | 35.7 |
| Low, no graphics: dropped | 36.7% | 19.4% |
| Low, no graphics: long tasks | 32 | 3 |
| Low, 3x: main thread | 454 ms/s | 268 ms/s |
| Low, 3x: dropped (frames) | 8.7% (33) | 12.3% (38) |
| High, 3x: main thread | 582 ms/s | 555 ms/s |
| High, 3x: style | 298 ms/s | 270 ms/s |
| High, 3x: dropped | 7.9% | 7.7% |

**Tried and rejected:** parking in High as well. The page's main thread fell to
438 ms a second, but over six rounds High dropped 13.9% against 6.8% and showed 44
frames a second against 50, every round the same way; at MacBook size 8.8% against
5.2%. The graphics process took 10-15% longer over the same frames. Not understood:
at Medium, where the same rise is harmless, frames, render passes, screen damage
and layers are all the same, and burning the saved time on the main thread does not
bring it back. Taking the parked cards off with `visibility: hidden` did not either.
So parking stops at High.

**Visual regression:** Pass at rest: Low, Medium and High on a MacBook-sized screen
and a phone match the commit before to within 2/255, apart from the animated
picture in an open project and the 30 x 2 px sliver at the foot of the scroll
indicator, each of which differs between two captures of the same commit too. One
difference by design, too small to catch in a capture: a card reaching the edge of
the ring goes from at most .75% opacity to none a few frames sooner.
**Functional regression:** Pass (`smoke.ps1` at the end of this log).

**Result:** Improved.

---

## Cycle 33: glass.js only watches the glass in High (adopted)

**Identified bottleneck:** below High glass.js has nothing to frost or bend, but
it still tracked every sheet on the page (a size observer on each, an intersection
observer per ring and for the page, a mutation observer per ring and per section,
all marks only High reads), and it read the bar's box as it ran, forcing the
page's style and layout partway through loading, for a lens and a glint that frosted
glass does not have.

**Proposed modification:** the watching starts when High does and stops when High
does (`startWatching`, `stopWatching`), and everything it left behind goes with it.
The bar's box is only read outside frost, and the lens's spare canvas is only made
for the lens.

**Implementation:** `glass.js`.

**Before / after (six rounds, three for the runtime rows):**

| | Before | After |
| --- | --- | --- |
| No graphics, Medium, load: DOMContentLoaded | 360 ms | 278 ms |
| No graphics, Medium, load: main thread busy | 1235 ms | 1112 ms |
| No graphics, Medium, load: total blocking | 505 ms | 431 ms |
| 3x, Medium, scroll: main thread | 172 ms/s | 159 ms/s |
| 3x, High, load: total blocking | 77 ms | 60 ms (inside the spread) |
| 3x, level switches: dropped frames | 67 | 64 |

With no graphics, scrolling and opening every collection came out level, inside
their spreads.

**Visual regression:** none possible below High; in High, a check of the page in a
private Chrome gives the same numbers from this build and the one before: arriving
in High, up from Medium, with a collection opened and back down and up again, the
same sheets wear a filter and the same ones carry the off-screen mark.
**Functional regression:** Pass (`smoke.ps1` at the end of this log).

**Result:** Improved.

---

## Cycle 34: the cursor's light, not inherited (rejected again)

**Identified bottleneck:** with the cursor on a card in Medium, style is 172-190 ms
of the page's 390 ms a second: the card and the 24 elements in it, 3-4 ms a frame.

**Root-cause hypothesis:** `--card-glow`, `-x` and `-y` are inherited, as cycle 2
found. In High the sparks muddied that test; Medium has none.

**Before / after (`hover`, three rounds):** with them registered as not inherited
and the card's `::after` asking for them by name, style 172 -> 191 ms/s, main thread
385 -> 394 ms/s, dropped 2.8 -> 3.4%.

**Result:** Rejected, as in cycle 2, and now for a reason. Selector matching across
that whole run came to 105 ms out of 2985 in style (with tracing on, so slower than
real), and a ring's cards tell the same story (cycle 32): what costs is working out
one card's own style after an inline write, not its contents or the selectors. The
writes are what would have to go, and what they write is the lean and the light.

---

## Cycle 35: laying the page out once while it is built (adopted)

**Identified bottleneck:** after the still sky, the biggest task of a load on a slow
machine is the one that renders the data, 270-440 ms with the main thread slowed 4x,
and after it the card measure runs a second time, 60-130 ms more in one task. By
task, with the elements each style pass touched: three layouts forced mid-build, the
measure's own, then the whole page restyled again, and laid out again in the frame
after.

**Root-cause hypothesis:**
- Setting `scrollLeft = 0` on the About and Skills rows and the featured row, which
  are not sliders on a desktop and have nothing to scroll back from, forces a layout
  each time, between one row being built and the next. They are built next to each
  other, so each layout is mostly wasted.
- `--card-content-height` is written on the root, where it restyles and lays out
  what is on the page, for what only project cards read. `--visual-viewport-height`
  the same, at every load and every change of a phone's toolbars, for what only an
  open project reads.
- The root's attributes are written after the read that forces style, not before.
- The second measure runs because the type "has just arrived", and it had: three
  faces nothing uses until the data renders (Barlow Condensed 800 and the two lighter
  Font Awesome faces) are first asked for by the layout that measures the cards. So
  every visit, not only a first, measures them while those are on their way.

**Proposed modification:** each of those. The rows skip the scroll unless they were
sliders. The two properties go on `#projects` and `#project-modal`, with
`--card-height` declared on `#projects` so it can see what is written there. The
environment writes first and reads after. The three faces are asked for before the
data is fetched, and the second measure runs only if a face is still loading after
the first. The page draws in all three, so this costs no bytes; a first visit, with
the type still on its way, measures twice as before.

**Implementation:** `portfolio.js` (`setupResponsiveEnvironment`,
`setupResponsiveCardSlider`, `setupCarousel`, `setupProjectCardFit`, the data fetch),
`portfolio.css`.

**Before / after (first load, Medium, six rounds):**

| | Before | After |
| --- | --- | --- |
| No graphics: main thread busy | 1155 ms | 984 ms |
| No graphics: long tasks | 5 | 3 |
| No graphics: total blocking | 512 ms (runs 400-681) | 357 ms (runs 279-444) |
| No graphics: longest task | 390 ms | 363 ms |
| 3x: main thread busy | 182 ms (runs 163-209) | 156 ms (runs 125-168) |
| Forced layouts while building | 4 | 1 |

**Visual regression:** Pass: Low, Medium and High on a MacBook-sized screen and a
phone match the base commit to within 2/255 apart from the open project's animated
picture and the 30 x 2 px sliver noted above (the same run compared with itself shows
those too).
**Functional regression:** Pass (`smoke.ps1` and `layout-audit.ps1` at the end of
this log).

**Result:** Improved.

---

## Cycle 36: the sky fetched when it is wanted (adopted)

**Identified bottleneck:** `setupGalaxyField` is 265 KB of the site's 433 KB of
script, 73 KB of its 117 KB off the wire. Every visit starts at Medium and High is
only ever chosen on the slider, yet every visit downloaded it, set it up (18-50 ms of
script with the main thread slowed 4x, a canvas context, its listeners and observers)
and released it again.

**Proposed modification:** `galaxy.js`, fetched the first time High is wanted, by a
stand-in with the same methods (`setupDeferredGalaxy`). Before it arrives its level
and easing are kept for it; nothing else it is told matters yet. It carries the
`?v=` of the `portfolio.js` that fetched it. To spare a first move to High the wait,
the file is fetched, not run, as soon as the pointer or the keyboard reaches the
slider. Its two random rolls are thrown when the page starts, as before, so a seeded
run draws the same sky.

**Implementation:** `portfolio.js`, new `galaxy.js`.

**Before / after (first load, five rounds):**

| | Before | After |
| --- | --- | --- |
| First visit: bytes | 556 KB | 487 KB |
| First visit: `portfolio.js` off the wire | 117 KB | 48 KB |
| First visit, no graphics: main thread busy | 1236 ms | 1197 ms |
| First visit, no graphics: total blocking | 541 ms | 481 ms (inside the spread) |
| Return visit, no graphics: main thread busy | 1045 ms | 920 ms |
| Return visit, no graphics: long tasks | 3 | 2 |
| Return visit, no graphics: DOMContentLoaded | 328 ms | 272 ms |
| Medium: listeners on the page | 432 | 418 |
| High, 3x, at rest: main thread | 104 ms/s | 98 ms/s |
| High, 3x, scroll: dropped | 28.4% | 27.7% |
| High, 3x, level walk: dropped frames | 67 | 70 |

**The cost, the one thing here that gets slower:** the first move to High of a visit
on a 200 KB/s connection with 150 ms of latency starts the sky's fade-in 365 ms after
the choice with the slider reached first, 710 ms without a pointer on it first (a
keyboard reaches it by focus, a script's direct change does not count), where it was
170 ms before. The glass changes at once and Medium's sky stays behind it until the
new one is in, as it always did while High's sky was being built (checked). Later
moves are as they were, and a reload at High starts the file at once. If the file
cannot be fetched High has no sky, only its glass over the plain backdrop, and asks
again the next time it is chosen.

**Visual regression:** none possible once it is in: the same code, the same seed.
**Functional regression:** Pass: `smoke.ps1`, 29 of 29, including a sky that rests
behind an open project and moves again.

**Result:** Improved.

---

## Cycle 37: a shadow's fade was most of what a ring cost in Low (adopted)

**Identified bottleneck:** turning a ring in Low, the graphics process rasterises
tiles for 460-560 ms a second at 3x, 67% of the 3D engine against Medium's 17%, and
drops 8-10% of frames. Composited scrolling for the row (`will-change:
scroll-position`) changed nothing, and neither did taking the turn's `z-index`
changes out.

**Root-cause hypothesis:** in Low a card has no layer of its own. The card coming to
the front fades in its deep shadow over .3s and the card leaving fades its out, about
the length of a turn, and every frame of that fade paints the row and rasterises its
tiles again. Taking the shadow away entirely (an ablation) took the tiles to 64 ms a
second and the dropped frames from 34 to 1.

**Proposed modification:** in Low the fade goes in three steps. That shadow only
moves a pixel by 8/255 at most (a shot with and without it), so each step is under
3/255. Medium and High, where each card is a layer, gain nothing from it (tiles 92 ->
84 and 125 -> 130 ms/s, dropped 2.1 -> 1.4% and 11.2 -> 12.9%) and keep the smooth
fade.

**Implementation:** `portfolio.css`.

**Before / after (`ring` in Low, three rounds):**

| | Before | After |
| --- | --- | --- |
| 3x: dropped (frames) | 7.7% (22) | 0.6% (1) |
| 3x: GPU 3D engine | 69% | 36% |
| 3x: graphics process | 71% | 32% |
| 3x: tiles | 461 ms/s | 167 ms/s |
| MacBook size: dropped (frames) | 1.6% (4) | 0.6% (1) |
| MacBook size: GPU 3D engine | 39% | 25% |
| No graphics: dropped frames | 63 | 60 |
| No graphics: main thread | 879 ms/s | 813 ms/s |

(Frames shown a second fall with these, 47 to 38, because there are fewer of them to
show.)

**Visual regression:** Low's captures match to within 2/255 at rest. In motion, one
change by design and not one to see: the deep shadow arrives in three steps of under
3/255 in place of a smooth .3s.
**Functional regression:** Pass.

**Result:** Improved.

---

## Cycle 38: Low's ring writes only what Low shows (adopted)

**Identified bottleneck:** with no graphics acceleration a ring in Low still drops
18% of its frames, with style at 208 ms a second. Nothing about a card's place on the
ring is read in Low, where the rings lie flat (`portfolio.css`), yet the six or so
cards near the front (cycle 32 parked the rest) had all of it written on every frame,
and each write has the browser work that card's style out again.

**Proposed modification:** in Low a ring only says which card is in front. The
stylesheet takes the rest: every card answers the pointer and the one in front stands
over its neighbours, which also covers whatever a level above left on them. A press
on a card works out how far round it is from where it stands. Going up from Low, an
open ring is given its places at once.

**Implementation:** `portfolio.js` (`updateCardDepth`, the ring's click, an observer
of `data-effects`), `portfolio.css`.

**Before / after (`ring` in Low, three rounds):**

| | Before | After |
| --- | --- | --- |
| No graphics: dropped (frames) | 18.4% (56) | 9.5% (31) |
| No graphics: frames a second | 29.4 | 34.5 |
| No graphics: style | 208 ms/s | 117 ms/s |
| 3x: main thread | 211 ms/s | 119 ms/s |
| 3x: style | 85 ms/s | 18 ms/s |
| 3x: dropped (frames) | 0.5% (1) | 1.1% (2) |

**Visual regression:** Pass: all three levels match the base commit at rest on a
MacBook-sized screen and a phone, apart from what two captures of one commit differ by
as well: the open project's animated picture, the 30 x 2 px sliver, and on a phone the
length of the scroll indicator's fill, depending on how much of the page has been
measured when the shot is taken. In Low the z-order of the cards no longer changes
through a turn; they never overlap there.
**Functional regression:** Pass: with an open ring Low to Medium to High and back gives
the same places as arriving at each level; in Low a press on the front card opens it,
a press on the card beside it opens that one and walks the ring round to it, and the
arrows turn it; in Medium a full walk of the ring leaves the right cards showing.

**Result:** Improved.

---

## Tried and not kept in this round

- **The scroll indicator as a scroll-driven animation** on the compositor. Low at 3x:
  main thread 125 -> 100 ms/s, dropped frames 10 -> 12. Medium with no graphics: main
  thread 691 -> 691 ms/s, dropped frames 1 -> 1. No gain anyone would see, for a second
  way of drawing the same bar.
- **Taking the fade animation off the clones the card measure lays out.** A
  first load: main thread busy 960 -> 880 ms, total blocking 287 -> 276 ms, runs
  overlapping; timed in place, 88 -> 75 ms a measure with single runs from 43 to 193.
- **The cards' scroll-driven fade (`.project-copy`) as a cost at all.** Ablated: hover
  380 -> 376 ms/s, ring 205 -> 210 ms/s, collections 347 -> 312 ms/s, dropped frames
  the same. It stays.

---

## Each level against the commit before these cycles (measured)

The base commit against the finished branch. First loads from two local servers, a
warm cache and five rounds, `first visit` with the cache cleared; the rest as
interleaved `ab.ps1` runs of two rounds, so treat small differences as level.

| First load | Low before | Low now | Medium before | Medium now | High before | High now |
| --- | --- | --- | --- | --- | --- | --- |
| 3x: main thread busy | 160 ms | 107 ms | 268 ms | 150 ms | 1019 ms | 969 ms |
| 3x: longest task | 37 ms | 35 ms | 42 ms | 39 ms | 100 ms | 70 ms |
| 3x: total blocking | 0 | 0 | 0 | 0 | 82 ms | 26 ms |
| No graphics: main thread busy | 887 ms | 705 ms | 1319 ms | 836 ms | 5798 ms | 5563 ms |
| No graphics: long tasks | 3 | 2 | 5 | 2 | 38 | 37 |
| No graphics: total blocking | 271 ms | 236 ms | 412 ms | 264 ms | 3429 ms | 3342 ms |
| No graphics: longest task | 305 ms | 273 ms | 327 ms | 285 ms | 809 ms | 523 ms |

First visit, Medium, no graphics: 553 -> 488 KB; main thread busy 1654 -> 1169 ms;
long tasks 6 -> 3; total blocking 653 -> 520 ms; the still sky on screen at 1633 ->
1170 ms.

| In use | Low before | Low now | Medium before | Medium now | High before | High now |
| --- | --- | --- | --- | --- | --- | --- |
| 3x, ring: dropped | 7.1% | 0.6% | 0.9% | 0% | 5.6% | 6.1% |
| 3x, ring: main thread (ms/s) | 453 | 121 | 345 | 234 | 570 | 547 |
| 3x, ring: GPU 3D engine | 66% | 30% | 18% | 19% | 73% | 72% |
| No graphics, ring: dropped | 32.5% | 11% | 7.4% | 1.3% | - | - |
| No graphics, ring: long tasks | 30.5 | 0 | 35 | 6 | - | - |
| 3x, scroll: dropped | 5.5% | 4.2% | 9.5% | 9.3% | 26.2% | 28.4% |
| 3x, scroll: main thread (ms/s) | 125 | 114 | 131 | 131 | 160 | 131 |
| 3x, cursor over cards: dropped | 1.2% | 1.2% | 2.4% | 2.4% | 15.2% | 15.0% |
| 3x, project open and close: dropped | 13.4% | 12.8% | 12.4% | 14.3% | 22.9% | 24.1% |
| 3x, every collection, then scroll: dropped | 2.9% | 2.2% | 2.1% | 2.2% | 25.2% | 27.2% |
| No graphics, every collection: dropped | 13.5% | 7.9% | 17.1% | 13.1% | - | - |
| At rest, High, 3x: main thread (ms/s) | - | - | - | - | 105 | 95 |

Three things this does not change. High on this laptop at 3x is still limited by
the graphics process, and its dropped frames are where they were. Under the cursor
each level is as it was. Opening a project too: most of that is raster of what the
project shows. One thing that reads oddly: High's first paint on a machine with no
graphics came at 356 ms against 200 in one five-round run, with single runs from 120
to 560 in the two arms together, and at 84 ms in both at 3x; not looked into further.

---

## Final checks (every level on any machine)

- `smoke.ps1`: 29 of 29 with graphics acceleration and 27 of 27 without.
- `layout-audit.ps1 -Level low|medium|high`: 0 of 24 screens with problems at each.
- `capture.ps1 -TestPattern` at each level on a MacBook-sized screen and a phone,
  against the base commit: within 2/255 apart from what two captures of the base
  commit differ by as well (see cycle 38).
- Scratch scripts against a private Chrome: the still sky and the graphics question by
  the worker and by every way of falling back, with and without graphics; the glass in
  High the same as the build before it, arriving, up from Medium and back; a ring
  through the levels and under the pointer.
- Not measured: a real slow laptop, a real phone, or any browser but Chrome. Safari
  and Firefox take the same paths unless they lack `OffscreenCanvas`, WebGL in a
  worker or a registered custom property, each of which has a fallback that was
  exercised only by removing it in Chrome. `@property` without support leaves those
  properties inherited, as they were.

---

## Cycle 39: the lines over the About cards, with a cause this time (fix adopted, ghost not reproduced here)

**Identified bottleneck:** reported with a screen recording, in Low: passing the cursor
on and off Education, Robotics Experience or Hands On Work leaves a few lines above the
card until a scroll draws that place again. Software & Controls, Manufacturing &
Fabrication, CAD & Design and the project cards never do it. In the recording (3x) the
lines sit where the raised card's top had been and about 2 CSS px above where it rests.
Cycle 28 put this down to that machine's own Chrome and gave a raised surface a steady
layer. That did not explain why only three cards do it.

**Root-cause hypothesis:** the three have one thing the others do not: the link's arrow,
which turned by `transition: transform`. A layer log of the bench Chrome through a hover
(`LayerTree.layerTreeDidChange`) shows what follows from it. Chrome gives the arrow a
layer of its own while it turns, and the card's rim (`::before`, z-index 5) overlaps the
arrow and paints after it, so the rim has to go on a layer too. The whole 1143 x 1009 rim
comes off the card for about 180 ms on the way in and again on the way out, and folds
back while the card's .2s lift is still moving. That leaves the strip the rim has just
left to a repaint which, on that screen, does not come.

**Proposed modification:** the arrow's turn goes through a registered custom property,
`--about-arrow-turn`, with the same .18s and the same easing. A property's transition
runs on the main thread, so nothing is promoted and nothing has to climb over it.

**Implementation:** `portfolio.css`.

**Before / after (layers through a hover on and off, Low):**

| | Before | After |
| --- | --- | --- |
| About card | card, arrow and rim, about 180 ms each way | one, throughout |
| Skills card | one | one |

Medium loses its arrow layer the same way. High's cards are layers anyway.

**Visual regression:** none to see: the same turn on the same clock. It costs a few
repaints of a 34 x 39 box for .18s.
**Functional regression:** Pass (`smoke.ps1`).

**Result:** Adopted, to be confirmed on the machine that showed it. The lines themselves
have never appeared in the bench Chrome, in this report or in cycle 28's, so what is proven
here is that the split is gone, not that the lines are.

---

## Cycle 40: High's bright sky, at no cost to the levels below it (adopted)

**Identified bottleneck:** none: a new thing, which had to cost Low and Medium nothing.
Five quick presses on the slider's High stop swap the space sky for a Frutiger Aero one
(README, "The other sky").

**Proposed modification:** all of it is in `aero.js` (75 KB, 19 KB off the wire) and
`aero.css` (9 KB, 3 KB off the wire), requested on the fifth press and never before. What
every visitor carries is the counter in `portfolio.js` (4 KB, 1.4 KB off the wire) and one
line in the head that does nothing without `data-aero`. It is drawn by code once, into
sprites and flat backgrounds (the clouds in a worker), and the frames are `drawImage`s of
those. While it shows, the space sky is told it is at Medium, so its loop and memory go;
with cycle 36, a reload with it on never runs `galaxy.js` at all. Going down a level hands
back the loop, listeners, sprites and canvas.

**Implementation:** `aero.js`, `aero.css`, `portfolio.js` (`loadAero`, `syncAero`,
`countAeroPress`, `applyEffectsMode`), `index.html`'s head.

**The sky against the space sky (High, 3x, native, two interleaved rounds, measured before
the merge with cycles 30-38):**

| | Space | Aero |
| --- | --- | --- |
| Scroll: dropped | 34.6% | 26.4% |
| Scroll: main thread | 117 ms/s | 69 ms/s |
| Scroll: GPU 3D engine | 41% | 49% |
| At rest on the projects: dropped | 1.2% | 0% |
| At rest: main thread | 108 ms/s | 70 ms/s |
| At rest: GPU 3D engine | 41% | 51% |
| Cursor over cards: dropped | 29.6% | 27.3% |
| Cursor over cards: main thread | 482 ms/s | 335 ms/s |
| Cursor over cards: GPU 3D engine | 93% | 91% |
| Heap | 11-21 MB | 2-3 MB |

So it asks no more than the High it replaces, with the graphics engine somewhat busier at
rest. Two rounds, so small differences are level.

**Visual regression:** Low, Medium and High without it: nothing changes, as no rule in
`aero.css` is loaded or answers without `data-aero`.
**Functional regression:** Pass: see the final checks below. Not on a phone's real
hardware, and in Chrome only.

**Result:** Adopted.

---

## Cycle 41: Low's own hidden look, an eye (adopted)

**Identified bottleneck:** none: a new thing for the level that has to run on anything. Ten
quick presses on the Low stop find the dark web of about 2000. Two attempts at its backdrop
were sent back as cheap: one in hard flat vector, one a poster with all its glow painted
ahead of time into a WebP. What was asked for instead is one great dithered eye that fills
the screen, follows the cursor and blinks, which means something has to run in Low.

**Proposed modification:** make what runs as small as it can be. The canvas is about 400
cells wide, shown with its pixels large, so there are few of them. Every tone is worked out
once into lookups, the iris is a sprite, a frame draws only the cells that changed at about
16 a second, and there are no frames at all unless the eye is moving. The aura behind it is
a few gradients on the lattice's fixed layer, painted once. It dims where the page's words
run. Panes are one colour at one transparency everywhere.

It was then sent back for sliding: an eye is a ball, and has to move by turning. So the iris
sprite is now read through a ball, each cell in the changed box turning its point on the ball
by the gaze (a handful of multiplications and one lookup), which narrows the iris as it comes
round to the edge. The shading is worked out once as before, and the window it reflects stays
with the room. The ball is a little narrower than the opening, so its round edge shows in the
corners.

**Implementation:** `y2k.js`, `y2k.css`.

**Before / after (Low against this look, 3x, native, two interleaved rounds):**

| | Plain | This look |
| --- | --- | --- |
| Scroll: dropped | 4.6% | 3.3% |
| Scroll: main thread | 120 ms/s | 88 ms/s |
| At rest: main thread | 1 ms/s | 17 ms/s |
| Cursor over cards: dropped | 5.9% | 3.3% |
| Cursor over cards: main thread | 99 ms/s | 153 ms/s |
| Ring turning: dropped | 0.8% | 1.2% |
| Ring turning: GPU 3D engine | 33% | 21% |

So it does cost something now, which the earlier versions did not: about 50 ms a second while
the cursor moves, a few frames at each blink. Turning a ball costs no more than sliding a
sprite did, within what these runs can tell apart. The at-rest row has the eye looking about for
itself, as it does with no cursor seen; with a cursor it is only the blinks. This is the one
hidden look that asks anything of Low.

**Result:** Adopted, with that cost, because the eye is what was asked for.

---

## Cycle 42: Medium's own hidden look, a desk of things that work (adopted)

**Identified bottleneck:** none: new. A first version painted a whole desk behind the page
and made four windows work on top of it. It was sent back as clutter: pop-ups behind
everything, like a virus. So everything that could not be used went, and the picture with it:
the backdrop is only the lattice on pink.

**Proposed modification:** plain elements on one fixed layer behind the page, so they stay with
the visitor all the way down. Fourteen come out in the first seven seconds, one every half
second, the real windows dealt in among short notes at random; then one every five to thirty
seconds, never more than twenty out at once. Nothing else runs unless a hand is on it. The
infill window redraws only as its slider moves, and draws what a slicer would: walls of one
width, set further apart as density falls, thickening above about half and closing up at 100%.
The print job's bar is a plain `steps()` animation. Only holding the torque window asks for
frames, and it stops when it has run down.

Anything on the desk is moved by a press and hold of 220 ms. What is held comes up over the page,
so it can be seen on its way, and sinks back behind when it is let go. A swipe that sets off at
once is not a hold, so a phone still scrolls across a screen full of windows; only once something
has been lifted does a finger stop moving the page. The first version listened for moves on the
desk itself and lost the drag when a quick flick left the title bar before the first move
arrived; worse, the drag stayed set and took the next press with it, so a window would not close.
It now listens on the window from the moment of the press.

**Implementation:** `vapor.js`, `vapor.css`.

**Before / after (Medium against this look, 3x, native, two interleaved rounds, the burst
included):**

| | Plain | This look |
| --- | --- | --- |
| Scroll: dropped | 10.2% | 2.9% |
| Scroll: GPU 3D engine | 36% | 34% |
| At rest: frames | 0 | 0 |
| Cursor over cards: dropped | 2.8% | 0.1% |
| Ring turning: dropped | 1.0% | 0.2% |
| Ring turning: main thread | 275 ms/s | 292 ms/s |

**Result:** Adopted.

---

## Cycle 43: High's eye, and a richer bright sky (adopted)

**Identified bottleneck:** none: new. A neon city in lime and then a dark lake with a great lens
were both sent back, and the dark sky was dropped in favour of Low's eye with everything High can
spend on it. The bright sky was called cheap: flat, with generic icons in its bubbles.

**Proposed modification:** the eye is two passes on the graphics card. The first draws it one
dither cell at a time on a small picture, and because a fragment shader does this anyway it can
afford the real thing: a ball with a turning matrix, an iris that foreshortens, veins and faint
globe lines fixed to the surface so they go round with it, a light and a reflected window that
stay put, lids that go a little way with it, a lit rim. The second lays that on the screen with
split colour, bloom from the mip chain and shafts off the pupil. It looks about for itself, and
two presses set it following the cursor for fifteen seconds. The bright sky takes a downscaled
copy of each frame for light through the clouds, a lake that reflects, refraction inside the
larger bubbles and bloom, and its bubbles carry this portfolio's own CAD and project photos.

**Implementation:** `ego.js`, `ego.css`, `aero.js`, `aero.css`.

**Before / after (High against each, 3x, native, two interleaved rounds):**

| | Stars | Eye | Stars | Bright sky |
| --- | --- | --- | --- | --- |
| Scroll: dropped | 32.5% | 19.1% | 27.1% | 22.3% |
| At rest on the projects: dropped | 2.2% | 0% | 1.7% | 0% |
| At rest: GPU 3D engine | 32% | 40% | 31% | 52% |
| Cursor over cards: dropped | 19.8% | 14.4% | 26.7% | 33.7% |
| Ring turning: dropped | 16.0% | 25.7% | 16.8% | 25.4% |
| Ring turning: GPU 3D engine | 74% | 82% | 73% | 77% |

Better than the stars on a scroll and at rest. Both are heavier on a turning ring, and the bright
sky is heavier under the cursor too.

**Result:** Adopted, as High, with those costs.

---

## Cycle 44: The hidden looks on any screen (adopted)

**Identified bottleneck:** seven looks photographed at seventeen screens, from a folding phone
(280x653) to a very wide monitor (3840x1080), showed what the layout audit cannot see.

- The eyes chose between two shapes at a height of 1.1 widths, so a screen just past that line
  jumped from fine cells to cells two and a half times the size, and a tablet held upright was
  coarse. On a phone the eye turned until its iris was off the screen.
- The eyes' cost and grain followed the width alone, so a very wide monitor's cells were larger
  than they needed to be.
- The light behind the eye fell directly behind the name.
- Medium's windows were sized in `vw` and `vh` and its notes and lettering in fixed units, so on a
  very wide monitor a window dwarfed the note beside it and cut off the robot's feet, and on a phone
  held sideways they were too large to leave any room. Running words could not be read over what
  had popped up behind them.
- The address bar of a phone sliding away rebuilt the eye.

**Proposed modification:** the eye's shape now eases from wide to tall with no jump, and on a very
wide monitor it stops short of being a slit. Its cell comes from the screen's area, so there are
about 100,000 cells at any size or shape and the same work to do. It turns no further than keeps
the iris in sight. The light and the reflected window moved to the right, off the page's words. A
change of height under 16% no longer rebuilds it, as the bright sky already did. Everything on the
desk is measured in one size that follows the screen's shorter way, so it all keeps its proportions,
and on a touch screen its small controls answer a good way beyond their edges. Words that have to
be read stand on a plain label of the desk's own pink.

**Implementation:** `y2k.js`, `ego.js`, `vapor.css`.

**Result:** Adopted. The bright sky needed nothing: 1.7 s to come up at 1920x1080 and at 3440x1440.

---

## Cycle 45: An eye on every level, a desk that wants to harm your machine (adopted)

**Identified bottleneck:** none: new. The bright sky of cycles 40 and 43 was removed on request.
Every level is now its usual sky and one great eye, and Medium has the pink desk as its last
switch. The desk was to look like a real virus: far more windows, overlapping, with the portfolio's
own projects among them and a character with some menace, moved the way Dokkaebi's phone hack moves
in Rainbow Six without copying any of how it looks.

**Proposed modification:** Medium's eye sits between the other two. Low's works out each cell on the
page's thread a few times a second, High's runs two passes on the graphics card on every frame, and
this runs one pass, thirty times a second, only while something is moving, so it asks for no frames
between one movement and the next. On the desk, 56 windows break in over seven seconds, each torn
across and thrown about for a quarter of a second, the notes stacking a little down and to the right
of each other until the stack runs out of room, with a ceiling of 80. The desk's own robot has gone
bad: a very small canvas, eight times a second, of static blocks flickering round it while it glares
at the cursor, bares its teeth, laughs and breaks up, and types out what it is doing to your machine.
Only the newest three act up at once. Static breaks out across the desk in surges, and otherwise its
canvas is put away. A project's picture is read once from its smallest copy and dithered onto a 96
by 60 canvas, and its OPEN opens that project.

**Implementation:** `iris.js`, `iris.css`, `vapor.js`, `vapor.css`, `portfolio.js`; `aero.js` and
`aero.css` removed.

**Before / after (each against its plain level, 3x, native, two interleaved rounds):**

| | Low eye | Medium eye | Medium desk | High eye |
| --- | --- | --- | --- | --- |
| At rest: frames a second | 7 | 16 | 9 | 60 |
| At rest: main thread | 14 ms/s | 15 ms/s | 26 ms/s | 53 ms/s |
| At rest: GPU 3D engine | 1% | 7% | 5% | 38% |
| At rest: GPU process CPU | 1% | 4% | 12% | 48% |
| Scroll: dropped (plain level) | 3.5% (6.7%) | 8.1% (15.2%) | 3.6% (9.5%) | 17.8% (33.3%) |
| Cursor over cards: dropped (plain level) | 3.2% (0.5%) | 1.9% (2.8%) | 0.2% (2.2%) | 15.2% (23.3%) |
| Ring turning: dropped (plain level) | 1.8% (1.3%) | 0% (0.9%) | 0.2% (0.7%) | 22.2% (15.3%) |
| Ring turning: GPU 3D engine (plain level) | 19% (34%) | 38% (18%) | 42% (18%) | 85% (70%) |

The plain levels keep their order too: at rest Low and Medium ask for nothing and High's GPU 3D engine
is at 34%; under the cursor the GPU 3D engine is 13%, 53% and 90%. The desk no longer asks for nothing
at rest, because the robot keeps moving, and it is the one thing at Medium that costs more at rest
than Medium's eye. Giving the robot's window a layer of its own took its main thread from 31 to 26
ms/s and the GPU process from 14% to 12%; the rest is what a page at three times the pixels costs to
put up nine times a second, and it stays about a quarter of High's. Under the cursor Low's eye costs
more than plain Low, as cycle 41 says.

**Result:** Adopted. Each level's looks stay in order: Low under Medium under High.

---

## Cycle 46: Every switch a transition, eyes that arrive, and a desk of 900 layers brought to 30 (adopted)

**Identified bottleneck:** a change of level was a cut with a pause while the new backdrop was
built, and so was a change of look. Two presses now go round the looks on any stop, with no ten to
find them first, and the look carries from level to level, so switches are far more common. And
after the desk's popups were multiplied to about two hundred, the desk cost more than High's eye on
a scroll (GPU 3D engine 76% against plain Medium's 38%) and under the cursor. A count of the
compositor's layers found why: 903 of them. Every one of the desk's little lettering canvases (590)
and project pictures (58) was a layer of its own, as a GPU-drawn canvas is, and with them every note
above one (209) had to be a layer too to keep its place in the pile. All of them were put together
on every frame, eight or nine frames a second at rest while the robot moves.

**Proposed modification:**
- `shift(kind, change)` holds a View Transition snapshot of the page while `change` builds the new
  one, then uncovers it with a compositor animation that says what changed: a level going up spreads
  out from the slider and going down draws back into it; an eye opens out of a slit and closes into
  one; the desk breaks in torn across and leaving it switches off like an old screen; the page goes
  dark for High's eye. While one plays, further changes go straight onto its new side. Low gets them
  too, and reduced motion skips them. The rule is in `CLAUDE.md` for anyone who works here next.
- Each eye arrives in its own way. Low's is simply there. Medium's lies shut, twitches, and wakes all
  at once with three rings of shock. High's builds itself out of the dark over 3.4 seconds of real time
  (so a slow machine does not watch it in slow motion): the lattice alone, the ground coming up from
  the foot of the screen, cells pouring in round it in arms, the ball winding in from its rim, then
  the white, the veins, the iris and the glint, all of it spinning down to stillness before it wakes.
  Both of the graphics-card eyes keep what they compiled between switches, so a switch back is at
  once; High's gives back its picture's memory.
- Low's own backdrop gets a draughtsman's construction drawn faint over the lattice, painted once.
- The desk's lettering is drawn once per line and shown as an image, and so are the project
  pictures. Only the robot's own typing, on the robot's own layer, stays a canvas.

**Implementation:** `portfolio.js`, `portfolio.css`, `y2k.js`, `iris.js`, `ego.js`, `vapor.js`,
`vapor.css`, `CLAUDE.md`.

**Before / after, the desk with about 220 out (3x, native, two interleaved rounds):**

| | Plain Medium | Desk, canvases | Desk, pictures |
| --- | --- | --- | --- |
| Compositor layers | - | 903 | about 30 |
| Scroll: dropped | 8.1-11.5% | 17.5% | 3.8% |
| Scroll: GPU 3D engine | 35-38% | 76% | 51% |
| At rest: main thread | 3 ms/s | 41 ms/s | 31 ms/s |
| At rest: GPU process CPU | 0% | 18% | 8% |
| Cursor over cards: dropped | 2.0-2.3% | 0.8% | 0.1% |
| Cursor over cards: GPU 3D engine | 49-50% | 61% | 42% |
| Ring turning: dropped | 0.5-0.8% | 3.9% | 0.6% |

The main thread still does more than plain Medium on a scroll and under the cursor (about 300 and
590 ms/s against 120 and 390): that is the burst itself, two hundred windows made in seven seconds,
which every one of these runs catches. It drops no more frames for it.

**The ladder, each look against its own plain level (3x, native, two interleaved rounds):**

| | Low eye | Medium eye | Medium desk | High eye |
| --- | --- | --- | --- | --- |
| At rest: frames a second | 7 | 11 | 9 | 60 |
| At rest: main thread | 14 ms/s | 11 ms/s | 31 ms/s | 46 ms/s |
| At rest: GPU 3D engine | 1% | 5% | 3% | 49% |
| At rest: GPU process CPU | 1% | 3% | 8% | 42% |
| Scroll: dropped (plain level) | 2.6% (6.9%) | 7.8% (9.8%) | 3.8% (11.5%) | 15.7% (26.6%) |
| Cursor over cards: dropped (plain level) | 3.4% (0.7%) | 1.2% (2.1%) | 0.1% (2.3%) | 11.3% (14.9%) |
| Ring turning: dropped (plain level) | 1.7% (2.2%) | 0% (1.0%) | 0.6% (0.8%) | 15.3% (5.0%) |

**Result:** Adopted. The earlier desk of 56 windows had the same fault on a smaller scale, about 250
layers; anything put on this site in quantity should be checked for it.

---

## Cycle 47: Dark skies, one large thing on High and many small ones, Medium held still (adopted)

**Identified bottleneck:** looks, then cost. The galaxies read as friendly: purple and blue,
bright, and on Medium and High one great spiral filled the right half of the screen. Wanted:
space dark, mysterious and frightening without anything from horror in it, a real galaxy;
Low dark with stars and only slow, few movements; Medium still, one large thing with a few
others round it; High all moving, no lattice, one large thing at most and many smaller ones
that change as the page is scrolled, with ships of two kinds fighting. Medium's living galaxy
was also the most expensive thing Medium did at rest, and on a basic graphics driver it would
have been drawn on the processor.

**Proposed modification:**
- One painter for the still sky (`paintGalaxySky` in `portfolio.js`, run once in a worker) in a
  dark palette: near-black deep, nebulae at half their old strength, a vignette. Low gets it as
  it was, darker, with its four slow glints and slow shooting stars. Medium gets the full
  painting: dust clouds, sixteen far galaxies, a large spiral with pale arms, heavy dust, red
  knots and a black hole at its heart, three black holes in discs of fire, a world with a ring,
  a red star dying in its shells and a galaxy edge on. Nothing on Medium moves.
- `cosmos.js` is High's alone. The galaxy at the top of the page is a third of the width it
  was. Down the page six things come in for every screen scrolled, each placed from its own
  number so the page is always the same, each at its own depth and speed, of eight kinds; at
  most 24 on the screen at once go to the shader, each pixel skipping any it is not near.
  Two kinds of fighters and their great ships fight on a 2D canvas over it, their numbers set
  by how far down the page it is.
- The shader is built on the side (`KHR_parallel_shader_compile`) and the galaxy fades in once
  it is ready, instead of the page stopping while it is compiled.
- A graphics card the browser imitates on the processor (SwiftShader, llvmpipe, Microsoft
  Basic Render Driver) gets no galaxy.

- The desk's loose words lost their pink blocks for a haze of pink round every letter, seven
  soft shadows deep. It read well and cost the desk a sixth of its frames on a scroll: 15-18%
  dropped against 3.8% in cycle 46. A lighter haze of three shadows, and a ring of twelve
  shadows with no blur at all, cost the same; so did a pink outline (`-webkit-text-stroke`
  under the letters, `paint-order: stroke fill`) on top of the headings' teal offset. With no
  shadow on the desk at all it was 2%. What kept it there and still reads: the outline alone
  on the words, and the headings' hard offset alone, with no outline on them. Drawing a
  shadow or an outline round type of the headings' size is what costs, not how soft it is.
- High's galaxy draws every other frame, a little softer, on a machine the page has eased
  (`data-effects-pace`), as the eye and the sky beside it already did.

**Implementation:** `portfolio.js`, `portfolio.css`, `galaxy.js`, `cosmos.js`, `vapor.css`.

**Low against the last commit, on `minimum` (no graphics acceleration, main thread 6x slower, two interleaved rounds):**

| | Last commit | Now | Now, eye |
| --- | --- | --- | --- |
| Scroll: dropped | 0.8% | 1.1% | 0.6% |
| Scroll: frames a second | 56.5 | 57.6 | 58.4 |
| Scroll: main thread (6x slower) | 764 ms/s | 842 ms/s | 803 ms/s |
| At rest: frames in eight seconds | 0 | 7 | 13 |
| At rest: main thread (6x slower) | 6 ms/s | 22 ms/s | 61 ms/s |

The seven frames at rest are its four glints changing step, the compositor's alone.

**Medium and High on `native` (3x, two interleaved rounds):**

| | Medium | Medium, desk | High, last commit | High, now |
| --- | --- | --- | --- | --- |
| Scroll: dropped | 9.6% (11.2% at the last commit) | 3.1% (16.5% with the haze) | 27.3% | 26.1% |
| Scroll: GPU 3D engine | 36% | 51% | 46% | 57% |
| At rest: frames a second | 0 | 18 | 25 | 42 |
| At rest: main thread | 3 ms/s | 43 ms/s | 85 ms/s | 135 ms/s |
| At rest: GPU 3D engine | 0% | 7% | 33% | 58% |
| At rest: GPU process CPU | 0% | 12% | 34% | 59% |

Before the easing above, High at rest drew 59 frames a second with the GPU 87% busy. Medium's
eye at rest: 6 frames a second, 13 ms/s. Switching to High stopped the page for 648 ms while
the shader was compiled; built on the side, 220 ms, the rest being the sky behind it.

Medium at rest now does less than Low: Low has its slow glints and Medium, asked to hold
still, has nothing. Both are next to nothing; everywhere else the order holds.

**Checks:** `smoke.ps1` 50 of 50 with graphics and 48 of 48 without; the desk with real
presses 34 of 34; with touch 11 of 11; every card's and sheet's picture in all seven looks,
with one report at Medium and High that is the 3D ring itself (two cards on it measured at
different angles, a pixel apart). The first smoke run failed three presses at High: the page
was stopped while the shader compiled, and the presses landed as one. Building it on the side
fixed that. High filmed down the whole page at 1470x860 and 390x844: no script errors.

**Result:** Adopted.

---

## Cycle 48: One living sky for Medium and High, things that act on each other, the sky going out when nobody is there (adopted)

**Identified bottleneck:** looks and lag together. High ran two skies at once: the old one
(`galaxy.js`, a 2D canvas redrawn over the whole screen) under the new galaxy (`cosmos.js`),
and on this machine's built-in graphics the galaxy drew every other frame, so what scrolled
with the page juddered against it. "Very laggy." The things scattered down High's page sat
still where they were put; Aloe's reference was the old High, where worlds fell into black
holes and craft landed on them. Medium was asked for movement again, things floating "that
interact with the background" without being "crazy". The pulsars (the bluish spinning thing
with beams and a blink) were to go everywhere. The black the backdrop went when the tab was
left was liked, and wanted on purpose: dark a few seconds after nobody moves, alive again on
the next move, at every level.

**Proposed modification:**
- `galaxy.js` is gone. Every level lays down the still sky (`paintGalaxySky`), which is now
  far off: stars, and far galaxies as points of light. Medium and High draw `cosmos.js` over
  it, one engine with two budgets (`LEVELS`). Medium's painting keeps its spiral; the black
  holes, the ringed world and the dying star painted into it before are now live.
- What is near acts on what is round it, all of it in the page's script and none of it on the
  graphics card but the drawing: each thing floats about its place and springs back when
  pushed; the cursor pushes; every so often a hole takes hold of the nearest thing it can
  swallow, which drifts in, is caught, goes round along the hole's disc faster and smaller,
  and is swallowed with a flare and sparks that mostly fall back; comets are bent by the holes
  and by the cursor and caught by the holes; worlds are lit from the side of whatever burns
  nearest; landers come down on worlds and are taken with one that goes in. At High the
  fighters steer round the worlds, are pulled at by the holes and taken if they stray, their
  shots bend round the holes and knock the orbs they hit. Medium's painted spiral has a live
  heart where the painting put it.
- The holes bend the picture behind them: `setupStillSky` hands the picture to `cosmos.js`,
  which samples it wherever a hole (or, gently, the cursor) bends the light, so the stars
  behind are drawn round a hole in a ring. Everywhere else the picture shows as it is.
- High is crowded with orbs -- rock, ice, molten under a crust, balls of light -- that wander
  further than anything else and can be pushed a long way; one pushed into a hole cracks,
  spins up, and comes apart on the way in, the pieces following it. Far things are small and
  slow. Pulsars are taken out; the orbs have their kind number.
- One full-screen pass for all of it, at High every frame (scale 1.25, or 1 eased -- easing no
  longer halves the frames), at Medium thirty a second unless something is moving fast, a
  scroll included. Two parallax layers of stars at High and one at Medium give the scroll
  depth. Each shader is built on the side; the other level's is built in idle time once the
  first is up, so a change of level does not wait for one.
- The backdrop goes dark at every level five seconds after the last move, scroll, key or
  touch (`IDLE_DARK_MS`), and `cosmos.js` stops drawing once it has faded; the next move
  wakes it with a flare. The eyes and the desk keep watching.
- Switches grade with the level. Up to High bursts out of the slider (`surge`); between the
  stars and the eye only the backdrop moves (`warp`): High swirls the old one down into a
  flash, holds black, and climbs the new one up from behind; Medium is the same lighter and
  Low a few steps. A new still picture fades over the old one (`.background-grid::after`)
  instead of replacing it in a frame, and is started at once on a change of level.

- On a machine the page has eased, High also rests at thirty frames a second, and takes every
  frame only while someone is scrolling or moving: every frame of a moving backdrop is every
  sheet of High's glass filtered again, which is most of what a frame costs (with the glass
  forced to frost, High dropped 36% on a scroll against 46%).
- Medium's desk (a helper agent, `vapor.js`, `vapor.css`): the pop-ups that did nothing are a
  wall painted once at three depths behind the page; those in front all lead somewhere.

**Implementation:** `cosmos.js`, `portfolio.js`, `portfolio.css`, `vapor.js`, `vapor.css`,
`CLAUDE.md`, `tools/perf/smoke.ps1`, `tools/perf/ab.ps1` (a port of its own for each arm: a
Chrome slow to close was stopping the next one starting); `galaxy.js` removed.

**On `native`, two interleaved rounds, kept awake by a key every second.** The machine was
busy with other work throughout and every number moved by a third between runs; compare
within a table only.

| | Low | Medium | High |
| --- | --- | --- | --- |
| Scroll: dropped | 7.5% | 18.2% | 41.5% |
| Scroll: GPU 3D engine | 24% | 50% | 43% |
| At rest: frames a second | 1.9 | 40 | 29 |
| At rest: main thread | 5 ms/s | 72 ms/s | 126 ms/s |
| At rest: GPU 3D engine | 0% | 35% | 59% |
| At rest: GPU process CPU | 3% | 24% | 81% |

| High | Before (two skies) | Now | Now, glass as frost |
| --- | --- | --- | --- |
| Scroll: dropped | 49.2% | 45.9% | 36.1% |
| Scroll: main thread | 137 ms/s | 56 ms/s | 72 ms/s |
| At rest: main thread | 220 ms/s | 76 ms/s | 85 ms/s |
| At rest: GPU 3D engine | 67% | 50% | 47% |
| At rest: compositing on the GPU process | 336 ms/s | 184 ms/s | 110 ms/s |

High's scroll is what it was; at rest it does less, and Medium sits between Low and High at
every point. Medium at rest is no longer nothing: it was asked to move. Left alone, every
level goes dark after five seconds: Medium measured 0.7 ms/s once it had, and High's frame
count stops a second and a half after the fade begins. The desk, by the helper's own five rounds: 8.3% dropped on a
scroll before, 3.6% now, 2,665 elements on it before and 1,024 now.

**Checks:** `smoke.ps1` 50 of 50 with graphics and 48 of 48 without (the transition check
now waits out the eye's warp before the next switch, and watches `data-warp` as well as
`data-shift`); touch 11 of 11; every card's and sheet's picture in all seven looks, the one
report again the 3D ring's two cards a pixel apart; the desk's own test with every front
pop-up pressed through to where it leads. High and Medium filmed at 1470x860 and 390x844, the
warp at High and the burst up to it filmed frame by frame: no script errors. In forty seconds
watched, Medium swallowed four things and High seven, and High went dark when left and came
back on one move.

**Result:** Adopted.

---

## Cycle 49: Darker, sharper, ships with a look, and switches that die and burst (adopted)

**Identified bottleneck:** looks. Set beside the live High (`galaxy.js`, near black, grey, a
dark planet lit only at its rim), the new skies were "very bright and colorful" with "a lot
going on"; the ships read as cursor arrows; the planets were blocky looked at closely, drawn
at one canvas pixel to a CSS pixel on an eased machine with a hard edge; and the switches
between the stars and the eye were a spinning rectangle. Low's switch was liked as High's.

**Proposed modification:**
- Medium and High graded dark and grey in the shader (`uDim`, `uMono`), stars, holes, nebulae
  and the galaxy dimmer, fewer things (High nine to a screen, orbs two in five of them), and
  the worlds and orbs dark and lit at the rim. The still picture for Medium and High painted
  near black with its colour taken down to a trace (`paintGalaxySky`'s `dark`), Low's as it was.
  The worker never got `live` before: Medium painted its holes, ringed world and dying star
  under the live ones. It does now.
- Worlds, orbs and moons have a soft edge a pixel wide, and High draws at up to twice the
  screen's pixels (1.5 on an eased machine), Medium 1.25.
- Each kind of ship drawn once, large, into a sprite of its own, and laid down turned; the
  great ships likewise; the wrecks the same sprites with the lights out; a faint wake behind
  each fighter.
- Switches between the stars and the eye at Medium and High drawn on a canvas of their own
  over the backdrop: leaving the stars the galaxy collapses and goes off in a Big Bang down to
  black, the eye arriving under it and waiting it out (`show({ after })`); leaving an eye it
  dies (`die(ms)`: the pupil blows, the lids come down), tears, and comes apart in blocks from
  the iris out before the stars burst back through the dark. Every eye, as it wakes, has light
  pour into its iris and starts out at the viewer. Low takes the old swirl, without filters.

**Implementation:** `cosmos.js`, `portfolio.js`, `portfolio.css`, `ego.js`, `iris.js`,
`CLAUDE.md`, `tools/perf/smoke.ps1`.

**High, sharper against drawn at 1x, on `native` (two interleaved rounds, kept awake):**
scroll 30.5% dropped against 31.3%; at rest 30 frames a second either way, the GPU 3D engine
52% against 45%. Kept: High has no ceiling, and the rest of the frame is the glass.

**Checks:** `smoke.ps1` 50 of 50 with graphics and 48 of 48 without (the test now waits out
Low's longer switch, and waits for High's eye to say it is awake, `data-awake`, before
pressing it); touch 11 of 11. The Big Bang at High and Medium, High's eye dying, and the light
pouring into it filmed frame by frame: no script errors.

**Result:** Adopted.

Afterwards, by request: the great ships and the wrecks are gone (the wrecks were the fighters'
sprites blown up past three times their size, "big weird ships"); Medium plays High's Big Bang
and death at full strength; and High's eye builds itself over five seconds from the bones out
-- a wire globe with its measurements marked, ten wedges coming in from an exploded view with
their cut edges lit, veins growing in from the rim, the iris, the skin closing over it from the
edges, a ring of light sealing it -- in place of the arms of cells. `smoke.ps1` 50 of 50 with
graphics (one run before that failed three of High's eye checks while the machine was busy
and passed on its own) and 48 of 48 without.

Then: Medium's things hold still on the screen (nine of them, no parallax, no wander, no
push; comets, feeding and landers still move); every level paints the same dark sky, Low's
shown at .62; High's things are placed down the page one after another and across and up the
screen by a Halton sequence, so the middle is no longer bare; High's switches between the
stars and the eye swirl and change colour as the galaxy falls in and pass through a trip of
wheeling colour before the new one; and Medium's eye builds itself from the bones out like
High's. `smoke.ps1` 50 of 50 with graphics and 48 of 48 without; touch 11 of 11.

Last, by request: the centred rainbow trip is gone. Medium and High play one switch: the Big
Bang, the eye building itself, then the eye's own dots, dithered in its colours, spiralling in
from the whole screen round the iris and swallowed by it (`pourIntoIris`, drawn cell by cell
into a small picture and laid on the screen with its pixels showing, about 20,000 cells), and
the eye waking wild for a second and a half or so; leaving it, its dots evaporate upward. From
one level's eye to another's the eye is simply there (`settled`). The frame monitor now looks
away while a switch plays (`deferPerformanceSampling`), since a switch's own work is not the
machine struggling. `smoke.ps1` over five runs with graphics: 50, 50, 49, 48 and 49 of 50,
each miss in a different check about the eye arriving at High or counting a step down and
each passing on the next run and in a probe on its own; without graphics 48 of 48 in every
run.

Then, by request: the spiral is faster and feeds the pupil. It lasts 0.6 s rather than 1.1
(`GATHER_MS` in ego.js and iris.js), turns about three times as fast, and wheels round the
pupil where the eye is looking (`irisAt`) rather than off to one side, in the iris's own
colours by how far out it is, pale pink at the middle through violet to lavender, with a cold
cyan streaking round, where it used to cycle five colours by angle. The holes lost the thin
bright ring at the edge of their dark (the shader's photon ring, and the stroke in the still
sky's fallback). And nothing is kept to the right any more: the holes and dying stars are
placed across the whole screen like everything else, the stars and things behind the words are
only a shade quieter, and the galaxy stands somewhere new each visit, chosen from the still
sky's seed (`portfolioSkySpot`), where Medium's painted spiral and its feeding heart and
High's living galaxy all go. Low's picture keeps its old composition.

Then: the spiral's five arms closed up, at the end, into a figure like a swastika, so the pour
has no arms at all now. It is a whirlpool of loose dots, about one to every five cells of its
grid (4,200 at most), each starting anywhere on the screen and winding in on a path of its own,
reaching the pupil at a time of its own, with a curved tail of five steps behind it; written
straight into the grid's pixels, so a frame is a few milliseconds of plain arithmetic. The eyes
go wild for half a second once awake, not 1.7 or 1.8, and Medium's and High's look at the cursor
all the time once awake, as Low's did; the two presses still fix them, flushed, as before. A
switch no longer leaves the new eye staring ahead until the cursor moves: the page keeps where
the cursor last was (`window.portfolioPointer`) and the eye looks there as it arrives.

Then Medium, which Aloe found laggy on this laptop (i7-1185G7, Iris Xe, a 3840x2400 screen at
3x). Measured in the bench Chrome at the screen's own scale, 1280x720, the page and data pinned
to the committed copies so only `cosmos.js` differed: Medium meant to rest at thirty frames a
second but drew about 55, because a comet out kept it at every frame, and with comets arriving
every 14 to 26 s and taking up to 16 to cross, one was nearly always out. Blocking `cosmos.js`
altogether brings the GPU 3D engine at rest from about 50% to 6%, and a scroll runs 29-34
frames a second with or without the sky (Low's runs 38-43): a scroll on this screen is slow
for the glass at 3x, not the sky. Drawing the comets alone between the sky's frames, on their
own canvas, saved nothing (61% against 57% at rest): any change under the glass has it blurred
again, and that is most of a frame. So Medium now stays at thirty through a scroll, the cursor
moving and a comet crossing, and only a world going into a hole takes it to every frame:

| Medium, 3x, medians | Before | After |
| --- | --- | --- |
| At rest: GPU 3D engine | 53% | 36% |
| At rest: sky frames a second | 60 | 30 |
| Cursor moving: GPU 3D engine | 54% | 48% |
| Scroll: page frames a second | 32 | 35 |

---

## Final checks (cycles 30-40 together)

On the merged tree, not the branches:

- `smoke.ps1`: 36 of 36 with graphics acceleration and 34 of 34 without.
- `layout-audit.ps1 -Level low|medium|high`: 0 of 24 screens with problems at each.
- The other sky end to end in a private Chrome, with real presses, 17 of 17: nothing of it
  fetched on a first visit at Medium; five presses on Low or Medium, five half a second
  apart, four, and three then a pause then two all do nothing; five quick ones on High bring
  it up about a second later with the glass still `refract`; a card still rises and leans; a
  project opens and closes over it; Medium removes it; High brings it back; a reload keeps it
  and `galaxy.js` does not run; five more put the space sky back; no script errors.
- With reduced motion asked for, its canvas is the same two shots 1.5 s apart, and it moves
  without.
- Layer log, Low: an About card and a Skills card now go through a hover with the same
  layers, no arrow and no rim among them.
- Not measured: the lines of cycle 39 on the machine that showed them, a real phone, or any
  browser but Chrome.

Cycles 41-46, on the finished tree:

- `smoke.ps1`: 50 of 50 with graphics acceleration and 48 of 48 without, including one press and two
  slow ones doing nothing, two quick ones finding each look and going round them, the eye carrying
  from level to level, Medium's desk last and its absence at the other levels, a double press setting
  High's eye following once it has built itself, a transition playing for a change of look and of
  level, each level's own backdrop returning, and a reload going back to the usual look. With no
  graphics the two-press steps are handed to the slider together, as presses sent one at a time
  arrive further apart there than any hand's. One run without graphics failed 'moving it back up after
  a step down is counted' straight after a reload, and passed on the next run.
- Every transition and High's eye being built, filmed frame by frame: each kind plays, and no script
  errors.
- `layout-audit.ps1 -Level low|medium|high`: 0 of 24 screens with problems at each, with the
  page's own looks. With each hidden look on: all three eyes 0 of 24. The Medium desk reports 13 of 24,
  every one a touch screen and every report the same: its small retro controls are small to look at.
  They answer beyond their edges, which that check does not measure.
- The looks at seventeen screens, photographed and looked at: no sideways overflow, nothing
  stranded off the screen, no script errors. The bright sky was checked at these before it was removed.
- The Medium desk, with real presses, 34 of 34: next to nothing out to begin with, about a hundred at
  three and a half seconds, two hundred at seven (on time, however late its timers run, since it makes
  up whatever is due), then a pause; all six real things among them, with the robot, project pictures
  that had arrived and links to the page; the robot's picture changing; fixed as the page scrolls and
  behind it; a press that moves straight off carrying nothing; a hold lifting one; a fast flick carrying
  it over the page and under the navigation; sinking back when let go; a slow press on a button still
  pressing it; a project popup opening its project; a warning scrolling to the page; STOP IT not closing
  the robot; closing it bringing it back; the static going away again; the gaps after the burst all 5 to
  30 s; 260 and no more.
- The same with real touch events at a phone's size, 11 of 11: a swipe across a window scrolling the
  page and leaving it where it was; a hold lifting it; the finger carrying it with the page not
  scrolling; a tap just off a small key closing the note.
- Not measured: a real phone or tablet, or any browser but Chrome, so nothing here has seen Safari on
  an iPhone or a Mac. A real 4K monitor: at 3840x2160 under emulation the test browser stalls for tens
  of seconds in waits with no painting in them, which 3440x1440 does not, so the figure says more
  about the emulation than the page. The custom cursors could not be seen in a captured screenshot.
