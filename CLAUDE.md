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

## Technical decisions

- **Canvas 2D, no animation dependencies**, with a spatial grid for neighbor lookups.
  Not WebGL: the effect is line-dominated rather than particle-count-dominated, and a
  fast first paint on a mid-range laptop matters more than true bloom. The render layer
  can be swapped later without touching the simulation.

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
