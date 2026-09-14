export interface RippleOptions {
  /** Peak radial displacement in CSS pixels. */
  amplitude: number;
  /** How fast the ring expands, in CSS pixels per second. */
  speed: number;
  /** Distance between crests, in CSS pixels. */
  wavelength: number;
  /** Thickness of the disturbed band either side of the ring. */
  bandWidth: number;
  /** Distance over which the disturbance loses half its strength. */
  falloff: number;
  /** Time constant for the whole ripple to settle. */
  decaySeconds: number;
  /** Simultaneous ripples. Beyond this, the oldest is displaced. */
  capacity: number;
}

/**
 * Settled below this fraction of full strength, a ripple is retired.
 *
 * At the amplitudes in use this is well under a pixel of displacement. It is
 * not merely cosmetic: the retirement age scales with the decay constant, and
 * a slow ripple would otherwise stay on the books for ten seconds, displacing
 * neurons by amounts nobody can see.
 */
const SPENT = 0.05;

/**
 * Expanding rings that push neurons along the radius, the way a dropped stone
 * disturbs still water.
 *
 * This only produces a displacement to add to positions; it holds no opinion
 * about what is being displaced. Because dendrites are drawn from live
 * positions, bending them costs nothing extra — they follow the neurons they
 * connect.
 *
 * The disturbance is a sine confined to a travelling Gaussian band rather than
 * a sine across the whole field: water is flat ahead of the ring and behind it,
 * and only the band is moving. Confining it also means most neurons can be
 * rejected with a distance comparison, so the trigonometry runs for the few
 * hundred that are actually near the wavefront.
 */
export class Ripples {
  activeCount = 0;

  private readonly options: RippleOptions;
  private readonly centreX: Float32Array;
  private readonly centreY: Float32Array;
  private readonly age: Float32Array;

  constructor(options: RippleOptions) {
    this.options = options;
    this.centreX = new Float32Array(options.capacity);
    this.centreY = new Float32Array(options.capacity);
    this.age = new Float32Array(options.capacity);
  }

  /** Drops a fresh ripple at a point. */
  spawn(x: number, y: number): void {
    const slot = this.activeCount < this.options.capacity ? this.activeCount++ : this.oldest();
    this.centreX[slot] = x;
    this.centreY[slot] = y;
    this.age[slot] = 0;
  }

  step(dt: number): void {
    const limit = this.settleSeconds();
    for (let i = this.activeCount - 1; i >= 0; i--) {
      this.age[i] += dt;
      if (this.age[i] >= limit) this.remove(i);
    }
  }

  /**
   * Adds each ripple's displacement to the live positions.
   *
   * Direction comes from the rest position, not the live one, so a neuron
   * already displaced by wobble is still pushed directly away from the click.
   */
  displace(
    homeX: Float32Array,
    homeY: Float32Array,
    liveX: Float32Array,
    liveY: Float32Array,
    count: number,
  ): void {
    const { amplitude, speed, wavelength, bandWidth, falloff, decaySeconds } = this.options;
    const angularFrequency = (Math.PI * 2) / wavelength;
    // Past this far from the ring the Gaussian is negligible; skip the maths.
    const reach = bandWidth * 2.5;

    for (let r = 0; r < this.activeCount; r++) {
      const age = this.age[r];
      const front = speed * age;
      const strength = amplitude * Math.exp(-age / decaySeconds);
      const cx = this.centreX[r];
      const cy = this.centreY[r];

      for (let i = 0; i < count; i++) {
        const dx = homeX[i] - cx;
        const dy = homeY[i] - cy;
        const distance = Math.sqrt(dx * dx + dy * dy);
        // A neuron exactly at the click has no radius to be pushed along.
        if (distance < 0.001) continue;

        const fromFront = distance - front;
        if (fromFront > reach || fromFront < -reach) continue;

        const band = fromFront / bandWidth;
        const offset =
          strength *
          Math.exp(-band * band) *
          Math.sin(fromFront * angularFrequency) *
          (1 / (1 + distance / falloff));

        liveX[i] += (dx / distance) * offset;
        liveY[i] += (dy / distance) * offset;
      }
    }
  }

  /** Age at which a ripple has faded below notice. */
  private settleSeconds(): number {
    return this.options.decaySeconds * Math.log(1 / SPENT);
  }

  private oldest(): number {
    let slot = 0;
    for (let i = 1; i < this.activeCount; i++) {
      if (this.age[i] > this.age[slot]) slot = i;
    }
    return slot;
  }

  private remove(i: number): void {
    const last = --this.activeCount;
    if (i === last) return;
    this.centreX[i] = this.centreX[last];
    this.centreY[i] = this.centreY[last];
    this.age[i] = this.age[last];
  }
}
