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
  /** Drift speed of the unattended focus, in CSS pixels per second. */
  wanderSpeed: number;
  /** Idle time before the pointer surrenders the focus back to the drift. */
  handoffSeconds: number;
  /**
   * Slow brightness swells that drift across the field.
   *
   * Summed plane waves at different angles, wavelengths and speeds. Their
   * interference never repeats on any timescale a visitor will notice, which
   * is what makes the field read as thinking rather than ticking.
   */
  breathWaves: number;
  /** Wavelengths in CSS pixels, randomised between these bounds. */
  breathWavelength: [number, number];
  /** Seconds per cycle, randomised between these bounds. */
  breathPeriod: [number, number];
  /** Whether the swells move. False freezes them; see calmVariant. */
  breathAnimated: boolean;
  /** A deliberate click: full strength, reaching far. */
  strikeIntensity: number;
  strikeHops: number;
  pulseSpeed: number;
  /**
   * Fraction of full speed a spent signal still travels at.
   *
   * Signals slow as they weaken, so a strike decelerates as it spreads
   * outward instead of racing to its limit at a constant rate.
   */
  speedFloor: number;
  hopDecay: number;
  minIntensity: number;
  refractorySeconds: number;
  glowDecaySeconds: number;
  /** Cap on simultaneous pulses, as a fraction of the dendrite count. */
  pulseCapacityRatio: number;
  /** Peak radial displacement of the click ripple, in CSS pixels. */
  rippleAmplitude: number;
  /** Expansion speed of the ripple ring, in CSS pixels per second. */
  rippleSpeed: number;
  /** Distance between ripple crests. */
  rippleWavelength: number;
  /** Thickness of the disturbed band either side of the ring. */
  rippleBandWidth: number;
  /** Distance over which the ripple loses half its strength. */
  rippleFalloff: number;
  /** Time constant for the ripple to settle. */
  rippleDecaySeconds: number;
  /** Simultaneous ripples. */
  rippleCapacity: number;
}

const BASE: NeuralConfig = {
  spacing: 58,
  maxDegree: 3,
  wobbleAmplitude: 5,
  wobblePeriod: [9, 17],
  focusRadius: 300,
  wanderSpeed: 90,
  handoffSeconds: 2.5,
  breathWaves: 3,
  breathWavelength: [420, 1100],
  breathPeriod: [8, 16],
  breathAnimated: true,
  strikeIntensity: 1,
  strikeHops: 12,
  pulseSpeed: 620,
  speedFloor: 0.3,
  // Decays slowly enough that all 12 hops survive the minimum, so a strike
  // reaches several hundred pixels rather than dying after a few dendrites.
  hopDecay: 0.87,
  minIntensity: 0.05,
  refractorySeconds: 0.35,
  glowDecaySeconds: 0.55,
  pulseCapacityRatio: 0.9,
  // Around a quarter of the neuron spacing: enough to read as a disturbance
  // travelling through the tissue, not enough to tear the network apart.
  rippleAmplitude: 14,
  // Deliberately slow — a third of the speed of a signal.
  //
  // The ripple should read as something moving through tissue rather than a
  // splash: a fast ring is over before the eye follows it, and what is left is
  // a flinch. Slow expansion, a long wavelength and a wide band together make
  // one broad swell passing through, which is what reads as cerebral. The
  // amplitude envelope then does most of the work of ending it, so the wave
  // dissipates rather than running out of screen.
  rippleSpeed: 190,
  rippleWavelength: 260,
  rippleBandWidth: 210,
  rippleFalloff: 620,
  rippleDecaySeconds: 2.6,
  rippleCapacity: 4,
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
  return {
    ...BASE,
    spacing: 44,
    focusRadius: 200,
    strikeHops: 10,
    // Scaled with the tighter spacing, or the ripple overwhelms the network.
    rippleAmplitude: 10,
    rippleWavelength: 200,
    rippleBandWidth: 160,
  };
}

/**
 * The field for a visitor who asked for reduced motion.
 *
 * Not a still image. A dead hero reads as a broken page, and most people with
 * the preference set chose it to quieten interface chrome, not to opt out of
 * everything. The rule applied here is narrower and matches what the
 * preference is actually for: **nothing moves unless the visitor moves it.**
 *
 * So the autonomous motion goes — no wobble, no drifting focus, no drifting
 * brightness swells — while illumination still follows a pointer and a tap
 * still fires a strike, slowed and shortened. Every visitor gets a response;
 * none gets motion they did not ask for.
 */
export function calmVariant(config: NeuralConfig): NeuralConfig {
  return {
    ...config,
    wobbleAmplitude: 0,
    wanderSpeed: 0,
    // Frozen, not flat: the swells still vary from place to place, so the
    // resting field keeps its depth without anything changing over time.
    breathAnimated: false,
    pulseSpeed: config.pulseSpeed * 0.5,
    strikeHops: Math.min(config.strikeHops, 6),
    glowDecaySeconds: config.glowDecaySeconds * 1.5,
    // The ripple is real movement, so it is damped hard here — kept because a
    // click is the visitor asking for it, but not at full strength.
    rippleAmplitude: config.rippleAmplitude * 0.4,
    rippleSpeed: config.rippleSpeed * 0.7,
  };
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
