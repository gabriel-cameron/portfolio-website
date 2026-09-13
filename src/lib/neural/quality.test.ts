import { describe, expect, test } from 'vitest';
import { QualityController } from './quality';

const options = { scales: [1, 0.8, 0.62], slowMs: 20, fastMs: 12, window: 30 };

function feed(quality: QualityController, frameMs: number, frames: number) {
  for (let i = 0; i < frames; i++) quality.sample(frameMs);
}

describe('QualityController', () => {
  test('starts at full quality', () => {
    expect(new QualityController(options).scale).toBe(1);
  });

  test('drops quality when frames are consistently slow', () => {
    const quality = new QualityController(options);
    feed(quality, 30, options.window + 1);
    expect(quality.scale).toBe(0.8);
  });

  test('ignores an isolated slow frame', () => {
    const quality = new QualityController(options);
    feed(quality, 8, 20);
    quality.sample(200); // a GC pause or a background tab stalling
    feed(quality, 8, 20);
    expect(quality.scale).toBe(1);
  });

  test('keeps dropping if it is still too slow', () => {
    const quality = new QualityController(options);
    feed(quality, 40, (options.window + 1) * 2);
    expect(quality.scale).toBe(0.62);
  });

  test('never drops below the lowest scale', () => {
    const quality = new QualityController(options);
    feed(quality, 100, options.window * 10);
    expect(quality.scale).toBe(0.62);
  });

  test('recovers when the machine has headroom again', () => {
    const quality = new QualityController(options);
    feed(quality, 30, options.window + 1);
    expect(quality.scale).toBe(0.8);
    feed(quality, 5, options.window * 4 + 1);
    expect(quality.scale).toBe(1);
  });

  test('never rises above full quality', () => {
    const quality = new QualityController(options);
    feed(quality, 1, options.window * 20);
    expect(quality.scale).toBe(1);
  });

  test('reports when the scale changed so the canvas can resize', () => {
    const quality = new QualityController(options);
    const changes = [];
    for (let i = 0; i < options.window + 1; i++) changes.push(quality.sample(30));
    expect(changes.filter(Boolean)).toHaveLength(1);
  });

  test('does not oscillate between two levels on borderline frames', () => {
    const quality = new QualityController(options);
    let changes = 0;
    // 16ms sits between the fast and slow thresholds: neither raise nor drop.
    for (let i = 0; i < 600; i++) if (quality.sample(16)) changes++;
    expect(changes).toBe(0);
  });
});
