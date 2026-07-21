/**
 * rng.ts — mulberry32 PRNG + seed resolution (PRD §5.3).
 * Same seed ⇒ identical stream ⇒ identical world.
 */

/** Deterministic 32-bit PRNG returning floats in [0, 1). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Reads the seed from `?seed=` in the URL, else derives a random int.
 * Math.random is allowed here (app code, not the deterministic stream).
 */
export function readSeed(): number {
  try {
    const raw = new URLSearchParams(window.location.search).get('seed');
    if (raw !== null && raw.trim() !== '') {
      const n = Number(raw);
      if (Number.isFinite(n)) return Math.floor(Math.abs(n)) >>> 0;
    }
  } catch {
    // no window / bad URL — fall through to random
  }
  return Math.floor(Math.random() * 1e9);
}

/** Convenience: resolve a seed and its bound rng together. */
export function initRng(): { seed: number; rng: () => number } {
  const seed = readSeed();
  return { seed, rng: makeRng(seed) };
}
