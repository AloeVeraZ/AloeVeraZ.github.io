# Performance and regression tools

Windows PowerShell 5.1 scripts that measure the site in a private copy of
Chrome over the DevTools protocol. Nothing to install: they use Chrome, the
.NET Framework that ships with Windows, and two small C# helpers compiled on
the fly. The browser runs off the left edge of the screen with its own
profile, so a run never covers the desktop or touches your own Chrome.

Start the local server first and leave it running:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/perf/serve.ps1
```

| Script | What it does |
| --- | --- |
| `serve.ps1` | Static server on port 8862 that answers like GitHub Pages: gzip, ETags and 304s, `404.html`. `-CacheSeconds 600` for warm-cache runs. |
| `bench.ps1` | Runs the interaction scenarios and records a trace of each. Results land in `tools/.cache/perf/` (git-ignored). |
| `ab.ps1` | Runs variants of the page against each other, interleaved round by round, and prints medians side by side. |
| `capture.ps1` | Screenshots of the main states on several screens; `-CompareWith` diffs two captures pixel by pixel. |
| `layout-audit.ps1` | Loads the page on 24 screens, from folding phones to 4K, and checks for sideways scrolling, clipped text, small tap targets and type below 13px. |
| `Cdp.psm1`, `TraceStats.cs`, `ImageDiff.cs` | The DevTools client, the trace reader and the image differ the scripts share. |

## Configurations

`-Config` picks what the run stands in for. None of them is the hardware it
is named after: they are this machine (an Intel Iris Xe laptop with a
3840x2400 screen at 300%) set up to resemble it.

| Config | Viewport | Scale | Notes |
| --- | --- | --- | --- |
| `native` | 1280 x 720 | 3x | This laptop as it is. The page sees Intel graphics and starts with its sky eased. |
| `mac` | 1470 x 860 | 2x | A 13-inch MacBook Air's default size. The page is told it runs on Apple graphics, so it runs its sky at full rate as it would on a Mac. |
| `lowend` | 1366 x 650 | 1x | No graphics acceleration at all (software compositing) and the main thread slowed 4x. |
| `phone` | 390 x 844 | 3x | A touch phone, main thread slowed 4x. Says nothing about a phone's graphics. |

## Scenarios

`idle-top`, `idle-projects`: eight seconds untouched at the top of the page
and at the projects. `scroll`: one steady wheel scroll from the top to the
foot of the page at 1800 px/s. `hover`: the cursor travelling across the
three featured cards for five seconds. `ring`: an archive ring turned six
times. `modal`: two projects opened, scrolled and closed. `modal-idle`: a
project left open for eight seconds. `modal-scroll`: an open project scrolled
from top to bottom, timed from two seconds after it opened. `fx-toggle`: the
effects slider walked from where the page starts down to Low a stop at a
time and back up to High, a second and a half on each.
`collections`: every collection opened, then a scroll to the foot of the page.

Every scenario starts from a freshly loaded page, nine seconds after load so
the page's frame monitor has finished its warm-up. `Math.random` is seeded,
so every run draws the same sky.

## Effects levels

`bench.ps1`, `capture.ps1` and `layout-audit.ps1` take `-Level low`,
`medium` or `high`, which starts every load at that level as if the visitor
had chosen it on the slider and insisted on it, so the frame monitor never
steps it down (`-LowFx` still means `-Level low`). Without it each load is a
first visit and starts Medium. In `ab.ps1` a level is an arm's `Js`, for
example
`@{ medium = @{ Js = "sessionStorage.setItem('portfolio-effects-level', 'medium'); sessionStorage.setItem('portfolio-effects-overrides', '3');" } }`.
`Set-EffectsLevel` in `Cdp.psm1` moves the slider during a run; a level set
that way can still be stepped down, as a visitor's can.

## Reading the numbers

- **fps, frameMedianMs, frameP95Ms, frameP99Ms**: frames reaching the screen
  (the GPU process's `Display::DrawAndSwap`) and the gaps between them. A page
  at rest draws nothing, so idle fps is how often the sky redraws, not a
  measure of smoothness.
- **framesOver16_7Pct**: the share of gaps of 1.5 display frames or more, i.e.
  frames that missed a vsync.
- **mainTaskMsPerSec**: the page's main thread, busy milliseconds per second.
- **cpu_renderer, cpu_GPU**: CPU use of the page's process and Chrome's GPU
  process, in percent of one core.
- **gpu3d**: Windows' 3D-engine utilization counter for the GPU process, as
  Task Manager shows it.
- **gpuMsPerSec_composite / canvas / tiles / swap**: the GPU process's main
  thread, split into drawing the screen (layers, glass filters), replaying
  the sky canvas, rasterising page tiles, and presenting.

The machine's own load moves every number by 10 to 30 percent between runs.
Compare arms of one `ab.ps1` run, never numbers from different days.
