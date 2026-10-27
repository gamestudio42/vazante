import {
  ACCURACY_MOVING,
  ACCURACY_STATIONARY,
  CELL_SIZE,
  DIRECT_AIM_CORRIDOR_M,
  DIRECT_CONTROL_ACCURACY_BONUS,
  NOISE_SHOT,
  NOISE_SHOT_RADIUS_M,
  RETARGET_INTERVAL_TICKS,
  BRUTE_STAGGER_FACTOR,
  COVER_ACCURACY_BONUS,
  STAGGER_TICKS,
  STRESS,
  SoldierActivity,
  TARGET_SHARE_PENALTY,
  TICK_DT,
  ZombieKind,
  TICK_HZ,
  WEAPONS,
  DAY,
  clockHours,
  daylight,
  type Stance,
  type WeaponStats,
} from '@vazante/shared';
import type { Soldier } from '../entities.ts';
import { isActiveSoldier, type World } from '../world.ts';
import { distToSite } from './logistics.ts';

/** cos(45°): `hold` only engages inside the 90° arc in front of the formation. */
const HOLD_ARC_COS = 0.7071;
/** In `withdraw`, soldiers only fire at zombies this close. */
const WITHDRAW_RANGE_M = 6;

export function stepCombat(w: World): void {
  for (const s of w.soldiers) {
    if (!isActiveSoldier(s)) continue;
    const wpn = WEAPONS[s.weapon];

    if (s.reloadT > 0) {
      s.reloadT--;
      s.activity = SoldierActivity.Reloading;
      if (s.reloadT === 0) {
        const n = Math.min(wpn.magazine - s.mag, s.ammo);
        s.mag += n;
        s.ammo -= n;
        s.activity = s.direct ? SoldierActivity.Direct : SoldierActivity.Idle;
      }
      continue;
    }

    if (s.direct) {
      stepDirectFire(w, s, wpn);
      continue;
    }

    if (s.panicT > 0) {
      s.target = -1;
      s.fireAcc = 0;
      continue;
    }

    const q = w.squad(s.squad);
    const stance: Stance = q ? q.stance : 'aggressive';
    const range = engagementRange(stance, wpn) * sightFactor(w, s.x, s.y);
    if (!validTarget(w, s, s.target, range) || (w.tick + s.id) % RETARGET_INTERVAL_TICKS === 0) {
      s.target = acquire(w, s, range, stance, q ? q.hx : s.fx, q ? q.hy : s.fy, mateTargets(w, s));
    }
    if (s.target < 0) {
      s.fireAcc = 0;
      if (s.activity === SoldierActivity.Engaging) s.activity = s.moving ? SoldierActivity.Moving : SoldierActivity.Idle;
      continue;
    }
    const zx = w.zombies.x[s.target];
    const zy = w.zombies.y[s.target];
    const [fx, fy] = unit(zx - s.x, zy - s.y);
    s.fx = fx;
    s.fy = fy;
    if (s.mag === 0) {
      startReload(w, s, wpn);
      continue;
    }
    s.activity = SoldierActivity.Engaging;
    s.fireAcc += wpn.shotsPerSecond * TICK_DT;
    while (s.fireAcc >= 1 && s.mag > 0 && w.zombies.isAlive(s.target)) {
      s.fireAcc -= 1;
      shoot(w, s, wpn, s.target, 0);
    }
    if (!w.zombies.isAlive(s.target)) s.target = -1;
  }
}

/** At night soldiers see half as far, except under the floodlights around bases and depots. */
function sightFactor(w: World, x: number, y: number): number {
  const day = daylight(clockHours(w.tick));
  if (day >= 1) return 1;
  for (const b of w.bases) if (distToSite(b, x, y) <= DAY.siteLightM) return 1;
  return 1 - (1 - DAY.nightVision) * (1 - day);
}

function engagementRange(stance: Stance, wpn: WeaponStats): number {
  if (stance === 'defensive') return wpn.range * 0.6;
  if (stance === 'withdraw') return Math.min(wpn.range, WITHDRAW_RANGE_M);
  return wpn.range;
}

function validTarget(w: World, s: Soldier, t: number, range: number): boolean {
  if (t < 0 || !w.zombies.isAlive(t)) return false;
  const dx = w.zombies.x[t] - s.x;
  const dy = w.zombies.y[t] - s.y;
  return dx * dx + dy * dy <= range * range;
}

const mates: number[] = [];

/** Targets the soldier's squadmates are already shooting at (shared scratch array). */
function mateTargets(w: World, s: Soldier): number[] {
  mates.length = 0;
  const q = w.squad(s.squad);
  if (!q) return mates;
  for (const id of q.members) {
    if (id === s.id) continue;
    const m = w.soldier(id);
    if (m && m.target >= 0 && isActiveSoldier(m)) mates.push(m.target);
  }
  return mates;
}

/**
 * Nearest visible zombie in range (and in the front arc for `hold`). A zombie that squadmates
 * already shoot at counts as farther, so a squad spreads its fire over the front.
 */
function acquire(w: World, s: Soldier, range: number, stance: Stance, hx: number, hy: number, taken: readonly number[]): number {
  let best = -1;
  let bestScore = Infinity;
  w.forZombiesNear(s.x, s.y, range, (slot, d2) => {
    if (d2 >= bestScore) return;
    let n = 0;
    for (const t of taken) if (t === slot) n++;
    const f = 1 + TARGET_SHARE_PENALTY * n;
    const score = d2 * f * f;
    if (score >= bestScore) return;
    const dx = w.zombies.x[slot] - s.x;
    const dy = w.zombies.y[slot] - s.y;
    if (stance === 'hold' && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      if ((dx * hx + dy * hy) / d < HOLD_ARC_COS) return;
    }
    if (!w.grid.lineOfSight(s.x, s.y, w.zombies.x[slot], w.zombies.y[slot])) return;
    best = slot;
    bestScore = score;
  });
  return best;
}

function stepDirectFire(w: World, s: Soldier, wpn: WeaponStats): void {
  const inp = s.direct!;
  s.activity = SoldierActivity.Direct;
  if (inp.reload && s.mag < wpn.magazine) {
    startReload(w, s, wpn);
    return;
  }
  if (!inp.fire) {
    s.fireAcc = 0;
    return;
  }
  s.fireAcc += wpn.shotsPerSecond * TICK_DT;
  while (s.fireAcc >= 1) {
    s.fireAcc -= 1;
    if (s.mag === 0) {
      startReload(w, s, wpn);
      s.fireAcc = 0;
      return;
    }
    const t = aimTarget(w, s, wpn.range);
    shoot(w, s, wpn, t, DIRECT_CONTROL_ACCURACY_BONUS);
  }
}

/** The first visible zombie inside the aim corridor. */
function aimTarget(w: World, s: Soldier, range: number): number {
  const ax = s.fx;
  const ay = s.fy;
  let best = -1;
  let bestT = Infinity;
  const c2 = DIRECT_AIM_CORRIDOR_M * DIRECT_AIM_CORRIDOR_M;
  w.forZombiesNear(s.x, s.y, range, (slot, d2) => {
    const dx = w.zombies.x[slot] - s.x;
    const dy = w.zombies.y[slot] - s.y;
    const t = dx * ax + dy * ay;
    if (t <= 0 || t >= bestT) return;
    if (d2 - t * t > c2) return;
    if (!w.grid.lineOfSight(s.x, s.y, w.zombies.x[slot], w.zombies.y[slot])) return;
    best = slot;
    bestT = t;
  });
  return best;
}

function startReload(w: World, s: Soldier, wpn: WeaponStats): void {
  if (s.ammo > 0) {
    if (s.reloadT === 0 && s.mag < wpn.magazine) {
      s.reloadT = Math.round(wpn.reloadSeconds * TICK_HZ);
      s.activity = SoldierActivity.Reloading;
      w.emit({ type: 'reloading', source: s.id, x: s.x, y: s.y });
    }
  } else if (s.mag === 0 && !s.outOfAmmoReported) {
    s.outOfAmmoReported = true;
    w.emit({ type: 'out_of_ammo', source: s.id, target: s.squad, x: s.x, y: s.y });
  }
}

/** Fire one shot at a zombie slot (or along the facing when slot is -1). */
function shoot(w: World, s: Soldier, wpn: WeaponStats, slot: number, bonus: number): void {
  s.mag--;
  w.stats.shotsFired++;
  w.grid.stampNoise(s.x, s.y, NOISE_SHOT, NOISE_SHOT_RADIUS_M);
  if (slot < 0) {
    const [ex, ey] = rayEnd(w, s.x, s.y, s.fx, s.fy, wpn.range);
    w.emit({ type: 'shot', source: s.id, x: s.x, y: s.y, x2: ex, y2: ey, value: 0 });
    return;
  }
  const z = w.zombies;
  const zx = z.x[slot];
  const zy = z.y[slot];
  const d = Math.sqrt((zx - s.x) * (zx - s.x) + (zy - s.y) * (zy - s.y));
  const r = d / wpn.range;
  const rangeFactor = 1 - r * r * 0.5;
  const stanceFactor = s.moving ? ACCURACY_MOVING : s.inCover ? ACCURACY_STATIONARY * COVER_ACCURACY_BONUS : ACCURACY_STATIONARY;
  const nerve = 1 - (STRESS.aimPenalty * s.stress) / 100;
  const p = clamp01(wpn.accuracy * clamp01(rangeFactor) * stanceFactor * nerve + bonus);
  let hits = 0;
  for (let i = 0; i < wpn.pellets; i++) if (w.rng.chance(p)) hits++;
  if (hits > 0) {
    z.hp[slot] -= wpn.damage * hits;
    if (z.hp[slot] <= 0) {
      z.kill(slot);
      w.stats.zombiesKilled++;
      w.emit({ type: 'zombie_killed', source: s.id, target: slot, x: zx, y: zy });
    } else {
      // Suppression: the hit knocks the zombie back on its heels.
      const t = z.kind[slot] === ZombieKind.Brute ? Math.round(STAGGER_TICKS[s.weapon] * BRUTE_STAGGER_FACTOR) : STAGGER_TICKS[s.weapon];
      if (z.stagger[slot] < t) z.stagger[slot] = t;
    }
  }
  w.emit({ type: 'shot', source: s.id, x: s.x, y: s.y, x2: zx, y2: zy, value: hits });
}

function rayEnd(w: World, x: number, y: number, dx: number, dy: number, range: number): [number, number] {
  const step = CELL_SIZE * 0.5;
  for (let t = step; t < range; t += step) {
    const c = w.grid.cellAt(x + dx * t, y + dy * t);
    if (c < 0 || w.grid.blocksSight(c)) return [x + dx * t, y + dy * t];
  }
  return [x + dx * range, y + dy * range];
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function unit(dx: number, dy: number): [number, number] {
  const d = Math.sqrt(dx * dx + dy * dy);
  return d > 1e-6 ? [dx / d, dy / d] : [1, 0];
}
