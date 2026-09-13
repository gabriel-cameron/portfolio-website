/**
 * Uniform spatial hash over a fixed field.
 *
 * Neighbour queries are the hot path of both graph construction and cursor
 * illumination. Comparing every node against every other is O(n^2); bucketing
 * into cells and scanning only the cells a radius touches makes it O(n).
 *
 * Buckets are stored as an intrusive linked list over two Int32Arrays rather
 * than arrays-of-arrays, so a rebuild costs no allocations and a query costs
 * none at all.
 */
export class SpatialGrid {
  private readonly cellSize: number;
  private cols = 0;
  private rows = 0;
  /** First node index in each cell, or -1. */
  private head = new Int32Array(0);
  /** Next node index sharing the cell, or -1. */
  private next = new Int32Array(0);
  private xs = new Float32Array(0);
  private ys = new Float32Array(0);
  private count = 0;

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  build(xs: Float32Array, ys: Float32Array, count: number, width: number, height: number): void {
    this.xs = xs;
    this.ys = ys;
    this.count = count;
    this.cols = Math.max(1, Math.ceil(width / this.cellSize));
    this.rows = Math.max(1, Math.ceil(height / this.cellSize));

    const cells = this.cols * this.rows;
    if (this.head.length < cells) this.head = new Int32Array(cells);
    if (this.next.length < count) this.next = new Int32Array(count);
    this.head.fill(-1, 0, cells);

    for (let i = 0; i < count; i++) {
      const cell = this.cellIndex(xs[i], ys[i]);
      this.next[i] = this.head[cell];
      this.head[cell] = i;
    }
  }

  /**
   * Writes the indices of every node within `radius` of (x, y) into `out`,
   * returning how many were written. Stops early if `out` fills up.
   */
  queryRadius(x: number, y: number, radius: number, out: Int32Array): number {
    const minCol = this.clampCol(Math.floor((x - radius) / this.cellSize));
    const maxCol = this.clampCol(Math.floor((x + radius) / this.cellSize));
    const minRow = this.clampRow(Math.floor((y - radius) / this.cellSize));
    const maxRow = this.clampRow(Math.floor((y + radius) / this.cellSize));
    const r2 = radius * radius;
    let n = 0;

    for (let row = minRow; row <= maxRow; row++) {
      const rowOffset = row * this.cols;
      for (let col = minCol; col <= maxCol; col++) {
        for (let i = this.head[rowOffset + col]; i !== -1; i = this.next[i]) {
          const dx = this.xs[i] - x;
          const dy = this.ys[i] - y;
          if (dx * dx + dy * dy <= r2) {
            if (n === out.length) return n;
            out[n++] = i;
          }
        }
      }
    }
    return n;
  }

  private cellIndex(x: number, y: number): number {
    const col = this.clampCol(Math.floor(x / this.cellSize));
    const row = this.clampRow(Math.floor(y / this.cellSize));
    return row * this.cols + col;
  }

  private clampCol(col: number): number {
    return col < 0 ? 0 : col >= this.cols ? this.cols - 1 : col;
  }

  private clampRow(row: number): number {
    return row < 0 ? 0 : row >= this.rows ? this.rows - 1 : row;
  }
}
