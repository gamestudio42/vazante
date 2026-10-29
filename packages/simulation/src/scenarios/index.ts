import { CELL_SIZE, DIFFICULTY, MISSIONS, MISSION_IDS, SLICE, type DifficultyId, type MissionId, ZOMBIE_POOL_CAPACITY, ZombieState } from '@vazante/shared';
import { Grid } from '../grid.ts';
import { generateCityMap, generateSliceMap } from '../mapgen.ts';
import { rollZombieKind, spawnSquad } from '../spawn.ts';
import { spawnTruck } from '../systems/logistics.ts';
import { startMission } from '../systems/mission.ts';
import { World } from '../world.ts';

/** Campaign missions, the Porto Velário sandbox, and an empty field for tests. */
export type ScenarioId = MissionId | 'open_field' | 'city_war';

export const SCENARIO_IDS: readonly ScenarioId[] = [...MISSION_IDS, 'open_field', 'city_war'];

export interface ScenarioOptions {
  zombies?: number;
  difficulty?: DifficultyId;
}

/** Scatter wandering zombies over walkable cells, keeping `clearM` metres around (bx, by) empty. */
function scatterHorde(w: World, count: number, bx: number, by: number, clearM: number): void {
  const minDist2 = clearM * clearM;
  let placed = 0;
  for (let attempts = 0; placed < count && attempts < count * 50; attempts++) {
    const x = w.rng.range(0, w.grid.widthM);
    const y = w.rng.range(0, w.grid.heightM);
    if (!w.grid.isWalkableAt(x, y)) continue;
    if ((x - bx) * (x - bx) + (y - by) * (y - by) < minDist2) continue;
    if (w.zombies.spawn(x, y, rollZombieKind(w), ZombieState.Wandering) >= 0) placed++;
  }
}

/**
 * Build a campaign mission: its map, squads in a row at the base (spaced 20 m on the slice map,
 * 16 m in the city), trucks at their sites, the base stock and the horde, then the objectives.
 */
export function buildMission(id: MissionId, seed: number, opts: ScenarioOptions = {}): World {
  const def = MISSIONS[id];
  const map = def.map === 'city' ? generateCityMap(seed) : generateSliceMap(seed);
  const w = new World(seed, map.grid, map.buildings, map.districts, map.sites, ZOMBIE_POOL_CAPACITY);
  w.difficulty = opts.difficulty ?? 'veteran';
  w.zombieKinds = def.zombieKinds;
  w.fog = true;
  const diff = DIFFICULTY[w.difficulty];
  const home = w.bases.find((b) => b.kind === 'base')!;
  const bx = ((home.x0 + home.x1 + 1) / 2) * CELL_SIZE;
  const by = ((home.y0 + home.y1 + 1) / 2) * CELL_SIZE;
  const gap = def.map === 'city' ? 16 : 20;
  const n = def.squads.length;
  def.squads.forEach((q, i) => spawnSquad(w, q.kind, q.name, bx + (i - (n - 1) / 2) * gap, by));

  home.materials = def.materials + diff.baseMaterials;
  home.ammo = def.ammo + diff.baseAmmo;
  const trucks = def.trucks.map((t) => {
    const site = t.at === 'base' ? home : t.at === 'depot' ? w.bases.find((b) => b.kind === 'depot')! : w.bases.find((b) => b.name === t.at)!;
    // Parked off-centre so it does not sit on the command post.
    const off = site === home ? 3 * CELL_SIZE : 0;
    return spawnTruck(w, ((site.x0 + site.x1 + 1) / 2) * CELL_SIZE + off, ((site.y0 + site.y1 + 1) / 2) * CELL_SIZE + off, t.ammo, t.materials).id;
  });
  scatterHorde(w, opts.zombies ?? Math.round(def.zombies * diff.cityZombies), bx, by, def.clearRadiusM);
  startMission(w, def, trucks);
  return w;
}

/**
 * Porto Velário sandbox: the 2 km city, four squads at the waterfront base, a truck at each depot
 * and the horde spread over the city. No objectives.
 */
export function cityWar(seed: number, opts: ScenarioOptions = {}): World {
  const map = generateCityMap(seed);
  const w = new World(seed, map.grid, map.buildings, map.districts, map.sites, ZOMBIE_POOL_CAPACITY);
  w.difficulty = opts.difficulty ?? 'veteran';
  w.fog = true;
  const diff = DIFFICULTY[w.difficulty];
  const home = w.bases.find((b) => b.kind === 'base')!;
  const bx = ((home.x0 + home.x1 + 1) / 2) * CELL_SIZE;
  const by = ((home.y0 + home.y1 + 1) / 2) * CELL_SIZE;
  const kinds = ['slice', 'marines', 'engineers', 'police'] as const;
  ['Alfa', 'Bravo', 'Charlie', 'Delta'].forEach((name, i) => spawnSquad(w, kinds[i], name, bx - 24 + i * 16, by));
  home.materials = SLICE.baseMaterials * 2 + diff.baseMaterials;
  home.ammo = SLICE.baseAmmo * 2 + diff.baseAmmo;
  for (const d of w.bases) {
    if (d.kind !== 'depot') continue;
    spawnTruck(w, ((d.x0 + d.x1 + 1) / 2) * CELL_SIZE, ((d.y0 + d.y1 + 1) / 2) * CELL_SIZE, SLICE.truckAmmo, SLICE.truckMaterials);
  }
  scatterHorde(w, opts.zombies ?? Math.round(6000 * diff.cityZombies), bx, by, 250);
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
  return buildMission(id, seed, opts);
}
