import { Rng } from '@vazante/kernel';
import { type DifficultyId, BASE_START, Blocked, CELL_SIZE, SoldierCondition, ZOMBIES, type BuildingRect, type DistrictInfo, type SimEvent, type SimSpeed, type SiteInfo } from '@vazante/shared';
import type { Base, Mission, Soldier, Squad, Structure, Vehicle } from './entities.ts';
import type { Grid } from './grid.ts';
import { FlowJob } from './navigation.ts';
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
  readonly structures: Structure[] = [];
  readonly bases: Base[] = [];
  readonly vehicles: Vehicle[] = [];
  /** Scenario objectives; null in sandbox scenarios. */
  mission: Mission | null = null;
  /** Control 0..100 per district (index = district id). */
  readonly districtControl: Uint8Array;
  /** Set when navigation changed (structure built, destroyed or toggled); forces a flow rebuild. */
  flowDirty = false;
  /** The horde distance field being rebuilt, a slice per tick. */
  readonly flowJob = new FlowJob();
  readonly stats: WorldStats = { zombiesKilled: 0, shotsFired: 0 };
  directSoldier: number | null = null;
  /** Fixed at scenario start. */
  difficulty: DifficultyId = 'veteran';
  /** Fog of war: frames carry only the zombies in sight. Presentation only, never read by the rules. */
  fog = false;
  /** Districts and sites produce (survival, the city sandbox). */
  economy = false;
  /** How many zombie kinds spawn (ZOMBIES order): the first mission keeps to the basic three. */
  zombieKinds = ZOMBIES.length;
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
  private readonly structureIndex = new Map<number, Structure>();

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
    this.districtControl = new Uint8Array(256).fill(100);
    for (const site of sites) {
      const b = site.kind === 'base' ? this.addBase(site.name, site.x0, site.y0, site.x1, site.y1) : this.addBase(site.name, site.x0, site.y0, site.x1, site.y1, 0, 0, 'depot');
      if (site.role) b.role = site.role;
    }
  }

  addBase(name: string, x0: number, y0: number, x1: number, y1: number, materials: number = BASE_START.materials, ammo: number = BASE_START.ammo, kind: Base['kind'] = 'base'): Base {
    const b: Base = { id: this.bases.length + 1, kind, buildable: kind === 'base', name, x0, y0, x1, y1, materials, ammo };
    this.bases.push(b);
    return b;
  }

  vehicle(id: number): Vehicle | undefined {
    return this.vehicles.find((v) => v.id === id);
  }

  baseById(id: number): Base | undefined {
    return this.bases.find((b) => b.id === id);
  }

  /** Base or depot whose cell rectangle contains the point, if any. */
  siteAt(x: number, y: number): Base | undefined {
    const cx = Math.floor(x / CELL_SIZE);
    const cy = Math.floor(y / CELL_SIZE);
    return this.bases.find((b) => cx >= b.x0 && cx <= b.x1 && cy >= b.y0 && cy <= b.y1);
  }

  structure(id: number): Structure | undefined {
    return this.structureIndex.get(id);
  }

  addStructure(st: Structure): void {
    this.structures.push(st);
    this.structureIndex.set(st.id, st);
    this.grid.structure[st.cell] = st.id;
  }

  removeStructure(st: Structure): void {
    const i = this.structures.indexOf(st);
    if (i >= 0) this.structures.splice(i, 1);
    this.structureIndex.delete(st.id);
    const g = this.grid;
    g.structure[st.cell] = 0;
    g.structHeight[st.cell] = 0;
    g.blocked[st.cell] &= ~(Blocked.StructureWall | Blocked.GateClosed | Blocked.Barrier);
    this.flowDirty = true;
  }

  /** Rebuild the id indexes from the entity arrays (after loading a snapshot from a file). */
  relink(): void {
    this.soldierIndex.clear();
    this.squadIndex.clear();
    this.structureIndex.clear();
    for (const s of this.soldiers) this.soldierIndex.set(s.id, s);
    for (const q of this.squads) this.squadIndex.set(q.id, q);
    for (const st of this.structures) this.structureIndex.set(st.id, st);
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
