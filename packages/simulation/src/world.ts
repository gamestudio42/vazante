import { Rng } from '@vazante/kernel';
import { CELL_SIZE, SoldierCondition, type BuildingRect, type DistrictInfo, type SimEvent, type SimSpeed, type SiteInfo } from '@vazante/shared';
import type { Soldier, Squad } from './entities.ts';
import type { Grid } from './grid.ts';
import { ZombiePool } from './zombies.ts';

export interface WorldStats {
  zombiesKilled: number;
  shotsFired: number;
}

/** The single authoritative world state. Everything here is simulation state except `events`. */
export class World {
  tick = 0;
  speed: SimSpeed = 1;
  readonly seed: number;
  readonly rng: Rng;
  readonly grid: Grid;
  readonly buildings: BuildingRect[];
  readonly districts: DistrictInfo[];
  readonly sites: SiteInfo[];
  readonly zombies: ZombiePool;
  readonly soldiers: Soldier[] = [];
  readonly squads: Squad[] = [];
  readonly stats: WorldStats = { zombiesKilled: 0, shotsFired: 0 };
  directSoldier: number | null = null;
  nextId = 1;

  /** Spatial hash of zombies by cell, rebuilt each tick (derived, not hashed). */
  readonly cellHead: Int32Array;
  readonly cellNext: Int32Array;
  /** Zombies per cell, rebuilt with the hash and kept current while the horde moves. */
  readonly cellCount: Uint16Array;

  /** Events produced since the last frame (presentation only, not part of the hashed state). */
  events: SimEvent[] = [];

  private readonly soldierIndex = new Map<number, Soldier>();
  private readonly squadIndex = new Map<number, Squad>();

  constructor(seed: number, grid: Grid, buildings: BuildingRect[], districts: DistrictInfo[], sites: SiteInfo[], zombieCapacity: number) {
    this.seed = seed;
    this.rng = new Rng(seed);
    this.grid = grid;
    this.buildings = buildings;
    this.districts = districts;
    this.sites = sites;
    this.zombies = new ZombiePool(zombieCapacity);
    this.cellHead = new Int32Array(grid.size).fill(-1);
    this.cellNext = new Int32Array(zombieCapacity).fill(-1);
    this.cellCount = new Uint16Array(grid.size);
  }

  allocId(): number {
    return this.nextId++;
  }

  addSoldier(s: Soldier): void {
    this.soldiers.push(s);
    this.soldierIndex.set(s.id, s);
  }

  addSquad(q: Squad): void {
    this.squads.push(q);
    this.squadIndex.set(q.id, q);
  }

  soldier(id: number): Soldier | undefined {
    return this.soldierIndex.get(id);
  }

  squad(id: number): Squad | undefined {
    return this.squadIndex.get(id);
  }

  emit(e: Omit<SimEvent, 'tick'>): void {
    this.events.push({ tick: this.tick, ...e });
  }

  rebuildZombieHash(): void {
    const { cellHead, cellNext, cellCount, zombies, grid } = this;
    cellHead.fill(-1);
    cellCount.fill(0);
    for (let s = 0; s < zombies.highWater; s++) {
      if (!zombies.isAlive(s)) continue;
      const c = grid.cellAt(zombies.x[s], zombies.y[s]);
      if (c < 0) continue;
      cellNext[s] = cellHead[c];
      cellHead[c] = s;
      cellCount[c]++;
    }
  }

  /**
   * Visit zombies within `radius` metres of a point via the spatial hash.
   * The callback returns true to stop early. Order: rows top to bottom, cells left to right, hash chain order.
   */
  forZombiesNear(x: number, y: number, radius: number, fn: (slot: number, d2: number) => boolean | void): void {
    const { grid, cellHead, cellNext, zombies } = this;
    const r = Math.ceil(radius / CELL_SIZE);
    const cx = Math.floor(x / CELL_SIZE);
    const cy = Math.floor(y / CELL_SIZE);
    const r2 = radius * radius;
    const x0 = Math.max(0, cx - r);
    const x1 = Math.min(grid.width - 1, cx + r);
    const y0 = Math.max(0, cy - r);
    const y1 = Math.min(grid.height - 1, cy + r);
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) {
        for (let s = cellHead[yy * grid.width + xx]; s !== -1; s = cellNext[s]) {
          const dx = zombies.x[s] - x;
          const dy = zombies.y[s] - y;
          const d2 = dx * dx + dy * dy;
          if (d2 <= r2 && fn(s, d2) === true) return;
        }
      }
    }
  }
}

export function isActiveSoldier(s: Soldier): boolean {
  return s.condition === SoldierCondition.Ok || s.condition === SoldierCondition.Bitten;
}
