import { COLORS } from './config';
import type { NeuralField } from './field';

/**
 * Distinct alpha levels edges and neurons are quantised to.
 *
 * Stroking each dendrite separately would mean ~1200 stroke calls a frame,
 * because a stroke can only use one alpha. Grouping by quantised alpha and
 * stroking each group as a single path cuts that to the number of *occupied*
 * levels — so the level count is a direct multiplier on draw calls, and canvas
 * draw calls are the dominant cost here, not pixels.
 *
 * That only became visible once the brightness swells arrived. Before them
 * almost every dendrite sat at the same resting alpha and a handful of levels
 * were occupied; the swells spread them across every level, which took a
 * 2560x1440 field from 4.1ms a frame to 14.4ms at 64 levels. Measured at that
 * size: 64 levels 14.4ms, 8 levels 5.8ms.
 *
 * Levels are spaced by the square root of alpha rather than uniformly. A
 * uniform split wastes most of its levels on bright values nothing occupies,
 * while the dim end — where the resting wiring lives, at about 4% alpha — gets
 * steps far larger than the values themselves and bands visibly. In sqrt space
 * 24 levels give the dim end the same resolution 64 uniform levels did, at a
 * third of the draw calls.
 */
const LEVELS = 24;

/** Level a given alpha belongs to. */
function levelOfAlpha(alpha: number): number {
  if (alpha <= 0) return 0;
  const level = (Math.sqrt(alpha > 1 ? 1 : alpha) * LEVELS) | 0;
  return level >= LEVELS ? LEVELS - 1 : level;
}

/** Alpha a whole level is drawn at: the midpoint of the band it covers. */
function alphaOfLevel(level: number): number {
  const root = (level + 0.5) / LEVELS;
  return root * root;
}

/** Resting dendrite alpha: present, but barely. Low enough that the neurons
 *  themselves read as the brighter element, like stars over faint wiring. */
const EDGE_BASE = 0.038;
/**
 * Extra dendrite alpha at the crest of a brightness swell.
 *
 * Large relative to EDGE_BASE on purpose: a hairline at 4% alpha has almost
 * no room to brighten, so a small addition is invisible. This makes a crest
 * roughly six times the resting brightness while still sitting below the
 * illumination the pointer produces.
 */
const EDGE_BREATH = 0.2;
/** Extra dendrite alpha directly under the focus. */
const EDGE_FOCUS = 0.42;
/** Extra dendrite alpha from a signal passing along it. */
const EDGE_SIGNAL = 0.85;

/** Resting neuron alpha, before any swell or illumination. */
const NODE_BASE = 0.22;
/** Extra neuron alpha at the crest of a brightness swell. */
const NODE_BREATH = 0.45;
const NODE_FOCUS = 0.7;
const NODE_RADIUS = 1.05;
/** Combined brightness below which a neuron is a bare dot with no halo. */
const HALO_THRESHOLD = 0.12;
/** How much of a halo a swell crest earns, before the pointer contributes. */
const HALO_BREATH = 0.3;
/** Halo radius in CSS pixels. */
const HALO_RADIUS = 13;
/** Radius of the bright head of a travelling signal. */
const SIGNAL_RADIUS = 9;
/** Width of the lit trail a signal leaves behind it. */
const TRAIL_WIDTH = 1.15;

const EDGE_WIDTH = 0.7;

/** Draws a NeuralField to a 2D canvas. */
export class NeuralRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private ratio = 1;
  private width = 0;
  private height = 0;

  /** Pre-rendered glow, so a frame never builds a gradient. */
  private halo: HTMLCanvasElement;
  private signal: HTMLCanvasElement;

  // Counting sort of edges by alpha level; sized to the graph, reused forever.
  private levelOf = new Uint8Array(0);
  private levelCount = new Int32Array(LEVELS);
  private levelCursor = new Int32Array(LEVELS);
  private ordered = new Int32Array(0);
  private nodeLevelOf = new Uint8Array(0);
  private nodeLevelCount = new Int32Array(LEVELS);
  private nodeLevelCursor = new Int32Array(LEVELS);
  private nodeOrdered = new Int32Array(0);

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas is unavailable');
    this.canvas = canvas;
    this.ctx = ctx;
    this.halo = sprite(HALO_RADIUS, this.ratio, COLORS.dendrite, 0.55);
    this.signal = sprite(SIGNAL_RADIUS, this.ratio, COLORS.signal, 1);
  }

  /**
   * Resizes the backing store. `ratio` folds device pixel ratio together with
   * the adaptive quality scale.
   */
  resize(width: number, height: number, ratio: number): void {
    this.width = width;
    this.height = height;
    this.ratio = ratio;
    this.canvas.width = Math.max(1, Math.round(width * ratio));
    this.canvas.height = Math.max(1, Math.round(height * ratio));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.halo = sprite(HALO_RADIUS, ratio, COLORS.dendrite, 0.55);
    this.signal = sprite(SIGNAL_RADIUS, ratio, COLORS.signal, 1);
  }

  /** Sizes the scratch buffers to a graph. Call after the graph is rebuilt. */
  prepare(field: NeuralField): void {
    const { edgeCount, count } = field.graph;
    if (this.levelOf.length < edgeCount) {
      this.levelOf = new Uint8Array(edgeCount);
      this.ordered = new Int32Array(edgeCount);
    }
    if (this.nodeLevelOf.length < count) {
      this.nodeLevelOf = new Uint8Array(count);
      this.nodeOrdered = new Int32Array(count);
    }
  }

  /** `lit` false draws the resting field only: no focus, no signals. */
  draw(field: NeuralField, lit: boolean): void {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, this.width, this.height);

    // Additive, so overlapping glow accumulates into brighter cores the way
    // light does, instead of compositing to a flat average.
    ctx.globalCompositeOperation = 'lighter';
    this.drawEdges(field, lit);
    this.drawNodes(field, lit);
    if (lit) this.drawSignals(field);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawEdges(field: NeuralField, lit: boolean): void {
    const ctx = this.ctx;
    const graph = field.graph;
    const nodeGlow = field.nodeGlow;
    const nodeBreath = field.nodeBreath;
    const liveX = field.liveX;
    const liveY = field.liveY;
    const edgeGlow = field.pulses.edgeGlow;
    const edgeCount = graph.edgeCount;
    const edgeA = graph.edgeA;
    const edgeB = graph.edgeB;
    const edgeCurve = graph.edgeCurve;

    this.levelCount.fill(0);
    for (let e = 0; e < edgeCount; e++) {
      let alpha = EDGE_BASE + (nodeBreath[edgeA[e]] + nodeBreath[edgeB[e]]) * 0.5 * EDGE_BREATH;
      if (lit) {
        alpha += (nodeGlow[edgeA[e]] + nodeGlow[edgeB[e]]) * 0.5 * EDGE_FOCUS;
        alpha += edgeGlow[e] * EDGE_SIGNAL;
      }
      const level = levelOfAlpha(alpha);
      this.levelOf[e] = level;
      this.levelCount[level]++;
    }

    let running = 0;
    for (let l = 0; l < LEVELS; l++) {
      this.levelCursor[l] = running;
      running += this.levelCount[l];
    }
    for (let e = 0; e < edgeCount; e++) {
      this.ordered[this.levelCursor[this.levelOf[e]]++] = e;
    }

    ctx.strokeStyle = `rgb(${COLORS.dendrite})`;
    ctx.lineWidth = EDGE_WIDTH;

    let start = 0;
    for (let l = 0; l < LEVELS; l++) {
      const size = this.levelCount[l];
      if (size === 0) continue;
      ctx.globalAlpha = alphaOfLevel(l);
      ctx.beginPath();
      for (let k = start; k < start + size; k++) {
        const e = this.ordered[k];
        const ax = liveX[edgeA[e]];
        const ay = liveY[edgeA[e]];
        const bx = liveX[edgeB[e]];
        const by = liveY[edgeB[e]];
        // Bow the dendrite sideways: straight lines read as a star chart.
        const dx = bx - ax;
        const dy = by - ay;
        const length = Math.sqrt(dx * dx + dy * dy) || 1;
        const bow = edgeCurve[e];
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo(
          (ax + bx) * 0.5 - (dy / length) * bow,
          (ay + by) * 0.5 + (dx / length) * bow,
          bx,
          by,
        );
      }
      ctx.stroke();
      start += size;
    }
  }

  private drawNodes(field: NeuralField, lit: boolean): void {
    const ctx = this.ctx;
    const count = field.graph.count;
    const nodeGlow = field.nodeGlow;
    const nodeBreath = field.nodeBreath;
    const liveX = field.liveX;
    const liveY = field.liveY;

    this.nodeLevelCount.fill(0);
    for (let i = 0; i < count; i++) {
      const resting = NODE_BASE + nodeBreath[i] * NODE_BREATH;
      const alpha = lit ? resting + nodeGlow[i] * NODE_FOCUS : resting;
      const level = levelOfAlpha(alpha);
      this.nodeLevelOf[i] = level;
      this.nodeLevelCount[level]++;
    }

    let running = 0;
    for (let l = 0; l < LEVELS; l++) {
      this.nodeLevelCursor[l] = running;
      running += this.nodeLevelCount[l];
    }
    for (let i = 0; i < count; i++) {
      this.nodeOrdered[this.nodeLevelCursor[this.nodeLevelOf[i]]++] = i;
    }

    ctx.fillStyle = `rgb(${COLORS.soma})`;
    let start = 0;
    for (let l = 0; l < LEVELS; l++) {
      const size = this.nodeLevelCount[l];
      if (size === 0) continue;
      ctx.globalAlpha = alphaOfLevel(l);
      ctx.beginPath();
      for (let k = start; k < start + size; k++) {
        const i = this.nodeOrdered[k];
        ctx.moveTo(liveX[i] + NODE_RADIUS, liveY[i]);
        ctx.arc(liveX[i], liveY[i], NODE_RADIUS, 0, Math.PI * 2);
      }
      ctx.fill();
      start += size;
    }

    // Halos only where they show. Drawing one per neuron is the single most
    // expensive thing this renderer could do, and most would be invisible.
    // Squaring the swell keeps the count down: only true crests bloom.
    for (let i = 0; i < count; i++) {
      const breath = nodeBreath[i] * nodeBreath[i] * HALO_BREATH;
      const strength = lit ? breath + nodeGlow[i] * 0.55 : breath;
      if (strength < HALO_THRESHOLD) continue;
      ctx.globalAlpha = strength > 1 ? 1 : strength;
      ctx.drawImage(
        this.halo,
        liveX[i] - HALO_RADIUS,
        liveY[i] - HALO_RADIUS,
        HALO_RADIUS * 2,
        HALO_RADIUS * 2,
      );
    }
  }

  private drawSignals(field: NeuralField): void {
    const ctx = this.ctx;
    const pulses = field.pulses;
    const liveX = field.liveX;
    const liveY = field.liveY;
    const edgeA = field.graph.edgeA;
    const edgeB = field.graph.edgeB;
    const edgeCurve = field.graph.edgeCurve;

    ctx.strokeStyle = `rgb(${COLORS.signal})`;
    ctx.lineWidth = TRAIL_WIDTH;

    for (let p = 0; p < pulses.activeCount; p++) {
      const e = pulses.edge[p];
      const forward = pulses.from[p] === edgeA[e];
      const ax = liveX[forward ? edgeA[e] : edgeB[e]];
      const ay = liveY[forward ? edgeA[e] : edgeB[e]];
      const bx = liveX[forward ? edgeB[e] : edgeA[e]];
      const by = liveY[forward ? edgeB[e] : edgeA[e]];

      const dx = bx - ax;
      const dy = by - ay;
      const length = Math.sqrt(dx * dx + dy * dy) || 1;
      const bow = forward ? edgeCurve[e] : -edgeCurve[e];
      const cx = (ax + bx) * 0.5 - (dy / length) * bow;
      const cy = (ay + by) * 0.5 + (dx / length) * bow;

      // Position along the same quadratic the dendrite is drawn with, so the
      // signal rides the wire rather than cutting the corner.
      const t = pulses.progress[p];
      const inv = 1 - t;
      const x = inv * inv * ax + 2 * inv * t * cx + t * t * bx;
      const y = inv * inv * ay + 2 * inv * t * cy + t * t * by;

      const intensity = pulses.intensity[p] > 1 ? 1 : pulses.intensity[p];

      // The travelled part of the dendrite, and only that part. Splitting the
      // quadratic at t (de Casteljau) keeps the trail on the same curve the
      // dendrite is drawn with, so it does not drift off the wire.
      ctx.globalAlpha = intensity * 0.9;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(ax + (cx - ax) * t, ay + (cy - ay) * t, x, y);
      ctx.stroke();

      const size = SIGNAL_RADIUS * (0.5 + intensity * 0.5);
      ctx.globalAlpha = intensity;
      ctx.drawImage(this.signal, x - size, y - size, size * 2, size * 2);
    }
  }
}

/** Radial gradients are slow to build, so each glow is rendered once. */
function sprite(radius: number, ratio: number, rgb: string, peak: number): HTMLCanvasElement {
  const size = Math.max(2, Math.ceil(radius * 2 * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const centre = size / 2;
  const gradient = ctx.createRadialGradient(centre, centre, 0, centre, centre, centre);
  gradient.addColorStop(0, `rgba(${rgb}, ${peak})`);
  gradient.addColorStop(0.35, `rgba(${rgb}, ${peak * 0.35})`);
  gradient.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}
