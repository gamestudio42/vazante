import {
  BUILDERS_REQUIRED,
  BUILD_RADIUS_M,
  Blocked,
  CELL_SIZE,
  DEMOLISH_REFUND,
  MG_NEST,
  NOISE_SHOT,
  NOISE_SHOT_RADIUS_M,
  STRUCTURES,
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

export function placementContext(w: World): PlacementContext {
  const g = w.grid;
  return {
    width: g.width,
    height: g.height,
    ground: g.ground,
    bases: w.bases,
    structureAt: (cell) => g.structure[cell] !== 0 || g.blocked[cell] !== Blocked.None,
    unitIn: (cell) => w.soldiers.some((s) => isActiveSoldier(s) && g.cellAt(s.x, s.y) === cell),
  };
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
    if (q.buildTask !== 0 && !w.structures.some((st) => st.id === q.buildTask && !st.built)) {
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
    for (const q of w.squads) {
      if (!q.autoBuild || q.buildTask !== 0 || q.order.kind === 'move' || !squadCanBuild(w, q)) continue;
      const qcx = Math.floor(q.ax / CELL_SIZE);
      const qcy = Math.floor(q.ay / CELL_SIZE);
      if (!base || qcx < base.x0 - TASK_BASE_MARGIN || qcx > base.x1 + TASK_BASE_MARGIN || qcy < base.y0 - TASK_BASE_MARGIN || qcy > base.y1 + TASK_BASE_MARGIN) continue;
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
    if (st.built) continue;
    const need = buildTicks(st.kind);
    if (st.work < need) {
      const cx = w.grid.cellCenterX(st.cell);
      const cy = w.grid.cellCenterY(st.cell);
      let builders = 0;
      for (const s of w.soldiers) {
        if (!isActiveSoldier(s) || s.direct) continue;
        const dx = s.x - cx;
        const dy = s.y - cy;
        if (dx * dx + dy * dy <= r2 && ++builders >= BUILDERS_REQUIRED) break;
      }
      if (builders >= BUILDERS_REQUIRED) st.work++;
    }
    if (st.work >= need && !cellOccupied(w, st.cell)) {
      st.built = true;
      applyBlocking(w, st);
      w.emit({ type: 'structure_built', source: st.id, x: w.grid.cellCenterX(st.cell), y: w.grid.cellCenterY(st.cell), reason: st.kind });
    }
  }
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

/** MG nests: crewed emplacements that engage the nearest zombie in range, firing over walls. */
export function stepEmplacements(w: World): void {
  const z = w.zombies;
  const r2 = MG_NEST.rangeM * MG_NEST.rangeM;
  for (const st of w.structures) {
    if (!st.built || st.kind !== 'mg_nest') continue;
    const base = w.bases[st.base];
    if (!base || base.ammo <= 0) continue;
    const x = w.grid.cellCenterX(st.cell);
    const y = w.grid.cellCenterY(st.cell);
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
    while (st.fireAcc >= 1 && st.target >= 0 && base.ammo > 0) {
      st.fireAcc -= 1;
      base.ammo--;
      w.stats.shotsFired++;
      const t = st.target;
      const tx = z.x[t];
      const ty = z.y[t];
      const d = Math.sqrt((tx - x) * (tx - x) + (ty - y) * (ty - y));
      const hit = w.rng.chance(MG_NEST.accuracy * (1 - 0.4 * (d / MG_NEST.rangeM)));
      if (hit) {
        z.hp[t] -= MG_NEST.damage;
        if (z.hp[t] <= 0) {
          z.kill(t);
          w.stats.zombiesKilled++;
          w.emit({ type: 'zombie_killed', source: 0, target: t, x: tx, y: ty });
          st.target = -1;
        }
      }
      w.emit({ type: 'shot', source: 0, x, y, x2: tx, y2: ty, value: hit ? 1 : 0, reason: 'lmg' });
    }
    w.grid.stampNoise(x, y, NOISE_SHOT, NOISE_SHOT_RADIUS_M);
  }
}
