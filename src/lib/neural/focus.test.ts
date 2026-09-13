import { describe, expect, test } from 'vitest';
import { Focus } from './focus';

const options = { wanderSpeed: 90, handoffSeconds: 2 };

function run(focus: Focus, seconds: number, dt = 1 / 60) {
  for (let elapsed = 0; elapsed < seconds; elapsed += dt) focus.step(dt);
}

describe('Focus wandering', () => {
  test('drifts on its own so the field is alive before anyone interacts', () => {
    const focus = new Focus(1200, 800, 1, options);
    const startX = focus.x;
    const startY = focus.y;
    run(focus, 1);
    expect(Math.hypot(focus.x - startX, focus.y - startY)).toBeGreaterThan(10);
  });

  test('stays inside the field', () => {
    const focus = new Focus(1200, 800, 1, options);
    for (let i = 0; i < 3000; i++) {
      focus.step(1 / 60);
      expect(focus.x).toBeGreaterThanOrEqual(0);
      expect(focus.x).toBeLessThanOrEqual(1200);
      expect(focus.y).toBeGreaterThanOrEqual(0);
      expect(focus.y).toBeLessThanOrEqual(800);
    }
  });

  test('moves smoothly rather than teleporting', () => {
    const focus = new Focus(1200, 800, 1, options);
    let previousX = focus.x;
    let previousY = focus.y;
    for (let i = 0; i < 1200; i++) {
      focus.step(1 / 60);
      // At 90px/s a frame step cannot exceed ~1.5px; allow generous headroom.
      expect(Math.hypot(focus.x - previousX, focus.y - previousY)).toBeLessThan(6);
      previousX = focus.x;
      previousY = focus.y;
    }
  });

  test('takes a different path for a different seed', () => {
    const a = new Focus(1200, 800, 1, options);
    const b = new Focus(1200, 800, 2, options);
    run(a, 2);
    run(b, 2);
    expect([a.x, a.y]).not.toEqual([b.x, b.y]);
  });

  test('keeps wandering after reaching a target', () => {
    const focus = new Focus(400, 400, 1, options);
    run(focus, 20);
    const x = focus.x;
    run(focus, 1);
    expect(Math.hypot(focus.x - x, focus.y - focus.y)).toBeGreaterThan(0);
  });
});

describe('Focus pointer handover', () => {
  test('snaps to the pointer when the visitor moves it', () => {
    const focus = new Focus(1200, 800, 1, options);
    focus.pointerMove(300, 400);
    focus.step(1 / 60);
    expect(focus.x).toBeCloseTo(300, 0);
    expect(focus.y).toBeCloseTo(400, 0);
  });

  test('stays put while the pointer is still', () => {
    const focus = new Focus(1200, 800, 1, options);
    focus.pointerMove(300, 400);
    run(focus, 1.5);
    expect(focus.x).toBeCloseTo(300, 0);
    expect(focus.y).toBeCloseTo(400, 0);
  });

  test('resumes wandering once the pointer has been idle', () => {
    const focus = new Focus(1200, 800, 1, options);
    focus.pointerMove(300, 400);
    run(focus, 6);
    expect(Math.hypot(focus.x - 300, focus.y - 400)).toBeGreaterThan(20);
  });

  test('eases back to wandering instead of jumping', () => {
    const focus = new Focus(1200, 800, 1, options);
    focus.pointerMove(300, 400);
    run(focus, 2.1); // just past the handoff threshold
    let previousX = focus.x;
    let previousY = focus.y;
    for (let i = 0; i < 200; i++) {
      focus.step(1 / 60);
      expect(Math.hypot(focus.x - previousX, focus.y - previousY)).toBeLessThan(6);
      previousX = focus.x;
      previousY = focus.y;
    }
  });

  test('hands control straight back when the pointer returns', () => {
    const focus = new Focus(1200, 800, 1, options);
    run(focus, 5);
    focus.pointerMove(800, 200);
    focus.step(1 / 60);
    expect(focus.x).toBeCloseTo(800, 0);
    expect(focus.y).toBeCloseTo(200, 0);
  });
});

describe('Focus resize', () => {
  test('keeps the focus inside a field that shrank', () => {
    const focus = new Focus(1200, 800, 1, options);
    focus.pointerMove(1100, 700);
    focus.step(1 / 60);
    focus.resize(390, 844);
    expect(focus.x).toBeLessThanOrEqual(390);
    expect(focus.y).toBeLessThanOrEqual(844);
  });

  test('wanders within the new bounds after a resize', () => {
    const focus = new Focus(1200, 800, 1, options);
    focus.resize(390, 844);
    for (let i = 0; i < 2000; i++) {
      focus.step(1 / 60);
      expect(focus.x).toBeLessThanOrEqual(390);
      expect(focus.y).toBeLessThanOrEqual(844);
    }
  });
});
