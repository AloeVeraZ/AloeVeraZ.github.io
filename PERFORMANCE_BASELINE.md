# Performance baseline

Measured on 24 October 2026, against commit `47e16a0` (the site before any of
the changes in [OPTIMIZATION_LOG.md](OPTIMIZATION_LOG.md)). Every number here
comes from `tools/perf/` (see [its README](tools/perf/README.md)), which drives
a private copy of Chrome over the DevTools protocol and reads Chrome's own
traces.

## The machine, and what it can and cannot stand in for

| | |
| --- | --- |
| Laptop | Lenovo ThinkPad X1 Yoga Gen 6 |
| CPU | Intel Core i7-1185G7, 4 cores / 8 threads |
| GPU | Intel Iris Xe (integrated), driver 32.0.101.7026 |
| Memory | 16 GB |
| Display | 3840 x 2400 at 300% (devicePixelRatio 3), 60 Hz |
| Browser | Chrome 155.0.8059.86, Windows 11 |

**No Apple hardware was available.** The "mac" configuration below runs this
laptop at a MacBook Air's default viewport and 2x scale, and tells the page it
is on Apple graphics so it runs its sky at the full rate it would use on a Mac
(on this machine it detects Intel graphics and slows the sky). It is a guess at
the shape of the load, not a measurement of a MacBook: Iris Xe is in the same
class as a base M1 GPU for raw throughput and memory bandwidth, but Chrome on
macOS draws through Metal, with less driver overhead than Direct3D 11 here,
and an M-series CPU is faster per core. No figure in this file should be read
as a MacBook Neo or MacBook Air result.

Other load on the machine (the Claude app, Discord, other Electron apps) moved
results by 10-30% between runs. Comparisons in the log are always interleaved
A/B runs, never numbers taken at different times.

| Config | Viewport | Scale | Stands in for |
| --- | --- | --- | --- |
| `mac` | 1470 x 860 | 2x | A 13-inch MacBook Air (page told it is on Apple graphics) |
| `native` | 1280 x 720 | 3x | This laptop, as a visitor would have it |
| `lowend` | 1366 x 650 | 1x | No graphics acceleration at all, CPU slowed 4x |
| `phone` | 390 x 844 | 3x | A mid-range phone's main thread (CPU slowed 4x); says nothing about a phone GPU |

## Headline numbers

**Dropped frames** are Chrome's own count of frames the page meant to show and
did not get to the screen in time (`PipelineReporter`), so a page at rest that
has nothing to draw is not penalised. Two rounds each for `mac` and `native`.

| Scenario | mac dropped | native dropped | mac GPU 3D | native GPU 3D |
| --- | --- | --- | --- | --- |
| Idle at the top | 0% / 0% | 0% / 0% | 10-11% | 12% |
| Idle at the projects | 0.4% / 4.0% | 0% / 0% | 20-33% | 34-43% |
| Scroll the whole page | 2.4% / 2.2% | 9.2% / 5.8% | 51-52% | 66-70% |
| Cursor across the featured cards | 1.8% / 0.9% | 8.8% / 8.3% | 72-73% | 91-92% |
| Turn an archive ring six times | 0% / 0% | 0% / 0.5% | 18-22% | 21-23% |
| Open, scroll and close two projects | **16.1% / 16.4%** | **23.6% / 25.7%** | 39-43% | 51-53% |
| High FX to Low FX and back | 16.7% / 14.0% | 17.4% / 19.3% | 27-30% | 37-38% |
| Open every collection, then scroll | 6.0% / 6.5% | 20.8% / 13.5% | 68-69% | 76-83% |

| Low end and phone (one round) | Dropped | Page main thread |
| --- | --- | --- |
| lowend idle | 77% | 1028 ms/s busy, 61 long tasks in 8 s |
| lowend scroll | 38% | 1049 ms/s |
| lowend cursor across cards | 53% | 858 ms/s |
| lowend project open/close | 51% | 808 ms/s |
| phone idle | 28% | 504 ms/s |
| phone scroll | 27% | 904 ms/s |
| phone ring | 8.5% | 728 ms/s |
| phone project open/close | 9.3% | 652 ms/s |

### Where the time goes (mac, per second of the scenario)

| Scenario | Page main thread | GPU process CPU | GPU process main thread: compositing / sky canvas / page tiles |
| --- | --- | --- | --- |
| Idle at the top | 106-110 ms | 22-24% | 36-40 / 89-105 / - ms |
| Idle at the projects | 100-101 ms | 37-41% | 128-161 / 78-98 / - ms |
| Scroll | 204-275 ms | 88-172% | 279-347 / 172-245 / 89-146 ms |
| Cursor across cards | 374-377 ms | 83-84% | 315-327 / 53-70 / 105-113 ms |
| Open every collection | 272-275 ms | 111-113% | 440-461 / 139-153 / 113-114 ms |

### Loading (local server, so network time is near zero)

| Config | First paint | DOMContentLoaded | LCP | Requests | Transferred (decoded) | Images loaded | CLS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| mac, cold | 104 ms | 106 ms | 104 ms | 44 | 2036 KB (2560) | 28 | 0.012 |
| mac, warm | 288 ms | 50 ms | 288 ms | 43 | 11 KB (254) | 28 | 0.012 |
| native, cold | 104 ms | 108 ms | 104 ms | 44 | 3572 KB (4095) | 28 | 0.011 |
| lowend, cold | 552 ms | 937 ms | 552 ms | 44 | 2036 KB (2560) | 28 | 0.008 |
| phone, cold | 336 ms | 694 ms | 336 ms | 44 | 3572 KB (4095) | 28 | **0.342** |

### Memory

| Run | JS heap (after GC) | DOM nodes | Event listeners |
| --- | --- | --- | --- |
| mac, 60 s untouched | 12.1 -> 12.9 MB | 3028 -> 3038 | 375 -> 375 |
| native, 60 s untouched | 10.2 -> 10.9 MB | 3011 -> 3017 | 375 -> 375 |
| mac, 4 rounds of project/FX/collections | 12.7 -> 17.3 MB | 3055 -> 3205 | 375 -> 375 |
| native, the same | 12.1 -> 14.7 MB | 3054 -> 3196 | 375 -> 375 |

Listeners do not grow. The ~140 extra nodes are the project sheet keeping the
last project it showed, which is by design.

## What the baseline found

1. **The graphics process, not the page, runs out of time.** During a scroll
   the GPU process's main thread is 75-85% busy and 84% of that is CPU work
   (Skia and ANGLE turning drawing into Direct3D calls), while the page's own
   main thread sits 20-25% busy. Chrome holds the page's next frame until the
   last one's tiles are rastered, so the page gets a frame only 12-25 times a
   second during a scroll, with gaps of up to 0.24-0.5 s. The content scrolls
   smoothly on the compositor, but the starfield is a fixed canvas that only
   moves when the page redraws it: **its parallax steps irregularly while the
   page glides**, which is the stutter. 9-43 frames per scroll also show
   content not yet rastered.
2. **The glass is most of that work.** With every backdrop filter switched off
   (an ablation, not a candidate), the idle GPU load on the projects view fell
   from 42% to 10% and late frames during a scroll from 10.3% to 3.9%. The bend
   at the rim (the SVG displacement) is about half of the glass's cost; the
   frost, the overlay-blended rim, the shadows and the sheen cost little.
3. **Opening a project with a video freezes the screen for ~400 ms.** The
   YouTube player, as it starts up, creates a WebGPU device in Chrome's GPU
   process, which blocks the thread that draws every frame. Without the
   iframe the same open/scroll/close drops 4-5% of frames instead of 16-20%.
4. **At rest, small layers repaint the glass.** A feeding black hole and a
   shooting star each draw on a small canvas of their own, but the compositor
   redraws one bounding box per frame: two small layers far apart, or one
   under the navigation bar (which the open-sky test does not count as glass),
   made the compositor re-filter most of the glass on screen ~24 times a
   second on top of the sky's own 8-15.
5. **Hovering a card** is GPU-bound on this laptop (91% at 3x): the tilted
   card's glass is re-filtered every frame. Style recalculation adds 120-130
   ms/s, mostly the cursor's trail sparks and the card's own tilt transition.
6. **A machine with no graphics acceleration** starts in High FX and spends
   ten seconds or more as a slideshow before the frame monitor drops it to Low
   FX, and every reload starts over.
7. **On a phone the first load shifts its layout** (CLS 0.34, "poor").
8. **A first visit downloads 25 card pictures nobody can see yet**: the
   duplicate cards each archive ring keeps at its ends load eagerly, inside
   collections that have not been opened.

## Visual references

`tools/perf/capture.ps1` saved the baseline's look before any change, in
`tools/.cache/perf/visual/` (not committed; rebuild them from `47e16a0` with
the same script):

- `baseline/`: hero, About, Skills, projects, a hovered card, an open ring,
  Contact and an open project, on the mac, native, tablet and phone screens.
- `baseline-pattern/`: the same with a fixed, sharp test pattern in place of
  the sky, so glass, layout and type can be compared to the pixel. Two
  captures of the unchanged page differ by at most 2/255 everywhere except the
  hovered card and the open project, whose pictures are animations.
- `baseline-lowfx/`: Low FX on the mac and phone screens.
