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
