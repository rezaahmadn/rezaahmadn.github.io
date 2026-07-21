import { describe, it, expect } from 'vitest';
import { makeRng } from '../src/util/rng';

describe('mulberry32 rng determinism (PRD §5.3)', () => {
  it('produces the same sequence for the same seed', () => {
    const a = makeRng(123456789);
    const b = makeRng(123456789);
    const seqA = Array.from({ length: 64 }, () => a());
    const seqB = Array.from({ length: 64 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = makeRng(1);
    const b = makeRng(2);
    const seqA = Array.from({ length: 32 }, () => a());
    const seqB = Array.from({ length: 32 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('returns floats in [0, 1)', () => {
    const r = makeRng(42);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
