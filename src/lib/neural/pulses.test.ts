import { describe, expect, test } from 'vitest';
import { ALLOCATION_FREE_KB, peakHeapRiseKb } from './allocation-probe';
import type { NeuralGraph } from './graph';
import { PulseSystem } from './pulses';

/**
 * Builds a graph fixture from an explicit edge list. Deliberately naive and
 * independent of buildGraph, so these tests exercise propagation rather than
 * agreeing with the production construction code.
 */
function graphOf(count: number, edges: Array<[number, number]>): NeuralGraph {
  const adjacency: number[][] = Array.from({ length: count }, () => []);
  edges.forEach(([a, b], e) => {
    adjacency[a].push(e);
    adjacency[b].push(e);
  });
  const adjStart = new Int32Array(count + 1);
  for (let i = 0; i < count; i++) adjStart[i + 1] = adjStart[i] + adjacency[i].length;

  return {
    count,
    homeX: new Float32Array(count),
    homeY: new Float32Array(count),
    edgeCount: edges.length,
    edgeA: Int32Array.from(edges.map((e) => e[0])),
    edgeB: Int32Array.from(edges.map((e) => e[1])),
    edgeLength: Float32Array.from(edges.map(() => 100)),
    edgeCurve: Float32Array.from(edges.map(() => 5)),
    adjStart,
    adjEdge: Int32Array.from(adjacency.flat()),
  };
}

/** 0 - 1 - 2 - 3 in a line. */
const line = () =>
  graphOf(4, [
    [0, 1],
    [1, 2],
    [2, 3],
  ]);

/** Hub 0 wired to 1, 2, 3. */
const star = () =>
  graphOf(4, [
    [0, 1],
    [0, 2],
    [0, 3],
  ]);

const options = {
  capacity: 64,
  speed: 200,
  speedFloor: 0.35,
  hopDecay: 0.7,
  minIntensity: 0.1,
  refractorySeconds: 0.4,
  glowDecaySeconds: 0.5,
};

/** Steps in small increments so pulses cannot skip a node. */
function run(pulses: PulseSystem, seconds: number, dt = 1 / 60) {
  for (let elapsed = 0; elapsed < seconds; elapsed += dt) pulses.step(dt);
}

describe('PulseSystem firing', () => {
  test('sends a pulse down every dendrite of the neuron that fires', () => {
    const pulses = new PulseSystem(star(), options);
    pulses.fire(0, 1, 4);
    expect(pulses.activeCount).toBe(3);
  });

  test('starts each pulse at the firing neuron', () => {
    const pulses = new PulseSystem(star(), options);
    pulses.fire(0, 1, 4);
    for (let i = 0; i < pulses.activeCount; i++) expect(pulses.from[i]).toBe(0);
  });

  test('advances a pulse along its dendrite over time', () => {
    const pulses = new PulseSystem(line(), options);
    pulses.fire(0, 1, 0);
    pulses.step(0.1);
    // 200px/s for 0.1s over a 100px dendrite = 20% of the way.
    expect(pulses.progress[0]).toBeCloseTo(0.2, 2);
  });

  test('sends a weakened signal along more slowly', () => {
    const strong = new PulseSystem(line(), options);
    strong.fire(0, 1, 0);
    strong.step(0.1);

    const weak = new PulseSystem(line(), options);
    weak.fire(0, 0.3, 0);
    weak.step(0.1);

    expect(weak.progress[0]).toBeLessThan(strong.progress[0]);
    expect(weak.progress[0]).toBeGreaterThan(0);
  });

  test('never stalls a signal completely, however weak', () => {
    const pulses = new PulseSystem(line(), options);
    pulses.fire(0, 0.01, 0);
    run(pulses, 3);
    expect(pulses.activeCount).toBe(0); // it still arrived
  });

  test('retires a pulse with no hops left when it arrives', () => {
    const pulses = new PulseSystem(line(), options);
    pulses.fire(0, 1, 0);
    run(pulses, 1);
    expect(pulses.activeCount).toBe(0);
  });
});

describe('PulseSystem propagation', () => {
  test('carries the signal onward to the next neuron', () => {
    const pulses = new PulseSystem(line(), options);
    pulses.fire(0, 1, 3);
    run(pulses, 0.6); // one 100px dendrite takes 0.5s
    expect(pulses.activeCount).toBe(1);
    // Crossed the first dendrite and is now travelling the second.
    expect(pulses.edgeGlow[0]).toBeGreaterThan(0);
    expect(pulses.edge[0]).toBe(1);
    expect(pulses.from[0]).toBe(1);
  });

  test('weakens with every hop', () => {
    const pulses = new PulseSystem(line(), options);
    pulses.fire(0, 1, 3);
    run(pulses, 0.6);
    expect(pulses.intensity[0]).toBeCloseTo(0.7, 5);
  });

  test('stops once the hop budget runs out', () => {
    const pulses = new PulseSystem(line(), { ...options, hopDecay: 1 });
    pulses.fire(0, 1, 1);
    run(pulses, 5);
    // Reached neuron 2 at most; neuron 3's dendrite never lights.
    expect(pulses.activeCount).toBe(0);
    expect(pulses.edgeGlow[2]).toBe(0);
  });

  test('stops once the signal is too weak to matter', () => {
    const pulses = new PulseSystem(line(), { ...options, hopDecay: 0.05 });
    pulses.fire(0, 1, 99);
    run(pulses, 5);
    expect(pulses.activeCount).toBe(0);
  });

  test('branches at a junction', () => {
    const pulses = new PulseSystem(
      graphOf(4, [
        [0, 1],
        [1, 2],
        [1, 3],
      ]),
      options,
    );
    pulses.fire(0, 1, 4);
    run(pulses, 0.6);
    // Arriving at hub 1, the signal continues down both other dendrites.
    expect(pulses.activeCount).toBe(2);
  });

  test('does not travel back the way it came', () => {
    const pulses = new PulseSystem(line(), options);
    pulses.fire(1, 1, 6);
    run(pulses, 3);
    for (let i = 0; i < pulses.activeCount; i++) expect(pulses.from[i]).not.toBe(1);
  });

  test('terminates instead of echoing around a loop', () => {
    const ring = graphOf(6, [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 0],
    ]);
    const pulses = new PulseSystem(ring, { ...options, hopDecay: 1, minIntensity: 0 });
    pulses.fire(0, 1, 1000);
    run(pulses, 10);
    expect(pulses.activeCount).toBe(0);
  });

  test('refuses to re-fire a neuron still in its refractory period', () => {
    const pulses = new PulseSystem(star(), options);
    pulses.fire(0, 1, 4);
    run(pulses, 0.6); // pulses reach 1, 2 and 3, putting them in refractory
    const before = pulses.activeCount;
    pulses.step(0.01);
    expect(pulses.activeCount).toBeLessThanOrEqual(before);
  });

  test('lets a deliberate click fire a neuron again immediately', () => {
    const pulses = new PulseSystem(star(), options);
    pulses.fire(0, 1, 4);
    pulses.fire(0, 1, 4);
    expect(pulses.activeCount).toBe(6);
  });

  test('never exceeds the pool capacity', () => {
    const hub: Array<[number, number]> = [];
    for (let i = 1; i < 40; i++) hub.push([0, i]);
    const pulses = new PulseSystem(graphOf(40, hub), { ...options, capacity: 10 });
    pulses.fire(0, 1, 4);
    expect(pulses.activeCount).toBe(10);
  });
});

describe('PulseSystem afterglow', () => {
  test('leaves a dendrite dark until the signal has crossed it', () => {
    const pulses = new PulseSystem(line(), options);
    pulses.fire(0, 1, 2);
    pulses.step(0.1); // 20% of the way along
    expect(pulses.edgeGlow[0]).toBe(0);
  });

  test('lights a dendrite once the signal reaches the far end', () => {
    const pulses = new PulseSystem(line(), options);
    pulses.fire(0, 1, 2);
    run(pulses, 0.6); // a 100px dendrite at 200px/s takes 0.5s
    expect(pulses.edgeGlow[0]).toBeGreaterThan(0);
  });

  test('fades the afterglow once the pulse has passed', () => {
    const pulses = new PulseSystem(line(), options);
    pulses.fire(0, 1, 0);
    run(pulses, 0.6);
    const litImmediately = pulses.edgeGlow[0];
    run(pulses, 1.5);
    expect(pulses.edgeGlow[0]).toBeLessThan(litImmediately);
  });

  test('leaves dendrites dark when nothing has fired', () => {
    const pulses = new PulseSystem(line(), options);
    run(pulses, 1);
    for (let e = 0; e < 3; e++) expect(pulses.edgeGlow[e]).toBe(0);
  });
});

describe('PulseSystem cost', () => {
  test('does not allocate while stepping', () => {
    const pulses = new PulseSystem(line(), options);
    const riseKb = peakHeapRiseKb(200000, (i) => {
      if (i % 200 === 0) pulses.fire(0, 1, 3);
      pulses.step(1 / 60);
    });
    expect(riseKb).toBeLessThan(ALLOCATION_FREE_KB);
  });
});
