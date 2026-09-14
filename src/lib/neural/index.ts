import { configFor } from './config';
import { NeuralField } from './field';
import { QualityController } from './quality';
import { NeuralRenderer } from './render';

export interface MountOptions {
  /** Element whose pointer events drive the field. Defaults to the canvas. */
  surface?: HTMLElement;
  /** Shows a frame-time readout. Useful for checking real phones. */
  hud?: boolean;
  seed?: number;
}

/** Device pixel ratio beyond this buys nothing visible on a glow field. */
const MAX_PIXEL_RATIO = 2;

/**
 * Longest frame the simulation will accept.
 *
 * A backgrounded tab or a stalled main thread can hand us a gap of seconds.
 * Integrating that in one step would teleport every signal to the end of its
 * dendrite. Better to lose the time than the continuity.
 */
const MAX_FRAME_SECONDS = 1 / 20;

/**
 * Controls whose clicks belong to them rather than to the field behind them.
 *
 * The field covers the whole hero, so a press on anything sitting over it also
 * reaches the strike handler. Firing a strike underneath the button that just
 * started a transition puts two animations on screen at once, which reads as
 * lag even when no frame is dropped.
 *
 * Matched with `closest()`, so a press on something nested inside a control —
 * an icon in a button, say — is covered too.
 */
const INTERACTIVE = 'a, button, input, select, textarea, label, [role="button"], [data-no-strike]';

/** Pointer travel, in pixels, above which a press is a drag and not a tap. */
const TAP_SLOP = 12;
/** Press duration, in milliseconds, above which it is a hold and not a tap. */
const TAP_TIMEOUT = 700;

/** Resize quiet period. Rebuilding the graph mid-drag would thrash. */
const RESIZE_DEBOUNCE_MS = 160;

/**
 * Starts the neural field on a canvas. Returns a teardown function.
 *
 * Everything that can idle, does: the loop stops when the canvas scrolls out
 * of view or the tab is hidden, which matters most on the phones this site
 * expects most of its traffic from.
 */
export function mountNeuralField(canvas: HTMLCanvasElement, options: MountOptions = {}) {
  const surface = options.surface ?? canvas;
  const seed = options.seed ?? 20260912;

  let width = Math.max(1, surface.clientWidth);
  let height = Math.max(1, surface.clientHeight);

  let field = new NeuralField(width, height, configFor(width), seed);
  const renderer = new NeuralRenderer(canvas);
  const quality = new QualityController({
    scales: [1, 0.8, 0.62],
    slowMs: 20,
    fastMs: 12,
    window: 45,
  });

  const hud = options.hud ? createHud(surface) : null;
  let hudDue = 0;
  let frameHandle = 0;
  let lastFrame = 0;
  let running = false;
  let onScreen = true;
  let resizeTimer = 0;

  const pixelRatio = () => Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO) * quality.scale;

  function applySize() {
    renderer.resize(width, height, pixelRatio());
    renderer.prepare(field);
  }

  function frame(now: number) {
    frameHandle = requestAnimationFrame(frame);
    const elapsedMs = now - lastFrame;
    lastFrame = now;

    const dt = Math.min(elapsedMs / 1000, MAX_FRAME_SECONDS);
    field.step(dt);
    renderer.draw(field, true);

    if (quality.sample(elapsedMs)) applySize();

    if (hud && now >= hudDue) {
      hudDue = now + 250;
      hud.textContent =
        `${(1000 / Math.max(elapsedMs, 0.001)).toFixed(0)} fps · ` +
        `${elapsedMs.toFixed(1)} ms · ` +
        `${field.graph.count} neurons · ${field.graph.edgeCount} dendrites · ` +
        `${field.pulses.activeCount} signals · ${(quality.scale * 100).toFixed(0)}%`;
    }
  }

  function start() {
    if (running || !onScreen || document.hidden) return;
    running = true;
    lastFrame = performance.now();
    frameHandle = requestAnimationFrame(frame);
  }

  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(frameHandle);
  }

  function resize() {
    const nextWidth = Math.max(1, surface.clientWidth);
    const nextHeight = Math.max(1, surface.clientHeight);
    if (nextWidth === width && nextHeight === height) return;
    width = nextWidth;
    height = nextHeight;
    field = new NeuralField(width, height, configFor(width), seed);
    applySize();
    if (!running) renderer.draw(field, true);
  }

  function pointAt(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  // --- events ---------------------------------------------------------------

  const onPointerMove = (event: PointerEvent) => {
    const point = pointAt(event);
    field.focus.pointerMove(point.x, point.y);
  };

  const onPointerLeave = () => field.focus.pointerLeave();

  let pressX = 0;
  let pressY = 0;
  let pressAt = 0;

  const onPointerDown = (event: PointerEvent) => {
    pressX = event.clientX;
    pressY = event.clientY;
    pressAt = event.timeStamp;
  };

  const onPointerUp = (event: PointerEvent) => {
    if (event.target instanceof Element && event.target.closest(INTERACTIVE)) return;
    // Scrolling a phone with a finger must not fire the network.
    const travelled = Math.hypot(event.clientX - pressX, event.clientY - pressY);
    if (travelled > TAP_SLOP || event.timeStamp - pressAt > TAP_TIMEOUT) return;
    const point = pointAt(event);
    field.focus.pointerMove(point.x, point.y);
    field.strikeAt(point.x, point.y);
  };

  const onVisibility = () => (document.hidden ? stop() : start());

  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, RESIZE_DEBOUNCE_MS);
  };

  const visibility = new IntersectionObserver(
    (entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting);
      if (onScreen) start();
      else stop();
    },
    { threshold: 0 },
  );

  surface.addEventListener('pointermove', onPointerMove, { passive: true });
  surface.addEventListener('pointerleave', onPointerLeave, { passive: true });
  surface.addEventListener('pointerdown', onPointerDown, { passive: true });
  surface.addEventListener('pointerup', onPointerUp, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });
  visibility.observe(canvas);

  applySize();
  start();

  return function unmount() {
    stop();
    window.clearTimeout(resizeTimer);
    visibility.disconnect();
    surface.removeEventListener('pointermove', onPointerMove);
    surface.removeEventListener('pointerleave', onPointerLeave);
    surface.removeEventListener('pointerdown', onPointerDown);
    surface.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    hud?.remove();
  };
}

function createHud(surface: HTMLElement): HTMLElement {
  const hud = document.createElement('div');
  hud.className = 'neural-hud';
  surface.appendChild(hud);
  return hud;
}
