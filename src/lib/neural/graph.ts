import { createRng } from './rng';
import { SpatialGrid } from './grid';

export interface GraphOptions {
  width: number;
  height: number;
  /** Minimum distance between neurons; also sets the overall density. */
  spacing: number;
  /** Dendrites each neuron reaches out with. Its final degree may exceed this
   *  because neighbours reach back. */
  maxDegree: number;
  seed: number;
}

export interface NeuralGraph {
  count: number;
  /** Rest positions. Live positions wobble around these; see field.ts. */
  homeX: Float32Array;
  homeY: Float32Array;
  edgeCount: number;
  edgeA: Int32Array;
  edgeB: Int32Array;
  edgeLength: Float32Array;
  /** Perpendicular offset of each dendrite's bezier control point. */
  edgeCurve: Float32Array;
  /** CSR adjacency: edges touching neuron i are adjEdge[adjStart[i]..adjStart[i+1]]. */
  adjStart: Int32Array;
  adjEdge: Int32Array;
}

/** How far a dendrite may stretch, as a multiple of the minimum spacing. */
const MAX_EDGE_FACTOR = 2.2;

/** Bridson's rejection count. 30 is the usual quality/speed tradeoff. */
const PLACEMENT_ATTEMPTS = 30;

/**
 * Builds the persistent neuron network for a field of the given size.
 *
 * Neurons are placed with Poisson-disc sampling rather than uniformly at
 * random: uniform placement clumps, and clumps read as a tangle instead of
 * tissue. A guaranteed minimum spacing also keeps dendrite lengths similar,
 * which makes signal travel times consistent.
 *
 * Runs once per resize, so clarity wins over speed here — unlike the frame
 * loop, which this exists to keep cheap.
 */
export function buildGraph(options: GraphOptions): NeuralGraph {
  const rng = createRng(options.seed);
  const { homeX, homeY, count } = placeNeurons(options, rng);
  return wire(options, rng, homeX, homeY, count);
}

/** Poisson-disc sampling (Bridson 2007). */
function placeNeurons(options: GraphOptions, rng: () => number) {
  const { width, height, spacing } = options;
  const cellSize = spacing / Math.SQRT2;
  const cols = Math.ceil(width / cellSize) + 1;
  const rows = Math.ceil(height / cellSize) + 1;

  // One slot per cell: a cell this small can hold at most one sample.
  const occupant = new Int32Array(cols * rows).fill(-1);
  const xs: number[] = [];
  const ys: number[] = [];
  const active: number[] = [];

  const record = (x: number, y: number) => {
    const index = xs.length;
    xs.push(x);
    ys.push(y);
    active.push(index);
    occupant[Math.floor(y / cellSize) * cols + Math.floor(x / cellSize)] = index;
    return index;
  };

  const fits = (x: number, y: number) => {
    if (x < 0 || y < 0 || x > width || y > height) return false;
    const col = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);
    // A conflicting sample can only be within two cells in each direction.
    const minCol = Math.max(0, col - 2);
    const maxCol = Math.min(cols - 1, col + 2);
    const minRow = Math.max(0, row - 2);
    const maxRow = Math.min(rows - 1, row + 2);
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const other = occupant[r * cols + c];
        if (other === -1) continue;
        const dx = xs[other] - x;
        const dy = ys[other] - y;
        if (dx * dx + dy * dy < spacing * spacing) return false;
      }
    }
    return true;
  };

  record(rng() * width, rng() * height);

  while (active.length > 0) {
    const pick = Math.floor(rng() * active.length);
    const from = active[pick];
    let placed = false;

    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
      const angle = rng() * Math.PI * 2;
      // Uniform over the annulus [spacing, 2*spacing).
      const radius = spacing * Math.sqrt(1 + 3 * rng());
      const x = xs[from] + Math.cos(angle) * radius;
      const y = ys[from] + Math.sin(angle) * radius;
      if (fits(x, y)) {
        record(x, y);
        placed = true;
        break;
      }
    }

    if (!placed) {
      // Exhausted: retire this sample by swapping the last one into its slot.
      active[pick] = active[active.length - 1];
      active.pop();
    }
  }

  return { homeX: Float32Array.from(xs), homeY: Float32Array.from(ys), count: xs.length };
}

/** Links each neuron to its nearest neighbours, deduplicating reciprocal pairs. */
function wire(
  options: GraphOptions,
  rng: () => number,
  homeX: Float32Array,
  homeY: Float32Array,
  count: number,
): NeuralGraph {
  const maxEdge = options.spacing * MAX_EDGE_FACTOR;
  const grid = new SpatialGrid(maxEdge);
  grid.build(homeX, homeY, count, options.width, options.height);

  const candidates = new Int32Array(64);
  const edgeA: number[] = [];
  const edgeB: number[] = [];
  const seen = new Set<number>();

  for (let i = 0; i < count; i++) {
    const found = grid.queryRadius(homeX[i], homeY[i], maxEdge, candidates);

    // Nearest-first, so a neuron wires to its closest neighbours.
    const nearby: Array<{ index: number; d2: number }> = [];
    for (let c = 0; c < found; c++) {
      const j = candidates[c];
      if (j === i) continue;
      const dx = homeX[j] - homeX[i];
      const dy = homeY[j] - homeY[i];
      nearby.push({ index: j, d2: dx * dx + dy * dy });
    }
    nearby.sort((a, b) => a.d2 - b.d2);

    for (let k = 0; k < Math.min(options.maxDegree, nearby.length); k++) {
      const j = nearby[k].index;
      const key = i < j ? i * count + j : j * count + i;
      if (seen.has(key)) continue;
      seen.add(key);
      edgeA.push(i);
      edgeB.push(j);
    }
  }

  const edgeCount = edgeA.length;
  const edgeLength = new Float32Array(edgeCount);
  const edgeCurve = new Float32Array(edgeCount);
  for (let e = 0; e < edgeCount; e++) {
    const dx = homeX[edgeB[e]] - homeX[edgeA[e]];
    const dy = homeY[edgeB[e]] - homeY[edgeA[e]];
    const length = Math.hypot(dx, dy);
    edgeLength[e] = length;
    // Signed bow, 5-13% of length. Straight lines read as a star chart.
    edgeCurve[e] = (rng() < 0.5 ? -1 : 1) * length * (0.05 + rng() * 0.08);
  }

  return {
    count,
    homeX,
    homeY,
    edgeCount,
    edgeA: Int32Array.from(edgeA),
    edgeB: Int32Array.from(edgeB),
    edgeLength,
    edgeCurve,
    ...buildAdjacency(count, edgeCount, edgeA, edgeB),
  };
}

/** Compressed sparse row index from neuron to the edges touching it. */
function buildAdjacency(count: number, edgeCount: number, edgeA: number[], edgeB: number[]) {
  const adjStart = new Int32Array(count + 1);
  for (let e = 0; e < edgeCount; e++) {
    adjStart[edgeA[e] + 1]++;
    adjStart[edgeB[e] + 1]++;
  }
  for (let i = 0; i < count; i++) adjStart[i + 1] += adjStart[i];

  const cursor = Int32Array.from(adjStart.subarray(0, count));
  const adjEdge = new Int32Array(edgeCount * 2);
  for (let e = 0; e < edgeCount; e++) {
    adjEdge[cursor[edgeA[e]]++] = e;
    adjEdge[cursor[edgeB[e]]++] = e;
  }
  return { adjStart, adjEdge };
}
