import { describe, expect, it } from 'vitest';
import { Ground } from '@vazante/shared';
import { Fnv1a } from '@vazante/kernel';
import { generateSliceMap } from '../src/index.ts';

function mapHash(seed: number): number {
  const m = generateSliceMap(seed);
  return new Fnv1a().bytes(m.grid.ground).bytes(m.grid.heights).digest();
}

describe('slice map', () => {
  it('is deterministic per seed', () => {
    expect(mapHash(11)).toBe(mapHash(11));
    expect(mapHash(11)).not.toBe(mapHash(12));
  });

  it('every street cell is reachable from the base', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { grid, sites } = generateSliceMap(seed);
      const base = sites.find((s) => s.kind === 'base')!;
      const start = grid.idx(base.x0 + 2, base.y0 + 2);
      expect(grid.isWalkable(start)).toBe(true);
      const seen = new Uint8Array(grid.size);
      const stack = [start];
      seen[start] = 1;
      while (stack.length) {
        const c = stack.pop()!;
        const x = c % grid.width;
        const y = (c - x) / grid.width;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (!grid.inBounds(nx, ny)) continue;
          const n = grid.idx(nx, ny);
          if (!seen[n] && grid.isWalkable(n)) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
      let streets = 0;
      for (let i = 0; i < grid.size; i++) {
        if (grid.ground[i] === Ground.Street) {
          streets++;
          expect(seen[i]).toBe(1);
        }
      }
      expect(streets).toBeGreaterThan(1000);
    }
  });

  it('has buildings, four districts, a base and a depot', () => {
    const m = generateSliceMap(1);
    expect(m.buildings.length).toBeGreaterThan(50);
    expect(m.districts).toHaveLength(4);
    expect(m.sites.map((s) => s.kind).sort()).toEqual(['base', 'depot']);
  });
});
