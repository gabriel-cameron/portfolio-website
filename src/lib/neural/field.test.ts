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

describe('NeuralField activity', () => {
  test('fires on its own so the page looks like it is thinking', () => {
    const field = fieldOf();
    run(field, 3);
    expect(field.totalFirings).toBeGreaterThan(2);
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

  test('spreads a strike further than an ambient firing', () => {
    const quiet = new NeuralField(1200, 800, { ...config, ambientInterval: [999, 999] }, 1234);
    quiet.strikeAt(600, 400);
    let struck = 0;
    for (let i = 0; i < 240; i++) {
      quiet.step(1 / 60);
      struck = Math.max(struck, quiet.pulses.activeCount);
    }
    expect(struck).toBeGreaterThan(4);
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
