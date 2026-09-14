# Portfolio Website

Personal portfolio. Its job is professional utility: present work experience so it helps
land better-paying roles.

## Product constraints

- **Audience: hiring managers and recruiters.** Credibility and fast scanning beat
  cleverness. A visitor should know who this is without scrolling.
- **Mobile is a first-class target.** Much of the traffic arrives from LinkedIn on
  phones. Every feature must work on a small touch screen before it is done.
- **`prefers-reduced-motion` is not consulted anywhere, by instruction.** Do not add it —
  not as a damped variant, not as a media query, not for a new feature.
- **The hero's look is signed off. Do not retune it.** Fixing a measured bug is fine;
  adjusting how it feels is not.

## The hero

A dark field of blue-white neurons.

- **The graph is persistent.** Each neuron keeps 2–4 fixed connections, decided once per
  resize. Load-bearing: a signal needs a graph to travel along.
- **Dendrites curve.** Straight lines read as star charts.
- **Brightness swells drift across the field.** This is the resting state, and the reason
  the page reads as thinking. Nothing else moves unprompted — signals come only from a
  click.
- **A click fires a signal** that branches outward, dimming and slowing, and **ripples the
  field**: an expanding ring that displaces neurons along the radius, like a stone in
  water. The ripple is slow on purpose; a fast one reads as a flinch.
- **An unattended focus point drifts** and illuminates as it passes; the pointer takes
  over while moving. Without it a phone has nothing to illuminate.
- **Neurons wobble around fixed rest positions.** They must never drift, or they would
  drag dendrites across the screen.

## The work view

"See my work" moves the name aside and materialises a translucent card, with a named
project index opposite it. Content is placeholder.

- **Three symmetric columns**: name, card, index. The name and index always take opposite
  sides — left/right with room, top/bottom when stacked. Positions derive from
  `--card-w`; if the card's width changes, that must change with it or symmetry drifts.
- **The handover is watched, not timed.** `revealWhenNameClears()` polls until the name
  has vacated the card's space. A fixed delay is wrong at some width: the crossing point
  ranges from 311ms on a phone to 733ms at 1280px.
- **Index items use a fixed-width, left-aligned box.** With `max-content` each title's
  facing edge lands at (position − text width), and title lengths vary more than the
  layout does, so that edge goes ragged and out of order. A uniform box also gives the
  connector a constant attachment point.
- **The active item scales; it must never change `font-size`**, which reflows the list
  every frame. It scales from the edge away from the card, so the connector's anchor
  holds still.
- **The connector is re-measured every frame** of the transition. Measuring once anchors
  it to where the item used to be.

## Traps

- **The materialise filter recipe is the effect. Do not simplify it.** Anisotropic noise
  (`baseFrequency "0.002 0.09"`) gives long horizontal streaks with hard edges, and the
  `feColorMatrix` pinning green to 0.5 zeroes vertical displacement, since
  `feDisplacementMap` offsets y by `(G − 0.5)`. Together they make a horizontal tear;
  change either and it becomes a soft blobby wobble. The curve is a hard ease-out so the
  strips snap back into line.
- **An element with `filter` is its own backdrop root**, so `backdrop-filter` has nothing
  to sample through it and the glass goes flat. The warp is removed once it is spent.
- **Astro scoped styles do not reach elements created at runtime.** Anything
  `document.createElement`-ed silently loses its styling. Use `.parent :global(child)`.
- **Wave ids, not refractory timers, bound a strike.** Each strike carries an id and a
  neuron fires at most once per id, which is what guarantees propagation terminates on a
  cyclic graph. A timer alone does not: a signal can lap a cycle after it expires.
- **The alpha level count is the renderer's performance dial.** Every occupied level is
  one `beginPath`/`stroke`, and the swells spread edges across all of them. 24 levels,
  spaced by √alpha so the dim end keeps its resolution. Adaptive quality only scales
  resolution, so it cannot help with draw-call cost.
- **Nothing may allocate in the frame loop.** In particular avoid `Math.hypot`, whose
  variadic implementation allocates in V8, and coercing integers with `>>> 0`, which
  produces values above the small-integer range and boxes them.
- **Heap before/after cannot detect per-frame garbage** — it is scavenged and never
  appears. The tests sample for the heap sawtooth instead; see `allocation-probe.ts`.
- **Biome is scoped to `src/**/*.ts`.** It parses `.astro` frontmatter but not templates,
  so anything used only in markup looks unused and `--write --unsafe` would delete it.
  `astro check` owns `.astro`.

## Layout

`src/lib/neural/` — the simulation knows nothing about canvases, the renderer nothing
about the simulation.

| File | Role |
| --- | --- |
| `config.ts` | Every knob for how it feels. Tune here first. |
| `render.ts` | Brightness constants, alpha batching, sprites. |
| `graph.ts` | Poisson-disc placement, k-nearest wiring. Runs once per resize. |
| `field.ts` | Positions, illumination, swells. |
| `pulses.ts` | Signal pool and propagation. |
| `ripples.ts` | Click displacement rings. |
| `focus.ts`, `quality.ts` | Wandering focus; adaptive render scale. |
| `grid.ts`, `rng.ts` | Spatial hash; seeded PRNG. |

## Verification

```
npm test          # 102 unit tests
npm run build
npx astro check   # types, including .astro
npx biome check src
npm run dev       # ?hud for a frame-time readout
```

Measured on a fast desktop, Chromium, DPR 1:

| Case | Result |
| --- | --- |
| 1440×900 idle | 251 neurons, 437 dendrites, ~5.5ms |
| 2560×1440 idle | 689 neurons, 1197 dendrites, ~8.8ms |
| 390×844 phone | 106 neurons, 186 dendrites, ~5.5ms |
| Payload | ~7KB gzipped JS |

Unverified on slow hardware and on iOS Safari, which is the main risk for the animated
filter and `backdrop-filter`. Use `?hud` on a real phone.

## Deployment

Public repo, GitHub Pages, source set to GitHub Actions. `.github/workflows/deploy.yml`
lints, typechecks, tests, builds and publishes on every push to `main`. The custom
domain lives in both the Pages settings and `public/CNAME`, so it survives redeploys.

Commits use the GitHub noreply address; the repo's local git config is already set to it.
Keep it that way.

## Environment (Windows 11, PowerShell 5.1)

- Node 24.21.0 / npm 11.19.0 via **nvm-windows**.
- **`nvm` cannot be driven from Claude Code.** It detects the missing console, pops a GUI
  dialog, and returns exit 0 having done nothing. Version changes must be run by hand in
  an elevated terminal.
- `gh` authenticated over SSH. Token scopes are `gist, read:org, repo` — **no `workflow`**.
  Pushing a `.github/workflows/` file over SSH works, but `gh` cannot manage Actions runs
  until `gh auth refresh -s workflow` is run interactively.
