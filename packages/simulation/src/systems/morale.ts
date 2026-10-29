import { COVER_STRESS_FACTOR, DAY, DIFFICULTY, Ground, SoldierActivity, STRESS, TICK_DT, clockHours, daylight } from '@vazante/shared';
import type { Grid } from '../grid.ts';
import type { Soldier } from '../entities.ts';
import { isActiveSoldier, type World } from '../world.ts';
import { distToSite } from './logistics.ts';

const NEAR2 = STRESS.nearM * STRESS.nearM;
const WITNESS2 = STRESS.witnessM * STRESS.witnessM;
const COHESION2 = STRESS.cohesionM * STRESS.cohesionM;

/**
 * Morale: pressure (zombies close, out of ammo, darkness) raises stress, quiet lowers it. Cover and
 * squadmates close by steady a soldier. A soldier at the breaking point runs for a moment (see units)
 * and holds fire. Also the squad's radio call on first contact. Runs after combat.
 */
export function stepMorale(w: World): void {
  const night = daylight(clockHours(w.tick, w.day)) < 1;
  for (const s of w.soldiers) {
    if (!isActiveSoldier(s)) continue;
    s.inCover = isCover(w.grid, w.grid.cellAt(s.x, s.y));

    // Zombies behind the squad's front weigh more: being caught from the flank or the rear is what breaks men.
    const q = w.squad(s.squad);
    const hx = q ? q.hx : s.fx;
    const hy = q ? q.hy : s.fy;
    let near = 0;
    let count = 0;
    w.forZombiesNear(s.x, s.y, STRESS.nearM, (slot, d2) => {
      if (d2 > NEAR2 || !w.zombies.isAlive(slot)) return;
      const dx = w.zombies.x[slot] - s.x;
      const dy = w.zombies.y[slot] - s.y;
      const rear = d2 > 1e-6 && (dx * hx + dy * hy) / Math.sqrt(d2) < STRESS.rearCos;
      near += rear ? STRESS.rearFactor : 1;
      return ++count >= STRESS.maxNear;
    });

    const atSite = w.bases.some((b) => distToSite(b, s.x, s.y) <= DAY.siteLightM);
    if (near > 0) {
      let gain = STRESS.perNear * near;
      if (s.mag + s.ammo === 0) gain += STRESS.outOfAmmo;
      if (night && !atSite) gain += STRESS.dark;
      if (matesNear(w, s) >= STRESS.cohesionMates) gain *= STRESS.cohesionFactor;
      if (s.inCover) gain *= COVER_STRESS_FACTOR;
      s.stress += gain * DIFFICULTY[w.difficulty].stress * TICK_DT;
    } else {
      s.stress -= (atSite ? STRESS.recoverAtSite : STRESS.recover) * TICK_DT;
    }
    s.stress = clampStress(s.stress);

    if (s.panicT > 0) {
      s.panicT--;
      if (s.panicT === 0) {
        s.stress = Math.min(s.stress, STRESS.afterPanic);
        s.panicCd = STRESS.panicCooldownTicks;
      }
    } else if (s.panicCd > 0) {
      s.panicCd--;
    } else if (s.stress >= STRESS.panic && !s.direct) {
      s.panicT = STRESS.panicTicks;
      s.target = -1;
      s.fireAcc = 0;
      w.emit({ type: 'soldier_panicked', source: s.id, target: s.squad, x: s.x, y: s.y });
    }
  }

  for (const q of w.squads) {
    if (q.contactCd > 0) q.contactCd--;
    let engaged = false;
    for (const id of q.members) {
      const s = w.soldier(id);
      if (s && isActiveSoldier(s) && s.activity === SoldierActivity.Engaging) {
        engaged = true;
        break;
      }
    }
    if (engaged && !q.engaged && q.contactCd === 0) {
      q.contactCd = STRESS.contactCooldownTicks;
      w.emit({ type: 'squad_contact', source: q.id, x: q.ax, y: q.ay });
    }
    q.engaged = engaged;
  }
}

/** Add stress to one soldier (cover softens it). */
export function addStress(s: Soldier, amount: number): void {
  s.stress = clampStress(s.stress + (s.inCover ? amount * COVER_STRESS_FACTOR : amount));
}

/** Everyone active within sight of `victim` takes a morale hit. */
export function witness(w: World, victim: Soldier, amount: number): void {
  for (const s of w.soldiers) {
    if (s === victim || !isActiveSoldier(s)) continue;
    const dx = s.x - victim.x;
    const dy = s.y - victim.y;
    if (dx * dx + dy * dy <= WITNESS2) addStress(s, s.squad === victim.squad ? amount : amount * 0.5);
  }
}

/** A walkable cell next to a wall, barrier, closed gate or building. */
export function isCover(g: Grid, cell: number): boolean {
  if (cell < 0 || !g.isWalkable(cell)) return false;
  const cx = cell % g.width;
  const cy = (cell - cx) / g.width;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      if ((ox === 0 && oy === 0) || !g.inBounds(cx + ox, cy + oy)) continue;
      if (isObstacle(g, g.idx(cx + ox, cy + oy))) return true;
    }
  }
  return false;
}

export function isObstacle(g: Grid, c: number): boolean {
  return g.isStructureBlocking(c) || g.ground[c] === Ground.Building;
}

function matesNear(w: World, s: Soldier): number {
  const q = w.squad(s.squad);
  if (!q) return 0;
  let n = 0;
  for (const id of q.members) {
    if (id === s.id) continue;
    const m = w.soldier(id);
    if (!m || !isActiveSoldier(m)) continue;
    const dx = m.x - s.x;
    const dy = m.y - s.y;
    if (dx * dx + dy * dy <= COHESION2) n++;
  }
  return n;
}

function clampStress(v: number): number {
  return v < 0 ? 0 : v > 100 ? 100 : v;
}
