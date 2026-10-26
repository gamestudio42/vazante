import { describe, expect, it } from 'vitest';
import { Fnv1a, Rng } from '../src/index.ts';

describe('Rng', () => {
  it('is deterministic for a seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 1000; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('differs across seeds', () => {
    expect(new Rng(1).nextU32()).not.toBe(new Rng(2).nextU32());
  });

  it('stays in range and is roughly uniform', () => {
    const r = new Rng(7);
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 100_000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      buckets[Math.floor(v * 10)]++;
    }
    for (const b of buckets) expect(Math.abs(b - 10_000)).toBeLessThan(500);
  });

  it('restores state', () => {
    const r = new Rng(9);
    r.nextU32();
    const s = r.getState();
    const x = r.nextU32();
    r.setState(s);
    expect(r.nextU32()).toBe(x);
  });
});

describe('Fnv1a', () => {
  it('matches the reference vectors for ASCII bytes', () => {
    const h = (s: string) => {
      const f = new Fnv1a();
      for (const c of s) f.byte(c.charCodeAt(0));
      return f.digest();
    };
    expect(h('')).toBe(0x811c9dc5);
    expect(h('a')).toBe(0xe40c292c);
    expect(h('foobar')).toBe(0xbf9cf968);
  });
});
