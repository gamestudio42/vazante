import {
  CELL_SIZE,
  Ground,
  NOISE_TRUCK,
  NOISE_TRUCK_RADIUS_M,
  RESUPPLY_RADIUS_M,
  RESUPPLY_ROUNDS_PER_S,
  TICK_DT,
  TICK_HZ,
  TRUCK,
  TRUCK_DRIVE_SEARCH_CELLS,
  TRUCK_ESCORT,
  TRUCK_RESUPPLY_M,
  WEAPONS,
  type RiskPolicy,
} from '@vazante/shared';
import type { Base, Vehicle } from '../entities.ts';
import { findPath } from '../navigation.ts';
import { isActiveSoldier, type World } from '../world.ts';
import { killZombie } from './infected.ts';

// ----- Resupply -----

/** Distance from a point (metres) to a site's cell rectangle (0 inside). */
export function distToSite(b: Base, x: number, y: number): number {
  const x0 = b.x0 * CELL_SIZE;
  const y0 = b.y0 * CELL_SIZE;
  const x1 = (b.x1 + 1) * CELL_SIZE;
  const y1 = (b.y1 + 1) * CELL_SIZE;
  const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
  const dy = y < y0 ? y0 - y : y > y1 ? y - y1 : 0;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Soldiers near a base or depot with ammunition refill their reserve at a fixed rate from that
 * site's stock; away from the sites, a parked truck hands out its ammunition cargo the same way.
 * Far from both, a squad that runs dry stays dry.
 */
export function stepResupply(w: World): void {
  const perTick = RESUPPLY_ROUNDS_PER_S * TICK_DT;
  const r2 = TRUCK_RESUPPLY_M * TRUCK_RESUPPLY_M;
  for (const s of w.soldiers) {
    if (!isActiveSoldier(s)) continue;
    const cap = WEAPONS[s.weapon].ammoPerSoldier;
    const need = cap - (s.ammo + s.mag);
    if (need <= 0) continue;
    let fed = false;
    for (const b of w.bases) {
      if (b.ammo <= 0 || distToSite(b, s.x, s.y) > RESUPPLY_RADIUS_M) continue;
      const n = Math.min(need, perTick, b.ammo);
      s.ammo += n;
      b.ammo -= n;
      s.outOfAmmoReported = false;
      fed = true;
      break;
    }
    if (fed) continue;
    for (const v of w.vehicles) {
      if (v.state !== 'idle' || v.cargoAmmo <= 0 || (v.x - s.x) * (v.x - s.x) + (v.y - s.y) * (v.y - s.y) > r2) continue;
      const n = Math.min(need, perTick, v.cargoAmmo);
      s.ammo += n;
      v.cargoAmmo -= n;
      s.outOfAmmoReported = false;
      break;
    }
  }
}

// ----- Vehicles -----

export function spawnTruck(w: World, x: number, y: number, cargoAmmo = 0, cargoMaterials = 0): Vehicle {
  const site = w.siteAt(x, y);
  const v: Vehicle = {
    id: w.allocId(),
    kind: 'truck',
    x,
    y,
    hx: 0,
    hy: 1,
    hp: TRUCK.hp,
    cargoAmmo,
    cargoMaterials,
    state: 'idle',
    policy: 'halt',
    dest: 0,
    origin: site?.id ?? 0,
    path: [],
    pathIdx: 0,
    blockedT: 0,
    rerouted: false,
    blockReported: false,
    passengers: 0,
  };
  w.vehicles.push(v);
  return v;
}

/** Trucks drive on streets, and inside bases and depots to reach them. */
function truckPassable(w: World): (cell: number) => boolean {
  const g = w.grid;
  return (cell) => {
    if (!g.isWalkable(cell)) return false;
    if (g.ground[cell] === Ground.Street) return true;
    const cx = cell % g.width;
    const cy = (cell - cx) / g.width;
    return w.bases.some((b) => cx >= b.x0 && cx <= b.x1 && cy >= b.y0 && cy <= b.y1);
  };
}

/** Nearest cell of the site (to its centre) that a truck can stand on. */
function siteTargetCell(w: World, b: Base, ok: (cell: number) => boolean): number {
  const g = w.grid;
  const mx = (b.x0 + b.x1) / 2;
  const my = (b.y0 + b.y1) / 2;
  let best = -1;
  let bd = Infinity;
  for (let cy = b.y0; cy <= b.y1; cy++) {
    for (let cx = b.x0; cx <= b.x1; cx++) {
      const c = g.idx(cx, cy);
      if (!ok(c)) continue;
      const d = (cx - mx) * (cx - mx) + (cy - my) * (cy - my);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
  }
  return best;
}

function planRoute(w: World, v: Vehicle, dest: Base, avoidZombies: boolean): boolean {
  const ok = truckPassable(w);
  return planRouteTo(w, v, siteTargetCell(w, dest, ok), ok, avoidZombies);
}

function planRouteTo(w: World, v: Vehicle, goal: number, ok: (cell: number) => boolean, avoidZombies: boolean): boolean {
  if (goal < 0) return false;
  const cells = findPath(w.grid, w.grid.cellAt(v.x, v.y), goal, {
    maxExpanded: 40000,
    passable: ok,
    extraCost: avoidZombies ? (c) => (w.cellCount[c] > 0 ? TRUCK.rerouteZombieCost : 0) : undefined,
  });
  if (!cells) return false;
  v.path = [];
  for (const c of cells) v.path.push(w.grid.cellCenterX(c), w.grid.cellCenterY(c));
  v.pathIdx = 0;
  return true;
}

/** The truck cell nearest a point within TRUCK_DRIVE_SEARCH_CELLS, or -1. */
function pointTargetCell(w: World, x: number, y: number, ok: (cell: number) => boolean): number {
  const g = w.grid;
  const c0 = g.cellAt(x, y);
  if (c0 < 0) return -1;
  const cx = c0 % g.width;
  const cy = (c0 - cx) / g.width;
  let best = -1;
  let bd = Infinity;
  const r = TRUCK_DRIVE_SEARCH_CELLS;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (!g.inBounds(cx + dx, cy + dy)) continue;
      const c = g.idx(cx + dx, cy + dy);
      const d = dx * dx + dy * dy;
      if (d < bd && ok(c)) {
        bd = d;
        best = c;
      }
    }
  }
  return best;
}

/** Clear the per-trip state before a new order. */
function startTrip(w: World, v: Vehicle): void {
  v.origin = w.siteAt(v.x, v.y)?.id ?? v.origin;
  v.rerouted = false;
  v.blockedT = 0;
  v.blockReported = false;
}

export function orderDrive(w: World, id: number, x: number, y: number, queue = false): string | null {
  const v = w.vehicle(id);
  if (!v || v.state === 'destroyed') return 'no_vehicle';
  // Queued behind a drive already under way: the truck goes there next.
  if (queue && v.dest === 0 && v.escort === undefined && (v.state === 'moving' || v.state === 'blocked')) {
    (v.via ??= []).push({ x, y });
    return null;
  }
  v.via = undefined;
  const ok = truckPassable(w);
  const goal = pointTargetCell(w, x, y, ok);
  if (goal < 0) return 'no_road';
  startTrip(w, v);
  v.escort = undefined;
  v.dest = 0;
  if (!planRouteTo(w, v, goal, ok, false)) return 'no_route';
  v.state = 'moving';
  return null;
}

/** Plan the next leg of a drive route, keeping the rest of the route. */
function orderDriveNext(w: World, v: Vehicle, x: number, y: number): boolean {
  const ok = truckPassable(w);
  if (!planRouteTo(w, v, pointTargetCell(w, x, y, ok), ok, false)) return false;
  v.state = 'moving';
  return true;
}

export function orderEscort(w: World, id: number, squad: number | null): string | null {
  const v = w.vehicle(id);
  if (!v || v.state === 'destroyed') return 'no_vehicle';
  if (squad === null) {
    v.escort = undefined;
    return null;
  }
  if (!w.squad(squad)) return 'no_squad';
  startTrip(w, v);
  v.escort = squad;
  v.dest = 0;
  v.via = undefined;
  return null;
}

/** Escorting: keep behind the squad, re-planning now and then; returns the speed cap for this tick. */
function stepEscort(w: World, v: Vehicle): number {
  const q = w.squad(v.escort!);
  const members = q ? q.members.map((id) => w.soldier(id)).filter((s) => s !== undefined && isActiveSoldier(s)) : [];
  if (!q || members.length === 0) {
    v.escort = undefined;
    return TRUCK.speed;
  }
  const tx = q.ax - q.hx * TRUCK_ESCORT.behindM;
  const ty = q.ay - q.hy * TRUCK_ESCORT.behindM;
  const dx = tx - v.x;
  const dy = ty - v.y;
  const d2 = dx * dx + dy * dy;
  if ((w.tick + v.id) % TRUCK_ESCORT.replanTicks === 0) {
    if (d2 < TRUCK_ESCORT.nearM * TRUCK_ESCORT.nearM) {
      if (v.state === 'moving') {
        v.state = 'idle';
        v.path = [];
        v.pathIdx = 0;
      }
    } else if (v.state !== 'blocked') {
      const ok = truckPassable(w);
      if (planRouteTo(w, v, pointTargetCell(w, tx, ty, ok), ok, false)) v.state = 'moving';
    }
  }
  return d2 > TRUCK_ESCORT.catchUpM * TRUCK_ESCORT.catchUpM ? TRUCK.speed : Math.min(TRUCK.speed, q.speed * TRUCK_ESCORT.paceFactor);
}

export function orderConvoy(w: World, id: number, to: number, policy: RiskPolicy): string | null {
  const v = w.vehicle(id);
  if (!v || v.state === 'destroyed') return 'no_vehicle';
  const dest = w.baseById(to);
  if (!dest) return 'no_site';
  startTrip(w, v);
  v.policy = policy;
  v.dest = dest.id;
  v.escort = undefined;
  v.via = undefined;
  if (!planRoute(w, v, dest, false)) return 'no_route';
  v.state = 'moving';
  return null;
}

export function stopVehicle(w: World, id: number): string | null {
  const v = w.vehicle(id);
  if (!v || v.state === 'destroyed') return 'no_vehicle';
  v.state = 'idle';
  v.path = [];
  v.pathIdx = 0;
  v.dest = 0;
  v.escort = undefined;
  v.via = undefined;
  return null;
}

/** Move cargo between a vehicle and the site it is parked in. Positive loads, negative unloads. */
export function loadCargo(w: World, id: number, ammo: number, materials: number): string | null {
  const v = w.vehicle(id);
  if (!v || v.state === 'destroyed') return 'no_vehicle';
  if (v.state === 'moving') return 'vehicle_moving';
  const site = w.siteAt(v.x, v.y);
  if (!site) return 'not_at_site';
  const a = Math.floor(ammo);
  const m = Math.floor(materials);
  const da = a >= 0 ? Math.min(a, site.ammo, TRUCK.capacityAmmo - v.cargoAmmo) : -Math.min(-a, v.cargoAmmo);
  const dm = m >= 0 ? Math.min(m, site.materials, TRUCK.capacityMaterials - v.cargoMaterials) : -Math.min(-m, v.cargoMaterials);
  v.cargoAmmo += da;
  site.ammo -= da;
  v.cargoMaterials += dm;
  site.materials -= dm;
  return null;
}

function zombiesAhead(w: World, v: Vehicle, radius: number): number {
  let n = 0;
  const ax = v.x + v.hx * radius;
  const ay = v.y + v.hy * radius;
  w.forZombiesNear(ax, ay, radius, () => {
    n++;
  });
  return n;
}

function arrive(w: World, v: Vehicle): void {
  // A route drives on to its next point.
  while (v.via && v.dest === 0) {
    const next = v.via.shift()!;
    if (v.via.length === 0) v.via = undefined;
    if (orderDriveNext(w, v, next.x, next.y)) return;
  }
  const site = w.baseById(v.dest);
  v.state = 'idle';
  v.path = [];
  v.pathIdx = 0;
  v.dest = 0;
  if (!site || w.siteAt(v.x, v.y) !== site) return;
  if (v.passengers > 0 && site.kind === 'base') {
    w.emit({ type: 'civilians_delivered', source: v.id, target: site.id, x: v.x, y: v.y, value: v.passengers });
    v.passengers = 0;
  }
  const ammo = v.cargoAmmo;
  const materials = v.cargoMaterials;
  if (ammo === 0 && materials === 0) return;
  site.ammo += ammo;
  site.materials += materials;
  v.cargoAmmo = 0;
  v.cargoMaterials = 0;
  w.emit({ type: 'cargo_delivered', source: v.id, target: site.id, x: v.x, y: v.y, value: ammo, reason: String(materials) });
}

export function stepVehicles(w: World): void {
  for (const v of w.vehicles) {
    if (v.state === 'destroyed') continue;
    if (v.hp <= 0) {
      v.state = 'destroyed';
      v.cargoAmmo = 0;
      v.cargoMaterials = 0;
      v.path = [];
      w.emit({ type: 'vehicle_destroyed', source: v.id, x: v.x, y: v.y });
      continue;
    }
    const cap = v.escort !== undefined ? stepEscort(w, v) : TRUCK.speed;
    if (v.state !== 'moving' && v.state !== 'blocked') continue;
    if (v.pathIdx * 2 >= v.path.length) {
      arrive(w, v);
      continue;
    }

    let speed: number = cap;
    const crowd = zombiesAhead(w, v, TRUCK.blockRadiusM);
    if (crowd >= TRUCK.blockCount) {
      if (!v.blockReported) {
        v.blockReported = true;
        w.emit({ type: 'convoy_blocked', source: v.id, x: v.x, y: v.y, reason: v.policy });
      }
      switch (v.policy) {
        case 'push_through':
          speed *= TRUCK.pushSpeedFactor;
          ramZombies(w, v);
          break;
        case 'halt':
          v.state = 'blocked';
          continue;
        case 'return': {
          const origin = w.baseById(v.origin);
          if (origin && v.dest !== origin.id && planRoute(w, v, origin, true)) {
            v.dest = origin.id;
            v.policy = 'halt';
          } else v.state = 'blocked';
          continue;
        }
        case 'reroute': {
          v.blockedT++;
          const dest = w.baseById(v.dest);
          if (!v.rerouted && dest && planRoute(w, v, dest, true)) v.rerouted = true;
          else if (v.blockedT > TRUCK.rerouteGiveUpS * TICK_HZ) {
            v.state = 'blocked';
            continue;
          }
          speed *= TRUCK.pushSpeedFactor;
          break;
        }
      }
    } else {
      if (v.state === 'blocked') v.state = 'moving';
      v.blockReported = false;
      v.blockedT = 0;
    }

    let remaining = speed * TICK_DT;
    while (remaining > 0 && v.pathIdx * 2 < v.path.length) {
      const tx = v.path[v.pathIdx * 2];
      const ty = v.path[v.pathIdx * 2 + 1];
      const dx = tx - v.x;
      const dy = ty - v.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1e-6) {
        v.hx = dx / d;
        v.hy = dy / d;
      }
      if (d <= remaining) {
        v.x = tx;
        v.y = ty;
        remaining -= d;
        v.pathIdx++;
      } else {
        v.x += (dx / d) * remaining;
        v.y += (dy / d) * remaining;
        remaining = 0;
      }
    }
    w.grid.stampNoise(v.x, v.y, NOISE_TRUCK, NOISE_TRUCK_RADIUS_M);
  }
}

/** Pushing through: zombies right in front of the bumper take damage. */
function ramZombies(w: World, v: Vehicle): void {
  const z = w.zombies;
  const ax = v.x + v.hx * TRUCK.radiusM;
  const ay = v.y + v.hy * TRUCK.radiusM;
  const hit: number[] = [];
  w.forZombiesNear(ax, ay, TRUCK.radiusM + 0.6, (s) => {
    hit.push(s);
  });
  for (const s of hit) {
    z.hp[s] -= TRUCK.pushDamage;
    if (z.hp[s] <= 0 && z.isAlive(s)) killZombie(w, s, 0);
  }
}
