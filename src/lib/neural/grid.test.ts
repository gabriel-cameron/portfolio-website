import { beforeEach, describe, expect, test } from 'vitest';
import { ALLOCATION_FREE_KB, peakHeapRiseKb } from './allocation-probe';
import { SpatialGrid } from './grid';

/** Builds a grid over the given points and returns the query helper. */
function gridOf(points: Array<[number, number]>, cellSize = 10) {
  const xs = Float32Array.from(points.map((p) => p[0]));
  const ys = Float32Array.from(points.map((p) => p[1]));
  const grid = new SpatialGrid(cellSize);
  grid.build(xs, ys, points.length, 100, 100);
  return grid;
}

describe('SpatialGrid', () => {
  let out: Int32Array;

  beforeEach(() => {
    out = new Int32Array(64);
  });

  test('finds a point inside the radius', () => {
    const grid = gridOf([[50, 50]]);
    const n = grid.queryRadius(52, 52, 5, out);
    expect(n).toBe(1);
    expect(out[0]).toBe(0);
  });

  test('excludes a point outside the radius but inside the scanned cells', () => {
    // (59,59) sits in a neighbouring cell that the 8-cell scan visits,
    // but it is ~12.7 away, beyond the radius of 5.
    const grid = gridOf([[59, 59]]);
    expect(grid.queryRadius(50, 50, 5, out)).toBe(0);
  });

  test('finds points spread across several cells', () => {
    const grid = gridOf([
      [50, 50],
      [56, 50],
      [44, 50],
      [50, 56],
      [90, 90],
    ]);
    const n = grid.queryRadius(50, 50, 8, out);
    expect(n).toBe(4);
    expect([...out.slice(0, n)].sort()).toEqual([0, 1, 2, 3]);
  });

  test('finds points at the corners of the field', () => {
    const grid = gridOf([
      [0, 0],
      [100, 100],
    ]);
    expect(grid.queryRadius(0, 0, 3, out)).toBe(1);
    expect(grid.queryRadius(100, 100, 3, out)).toBe(1);
  });

  test('never writes past the end of the output buffer', () => {
    const points: Array<[number, number]> = [];
    for (let i = 0; i < 50; i++) points.push([50, 50]);
    const small = new Int32Array(8);
    const grid = gridOf(points);
    expect(grid.queryRadius(50, 50, 5, small)).toBe(8);
  });

  test('rebuilding replaces the previous contents', () => {
    const grid = new SpatialGrid(10);
    grid.build(Float32Array.from([50]), Float32Array.from([50]), 1, 100, 100);
    grid.build(Float32Array.from([90]), Float32Array.from([90]), 1, 100, 100);
    expect(grid.queryRadius(50, 50, 5, out)).toBe(0);
    expect(grid.queryRadius(90, 90, 5, out)).toBe(1);
  });

  test('does not allocate per query', () => {
    const grid = gridOf([[50, 50]]);
    // More iterations than the other probes need: one query is cheap enough
    // that a shorter run does not produce a stable sawtooth to measure.
    const riseKb = peakHeapRiseKb(400000, () => grid.queryRadius(50, 50, 5, out));
    expect(riseKb).toBeLessThan(ALLOCATION_FREE_KB);
  });
});
