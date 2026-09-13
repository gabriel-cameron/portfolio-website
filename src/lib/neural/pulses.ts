import type { NeuralGraph } from './graph';

export interface PulseOptions {
  /** Maximum simultaneous pulses. Spawns beyond this are dropped. */
  capacity: number;
  /** Travel speed in CSS pixels per second. */
  speed: number;
  /** Fraction of intensity carried across each junction. */
  hopDecay: number;
  /** Below this intensity a signal stops propagating. */
  minIntensity: number;
  /** How long a neuron stays unexcitable after firing. */
  refractorySeconds: number;
  /** Time constant for a dendrite's afterglow to fade. */
  glowDecaySeconds: number;
}

/**
 * Signals travelling the network, as a fixed-size struct-of-arrays pool.
 *
 * Two mechanisms keep a strike from running away. A **wave id** lets each
 * neuron fire at most once per strike, which caps total work at one visit per
 * edge and guarantees termination even on a graph full of loops — a plain
 * refractory timer does not, because a signal can lap a cycle after the timer
 * expires and echo forever. The **refractory period** then stops separate
 * strikes and ambient firings from piling up on the same neuron, which is
 * about how it looks rather than whether it halts.
 *
 * Nothing here allocates after construction: the frame loop must not create
 * garbage, or collection pauses show up as stutter.
 */
export class PulseSystem {
  /** Dendrite each live pulse is travelling. */
  readonly edge: Int32Array;
  /** Neuron each live pulse departed from. */
  readonly from: Int32Array;
  /** How far along the dendrite, 0 to 1. */
  readonly progress: Float32Array;
  readonly intensity: Float32Array;
  /** Lingering brightness per dendrite, decaying toward zero. */
  readonly edgeGlow: Float32Array;

  activeCount = 0;

  private readonly graph: NeuralGraph;
  private readonly options: PulseOptions;
  private readonly rate: Float32Array;
  private readonly hopsLeft: Int32Array;
  private readonly wave: Int32Array;
  /** Last strike to visit each neuron, or -1. */
  private readonly lastWave: Int32Array;
  private readonly refractory: Float32Array;
  private nextWave = 0;

  constructor(graph: NeuralGraph, options: PulseOptions) {
    this.graph = graph;
    this.options = options;

    const { capacity } = options;
    this.edge = new Int32Array(capacity);
    this.from = new Int32Array(capacity);
    this.progress = new Float32Array(capacity);
    this.intensity = new Float32Array(capacity);
    this.rate = new Float32Array(capacity);
    this.hopsLeft = new Int32Array(capacity);
    this.wave = new Int32Array(capacity);

    this.edgeGlow = new Float32Array(graph.edgeCount);
    this.lastWave = new Int32Array(graph.count).fill(-1);
    this.refractory = new Float32Array(graph.count);
  }

  /**
   * Excites a neuron, sending a signal down every dendrite it owns.
   *
   * Always succeeds regardless of refractory state: this is the deliberate
   * path (a click, or an ambient firing the field has chosen), and a visitor
   * clicking twice expects two strikes.
   */
  fire(node: number, intensity: number, hops: number): void {
    const wave = this.nextWave++;
    this.lastWave[node] = wave;
    this.refractory[node] = this.options.refractorySeconds;
    this.emitFrom(node, -1, intensity, hops, wave);
  }

  step(dt: number): void {
    const { hopDecay, minIntensity, glowDecaySeconds } = this.options;
    const { edgeA, edgeB } = this.graph;

    const glowFactor = Math.exp(-dt / glowDecaySeconds);
    for (let e = 0; e < this.edgeGlow.length; e++) this.edgeGlow[e] *= glowFactor;
    for (let n = 0; n < this.refractory.length; n++) {
      const remaining = this.refractory[n] - dt;
      this.refractory[n] = remaining > 0 ? remaining : 0;
    }

    // Backwards, so swap-removal only ever moves an already-visited pulse (or
    // one spawned this frame, which must wait for the next) into the slot.
    for (let i = this.activeCount - 1; i >= 0; i--) {
      const advanced = this.progress[i] + this.rate[i] * dt;
      const edge = this.edge[i];
      if (this.edgeGlow[edge] < this.intensity[i]) this.edgeGlow[edge] = this.intensity[i];

      if (advanced < 1) {
        this.progress[i] = advanced;
        continue;
      }

      const target = edgeA[edge] === this.from[i] ? edgeB[edge] : edgeA[edge];
      const carried = this.intensity[i] * hopDecay;
      if (
        this.hopsLeft[i] > 0 &&
        carried >= minIntensity &&
        this.lastWave[target] !== this.wave[i] &&
        this.refractory[target] === 0
      ) {
        this.lastWave[target] = this.wave[i];
        this.refractory[target] = this.options.refractorySeconds;
        this.emitFrom(target, edge, carried, this.hopsLeft[i] - 1, this.wave[i]);
      }
      this.remove(i);
    }
  }

  /** Sends a pulse down every dendrite of `node` except the one it arrived on. */
  private emitFrom(node: number, incoming: number, intensity: number, hops: number, wave: number) {
    const { adjStart, adjEdge, edgeLength } = this.graph;
    for (let s = adjStart[node]; s < adjStart[node + 1]; s++) {
      const edge = adjEdge[s];
      if (edge === incoming) continue;
      if (this.activeCount === this.options.capacity) return;

      const i = this.activeCount++;
      this.edge[i] = edge;
      this.from[i] = node;
      this.progress[i] = 0;
      this.intensity[i] = intensity;
      this.rate[i] = this.options.speed / edgeLength[edge];
      this.hopsLeft[i] = hops;
      this.wave[i] = wave;
    }
  }

  private remove(i: number): void {
    const last = --this.activeCount;
    if (i === last) return;
    this.edge[i] = this.edge[last];
    this.from[i] = this.from[last];
    this.progress[i] = this.progress[last];
    this.intensity[i] = this.intensity[last];
    this.rate[i] = this.rate[last];
    this.hopsLeft[i] = this.hopsLeft[last];
    this.wave[i] = this.wave[last];
  }
}
