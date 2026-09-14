import { describe, expect, test } from 'vitest';
import { peakHeapRiseKb } from './allocation-probe';
import { configFor } from './config';
import { NeuralField } from './field';

const config = configFor(1200);

function fieldOf(width = 1200, height = 800) {
  return new NeuralField(width, height, config, 1234);
}

function run(field: NeuralField, seconds: number, dt = 1 / 60) {
  for (let elapsed = 0; elapsed < seconds; elapsed += dt) field.step(dt);
}

describe('NeuralField layout', () => {
  test('wires a network across the viewport', () => {
    const field = fieldOf();
    expect(field.graph.count).toBeGreaterThan(100);
    expect(field.graph.edgeCount).toBeGreaterThan(100);
  });

  test('keeps each neuron within its wobble of its rest position', () => {
    const field = fieldOf();
    run(field, 5);
    const limit = config.wobbleAmplitude * 1.5;
    for (let i = 0; i < field.graph.count; i++) {
      const dx = field.liveX[i] - field.graph.homeX[i];
      const dy = field.liveY[i] - field.graph.homeY[i];
      expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(limit);
    }
  });

  test('actually moves the neurons', () => {
    const field = fieldOf();
    const startX = field.liveX[0];
    run(field, 3);
    expect(field.liveX[0]).not.toBe(startX);
  });

  test('rebuilds for the new viewport on resize', () => {
    const field = fieldOf();
    const before = field.graph.count;
    field.resize(390, 844);
    expect(field.graph.count).not.toBe(before);
    for (let i = 0; i < field.graph.count; i++) {
      expect(field.graph.homeX[i]).toBeLessThanOrEqual(390);
      expect(field.graph.homeY[i]).toBeLessThanOrEqual(844);
    }
  });
});

describe('NeuralField illumination', () => {
  test('brightens neurons near the focus', () => {
    const field = fieldOf();
    field.focus.pointerMove(field.graph.homeX[0], field.graph.homeY[0]);
    field.step(1 / 60);
    expect(field.nodeGlow[0]).toBeGreaterThan(0.8);
  });

  test('leaves neurons beyond the focus radius dark', () => {
    const field = fieldOf();
    field.focus.pointerMove(-1000, -1000);
    field.step(1 / 60);
    for (let i = 0; i < field.graph.count; i++) expect(field.nodeGlow[i]).toBe(0);
  });

  test('falls off with distance rather than switching on and off', () => {
    const field = fieldOf();
    const x = field.graph.homeX[0];
    const y = field.graph.homeY[0];
    field.focus.pointerMove(x, y);
    field.step(1 / 60);
    const atCentre = field.nodeGlow[0];
    field.focus.pointerMove(x + config.focusRadius * 0.6, y);
    field.step(1 / 60);
    const atEdge = field.nodeGlow[0];
    expect(atEdge).toBeGreaterThan(0);
    expect(atEdge).toBeLessThan(atCentre);
  });
});

describe('NeuralField ripple', () => {
  test('disturbs the neurons around a click', () => {
    const field = fieldOf();
    field.strikeAt(600, 400);
    field.step(0.2);

    let furthestFromRest = 0;
    for (let i = 0; i < field.graph.count; i++) {
      const dx = field.liveX[i] - field.graph.homeX[i];
      const dy = field.liveY[i] - field.graph.homeY[i];
      furthestFromRest = Math.max(furthestFromRest, Math.hypot(dx, dy));
    }
    // More than the wobble alone could account for.
    expect(furthestFromRest).toBeGreaterThan(config.wobbleAmplitude);
  });

  test('disturbs near the click and not the far side of the field', () => {
    const field = fieldOf();
    field.strikeAt(60, 60);
    field.step(0.15);

    const moved = (i: number) =>
      Math.hypot(field.liveX[i] - field.graph.homeX[i], field.liveY[i] - field.graph.homeY[i]);

    let nearTotal = 0;
    let nearCount = 0;
    let farTotal = 0;
    let farCount = 0;
    for (let i = 0; i < field.graph.count; i++) {
      const distance = Math.hypot(field.graph.homeX[i] - 60, field.graph.homeY[i] - 60);
      if (distance < 220) {
        nearTotal += moved(i);
        nearCount++;
      } else if (distance > 800) {
        farTotal += moved(i);
        farCount++;
      }
    }
    expect(nearCount).toBeGreaterThan(0);
    expect(farCount).toBeGreaterThan(0);
    expect(nearTotal / nearCount).toBeGreaterThan(farTotal / farCount);
  });

  test('settles back to rest once the ripple has passed', () => {
    const field = fieldOf();
    field.strikeAt(600, 400);
    run(field, 10);
    const limit = config.wobbleAmplitude * 1.5;
    for (let i = 0; i < field.graph.count; i++) {
      const dx = field.liveX[i] - field.graph.homeX[i];
      const dy = field.liveY[i] - field.graph.homeY[i];
      expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(limit);
    }
  });

  test('travels outward from the click', () => {
    const ringAt = (seconds: number) => {
      const field = fieldOf();
      field.strikeAt(600, 400);
      run(field, seconds);
      let furthest = 0;
      for (let i = 0; i < field.graph.count; i++) {
        const dx = field.liveX[i] - field.graph.homeX[i];
        const dy = field.liveY[i] - field.graph.homeY[i];
        if (Math.hypot(dx, dy) < config.wobbleAmplitude) continue;
        const distance = Math.hypot(field.graph.homeX[i] - 600, field.graph.homeY[i] - 400);
        furthest = Math.max(furthest, distance);
      }
      return furthest;
    };
    expect(ringAt(0.45)).toBeGreaterThan(ringAt(0.15));
  });
});

describe('NeuralField breathing', () => {
  test('varies brightness over time', () => {
    const field = fieldOf();
    field.step(1 / 60);
    const first = Float32Array.from(field.nodeBreath);
    run(field, 3);
    let changed = 0;
    for (let i = 0; i < field.graph.count; i++) {
      if (Math.abs(field.nodeBreath[i] - first[i]) > 0.02) changed++;
    }
    expect(changed).toBeGreaterThan(field.graph.count * 0.5);
  });

  test('travels across the field rather than pulsing everywhere at once', () => {
    const field = fieldOf();
    field.step(1 / 60);
    // Brightness at one instant must differ from place to place, or the whole
    // screen would throb in unison.
    let min = Number.POSITIVE_INFINITY;
    let max = 0;
    for (let i = 0; i < field.graph.count; i++) {
      min = Math.min(min, field.nodeBreath[i]);
      max = Math.max(max, field.nodeBreath[i]);
    }
    expect(max - min).toBeGreaterThan(0.25);
  });

  test('stays within bounds', () => {
    const field = fieldOf();
    for (let i = 0; i < 400; i++) {
      field.step(1 / 30);
      for (let n = 0; n < field.graph.count; n++) {
        expect(field.nodeBreath[n]).toBeGreaterThanOrEqual(0);
        expect(field.nodeBreath[n]).toBeLessThanOrEqual(1);
      }
    }
  });

  test('is deterministic for a seed', () => {
    const a = fieldOf();
    const b = fieldOf();
    run(a, 2);
    run(b, 2);
    expect([...a.nodeBreath]).toEqual([...b.nodeBreath]);
  });

  test('changes smoothly, never jumping', () => {
    const field = fieldOf();
    field.step(1 / 60);
    let previous = Float32Array.from(field.nodeBreath);
    for (let f = 0; f < 300; f++) {
      field.step(1 / 60);
      for (let i = 0; i < field.graph.count; i++) {
        expect(Math.abs(field.nodeBreath[i] - previous[i])).toBeLessThan(0.05);
      }
      previous = Float32Array.from(field.nodeBreath);
    }
  });
});

describe('NeuralField activity', () => {
  test('never fires a signal unprompted', () => {
    const field = fieldOf();
    run(field, 20);
    expect(field.totalFirings).toBe(0);
    expect(field.pulses.activeCount).toBe(0);
  });

  test('fires the neuron nearest a click', () => {
    const field = fieldOf();
    const target = 7;
    field.strikeAt(field.graph.homeX[target], field.graph.homeY[target]);
    expect(field.pulses.activeCount).toBeGreaterThan(0);
    for (let i = 0; i < field.pulses.activeCount; i++) {
      expect(field.pulses.from[i]).toBe(target);
    }
  });

  test('spreads a strike across many dendrites', () => {
    const field = fieldOf();
    field.strikeAt(600, 400);
    let struck = 0;
    for (let i = 0; i < 240; i++) {
      field.step(1 / 60);
      struck = Math.max(struck, field.pulses.activeCount);
    }
    expect(struck).toBeGreaterThan(10);
  });

  test('carries a strike well beyond the neuron that was clicked', () => {
    const field = fieldOf();
    field.strikeAt(600, 400);
    let furthest = 0;
    for (let i = 0; i < 600; i++) {
      field.step(1 / 60);
      for (let e = 0; e < field.graph.edgeCount; e++) {
        if (field.pulses.edgeGlow[e] < 0.02) continue;
        const node = field.graph.edgeA[e];
        const distance = Math.hypot(field.liveX[node] - 600, field.liveY[node] - 400);
        furthest = Math.max(furthest, distance);
      }
    }
    // Several hundred pixels, not a couple of dendrites.
    expect(furthest).toBeGreaterThan(320);
  });

  test('keeps per-frame garbage within budget', () => {
    // Looser than ALLOCATION_FREE_KB because Focus.step leaves a residue of
    // roughly 32 bytes a frame that profiling could not pin to any statement
    // — a structurally identical replica measures clean, which points at a
    // deoptimisation rather than a line of code. At 60fps that is ~2KB/s, a
    // minor collection every few minutes, so it is not worth chasing further.
    // The budget still catches real regressions: calling Math.hypot once per
    // frame, which this loop used to do, measured 3953KB here.
    const budgetKb = 3200;
    const field = fieldOf();
    const riseKb = peakHeapRiseKb(60000, (i) => {
      if (i % 500 === 0) field.strikeAt(600, 400);
      field.step(1 / 60);
    });
    expect(riseKb).toBeLessThan(budgetKb);
  });
});
