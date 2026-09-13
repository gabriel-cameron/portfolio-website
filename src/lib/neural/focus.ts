import { createRng } from './rng';

export interface FocusOptions {
  /** Drift speed in CSS pixels per second while unattended. */
  wanderSpeed: number;
  /** Idle time before the pointer surrenders control back to the drift. */
  handoffSeconds: number;
}

/**
 * The point the field illuminates around.
 *
 * On a phone there is no cursor, so a field that only responds to the mouse
 * would be inert for most of the site's traffic. An unattended focus drifts
 * through the network on its own; the pointer simply takes it over while it is
 * being moved.
 *
 * When the pointer goes idle the drift resumes *from wherever the pointer
 * left off* rather than easing back to some remembered position. Sliding the
 * highlight across the screen would read as a glitch, and the speed of that
 * slide would depend on how far away the drift had got.
 */
export class Focus {
  x: number;
  y: number;

  private width: number;
  private height: number;
  private readonly rng: () => number;
  private readonly options: FocusOptions;
  private targetX = 0;
  private targetY = 0;
  private pointerIdle = Number.POSITIVE_INFINITY;

  constructor(width: number, height: number, seed: number, options: FocusOptions) {
    this.width = width;
    this.height = height;
    this.rng = createRng(seed);
    this.options = options;
    this.x = this.rng() * width;
    this.y = this.rng() * height;
    this.pickTarget();
  }

  pointerMove(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.pointerIdle = 0;
  }

  /** Gives the drift control back immediately, e.g. when the cursor leaves. */
  pointerLeave(): void {
    this.pointerIdle = Number.POSITIVE_INFINITY;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.x = Math.min(this.x, width);
    this.y = Math.min(this.y, height);
    this.pickTarget();
  }

  step(dt: number): void {
    this.pointerIdle += dt;
    if (this.pointerIdle < this.options.handoffSeconds) return;

    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    // Not Math.hypot: V8's variadic implementation allocates, and this runs
    // every frame. Measured at ~8MB of garbage per 400k calls.
    const distance = Math.sqrt(dx * dx + dy * dy);
    const travel = this.options.wanderSpeed * dt;

    if (distance <= travel) {
      this.x = this.targetX;
      this.y = this.targetY;
      this.pickTarget();
      return;
    }
    this.x += (dx / distance) * travel;
    this.y += (dy / distance) * travel;
  }

  private pickTarget(): void {
    this.targetX = this.rng() * this.width;
    this.targetY = this.rng() * this.height;
  }
}
