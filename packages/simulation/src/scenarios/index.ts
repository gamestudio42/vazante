import { CELL_SIZE, SLICE, ZOMBIE_POOL_CAPACITY, ZombieState } from '@vazante/shared';
import { Grid } from '../grid.ts';
import { generateSliceMap } from '../mapgen.ts';
import { rollZombieKind, spawnSquad } from '../spawn.ts';
import { spawnTruck } from '../systems/logistics.ts';
import { startSliceMission } from '../systems/mission.ts';
import { World } from '../world.ts';

export type ScenarioId = 'last_convoy' | 'open_field';

export interface ScenarioOptions {
  zombies?: number;
}

/** "O Último Comboio": two squads at the base, the horde spread over the city. */
export function lastConvoy(seed: number, opts: ScenarioOptions = {}): World {
  const map = generateSliceMap(seed);
  const w = new World(seed, map.grid, map.buildings, map.districts, map.sites, ZOMBIE_POOL_CAPACITY);
  const base = map.sites.find((s) => s.kind === 'base')!;
  const bx = ((base.x0 + base.x1 + 1) / 2) * CELL_SIZE;
  const by = ((base.y0 + base.y1 + 1) / 2) * CELL_SIZE;
  spawnSquad(w, 'slice', 'Alfa', bx - 10, by);
  spawnSquad(w, 'slice', 'Bravo', bx + 10, by);

  // The post is running out of ammunition; a loaded truck waits at the depot across the city.
  const home = w.bases.find((b) => b.kind === 'base')!;
  home.materials = SLICE.baseMaterials;
  home.ammo = SLICE.baseAmmo;
  const depot = map.sites.find((s) => s.kind === 'depot')!;
  const tx = ((depot.x0 + depot.x1 + 1) / 2) * CELL_SIZE;
  const ty = ((depot.y0 + depot.y1 + 1) / 2) * CELL_SIZE;
  const truck = spawnTruck(w, tx, ty, SLICE.truckAmmo, SLICE.truckMaterials);

  const count = opts.zombies ?? 200;
  const minDist2 = 150 * 150;
  let placed = 0;
  for (let attempts = 0; placed < count && attempts < count * 50; attempts++) {
    const x = w.rng.range(0, w.grid.widthM);
    const y = w.rng.range(0, w.grid.heightM);
    if (!w.grid.isWalkableAt(x, y)) continue;
    if ((x - bx) * (x - bx) + (y - by) * (y - by) < minDist2) continue;
    if (w.zombies.spawn(x, y, rollZombieKind(w), ZombieState.Wandering) >= 0) placed++;
  }
  startSliceMission(w, home.id, truck.id);
  return w;
}

/** Empty walkable field, for tests and benchmarks. */
export function openField(seed: number, cells = 64): World {
  const grid = new Grid(cells, cells);
  grid.district.fill(1);
  return new World(seed, grid, [], [{ id: 1, name: 'Campo', x0: 0, y0: 0, x1: cells - 1, y1: cells - 1 }], [], ZOMBIE_POOL_CAPACITY);
}

export function createScenario(id: ScenarioId, seed: number, opts?: ScenarioOptions): World {
  return id === 'open_field' ? openField(seed) : lastConvoy(seed, opts);
}
