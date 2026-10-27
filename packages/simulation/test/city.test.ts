import { describe, expect, it } from 'vitest';
import { Ground, STRUCTURE_FLOW_PENALTY } from '@vazante/shared';
import { FlowJob, SimulationEngine, computeFlowField, generateCityMap, type Grid } from '../src/index.ts';

function reachable(grid: Grid, start: number): Uint8Array {
  const seen = new Uint8Array(grid.size);
  const stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const c = stack.pop()!;
    const x = c % grid.width;
    const y = (c - x) / grid.width;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!grid.inBounds(x + dx, y + dy)) continue;
      const n = grid.idx(x + dx, y + dy);
      if (!seen[n] && grid.isWalkable(n)) {
        seen[n] = 1;
        stack.push(n);
      }
    }
  }
  return seen;
}

describe('Porto Velário', () => {
  it('is a 2 km city with a bay, a river, six districts, a base and three depots', () => {
    const m = generateCityMap(3);
    expect(m.grid.width).toBe(512);
    expect(m.districts).toHaveLength(6);
    expect(m.sites.filter((s) => s.kind === 'depot')).toHaveLength(3);
    let water = 0;
    for (let c = 0; c < m.grid.size; c++) if (m.grid.ground[c] === Ground.Water) water++;
    expect(water / m.grid.size).toBeGreaterThan(0.06);
    expect(m.buildings.length).toBeGreaterThan(2000);
  });

  it('every street cell and every depot is reachable from the base, across the river', () => {
    for (const seed of [1, 2, 3]) {
      const { grid, sites } = generateCityMap(seed);
      const base = sites.find((s) => s.kind === 'base')!;
      const seen = reachable(grid, grid.idx(base.x0 + 2, base.y0 + 2));
      for (let c = 0; c < grid.size; c++) if (grid.ground[c] === Ground.Street) expect(seen[c], `seed ${seed} cell ${c}`).toBe(1);
      for (const s of sites) expect(seen[grid.idx(s.x0 + 2, s.y0 + 2)]).toBe(1);
    }
  });

  it('the flow field computed in slices equals the one computed at once', () => {
    const { grid, sites } = generateCityMap(2);
    const sources = sites.map((s) => grid.idx(s.x0 + 3, s.y0 + 3));
    computeFlowField(grid, sources, STRUCTURE_FLOW_PENALTY);
    const whole = grid.flow.slice();
    grid.flow.fill(0);
    const job = new FlowJob();
    job.begin(grid, sources, STRUCTURE_FLOW_PENALTY);
    let slices = 1;
    while (!job.run(grid, 5000)) slices++;
    expect(slices).toBeGreaterThan(10);
    expect(grid.flow).toEqual(whole);
  });

  it('a save taken while the flow rebuild is half done loads and runs on identically', () => {
    const a = SimulationEngine.create(4, 'city_war', { zombies: 1500 });
    a.runTicks(7);
    expect(a.world.flowJob.active).toBe(true);
    const b = SimulationEngine.load(a.save());
    a.runTicks(40);
    b.runTicks(40);
    expect(b.hashState()).toBe(a.hashState());
  });

  it('the slice map still finishes its flow rebuild in the tick it starts', () => {
    const e = SimulationEngine.create(1);
    for (let t = 0; t < 30; t++) {
      e.tick();
      expect(e.world.flowJob.active).toBe(false);
    }
  });
});
