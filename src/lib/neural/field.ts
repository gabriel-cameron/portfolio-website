import type { NeuralConfig } from './config';
import { Focus } from './focus';
import { buildGraph, type NeuralGraph } from './graph';
import { PulseSystem } from './pulses';
import { Ripples } from './ripples';
import { createRng } from './rng';

/** Wobble is split across two axes, so cap each to keep the total within budget. */
const AXIS_SHARE = 0.7;

/** Averaged wave value treated as fully dark. */
const BREATH_FLOOR = 0.3;
/** Width of the band above that floor which is stretched to full brightness. */
const BREATH_SPAN = 0.5;

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
  readonly ripples: Ripples;
  readonly focus: Focus;
  /** Live positions, i.e. rest position plus wobble. */
  liveX: Float32Array;
  liveY: Float32Array;
  /** 0 to 1 illumination from the focus. */
  nodeGlow: Float32Array;
  /** 0 to 1 slow brightness swell drifting across the field. */
  nodeBreath: Float32Array;
  totalFirings = 0;

  private readonly config: NeuralConfig;
  private readonly seed: number;
  private time = 0;
  private rng: () => number;
  private wobbleAmpX!: Float32Array;
  private wobbleAmpY!: Float32Array;
  private wobbleFreqX!: Float32Array;
  private wobbleFreqY!: Float32Array;
  private wobblePhaseX!: Float32Array;
  private wobblePhaseY!: Float32Array;
  private breathKx!: Float32Array;
  private breathKy!: Float32Array;
  private breathOmega!: Float32Array;
  private breathPhase!: Float32Array;

  constructor(width: number, height: number, config: NeuralConfig, seed: number) {
    this.config = config;
    this.seed = seed;
    this.rng = createRng(seed);
    this.focus = new Focus(width, height, seed + 1, {
      wanderSpeed: config.wanderSpeed,
      handoffSeconds: config.handoffSeconds,
    });
    this.graph = buildGraph({ ...config, width, height, seed });
    this.pulses = this.createPulses();
    this.ripples = new Ripples({
      amplitude: config.rippleAmplitude,
      speed: config.rippleSpeed,
      wavelength: config.rippleWavelength,
      bandWidth: config.rippleBandWidth,
      falloff: config.rippleFalloff,
      decaySeconds: config.rippleDecaySeconds,
      capacity: config.rippleCapacity,
    });
    this.liveX = new Float32Array(this.graph.count);
    this.liveY = new Float32Array(this.graph.count);
    this.nodeGlow = new Float32Array(this.graph.count);
    this.nodeBreath = new Float32Array(this.graph.count);
    this.initWobble();
    this.initBreath();
    this.updatePositions();
    this.updateBreath();
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
    this.nodeBreath = new Float32Array(this.graph.count);
    this.initWobble();
    this.initBreath();
    this.updatePositions();
    this.updateBreath();
    this.focus.resize(width, height);
  }

  step(dt: number): void {
    this.time += dt;
    this.ripples.step(dt);
    this.updatePositions();
    this.focus.step(dt);
    this.illuminate();
    this.updateBreath();
    this.pulses.step(dt);
  }

  /** Fires the neuron nearest a point at full strength. */
  strikeAt(x: number, y: number): void {
    const nearest = this.nearestNode(x, y);
    if (nearest === -1) return;
    this.pulses.fire(nearest, this.config.strikeIntensity, this.config.strikeHops);
    this.ripples.spawn(x, y);
    this.totalFirings++;
  }

  private createPulses(): PulseSystem {
    return new PulseSystem(this.graph, {
      capacity: Math.max(32, Math.ceil(this.graph.edgeCount * this.config.pulseCapacityRatio)),
      speed: this.config.pulseSpeed,
      speedFloor: this.config.speedFloor,
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
    // After the wobble, so a ripple displaces where a neuron actually is.
    this.ripples.displace(homeX, homeY, this.liveX, this.liveY, count);
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

  /** Plane-wave parameters for the brightness swells. */
  private initBreath(): void {
    const count = this.config.breathWaves;
    const shortest = this.config.breathWavelength[0];
    const longest = this.config.breathWavelength[1];
    const quickest = this.config.breathPeriod[0];
    const slowest = this.config.breathPeriod[1];
    this.breathKx = new Float32Array(count);
    this.breathKy = new Float32Array(count);
    this.breathOmega = new Float32Array(count);
    this.breathPhase = new Float32Array(count);

    for (let w = 0; w < count; w++) {
      const angle = this.rng() * Math.PI * 2;
      const wavelength = shortest + this.rng() * (longest - shortest);
      const period = quickest + this.rng() * (slowest - quickest);
      const k = (Math.PI * 2) / wavelength;
      this.breathKx[w] = Math.cos(angle) * k;
      this.breathKy[w] = Math.sin(angle) * k;
      this.breathOmega[w] = (Math.PI * 2) / period;
      this.breathPhase[w] = this.rng() * Math.PI * 2;
    }
  }

  /**
   * Samples the drifting swells at each neuron.
   *
   * Averaging three waves concentrates the result around 0.5 — crests barely
   * reach 0.7 and troughs barely reach 0.3 — so used directly the field looks
   * uniformly half-lit and the swell cannot be seen at all. The average is
   * therefore stretched across its useful band and then squared, which puts
   * most of the field low and lets a crest arrive at full strength.
   */
  private updateBreath(): void {
    const waves = this.config.breathWaves;
    for (let i = 0; i < this.graph.count; i++) {
      const x = this.liveX[i];
      const y = this.liveY[i];
      let sum = 0;
      for (let w = 0; w < waves; w++) {
        const phase =
          x * this.breathKx[w] +
          y * this.breathKy[w] -
          this.time * this.breathOmega[w] +
          this.breathPhase[w];
        sum += 0.5 + 0.5 * Math.sin(phase);
      }
      const mean = sum / waves;
      const stretched = (mean - BREATH_FLOOR) / BREATH_SPAN;
      const clamped = stretched < 0 ? 0 : stretched > 1 ? 1 : stretched;
      this.nodeBreath[i] = clamped * clamped;
    }
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
