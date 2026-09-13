/**
 * Deterministic PRNG (mulberry32).
 *
 * The field's layout is generated from a seed so that a given viewport always
 * produces the same neuron arrangement — a resize must not reshuffle the whole
 * network, and tests need reproducible geometry.
 */
export function createRng(seed: number): () => number {
  // State is kept signed and the result masked to 31 bits. Unsigned coercion
  // (`>>> 0`) yields values above the small-integer range, which V8 stores as
  // a boxed number — garbage on every call, in a function the frame loop uses.
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) & 0x7fffffff) / 0x80000000;
  };
}
