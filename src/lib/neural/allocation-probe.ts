/**
 * Test support for the "allocates nothing per frame" guarantee.
 *
 * The frame loop must not create garbage: collection pauses read as stutter,
 * and this effect runs continuously behind the hero.
 *
 * Comparing heap size before and after a loop does not measure this. Transient
 * garbage is scavenged as it goes, so the two readings match whether the loop
 * allocated nothing or megabytes — verified by deliberately allocating in a
 * hot path and watching that check still pass.
 *
 * What garbage does leave is a sawtooth: the heap climbs between collections
 * and drops at each one. Sampling during the loop and recording the largest
 * climb above the running minimum measures the transient allocation directly.
 * A non-allocating loop stays within ~100KB; allocating a single small object
 * per iteration produces ~8MB.
 */

/**
 * Largest heap climb a genuinely allocation-free loop should show, in KB.
 *
 * Set well above the noise seen in practice rather than just above it. At 1500
 * the grid probe failed roughly one run in seven: its loop body is so cheap
 * that the run is over in few collection cycles, and the sawtooth it samples is
 * correspondingly ragged. The headroom costs nothing in sensitivity — a single
 * small object per iteration produces megabytes, so the gap to a real
 * regression is still wide.
 */
export const ALLOCATION_FREE_KB = 3000;

/**
 * Runs `body` `iterations` times and returns the largest rise in heap usage
 * above its running minimum, in kilobytes.
 */
export function peakHeapRiseKb(iterations: number, body: (i: number) => void): number {
  for (let i = 0; i < 5000; i++) body(i); // warm up the JIT before sampling
  const sampleEvery = Math.max(1, Math.floor(iterations / 400));
  let min = Number.POSITIVE_INFINITY;
  let peak = 0;

  for (let i = 0; i < iterations; i++) {
    body(i);
    if (i % sampleEvery !== 0) continue;
    const used = process.memoryUsage().heapUsed;
    if (used < min) min = used;
    if (used - min > peak) peak = used - min;
  }
  return peak / 1024;
}
