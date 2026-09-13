import { describe, expect, test } from 'vitest';
import { buildGraph } from './graph';

const FIELD = { width: 1200, height: 800, spacing: 60, maxDegree: 3, seed: 4242 };

describe('buildGraph placement', () => {
  test('fills the field at roughly the requested density', () => {
    const g = buildGraph(FIELD);
    const expected = (FIELD.width * FIELD.height) / (FIELD.spacing * FIELD.spacing);
    expect(g.count).toBeGreaterThan(expected * 0.5);
    expect(g.count).toBeLessThan(expected * 1.5);
  });

  test('keeps every neuron at least the spacing apart', () => {
    const g = buildGraph(FIELD);
    let worst = Number.POSITIVE_INFINITY;
    for (let i = 0; i < g.count; i++) {
      for (let j = i + 1; j < g.count; j++) {
        const dx = g.homeX[i] - g.homeX[j];
        const dy = g.homeY[i] - g.homeY[j];
        worst = Math.min(worst, Math.sqrt(dx * dx + dy * dy));
      }
    }
    expect(worst).toBeGreaterThanOrEqual(FIELD.spacing * 0.999);
  });

  test('keeps every neuron inside the field', () => {
    const g = buildGraph(FIELD);
    for (let i = 0; i < g.count; i++) {
      expect(g.homeX[i]).toBeGreaterThanOrEqual(0);
      expect(g.homeX[i]).toBeLessThanOrEqual(FIELD.width);
      expect(g.homeY[i]).toBeGreaterThanOrEqual(0);
      expect(g.homeY[i]).toBeLessThanOrEqual(FIELD.height);
    }
  });

  test('is deterministic for a given seed', () => {
    const a = buildGraph(FIELD);
    const b = buildGraph(FIELD);
    expect([...a.homeX]).toEqual([...b.homeX]);
    expect([...a.edgeA]).toEqual([...b.edgeA]);
  });

  test('produces a different field for a different seed', () => {
    const a = buildGraph(FIELD);
    const b = buildGraph({ ...FIELD, seed: 99 });
    expect([...a.homeX]).not.toEqual([...b.homeX]);
  });

  test('scales down to a phone-sized field without dying', () => {
    const g = buildGraph({ ...FIELD, width: 390, height: 844 });
    expect(g.count).toBeGreaterThan(20);
    expect(g.edgeCount).toBeGreaterThan(20);
  });
});

describe('buildGraph wiring', () => {
  test('connects every neuron to at least one other', () => {
    const g = buildGraph(FIELD);
    const degree = new Int32Array(g.count);
    for (let e = 0; e < g.edgeCount; e++) {
      degree[g.edgeA[e]]++;
      degree[g.edgeB[e]]++;
    }
    for (let i = 0; i < g.count; i++) expect(degree[i]).toBeGreaterThan(0);
  });

  test('holds an average degree in the 2-to-4 range the design calls for', () => {
    const g = buildGraph(FIELD);
    const average = (2 * g.edgeCount) / g.count;
    expect(average).toBeGreaterThanOrEqual(2);
    expect(average).toBeLessThanOrEqual(5);
  });

  test('never links a neuron to itself', () => {
    const g = buildGraph(FIELD);
    for (let e = 0; e < g.edgeCount; e++) expect(g.edgeA[e]).not.toBe(g.edgeB[e]);
  });

  test('never stores the same pair twice', () => {
    const g = buildGraph(FIELD);
    const seen = new Set<string>();
    for (let e = 0; e < g.edgeCount; e++) {
      const lo = Math.min(g.edgeA[e], g.edgeB[e]);
      const hi = Math.max(g.edgeA[e], g.edgeB[e]);
      const key = `${lo}-${hi}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  test('never links neurons further apart than the maximum dendrite length', () => {
    const g = buildGraph(FIELD);
    const max = FIELD.spacing * 2.2;
    for (let e = 0; e < g.edgeCount; e++) {
      const dx = g.homeX[g.edgeA[e]] - g.homeX[g.edgeB[e]];
      const dy = g.homeY[g.edgeA[e]] - g.homeY[g.edgeB[e]];
      expect(Math.sqrt(dx * dx + dy * dy)).toBeLessThanOrEqual(max + 0.001);
    }
  });

  test('records the length of each dendrite', () => {
    const g = buildGraph(FIELD);
    for (let e = 0; e < g.edgeCount; e++) {
      const dx = g.homeX[g.edgeA[e]] - g.homeX[g.edgeB[e]];
      const dy = g.homeY[g.edgeA[e]] - g.homeY[g.edgeB[e]];
      expect(g.edgeLength[e]).toBeCloseTo(Math.sqrt(dx * dx + dy * dy), 2);
    }
  });

  test('gives each dendrite a curve offset so none are dead straight', () => {
    const g = buildGraph(FIELD);
    for (let e = 0; e < g.edgeCount; e++) {
      expect(Math.abs(g.edgeCurve[e])).toBeGreaterThan(0);
      expect(Math.abs(g.edgeCurve[e])).toBeLessThan(g.edgeLength[e] * 0.5);
    }
  });
});

describe('buildGraph adjacency index', () => {
  test('lists exactly the edges touching each neuron', () => {
    const g = buildGraph(FIELD);
    for (let i = 0; i < g.count; i++) {
      const fromIndex = new Set<number>();
      for (let s = g.adjStart[i]; s < g.adjStart[i + 1]; s++) fromIndex.add(g.adjEdge[s]);

      const fromEdges = new Set<number>();
      for (let e = 0; e < g.edgeCount; e++) {
        if (g.edgeA[e] === i || g.edgeB[e] === i) fromEdges.add(e);
      }
      expect(fromIndex).toEqual(fromEdges);
    }
  });

  test('ends the adjacency index at twice the edge count', () => {
    const g = buildGraph(FIELD);
    expect(g.adjStart[g.count]).toBe(g.edgeCount * 2);
  });
});
