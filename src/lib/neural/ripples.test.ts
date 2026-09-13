import { describe, expect, test } from 'vitest';
import { ALLOCATION_FREE_KB, peakHeapRiseKb } from './allocation-probe';
import { Ripples } from './ripples';

const options = {
  amplitude: 12,
  speed: 500,
  wavelength: 150,
  bandWidth: 120,
  falloff: 500,
  decaySeconds: 1.2,
  capacity: 4,
};

/** Displacement each point receives, as {dx, dy}. */
function displace(ripples: Ripples, points: Array<[number, number]>) {
  const homeX = Float32Array.from(points.map((p) => p[0]));
  const homeY = Float32Array.from(points.map((p) => p[1]));
  const liveX = Float32Array.from(homeX);
  const liveY = Float32Array.from(homeY);
  ripples.displace(homeX, homeY, liveX, liveY, points.length);
  return points.map((_, i) => ({ dx: liveX[i] - homeX[i], dy: liveY[i] - homeY[i] }));
}

describe('Ripples', () => {
  test('starts with nothing running', () => {
    expect(new Ripples(options).activeCount).toBe(0);
  });

  test('leaves the field untouched before anything is dropped into it', () => {
    const ripples = new Ripples(options);
    ripples.step(0.5);
    const [point] = displace(ripples, [[200, 0]]);
    expect(point.dx).toBe(0);
    expect(point.dy).toBe(0);
  });

  test('displaces neurons at the expanding ring', () => {
    const ripples = new Ripples(options);
    ripples.spawn(0, 0);
    ripples.step(0.2); // the ring is now ~100px out
    // A quarter wavelength beyond the crest is where the wave is steepest.
    const [onRing] = displace(ripples, [[137, 0]]);
    expect(Math.abs(onRing.dx)).toBeGreaterThan(2);
  });

  test('leaves neurons far beyond the ring alone', () => {
    const ripples = new Ripples(options);
    ripples.spawn(0, 0);
    ripples.step(0.2);
    const [far] = displace(ripples, [[900, 0]]);
    expect(Math.abs(far.dx)).toBeLessThan(0.01);
  });

  test('pushes along the radius rather than sideways', () => {
    const ripples = new Ripples(options);
    ripples.spawn(0, 0);
    ripples.step(0.2);
    const [horizontal, vertical] = displace(ripples, [
      [137, 0],
      [0, 137],
    ]);
    expect(Math.abs(horizontal.dx)).toBeGreaterThan(2);
    expect(Math.abs(horizontal.dy)).toBeLessThan(0.001);
    expect(Math.abs(vertical.dy)).toBeGreaterThan(2);
    expect(Math.abs(vertical.dx)).toBeLessThan(0.001);
  });

  test('travels outward over time', () => {
    const ripples = new Ripples(options);
    ripples.spawn(0, 0);
    const reach = [];
    for (const seconds of [0.1, 0.3, 0.6]) {
      const fresh = new Ripples(options);
      fresh.spawn(0, 0);
      fresh.step(seconds);
      // Furthest point still meaningfully displaced.
      let furthest = 0;
      for (let r = 10; r < 900; r += 10) {
        const [p] = displace(fresh, [[r, 0]]);
        if (Math.abs(p.dx) > 0.5) furthest = r;
      }
      reach.push(furthest);
    }
    expect(reach[1]).toBeGreaterThan(reach[0]);
    expect(reach[2]).toBeGreaterThan(reach[1]);
  });

  test('weakens as it spreads', () => {
    const early = new Ripples(options);
    early.spawn(0, 0);
    early.step(0.15);
    const late = new Ripples(options);
    late.spawn(0, 0);
    late.step(1.1);

    const peak = (ripples: Ripples) => {
      let best = 0;
      for (let r = 5; r < 900; r += 5) {
        const [p] = displace(ripples, [[r, 0]]);
        best = Math.max(best, Math.abs(p.dx));
      }
      return best;
    };
    expect(peak(late)).toBeLessThan(peak(early));
  });

  test('settles completely and retires itself', () => {
    const ripples = new Ripples(options);
    ripples.spawn(0, 0);
    for (let i = 0; i < 600; i++) ripples.step(1 / 60);
    expect(ripples.activeCount).toBe(0);
    for (let r = 10; r < 900; r += 10) {
      const [p] = displace(ripples, [[r, 0]]);
      expect(p.dx).toBe(0);
    }
  });

  test('sums overlapping ripples', () => {
    const single = new Ripples(options);
    single.spawn(0, 0);
    single.step(0.2);

    const double = new Ripples(options);
    double.spawn(0, 0);
    double.spawn(0, 0);
    double.step(0.2);

    const [one] = displace(single, [[137, 0]]);
    const [two] = displace(double, [[137, 0]]);
    expect(Math.abs(two.dx)).toBeCloseTo(Math.abs(one.dx) * 2, 3);
  });

  test('drops the oldest when more arrive than it can hold', () => {
    const ripples = new Ripples(options);
    for (let i = 0; i < 9; i++) ripples.spawn(i * 10, 0);
    expect(ripples.activeCount).toBe(options.capacity);
  });

  test('survives a neuron sitting exactly where the click landed', () => {
    const ripples = new Ripples(options);
    ripples.spawn(50, 50);
    ripples.step(0.1);
    const [atCentre] = displace(ripples, [[50, 50]]);
    expect(Number.isFinite(atCentre.dx)).toBe(true);
    expect(Number.isFinite(atCentre.dy)).toBe(true);
  });

  test('never displaces further than its amplitude', () => {
    const ripples = new Ripples(options);
    ripples.spawn(0, 0);
    for (let frame = 0; frame < 300; frame++) {
      ripples.step(1 / 60);
      for (let r = 5; r < 1200; r += 25) {
        const [p] = displace(ripples, [[r, 0]]);
        expect(Math.abs(p.dx)).toBeLessThanOrEqual(options.amplitude);
      }
    }
  });

  test('does not allocate while running', () => {
    const ripples = new Ripples(options);
    const homeX = new Float32Array(400);
    const homeY = new Float32Array(400);
    for (let i = 0; i < 400; i++) {
      homeX[i] = (i % 20) * 60;
      homeY[i] = Math.floor(i / 20) * 60;
    }
    const liveX = new Float32Array(400);
    const liveY = new Float32Array(400);

    const riseKb = peakHeapRiseKb(60000, (i) => {
      if (i % 300 === 0) ripples.spawn(600, 400);
      ripples.step(1 / 60);
      liveX.set(homeX);
      liveY.set(homeY);
      ripples.displace(homeX, homeY, liveX, liveY, 400);
    });
    expect(riseKb).toBeLessThan(ALLOCATION_FREE_KB);
  });
});
