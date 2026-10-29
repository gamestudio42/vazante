import {
  BUILDERS_REQUIRED,
  BUILD_RADIUS_M,
  Blocked,
  CELL_SIZE,
  DEMOLISH_REFUND,
  ENGINEER,
  MG_NEST,
  NOISE_SHOT,
  NOISE_SHOT_RADIUS_M,
  REPAIR,
  STRUCTURES,
  WRECK,
  TICK_DT,
  TICK_HZ,
  ZombieState,
  checkPlacement,
  type PlacementContext,
  type StructureKind,
} from '@vazante/shared';
import type { Squad, Structure } from '../entities.ts';
import { planMove } from './units.ts';
import { isActiveSoldier, type World } from '../world.ts';
import { killZombie } from './infected.ts';

export function placementContext(w: World): PlacementContext {
  const g = w.grid;
  return {
    width: g.width,
    height: g.height,
    ground: g.ground,
    bases: w.bases,
    structureAt: (cell) => g.structure[cell] !== 0 || g.blocked[cell] !== Blocked.None,
    unitIn: (cell) => w.soldiers.some((s) => isActiveSoldier(s) && g.cellAt(s.x, s.y) === cell),
    engineerNear: (cx, cy) => engineerNear(w, (cx + 0.5) * CELL_SIZE, (cy + 0.5) * CELL_SIZE, ENGINEER.buildM),
    homeBase: w.bases.findIndex((b) => b.kind === 'base'),
  };
}

function engineerNear(w: World, x: number, y: number, r: number): boolean {
  return w.soldiers.some((s) => s.role === 'engineer' && isActiveSoldier(s) && (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y) <= r * r);
}

function insideBase(w: World, st: Structure): boolean {
  const b = w.bases[st.base];
  const cx = st.cell % w.grid.width;
  const cy = (st.cell - cx) / w.grid.width;
  return !!b && cx >= b.x0 && cx <= b.x1 && cy >= b.y0 && cy <= b.y1;
}

/** Validate, pay and place a blueprint. Returns a rejection reason or null. */
export function placeStructure(w: World, kind: StructureKind, x: number, y: number): string | null {
  const cx = Math.floor(x / CELL_SIZE);
  const cy = Math.floor(y / CELL_SIZE);
  const r = checkPlacement(placementContext(w), kind, cx, cy);
  if (r.error) return r.error;
  const base = w.bases[r.base];
  base.materials -= STRUCTURES[kind].materials;
  const st: Structure = {
    id: w.allocId(),
    kind,
    cell: cy * w.grid.width + cx,
    base: r.base,
    hp: STRUCTURES[kind].hp,
    work: 0,
    built: false,
    open: false,
    target: -1,
    fireAcc: 0,
  };
  // A nest out in the field has no base stock to draw on: it carries its own box.
  if (kind === 'mg_nest' && !w.bases.some((b) => cx >= b.x0 && cx <= b.x1 && cy >= b.y0 && cy <= b.y1)) st.ammo = MG_NEST.fieldAmmo;
  w.addStructure(st);
  w.emit({ type: 'structure_placed', source: st.id, x: (cx + 0.5) * CELL_SIZE, y: (cy + 0.5) * CELL_SIZE, reason: kind });
  return null;
}

export function buildTicks(kind: StructureKind): number {
  return Math.round(STRUCTURES[kind].buildTimeS * TICK_HZ);
}

/** Blocked bits a finished structure sets on its cell. */
function blockBits(st: Structure): number {
  if (st.kind === 'gate') return st.open ? Blocked.None : Blocked.GateClosed;
  return STRUCTURES[st.kind].blocksSight ? Blocked.StructureWall : Blocked.Barrier;
}

function applyBlocking(w: World, st: Structure): void {
  const g = w.grid;
  g.blocked[st.cell] = (g.blocked[st.cell] & ~(Blocked.StructureWall | Blocked.GateClosed | Blocked.Barrier)) | blockBits(st);
  g.structHeight[st.cell] = st.built && !(st.kind === 'gate' && st.open) ? Math.round(STRUCTURES[st.kind].height * 10) : 0;
  w.flowDirty = true;
}

function cellOccupied(w: World, cell: number): boolean {
  if (w.cellCount[cell] > 0) return true;
  for (const s of w.soldiers) if (isActiveSoldier(s) && w.grid.cellAt(s.x, s.y) === cell) return true;
  return false;
}

/** Squads may be pulled to blueprints from this far outside their base (cells). */
const TASK_BASE_MARGIN = 10;
const TASK_INTERVAL_TICKS = 10;

/**
 * Idle squads in a base go and build its blueprints, nearest first. Player orders cancel the task.
 * A squad keeps its task until that structure is finished or removed.
 */
function assignBuilders(w: World): void {
  for (const q of w.squads) {
    if (q.buildTask !== 0 && !taskOpen(w, q.buildTask)) {
      q.buildTask = 0;
      if (q.order.kind === 'move') q.order = { kind: 'hold', at: { x: q.ax, y: q.ay } };
    }
  }
  for (const st of w.structures) {
    if (st.built || st.work >= buildTicks(st.kind)) continue;
    if (w.squads.some((q) => q.buildTask === st.id)) continue;
    const base = w.bases[st.base];
    let best: Squad | undefined;
    let bd = Infinity;
    const sx = w.grid.cellCenterX(st.cell);
    const sy = w.grid.cellCenterY(st.cell);
    // Outside the walls only engineers in reach take the job.
    const field = !insideBase(w, st);
    for (const q of w.squads) {
      if (!q.autoBuild || q.buildTask !== 0 || q.order.kind === 'move' || !squadCanBuild(w, q)) continue;
      if (field) {
        if (q.kind !== 'engineers' || (q.ax - sx) * (q.ax - sx) + (q.ay - sy) * (q.ay - sy) > 4 * ENGINEER.buildM * ENGINEER.buildM) continue;
      } else {
        const qcx = Math.floor(q.ax / CELL_SIZE);
        const qcy = Math.floor(q.ay / CELL_SIZE);
        if (!base || qcx < base.x0 - TASK_BASE_MARGIN || qcx > base.x1 + TASK_BASE_MARGIN || qcy < base.y0 - TASK_BASE_MARGIN || qcy > base.y1 + TASK_BASE_MARGIN) continue;
      }
      const d = (q.ax - sx) * (q.ax - sx) + (q.ay - sy) * (q.ay - sy);
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
    if (!best) continue;
    const spot = workSpot(w, st.cell, best.ax, best.ay);
    if (spot >= 0 && planMove(w, best, w.grid.cellCenterX(spot), w.grid.cellCenterY(spot))) best.buildTask = st.id;
  }
}

/** A build or repair job still has work: an unfinished blueprint, a damaged structure, a wreck. */
function taskOpen(w: World, id: number): boolean {
  const st = w.structure(id);
  if (st) return !st.built || st.hp < STRUCTURES[st.kind].hp;
  return w.vehicle(id)?.state === 'destroyed';
}

/** Send an engineer squad to mend a damaged structure or get a wreck back on the road. */
export function orderRepair(w: World, squad: number, target: number): string | null {
  const q = w.squad(squad);
  if (!q) return 'no_squad';
  if (q.kind !== 'engineers') return 'not_engineers';
  const st = w.structure(target);
  const v = st ? undefined : w.vehicle(target);
  if (st ? !st.built || st.hp >= STRUCTURES[st.kind].hp : v?.state !== 'destroyed') return 'nothing_to_repair';
  let x: number;
  let y: number;
  if (st) {
    const spot = workSpot(w, st.cell, q.ax, q.ay);
    if (spot < 0) return 'no_route';
    x = w.grid.cellCenterX(spot);
    y = w.grid.cellCenterY(spot);
  } else {
    // Stand beside the wreck, on the squad's side of it.
    const dx = q.ax - v!.x;
    const dy = q.ay - v!.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    x = v!.x + (dx / d) * (WRECK.reachM / 2);
    y = v!.y + (dy / d) * (WRECK.reachM / 2);
    if (!w.grid.isWalkableAt(x, y)) {
      x = v!.x;
      y = v!.y;
    }
  }
  if (!planMove(w, q, x, y)) return 'no_route';
  q.buildTask = target;
  return null;
}

/** The damaged structure or wreck nearest the squad within `rangeM`, or 0. */
export function nearestRepair(w: World, squad: number, rangeM: number): number {
  const q = w.squad(squad);
  if (!q) return 0;
  let best = 0;
  let bd = rangeM * rangeM;
  for (const st of w.structures) {
    if (!st.built || st.hp >= STRUCTURES[st.kind].hp) continue;
    const d = (w.grid.cellCenterX(st.cell) - q.ax) ** 2 + (w.grid.cellCenterY(st.cell) - q.ay) ** 2;
    if (d < bd) {
      bd = d;
      best = st.id;
    }
  }
  for (const v of w.vehicles) {
    if (v.state !== 'destroyed') continue;
    const d = (v.x - q.ax) ** 2 + (v.y - q.ay) ** 2;
    if (d < bd) {
      bd = d;
      best = v.id;
    }
  }
  return best;
}

function squadCanBuild(w: World, q: Squad): boolean {
  let n = 0;
  for (const id of q.members) {
    const s = w.soldier(id);
    if (s && isActiveSoldier(s) && !s.direct) n++;
  }
  return n >= BUILDERS_REQUIRED;
}

/** Free walkable cell next to a blueprint, on the side nearest to (x, y). */
function workSpot(w: World, cell: number, x: number, y: number): number {
  const g = w.grid;
  const cx = cell % g.width;
  const cy = (cell - cx) / g.width;
  let best = -1;
  let bd = Infinity;
  for (const [dx, dy] of [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ]) {
    if (!g.inBounds(cx + dx, cy + dy)) continue;
    const n = g.idx(cx + dx, cy + dy);
    if (!g.isWalkable(n) || g.structure[n] !== 0) continue;
    const d = (g.cellCenterX(n) - x) ** 2 + (g.cellCenterY(n) - y) ** 2;
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  return best;
}

/** Builders advance blueprints; a finished blueprint waits until its cell is clear, then blocks. */
export function stepConstruction(w: World): void {
  if (w.tick % TASK_INTERVAL_TICKS === 0) assignBuilders(w);
  const r2 = BUILD_RADIUS_M * BUILD_RADIUS_M;
  for (const st of w.structures) {
    if (st.built) {
      if (st.hp < STRUCTURES[st.kind].hp) mend(w, st);
      continue;
    }
    const need = buildTicks(st.kind);
    if (st.work < need) {
      const cx = w.grid.cellCenterX(st.cell);
      const cy = w.grid.cellCenterY(st.cell);
      let builders = 0;
      let engineers = 0;
      for (const s of w.soldiers) {
        if (!isActiveSoldier(s) || s.direct) continue;
        const dx = s.x - cx;
        const dy = s.y - cy;
        if (dx * dx + dy * dy > r2) continue;
        builders++;
        if (s.role === 'engineer') engineers++;
        if (builders >= BUILDERS_REQUIRED && engineers > 0) break;
      }
      if (builders >= BUILDERS_REQUIRED) st.work = Math.min(need, st.work + (engineers > 0 ? ENGINEER.rate : 1));
    }
    if (st.work >= need && !cellOccupied(w, st.cell)) {
      st.built = true;
      applyBlocking(w, st);
      w.emit({ type: 'structure_built', source: st.id, x: w.grid.cellCenterX(st.cell), y: w.grid.cellCenterY(st.cell), reason: st.kind });
    }
  }
}

/** Engineers beside a damaged structure mend it. */
function mend(w: World, st: Structure): void {
  const cx = w.grid.cellCenterX(st.cell);
  const cy = w.grid.cellCenterY(st.cell);
  const r2 = BUILD_RADIUS_M * BUILD_RADIUS_M;
  let crew = 0;
  for (const s of w.soldiers) {
    if (s.role !== 'engineer' || !isActiveSoldier(s) || s.direct) continue;
    if ((s.x - cx) * (s.x - cx) + (s.y - cy) * (s.y - cy) <= r2 && ++crew >= REPAIR.crew) break;
  }
  if (crew > 0) st.hp = Math.min(STRUCTURES[st.kind].hp, st.hp + crew * REPAIR.hpPerS * TICK_DT);
}

export function damageStructure(w: World, st: Structure, dmg: number): void {
  st.hp -= dmg;
  if (st.hp > 0) return;
  w.emit({ type: 'structure_destroyed', source: st.id, x: w.grid.cellCenterX(st.cell), y: w.grid.cellCenterY(st.cell), reason: st.kind });
  w.removeStructure(st);
}

export function demolishStructure(w: World, id: number): string | null {
  const st = w.structure(id);
  if (!st) return 'no_structure';
  if (st.kind === 'command_post') return 'not_allowed';
  const base = w.bases[st.base];
  const cost = STRUCTURES[st.kind].materials;
  if (base) base.materials += st.built ? Math.floor(cost * DEMOLISH_REFUND) : cost;
  w.removeStructure(st);
  return null;
}

export function toggleGate(w: World, id: number): string | null {
  const st = w.structure(id);
  if (!st || st.kind !== 'gate') return 'no_gate';
  if (!st.built) return 'not_built';
  if (st.open && cellOccupied(w, st.cell)) return 'occupied_unit';
  st.open = !st.open;
  applyBlocking(w, st);
  w.emit({ type: 'gate_toggled', source: st.id, value: st.open ? 1 : 0, x: w.grid.cellCenterX(st.cell), y: w.grid.cellCenterY(st.cell) });
  return null;
}

/** Recount the zombie pile at every structure: stacked zombies at the wall plus those climbing inside it. */
export function computePiles(w: World): void {
  const g = w.grid;
  const z = w.zombies;
  for (const st of w.structures) g.pile[st.cell] = 0;
  for (let s = 0; s < z.highWater; s++) {
    if (!z.isAlive(s)) continue;
    let c = -1;
    if (z.state[s] === ZombieState.Stacked) c = z.stack[s];
    else {
      const here = g.cellAt(z.x[s], z.y[s]);
      if (here >= 0 && g.structure[here] !== 0) c = here;
    }
    if (c >= 0 && g.pile[c] < 255) g.pile[c]++;
  }
}

/** An idle truck parked beside a field nest tops its box up from the cargo. */
function refillNest(w: World, st: Structure, x: number, y: number): void {
  const need = MG_NEST.fieldAmmo - st.ammo!;
  if (need <= 0) return;
  const r2 = MG_NEST.refillM * MG_NEST.refillM;
  for (const v of w.vehicles) {
    if (v.state !== 'idle' || v.cargoAmmo <= 0 || (v.x - x) * (v.x - x) + (v.y - y) * (v.y - y) > r2) continue;
    const n = Math.min(need, v.cargoAmmo);
    v.cargoAmmo -= n;
    st.ammo! += n;
    return;
  }
}

/** MG nests: crewed emplacements that engage the nearest zombie in range, firing over walls. */
export function stepEmplacements(w: World): void {
  const z = w.zombies;
  const r2 = MG_NEST.rangeM * MG_NEST.rangeM;
  for (const st of w.structures) {
    if (!st.built || st.kind !== 'mg_nest') continue;
    const x = w.grid.cellCenterX(st.cell);
    const y = w.grid.cellCenterY(st.cell);
    if (st.ammo !== undefined) refillNest(w, st, x, y);
    // A field nest fires from its own box, the others from their base stock.
    const box = st.ammo !== undefined ? st : w.bases[st.base];
    if (!box || box.ammo! <= 0) continue;
    if (st.target >= 0) {
      const t = st.target;
      const dx = z.x[t] - x;
      const dy = z.y[t] - y;
      if (!z.isAlive(t) || dx * dx + dy * dy > r2 || !w.grid.lineOfSight(x, y, z.x[t], z.y[t], true)) st.target = -1;
    }
    if (st.target < 0) {
      let best = -1;
      let bd = r2;
      w.forZombiesNear(x, y, MG_NEST.rangeM, (slot, d2) => {
        if (d2 < bd && w.grid.lineOfSight(x, y, z.x[slot], z.y[slot], true)) {
          bd = d2;
          best = slot;
        }
      });
      st.target = best;
      if (best < 0) {
        st.fireAcc = 0;
        continue;
      }
    }
    st.fireAcc += MG_NEST.shotsPerS * TICK_DT;
    while (st.fireAcc >= 1 && st.target >= 0 && box.ammo! > 0) {
      st.fireAcc -= 1;
      box.ammo!--;
      st.fired = (st.fired ?? 0) + 1;
      if (st.ammo === 0) w.emit({ type: 'nest_empty', source: st.id, x, y });
      w.stats.shotsFired++;
      const t = st.target;
      const tx = z.x[t];
      const ty = z.y[t];
      const d = Math.sqrt((tx - x) * (tx - x) + (ty - y) * (ty - y));
      const hit = w.rng.chance(MG_NEST.accuracy * (1 - 0.4 * (d / MG_NEST.rangeM)));
      if (hit) {
        z.hp[t] -= MG_NEST.damage;
        if (z.hp[t] <= 0) {
          killZombie(w, t, 0);
          st.target = -1;
        }
      }
      w.emit({ type: 'shot', source: 0, x, y, x2: tx, y2: ty, value: hit ? 1 : 0, reason: 'lmg' });
    }
    w.grid.stampNoise(x, y, NOISE_SHOT, NOISE_SHOT_RADIUS_M);
  }
}
