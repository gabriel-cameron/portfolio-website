import type { NeuralConfig } from './config';
import { Focus } from './focus';
import { buildGraph, type NeuralGraph } from './graph';
import { PulseSystem } from './pulses';
import { createRng } from './rng';

/** Wobble is split across two axes, so cap each to keep the total within budget. */
const AXIS_SHARE = 0.7;

/**
 * The simulated network: where the neurons are, which are lit, and what is
 * firing. Knows nothing about canvases — see render.ts.
 *
 * Neurons wobble around a fixed rest position rather than drifting freely.
 * Free drift is what a proximity web can afford, because it recomputes its
 * links every frame; here the wiring is permanent, so a neuron that wandered
 * off would drag a dendrite across the screen behind it.
 */
export class NeuralField {
  graph: NeuralGraph;
  pulses: PulseSystem;
  readonly focus: Focus;
  /** Live positions, i.e. rest position plus wobble. */
  liveX: Float32Array;
  liveY: Float32Array;
  /** 0 to 1 illumination from the focus. */
  nodeGlow: Float32Array;
  totalFirings = 0;

  private readonly config: NeuralConfig;
  private readonly seed: number;
  private time = 0;
  private nextAmbient = 0;
  private rng: () => number;
  private wobbleAmpX!: Float32Array;
  private wobbleAmpY!: Float32Array;
  private wobbleFreqX!: Float32Array;
  private wobbleFreqY!: Float32Array;
  private wobblePhaseX!: Float32Array;
  private wobblePhaseY!: Float32Array;

  constructor(width: number, height: number, config: NeuralConfig, seed: number) {
    this.config = config;
    this.seed = seed;
    this.rng = createRng(seed);
    this.focus = new Focus(width, height, seed + 1, {
      wanderSpeed: 90,
      handoffSeconds: 2.5,
    });
    this.graph = buildGraph({ ...config, width, height, seed });
    this.pulses = this.createPulses();
    this.liveX = new Float32Array(this.graph.count);
    this.liveY = new Float32Array(this.graph.count);
    this.nodeGlow = new Float32Array(this.graph.count);
    this.initWobble();
    this.updatePositions();
    this.scheduleAmbient();
  }

  resize(width: number, height: number): void {
    // Same seed for the same size, so an orientation change and back does not
    // reshuffle the network.
    this.rng = createRng(this.seed);
    this.graph = buildGraph({ ...this.config, width, height, seed: this.seed });
    this.pulses = this.createPulses();
    this.liveX = new Float32Array(this.graph.count);
    this.liveY = new Float32Array(this.graph.count);
    this.nodeGlow = new Float32Array(this.graph.count);
    this.initWobble();
    this.updatePositions();
    this.focus.resize(width, height);
  }

  step(dt: number): void {
    this.time += dt;
    this.updatePositions();
    this.focus.step(dt);
    this.illuminate();

    this.nextAmbient -= dt;
    if (this.nextAmbient <= 0) {
      this.fireAmbient();
      this.scheduleAmbient();
    }

    this.pulses.step(dt);
  }

  /** Fires the neuron nearest a point at full strength. */
  strikeAt(x: number, y: number): void {
    const nearest = this.nearestNode(x, y);
    if (nearest === -1) return;
    this.pulses.fire(nearest, this.config.strikeIntensity, this.config.strikeHops);
    this.totalFirings++;
  }

  private createPulses(): PulseSystem {
    return new PulseSystem(this.graph, {
      capacity: Math.max(32, Math.ceil(this.graph.edgeCount * this.config.pulseCapacityRatio)),
      speed: this.config.pulseSpeed,
      hopDecay: this.config.hopDecay,
      minIntensity: this.config.minIntensity,
      refractorySeconds: this.config.refractorySeconds,
      glowDecaySeconds: this.config.glowDecaySeconds,
    });
  }

  private initWobble(): void {
    const { count } = this.graph;
    const { wobbleAmplitude, wobblePeriod } = this.config;
    const [slowest, fastest] = wobblePeriod;
    this.wobbleAmpX = new Float32Array(count);
    this.wobbleAmpY = new Float32Array(count);
    this.wobbleFreqX = new Float32Array(count);
    this.wobbleFreqY = new Float32Array(count);
    this.wobblePhaseX = new Float32Array(count);
    this.wobblePhaseY = new Float32Array(count);

    const limit = wobbleAmplitude * AXIS_SHARE;
    for (let i = 0; i < count; i++) {
      this.wobbleAmpX[i] = limit * (0.5 + this.rng() * 0.5);
      this.wobbleAmpY[i] = limit * (0.5 + this.rng() * 0.5);
      // Two unequal periods per neuron trace an open figure rather than a
      // circle, which would read as mechanical.
      this.wobbleFreqX[i] = (Math.PI * 2) / (slowest + this.rng() * (fastest - slowest));
      this.wobbleFreqY[i] = (Math.PI * 2) / (slowest + this.rng() * (fastest - slowest));
      this.wobblePhaseX[i] = this.rng() * Math.PI * 2;
      this.wobblePhaseY[i] = this.rng() * Math.PI * 2;
    }
  }

  private updatePositions(): void {
    const { count, homeX, homeY } = this.graph;
    for (let i = 0; i < count; i++) {
      this.liveX[i] =
        homeX[i] +
        Math.cos(this.time * this.wobbleFreqX[i] + this.wobblePhaseX[i]) * this.wobbleAmpX[i];
      this.liveY[i] =
        homeY[i] +
        Math.sin(this.time * this.wobbleFreqY[i] + this.wobblePhaseY[i]) * this.wobbleAmpY[i];
    }
  }

  /** Smooth falloff from the focus; squared distance avoids a square root. */
  private illuminate(): void {
    const radius2 = this.config.focusRadius * this.config.focusRadius;
    const { x, y } = this.focus;
    for (let i = 0; i < this.graph.count; i++) {
      const dx = this.liveX[i] - x;
      const dy = this.liveY[i] - y;
      const falloff = 1 - (dx * dx + dy * dy) / radius2;
      this.nodeGlow[i] = falloff > 0 ? falloff : 0;
    }
  }

  private fireAmbient(): void {
    const node = Math.floor(this.rng() * this.graph.count);
    this.pulses.fire(node, this.config.ambientIntensity, this.config.ambientHops);
    this.totalFirings++;
  }

  private scheduleAmbient(): void {
    const [soonest, latest] = this.config.ambientInterval;
    this.nextAmbient = soonest + this.rng() * (latest - soonest);
  }

  private nearestNode(x: number, y: number): number {
    let best = -1;
    let bestD2 = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.graph.count; i++) {
      const dx = this.liveX[i] - x;
      const dy = this.liveY[i] - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = i;
      }
    }
    return best;
  }
}
