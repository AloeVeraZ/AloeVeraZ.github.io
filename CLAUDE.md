# Working on this site

For any agent working in this repository. The README says how the site works and
OPTIMIZATION_LOG.md why it is built the way it is; these are the rules that are easy to miss.

## Every word comes from the data

- What a visitor reads (the hero, every section's headings, the About cards, skills, archive
  folders, projects and every link) is in `portfolio-data.json`, and Aloe edits it there and
  nowhere else. Don't type words into `index.html` or a script: give the element a
  `data-content` naming its field, or render it from the data.
- Every object of a kind has the same fields in the same order, empty where unused, and every
  link is `{ type, label, url }` (README, "Edit the site"; `portfolio-template.json`). A new
  field goes into the format in `tools/check-data.py`, the template and every object at once.
- Run `python tools/check-data.py` after touching the data; `--fix` also copies the words
  into `index.html`'s first-paint copy.
- The levels and hidden looks never keep their own copy of the content: they show the one page,
  and Medium's desk makes its pop-ups from the page's own cards, folders and links.

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
- Medium's sky draws thirty frames a second and stays there through a scroll, the cursor moving
  and a comet crossing; only a world going into a hole takes it to every frame. Most of what a
  frame costs is the glass over it blurred again, which any change under it sets off, so the
  way to make Medium cheaper is fewer frames, not a cheaper shader.
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
- Every eye is drawn in characters, at every level (Aloe's reference was ASCII-for-Nuke style
  footage). The eye is still worked out a cell at a time on its small picture; each character
  cell of the screen then takes the character that inks it about as much as the eye is bright
  there, in the eye's own colours (`portfolioGlyphs` in portfolio.js ranks the characters; the
  SCREEN passes in iris.js and ego.js, `drawGlyphs` in y2k.js). The characters never quite
  hold still: some step to the one either side a few times a second, and they roll through
  any character while the eye builds or is struck; at High a band of them also sweeps across.
  The characters are the eye: nothing under them shows its shape (no aura behind it, the page
  black), and High's bloom and shafts are made from the drawn characters and kept close round
  them. Aloe saw an eye with letters laid over it otherwise. The higher the level, the finer:
  Low's characters are three of its cells tall (at least 9px); Medium works the eye out on
  1.5 times as many cells each way and High on twice as many (`DETAIL`), with characters three
  of those cells tall (at least 8px and 7px), drawn on the screen's own pixels up to 2x.
  Plain Latin characters only. Everything a switch or a waking draws on the shared canvas
  (`fx` in portfolio.js: the ripple, the swirl into the iris, the Big Bang, the eye coming
  apart) is turned into characters the same way, each frame, at the level's character size;
  what is drawn black stays black behind them. Draw the character strip from `glyphs.image`
  (a bitmap) on a 2D canvas, never the strip's own canvas: a screen of them stalled a second.
  The eye and everything round it stay purple: no colour split on the characters (it left
  them green), the press tint violet, nothing cyan or warm.
- Every eye wakes without tracking the cursor and looks about for itself. Two presses on
  the visible eye (away from page controls) tint the iris and start tracking for ten seconds,
  then the resting color returns and tracking stops. This applies at Low, Medium and High. Medium and High play the
  same switch. From one level's eye to another's there is no build: `show({ settled: true })`.
  A centred rainbow spiral between switches was tried and dropped as "kind of shitty".
- The sky goes black a few seconds after the last input, at every level, and comes back alive
  when anyone moves (`IDLE_DARK_MS`). The eyes and the desk don't.

## The hidden looks

- One click on the diamond or two quick presses on a slider stop cycle that level's looks. A reload
  goes back to the default.
- The eye is the default at every level (`y2k.*` Low, `iris.*` Medium, `ego.*` High), the space
  sky is second, and Medium has the pink desk (`vapor.*`) last. The choice carries across levels.
- The page loads with the eye asleep (`eyeAsleep`, `html[data-eye-asleep]`): the eye itself does
  not show, and the page is black with a closed eye's slit of light where it lies, stirring,
  drawn by the eye itself (`rest()`, `sleepingLine()` in iris.js and ego.js) in characters far
  smaller than the eye's (about 3.5-4px, packed close) so together they make one sharp line:
  hair-thin and long, its length breathing, waves running along it and swelling it open at
  points, a pulse out from the middle every few seconds, colour drifting through lilac, pink
  and blue-violet with white peering out of the core, a dust of faint characters round it like
  the old line's haze, characters scrambling where a wave or ripple passes, and opening toward
  the pointer with ripples out from it, to invite the press, with its pulsing middle and four
  glints running along it, the same length at Medium and High. At both the eye is trying to get
  out (`strainAt`, `uStrain`): every few seconds it strains, trembling, bulges open round one
  place far enough to glimpse its iris and dark pupil, rays of light forcing out, and is
  slammed shut with a flash. Medium does it gently and less often (no tear, no jolt); High
  harder, with a tear and a jolt as it slams, and more round it even at rest: sparks drifting
  off it, rays always flickering, waves running both ways, six glints. One shader body in both
  files with the amounts as constants at its head (TREMBLE, BULGE, RAYS...): Medium and High
  differ in how much happens, not in what. Aloe wanted it thin, tiny-charactered and
  enticing. Low plain black.
  Aloe found the shut lids drawn as dithered lines "cheap"; keep the idle state soft. One press on the page away from controls sends a ripple out
  from the press (`ripple`, `rouseEye` in portfolio.js) and calls the eye's `rouse()`: the lids
  open on a plain ball, the skin draws back to leave just a circle, and then the build and waking
  play, at Low too (`paintBuild` in y2k.js, the same pieces falling into place). The plain ball
  is held no brighter than the eye awake: at High it used to white the screen out. Cycling the
  looks back round to the eye puts it to sleep again, as on first landing; changing level
  leaves it as it is. Reduced motion starts awake.
- Each look keeps to its level's budget: Low asks for almost nothing, Medium little, High what it
  must. Measure a change against the plain level before keeping it.
- Every look has to hold up at any size and shape, from a folding phone to an ultrawide monitor.
- No lettering in backdrops, and no Japanese or other Asian-styled lettering anywhere.
