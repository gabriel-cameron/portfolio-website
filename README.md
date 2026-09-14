# gabrielcameron.com

Personal portfolio. Astro, TypeScript, plain CSS, no runtime dependencies.

The hero is a hand-built canvas simulation: a network of neurons wired into a persistent
graph, with brightness swells drifting across it, and signals that branch outward and
ripple the field when you click. The project card materialises through an SVG
displacement filter applied to live DOM, so its text stays real text.

About 7 KB of gzipped JavaScript, all of it the animation.

## Running it

```sh
npm install
npm run dev      # http://localhost:4321  (?hud for a frame-time readout)
```

## Checks

```sh
npm test         # unit tests for the simulation
npm run build
npx astro check  # types, including .astro files
npx biome check src
```

## Layout

```
src/
├── lib/neural/   the field: simulation, renderer, and the maths behind them
├── layouts/
├── pages/
└── styles/
```

The simulation knows nothing about canvases and the renderer nothing about the
simulation, so either can be replaced without touching the other.
