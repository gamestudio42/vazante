import { CELL_SIZE, DIFFICULTY, SLICE, type DifficultyId, ZOMBIE_POOL_CAPACITY, ZombieState } from '@vazante/shared';
import { Grid } from '../grid.ts';
import { generateCityMap, generateSliceMap } from '../mapgen.ts';
import { rollZombieKind, spawnSquad } from '../spawn.ts';
import { spawnTruck } from '../systems/logistics.ts';
import { startSliceMission } from '../systems/mission.ts';
import { World } from '../world.ts';

export type ScenarioId = 'last_convoy' | 'open_field' | 'city_war';

export const SCENARIO_IDS: readonly ScenarioId[] = ['last_convoy', 'open_field', 'city_war'];

export interface ScenarioOptions {
  zombies?: number;
  difficulty?: DifficultyId;
}

/** "O Último Comboio": two squads at the base, the horde spread over the city. */
export function lastConvoy(seed: number, opts: ScenarioOptions = {}): World {
  const map = generateSliceMap(seed);
  const w = new World(seed, map.grid, map.buildings, map.districts, map.sites, ZOMBIE_POOL_CAPACITY);
  w.difficulty = opts.difficulty ?? 'veteran';
  const diff = DIFFICULTY[w.difficulty];
  const base = map.sites.find((s) => s.kind === 'base')!;
  const bx = ((base.x0 + base.x1 + 1) / 2) * CELL_SIZE;
  const by = ((base.y0 + base.y1 + 1) / 2) * CELL_SIZE;
  spawnSquad(w, 'slice', 'Alfa', bx - 10, by);
  spawnSquad(w, 'slice', 'Bravo', bx + 10, by);

  // The post is running out of ammunition; a loaded truck waits at the depot across the city.
  const home = w.bases.find((b) => b.kind === 'base')!;
  home.materials = SLICE.baseMaterials + diff.baseMaterials;
  home.ammo = SLICE.baseAmmo + diff.baseAmmo;
  const depot = map.sites.find((s) => s.kind === 'depot')!;
  const tx = ((depot.x0 + depot.x1 + 1) / 2) * CELL_SIZE;
  const ty = ((depot.y0 + depot.y1 + 1) / 2) * CELL_SIZE;
  const truck = spawnTruck(w, tx, ty, SLICE.truckAmmo, SLICE.truckMaterials);

  const count = opts.zombies ?? Math.round(200 * diff.cityZombies);
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

/**
 * Porto Velário sandbox (v0.5, in progress): the 2 km city, four squads at the waterfront base, a
 * truck at each depot and the horde spread over the city. No objectives yet.
 */
export function cityWar(seed: number, opts: ScenarioOptions = {}): World {
  const map = generateCityMap(seed);
  const w = new World(seed, map.grid, map.buildings, map.districts, map.sites, ZOMBIE_POOL_CAPACITY);
  w.difficulty = opts.difficulty ?? 'veteran';
  const diff = DIFFICULTY[w.difficulty];
  const home = w.bases.find((b) => b.kind === 'base')!;
  const bx = ((home.x0 + home.x1 + 1) / 2) * CELL_SIZE;
  const by = ((home.y0 + home.y1 + 1) / 2) * CELL_SIZE;
  ['Alfa', 'Bravo', 'Charlie', 'Delta'].forEach((name, i) => spawnSquad(w, 'slice', name, bx - 24 + i * 16, by));
  home.materials = SLICE.baseMaterials * 2 + diff.baseMaterials;
  home.ammo = SLICE.baseAmmo * 2 + diff.baseAmmo;
  for (const d of w.bases) {
    if (d.kind !== 'depot') continue;
    spawnTruck(w, ((d.x0 + d.x1 + 1) / 2) * CELL_SIZE, ((d.y0 + d.y1 + 1) / 2) * CELL_SIZE, SLICE.truckAmmo, SLICE.truckMaterials);
  }
  const count = opts.zombies ?? Math.round(6000 * diff.cityZombies);
  const minDist2 = 250 * 250;
  let placed = 0;
  for (let attempts = 0; placed < count && attempts < count * 50; attempts++) {
    const x = w.rng.range(0, w.grid.widthM);
    const y = w.rng.range(0, w.grid.heightM);
    if (!w.grid.isWalkableAt(x, y)) continue;
    if ((x - bx) * (x - bx) + (y - by) * (y - by) < minDist2) continue;
    if (w.zombies.spawn(x, y, rollZombieKind(w), ZombieState.Wandering) >= 0) placed++;
  }
  return w;
}

/** Empty walkable field, for tests and benchmarks. */
export function openField(seed: number, cells = 64): World {
  const grid = new Grid(cells, cells);
  grid.district.fill(1);
  return new World(seed, grid, [], [{ id: 1, name: 'Campo', x0: 0, y0: 0, x1: cells - 1, y1: cells - 1 }], [], ZOMBIE_POOL_CAPACITY);
}

export function createScenario(id: ScenarioId, seed: number, opts?: ScenarioOptions): World {
  if (id === 'open_field') return openField(seed);
  if (id === 'city_war') return cityWar(seed, opts);
  return lastConvoy(seed, opts);
}
