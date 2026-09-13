# Portfolio Website

Personal portfolio for Gabriel Cameron. Purpose is professional utility: display work
experience in a way that maximizes the chance of landing better-paying jobs.

## Product constraints

- **Audience: hiring managers and recruiters.** Credibility and fast scanning beat
  cleverness. A visitor should know who Gabriel is without scrolling.
- **Mobile is a first-class target, not a fallback.** Much of the traffic will arrive from
  LinkedIn on phones. Every feature must function and scale well on small touch screens
  before it is considered done. Desktop/laptop is primary only in the sense of being the
  most common single case.
- Commits use the personal identity (`gabrielcameron99@gmail.com`), not the Indeed address.

## Homepage animation

The defining feature. Dark background, bright blue-white "neurons" on a night-sky-like
field. Inspired by <https://benscott.dev> (source: `github.com/bscottnz/portfolio-site`).

**That repo has no license — all rights reserved. Never copy its code.** It was read only
to understand the technique (Canvas 2D proximity web, links computed per frame).

Ours is deliberately a different structure, which is what makes it distinct:

- **Persistent graph.** Each neuron keeps 2-4 fixed connections to nearby neighbors.
  Links do not flicker in and out by proximity. This is load-bearing: the click effect
  needs a graph to travel along.
- **Dendrites are curved,** not straight. Straight lines read as star charts; curves read
  as biology.
- **Cursor illuminates** existing pathways within a radius; it does not create links.
- **Brightness swells drift across the field** — neurons and pathways brighten and dim
  again in slow waves. This is the resting state, and the whole point of it: the page
  should feel like a *thinking brain*, not like a decoration that ticks.
- **Click fires an action potential** — a wavefront races outward hop by hop through the
  graph, branching at junctions, and **dimming and slowing** as it goes. Reaches most of
  the screen. Reads as forked lightning.
- **Click also ripples the field** — an expanding ring physically displaces neurons along
  the radius, like a stone dropped in still water, bending the dendrites with them.
  **Deliberately slow**: a third of the speed of a signal, with a long wavelength and a
  wide band, so it reads as one broad swell moving through tissue. A faster ring was tried
  and rejected — it was over before the eye could follow it, which reads as a flinch
  rather than as thought. Do not speed this up without asking.

There is deliberately **no unprompted firing.** Travelling signals that appeared on their
own were tried and rejected — they read as random ripples rather than thought. Signals
now only ever come from a click; the resting life comes from the swells.

Tone: **alive but restrained.** Never busy enough to compete with the hero text over it.

**The background is signed off and locked** (as of 2026-09-12). Do not retune the
animation's feel without being asked. Fixing a measured bug is fine; adjusting how it
looks is not.

Hero content over the canvas: name, title, CTA. No tagline.

**Type treatment: monospace, lowercase.** Chosen from a board of eight options, on the
argument that it reads as plainly technical and claims nothing it cannot back up. The
name and role are lowercased in CSS, not in the content, so the name stays properly
capitalised for screen readers and the page title. The CTA follows into monospace and
squares off its corners, or the two read as different voices.

The role keeps the accent blue at Gabriel's request. The treatment it replaced was
tracked-out all-caps *and* accent-tinted, which together are the commonest
generated-page tell; dropping the all-caps and the letter-spacing was the part that
mattered.

This is the one direction of the eight that needs no web font: every platform ships a
usable monospace, so the hero costs nothing to download. A distinctive mono (JetBrains
Mono, IBM Plex Mono) would sharpen it and is the obvious upgrade if it ever feels too
generic — but it is not required for the design to hold.

A fifth mechanic closes a hole the above leaves: **a wandering focus**. There is no
cursor on a phone, so an unattended focus point drifts through the network on its own,
illuminating as it passes; the pointer takes it over while being moved and hands back
2.5s after it stops. Phones get the full effect, and desktop looks alive before the
visitor touches anything.

### Reduced motion: calm, not dead

`prefers-reduced-motion: reduce` does **not** stop the animation. An earlier version
rendered a single still frame, which looked like a broken page — and it is a common
preference, since Windows 11 reports it whenever *Accessibility -> Visual effects ->
Animation effects* is off, which people switch off for perceived speed rather than
motion sensitivity. Ben Scott's site ignores the preference entirely; this one honours a
narrower rule that matches what the preference is for:

> **Nothing moves unless the visitor moves it.**

`calmVariant()` in `config.ts` drops the wobble and the drifting focus, freezes the
brightness swells where they are, and slows and shortens a strike. Illumination still follows a pointer and a tap
still fires. The frame loop also idles between interactions in this mode, since the image
is not changing — the tail has to outlast the afterglow or a strike freezes mid-decay.

Do not "fix" a still hero by deleting the preference check. If full motion for everyone
is ever wanted, that is a product decision to take deliberately.

## Technical decisions

- **Astro 7 + TypeScript, plain CSS, no runtime dependencies.** Astro ships zero JS by
  default, so the only script on the page is the animation. Chosen over Next (would add
  a React runtime to a site with no app state) and bare Vite (no layouts, no image
  optimisation, no content collections for the work history).
- **Canvas 2D, no animation dependencies**, with a spatial grid for neighbor lookups.
  Not WebGL: the effect is line-dominated rather than particle-count-dominated, and a
  fast first paint on a mid-range laptop matters more than true bloom. The render layer
  can be swapped later without touching the simulation.
- **Biome is scoped to `src/**/*.ts` only.** It parses `.astro` frontmatter but not the
  template, so anything used only in markup looks unused — `--write --unsafe` would
  delete it. `astro check` owns `.astro` files.

## Animation internals

`src/lib/neural/` — the simulation knows nothing about canvases, and the renderer
nothing about simulation.

| File | Role |
| --- | --- |
| `config.ts` | **Every knob for how it feels.** Density, speeds, intensities, hop counts. Tune here first. |
| `render.ts` | Brightness constants (`EDGE_BASE`, `EDGE_FOCUS`, `NODE_*`, halo/trail sizes). |
| `graph.ts` | Poisson-disc placement plus k-nearest wiring. Runs once per resize. |
| `pulses.ts` | Signal pool and propagation. |
| `field.ts` | Positions, illumination, brightness swells. |
| `ripples.ts` | Expanding displacement rings from a click. |
| `focus.ts` | Wandering focus and pointer handover. |
| `quality.ts` | Adaptive render scale. |
| `grid.ts`, `rng.ts` | Spatial hash; seeded PRNG. |

Load-bearing implementation notes, all of which cost real effort to find:

- **Wave ids, not just refractory timers, bound a strike.** Each strike gets an id and a
  neuron fires at most once per id, so propagation provably terminates on cyclic graphs.
  A refractory timer alone does not: a signal can lap a cycle after the timer expires and
  echo forever.
- **Neurons wobble around a fixed rest position**, never drift freely. The wiring is
  permanent, so a neuron that wandered would drag a dendrite across the screen.
- **Afterglow lands when a signal *finishes* crossing a dendrite**, not on entry. The
  renderer draws the travelled portion progressively by splitting the curve at `t`.
  Lighting whole dendrites on entry makes a strike read as regions switching on rather
  than lightning drawing itself.
- **Edges and nodes are drawn grouped by quantised alpha** (counting sort), so the whole
  network costs a few dozen draw calls rather than one per dendrite.
- **Canvas draw calls dominate this renderer, not pixels — so the alpha level count is
  the performance dial.** Each occupied level is one `beginPath`/`stroke` pair. This was
  invisible until the brightness swells arrived: before them nearly every dendrite sat at
  the same resting alpha and a handful of levels were occupied, and afterwards they spread
  across every level. Measured at 2560x1440: **64 levels 14.4ms a frame, 24 levels 8.8ms,
  8 levels 5.8ms**, at a *smaller* backing store — which is how we know it is not fill
  rate. Levels are now spaced by the square root of alpha, so the dim end where the
  resting wiring lives keeps fine steps while bright values, which nothing occupies, do
  not waste levels. 16 levels was rejected: it collapses 4% and 6% alpha into one bucket
  and flattens the dim end of every swell.
- **Adaptive quality cannot fix draw-call cost.** Its only lever is render scale, which
  addresses fill rate. If a weak machine at a large viewport is ever the problem, the
  lever to add is a lower level count per quality step, not a smaller buffer.
- **The ripple is a displacement, not a drawing.** `ripples.ts` only produces an offset to
  add to positions; dendrites bend for free because they are drawn from live positions.
  The disturbance is a sine confined to a travelling Gaussian band, which is both what
  water does and what makes it cheap — most neurons are rejected by a distance comparison
  before any trigonometry. Measured cost is nil: 6.83ms idle against 6.90ms mid-ripple.
- **Calm mode idles the frame loop, so anything outlasting the tail must be named in the
  idle check.** A ripple settles over ~4.5s against a 2.5s tail; without listing
  `ripples.activeCount` there, the network freezes mid-displacement.
- **A subtle effect still needs real render weight.** The swells were invisible at first
  despite being correct in the simulation: averaging three waves clusters values near 0.5
  so crests never arrived, and a hairline at 4% alpha has no room to brighten. The fix was
  to stretch the averaged wave across its useful band and give the swell an alpha
  contribution several times the resting value, plus a halo at the crests. Verify this
  kind of change by measuring rendered pixels, not by trusting the unit tests — they
  passed the entire time it could not be seen.
- **Nothing allocates in the frame loop.** Two real allocators were found and removed:
  `Math.hypot` (V8's variadic implementation allocates) and the RNG coercing state with
  `>>> 0`, which exceeds the small-integer range and boxes. Avoid both in per-frame code.
- **Heap before/after comparison cannot detect per-frame garbage** — transient garbage is
  scavenged and never shows up, and a deliberate allocation passed that check. The tests
  sample for the heap *sawtooth* instead; see `allocation-probe.ts`.

## Verification

```
npm test          # 77 unit tests: grid, graph, propagation, focus, quality, field
npm run build     # also the payload check
npx astro check   # types, including .astro
npx biome check src
npm run dev       # then http://localhost:4321/?hud for the frame-time readout
```

`?hud` shows fps, frame ms, neuron/dendrite/signal counts, the quality scale, and whether
calm mode is active. It is the tool for checking a real phone.

`?motion` forces full motion regardless of the reduced-motion preference. It exists to
tell calm mode apart from a fault — if `?motion` animates, the preference is the cause.

Measured on the development machine (a fast desktop, Chromium, DPR 1):

| Case | Result |
| --- | --- |
| 1440x900 idle | 251 neurons, 437 dendrites, mean 5.5ms, worst 5.7ms |
| 1440x900 during a strike | peaks ~90 signals, frames reach ~11ms |
| 1440x900 during a ripple | no measurable cost over idle |
| Ripple travel | ring reaches r=132px at 1s, 326px at 2s, 521px at 3s; peak 12.8px; retires at 7.8s |
| 2560x1440 idle, after the swells | 8.8ms mean (was 14.4ms at 64 alpha levels) |
| 2560x1440, four strikes and ripples at once | 10.0ms mean, 16.7ms worst |
| 2560x1440 idle | 689 neurons, 1197 dendrites, mean 4.1ms, worst 8.9ms |
| 390x844 (phone) | 106 neurons, 186 dendrites, ~5ms frames |
| Swell visibility | 15-19 units of brightness spread across the screen at one instant, and the bright band moves between samples |
| Main thread loaded ~26ms/frame | quality dropped 100% -> 62%, recovered to 100% |
| `prefers-reduced-motion` | calm mode: field drawn, no autonomous motion, responds to pointer and tap, settles after |
| Payload | 16.5KB raw / **5.9KB gzipped** JS; 4KB HTML with CSS inlined |

Not yet verified on real slow hardware — the numbers above come from a fast machine, and
CPU throttling is a simulation. Check `?hud` on an actual phone and an older laptop.

## Environment (Windows 11, PowerShell 5.1)

- Node **24.21.0** / npm 11.19.0, managed by **nvm-windows**.
- **`nvm` cannot be driven from Claude Code.** It detects the absence of a real console
  and pops a GUI dialog ("NVM for Windows should be run from a terminal"), returning exit
  0 with no output and doing nothing. Node version changes must be run by Gabriel in an
  elevated Windows Terminal / PowerShell. Do not retry it from a tool call.
- `gh` 2.98.0, authenticated as `gabriel-cameron`, git protocol SSH (verified working).
  Token scopes are `gist, read:org, repo` — **no `workflow` scope**. Pushing a
  `.github/workflows/` file over SSH works, but `gh` cannot manage Actions runs until
  `gh auth refresh -s workflow` is run interactively.
