# Working on this site

For any agent working in this repository. The README says how the site works and
OPTIMIZATION_LOG.md why it is built the way it is; these are the rules that are easy to miss.

## Every switch has a transition

Anything that changes what the page looks like at the press of a control (an effects level,
a hidden look, a theme, anything added later that switches the page's look) is never a cut and
never a bare pause, and the higher the level the more happens. Two tools in `portfolio.js`:

- `shift(kind, change)` holds a View Transition snapshot of the whole page while `change` builds
  the new one, and uncovers it with the keyframes keyed on `html[data-shift]` in `portfolio.css`.
  Levels use it: up to Medium spreads out from the slider (`rise`), up to High bursts out of it
  blinding while the old page falls away (`surge`), and going down draws back into it (`fall`).
  The desk breaks in torn across (`glitch`) and leaving it switches off like an old screen
  (`off`); Aloe likes those two as they are.
- `warp(level, change, from, to)` moves only the backdrop (every body child before the scroll
  bar), for switches that change nothing else: the stars and the eye. Low swirls the old one down
  into a point and climbs the new one up from behind (`SPIN`, transforms and opacity only). Medium
  and High, the same at both, draw on a canvas of their own over the backdrop (`fx`): leaving the
  stars is a Big Bang
  (`bigBang`), and leaving an eye it dies and decompiles into blocks before the stars burst back
  (`decompile`). The eyes do their own part: `die(ms)` on the way out, and as they wake they send
  `portfolio:eye-gather` (light pours into the iris) and pop out at the viewer.
- Design the High version first, as big as it can be, then simplify it for Medium and Low.
  Reduced motion skips them all.
- While one plays, further changes apply directly, so they show on its new side instead of
  cutting it short.

## What each level has to run on

- **Low** runs on the cheapest machine there is: Windows' own minimum, a dual-core at about
  1 GHz, 4 GB and basic graphics. Measure it on `tools/perf/bench.ps1 -Config minimum` (no
  graphics acceleration, the main thread slowed 6x). Paint expensive things once, off the page's
  thread; anything that moves is a compositor animation in steps or a very small canvas, and
  nothing asks for frames it does not need.
- **Medium** runs on an ordinary 11th or 12th generation Intel laptop, or its AMD and Apple
  equivalents. Measure it on `-Config native` on this machine, an i7-1185G7 on Iris Xe.
- **High** has no ceiling. It is allowed to bring an old laptop to its knees.
- Keep the order: Low costs less than Medium, and Medium less than High, in every look.

## The skies

- Every level paints the still sky once (`setupStillSky`). Medium and High draw `cosmos.js` over
  it: one engine, two budgets (`LEVELS` there). Aloe settled Low; leave it be.
- Every level has the same background, dark and nearly without colour, like High before them
  (aloeveraz.github.io as of early November 2026): near black, the light in it cold and grey,
  worlds dark and lit at the rim; Low shows it dimmer. Keep anything new that way; Aloe found a
  brighter, more colourful sky "a lot going on", and Low's old blue wrong.
- What separates the levels is how much happens: Medium's things hold still on the screen (only
  comets, feeding and landers move), High's are spread down the page, evenly, and pass at
  their own depths. Things stand anywhere across the screen, the holes as much as the rest, and
  the galaxy (Medium's painted spiral and its feeding heart, High's living one) stands somewhere
  new each visit (`portfolioSkySpot`); Aloe found them all on the right side. The holes have no
  bright ring at their edge: Aloe had it taken off.
- Far is the still picture: stars and far galaxies as points of light. Near is the living sky,
  and what is in it acts on what is around it: holes pull things in and swallow them, worlds and
  orbs are lit by whatever burns nearest, comets bend round the holes, the cursor pushes and
  bends, and at High the orbs crowd in, can be pushed into holes, and break apart going in, with
  the fighters and landers round all of it. Anything added should do the same, not sit there as
  decoration. Nothing big and strange: the great ships and the wrecks were taken out. No
  pulsars or anything else with beams sweeping and blinking: Aloe took them out.
- Medium's and High's eyes build themselves in five seconds from the bones out (iris.js, ego.js,
  `uBirth`): wire skeleton, pieces locking in from an exploded view, veins, iris, skin, sealed.
  Aloe's reference was anatomy drawn skin to bones, done by a machine. Whole, the eye's own dots,
  loose and thousands of them, in its iris's colours, whirl in from the whole screen and are
  swallowed by its pupil in about half a second (`pourIntoIris`, `GATHER_MS`), and it wakes and
  goes wild for half a second. Each dot keeps a path of its own: a spiral with arms read as a
  swastika once it shrank, so nothing in a switch may make arms or any figure.
- Every eye looks at the cursor all the time once it is awake, and an eye a switch brings in
  looks where the cursor already is (`window.portfolioPointer`). Two presses at Medium and High
  still fix it, pupil pinned and iris flushed, for fifteen seconds. Medium and High play the
  same switch. From one level's eye to another's there is no build: `show({ settled: true })`.
  A centred rainbow spiral between switches was tried and dropped as "kind of shitty".
- The sky goes black a few seconds after the last input, at every level, and comes back alive
  when anyone moves (`IDLE_DARK_MS`). The eyes and the desk don't.

## The hidden looks

- Two quick presses on any stop of the effects slider go round that level's looks. A reload
  goes back to the default.
- Every level has its usual sky and an eye (`y2k.*` Low, `iris.*` Medium, `ego.*` High); Medium
  has the pink desk (`vapor.*`) last. The choice carries across levels.
- Each look keeps to its level's budget: Low asks for almost nothing, Medium little, High what it
  must. Measure a change against the plain level before keeping it.
- Every look has to hold up at any size and shape, from a folding phone to an ultrawide monitor.
- No lettering in backdrops, and no Japanese or other Asian-styled lettering anywhere.
