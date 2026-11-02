/**
 * A seeded PRNG: the same seed always yields the same sequence, so a compiled timeline is the
 * same on the server, on the first client render and in tests. FNV-1a hashes the seed string and
 * mulberry32 generates from it. Not for anything that needs real randomness.
 */
export function seededRandom(seed: string): () => number {
  let state = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    state ^= seed.charCodeAt(i);
    state = Math.imul(state, 0x01000193);
  }
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
