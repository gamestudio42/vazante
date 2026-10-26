import { Blocked } from '@vazante/shared';
import { Rng } from '@vazante/kernel';
import { describe, expect, it } from 'vitest';
import { computeFlowField, FLOW_UNREACHABLE, generateSliceMap, type Grid } from '../src/index.ts';
import { MinHeap } from '../src/heap.ts';
import { zombieCanStep, NEIGHBOURS } from '../src/navigation.ts';

/** The original heap Dijkstra, kept as the reference the fast field must match exactly. */
function referenceFlow(grid: Grid, sources: readonly number[], penalty: number): Uint16Array {
  const flow = new Uint16Array(grid.size).fill(FLOW_UNREACHABLE);
  const heap = new MinHeap();
  const w = grid.width;
  for (const s of sources) {
    if (s < 0 || flow[s] === 0) continue;
    flow[s] = 0;
    heap.push(0, s);
  }
  while (heap.size > 0) {
    const d = heap.topKey();
    const cur = heap.pop();
    if (d > flow[cur]) continue;
    const cx = cur % w;
    const cy = Math.floor(cur / w);
    for (const [dx, dy, cost] of NEIGHBOURS) {
      if (!zombieCanStep(grid, cx, cy, dx, dy)) continue;
      const n = cur + dy * w + dx;
      const nd = d + cost + grid.zombieCost(n, penalty);
      if (nd < flow[n] && nd < FLOW_UNREACHABLE) {
        flow[n] = nd;
        heap.push(nd, n);
      }
    }
  }
  return flow;
}

describe('flow field', () => {
  it('matches the reference Dijkstra exactly, with walls, gates and climbable piles', () => {
    for (const seed of [1, 2, 3]) {
      const { grid } = generateSliceMap(seed);
      const rng = new Rng(seed);
      for (let i = 0; i < 400; i++) {
        const c = rng.int(0, grid.size - 1);
        if (!grid.isWalkable(c)) continue;
        grid.blocked[c] |= i % 3 === 0 ? Blocked.GateClosed : Blocked.StructureWall;
        grid.structHeight[c] = 35;
        if (i % 5 === 0) grid.pile[c] = 20;
      }
      for (let i = 0; i < 30; i++) {
        const c = rng.int(0, grid.size - 1);
        if (grid.isWalkable(c)) grid.blocked[c] |= Blocked.Rubble;
      }
      for (const penalty of [0, 200]) {
        const sources = [rng.int(0, grid.size - 1), rng.int(0, grid.size - 1), rng.int(0, grid.size - 1)];
        computeFlowField(grid, sources, penalty);
        expect(Array.from(grid.flow)).toEqual(Array.from(referenceFlow(grid, sources, penalty)));
      }
    }
  });
});
