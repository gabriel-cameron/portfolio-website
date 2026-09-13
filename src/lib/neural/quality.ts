export interface QualityOptions {
  /** Render scales from best to worst. */
  scales: number[];
  /** Frame times above this count against the current scale. */
  slowMs: number;
  /** Frame times below this count toward restoring quality. */
  fastMs: number;
  /** Frames of evidence needed before dropping a level. */
  window: number;
}

/** Restoring quality demands this much more evidence than dropping it. */
const RAISE_PATIENCE = 4;

/**
 * Trades resolution for frame rate when the machine cannot keep up.
 *
 * The render scale is the lever because it is the one that matters: this
 * effect is fill-rate bound — large additive glow sprites over the whole
 * viewport — so backing-store size dominates, and on a blurred glow field a
 * smaller buffer is close to invisible. Thinning the network instead would be
 * plainly visible, and rebuilding the graph mid-animation would hitch.
 *
 * Evidence accumulates rather than needing an unbroken run, so ordinary
 * variance still triggers a drop, while a lone stall — a GC pause, a
 * backgrounded tab — does not. Restoring quality is deliberately four times
 * slower than dropping it, so a machine sitting near the threshold settles
 * instead of flickering between levels.
 */
export class QualityController {
  private readonly options: QualityOptions;
  private level = 0;
  private slowEvidence = 0;
  private fastEvidence = 0;

  constructor(options: QualityOptions) {
    this.options = options;
  }

  get scale(): number {
    return this.options.scales[this.level];
  }

  /** Records a frame time; returns true if the scale changed. */
  sample(frameMs: number): boolean {
    if (frameMs > this.options.slowMs) {
      this.slowEvidence++;
      this.fastEvidence = 0;
    } else if (frameMs < this.options.fastMs) {
      this.fastEvidence++;
      if (this.slowEvidence > 0) this.slowEvidence--;
    }

    if (this.slowEvidence > this.options.window && this.level < this.options.scales.length - 1) {
      this.level++;
      this.reset();
      return true;
    }
    if (this.fastEvidence > this.options.window * RAISE_PATIENCE && this.level > 0) {
      this.level--;
      this.reset();
      return true;
    }
    return false;
  }

  private reset(): void {
    this.slowEvidence = 0;
    this.fastEvidence = 0;
  }
}
