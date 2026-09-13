/**
 * Every number that decides how the field feels, in one place.
 *
 * Tuning happens here rather than scattered through the simulation so the
 * look can be adjusted without reading the algorithms.
 */
export interface NeuralConfig {
  /** Minimum distance between neurons. Sets density. */
  spacing: number;
  /** Dendrites each neuron reaches out with. */
  maxDegree: number;
  /** How far a neuron drifts from its rest position. */
  wobbleAmplitude: number;
  /** Seconds per wobble cycle, randomised per neuron between these bounds. */
  wobblePeriod: [number, number];
  /** Radius the focus illuminates, in CSS pixels. */
  focusRadius: number;
  /** Seconds between ambient firings, randomised between these bounds. */
  ambientInterval: [number, number];
  ambientIntensity: number;
  ambientHops: number;
  /** A deliberate click: full strength, reaching far. */
  strikeIntensity: number;
  strikeHops: number;
  pulseSpeed: number;
  hopDecay: number;
  minIntensity: number;
  refractorySeconds: number;
  glowDecaySeconds: number;
  /** Cap on simultaneous pulses, as a fraction of the dendrite count. */
  pulseCapacityRatio: number;
}

const BASE: NeuralConfig = {
  spacing: 58,
  maxDegree: 3,
  wobbleAmplitude: 5,
  wobblePeriod: [9, 17],
  focusRadius: 200,
  ambientInterval: [0.35, 1.1],
  ambientIntensity: 0.55,
  ambientHops: 2,
  strikeIntensity: 1,
  strikeHops: 7,
  pulseSpeed: 620,
  hopDecay: 0.78,
  minIntensity: 0.12,
  refractorySeconds: 0.35,
  glowDecaySeconds: 0.42,
  pulseCapacityRatio: 0.9,
};

/** Viewport width below which the field is treated as a phone. */
const NARROW = 700;

/**
 * Adapts the field to the viewport.
 *
 * A phone gets tighter spacing, not merely fewer neurons: keeping the desktop
 * spacing on a 390px screen leaves six columns of dots, which reads as empty
 * rather than sparse. The illuminated radius shrinks with it so the highlight
 * stays a highlight instead of covering the screen.
 */
export function configFor(width: number): NeuralConfig {
  if (width > NARROW) return BASE;
  return { ...BASE, spacing: 44, focusRadius: 140, ambientHops: 2, strikeHops: 6 };
}

export const COLORS = {
  background: '#04060d',
  /** Resting dendrites. */
  dendrite: '150, 190, 255',
  /** Neuron cores. */
  soma: '214, 234, 255',
  /** Travelling signals. */
  signal: '186, 226, 255',
};
