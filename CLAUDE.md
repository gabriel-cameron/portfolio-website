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
- **Click fires an action potential** — a wavefront races outward hop by hop through the
  graph, branching at junctions, dying out after 6-8 hops. Reads as forked lightning.

Tone: **alive but restrained** — it should feel like the page is *thinking*. Visible
ambient pulses at rest, but never busy enough to compete with the hero text over it.

Hero content over the canvas: name, title, one line, CTA.

A fifth mechanic closes a hole the above leaves: **a wandering focus**. There is no
cursor on a phone, so an unattended focus point drifts through the network on its own,
illuminating as it passes; the pointer takes it over while being moved and hands back
2.5s after it stops. Phones get the full effect, and desktop looks alive before the
visitor touches anything.

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
| `field.ts` | Positions, illumination, ambient firing. |
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
- **Edges and nodes are drawn grouped by quantised alpha** (64 levels, counting sort), so
  the whole network costs a few dozen draw calls rather than one per dendrite.
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

`?hud` shows fps, frame ms, neuron/dendrite/signal counts and the current quality scale.
It is the tool for checking a real phone.

Measured on the development machine (a fast desktop, Chromium, DPR 1):

| Case | Result |
| --- | --- |
| 1440x900 | 251 neurons, 437 dendrites, ~4ms frames |
| 2560x1440 idle | 689 neurons, 1197 dendrites, mean 4.1ms, worst 8.9ms |
| 2560x1440, ~200 live signals | mean 4.2ms, worst 9.1ms — strikes are close to free |
| 390x844 (phone) | 106 neurons, 186 dendrites, ~5ms frames |
| Main thread loaded ~26ms/frame | quality dropped 100% -> 62%, recovered to 100% |
| `prefers-reduced-motion` | single static frame, byte-identical after 700ms, taps inert |
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
