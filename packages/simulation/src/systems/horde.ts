import {
  BITE_TURN_MAX_S,
  BITE_TURN_MIN_S,
  CELL_SIZE,
  DIR16_X,
  DIR16_Y,
  NOISE_CHASE_THRESHOLD,
  SoldierCondition,
  TICK_DT,
  TICK_HZ,
  ZOMBIES,
  ZOMBIE_ACCEL,
  ZOMBIE_ATTACK_INTERVAL_S,
  ZOMBIE_ATTACK_RANGE_M,
  ZOMBIE_MAX_NEIGHBOURS,
  ZOMBIE_MAX_PER_CELL,
  ZOMBIE_PERCEPTION_M,
  ZOMBIE_SEPARATION_M,
  ZOMBIE_WANDER_SPEED_FACTOR,
  ZombieState,
} from '@vazante/shared';
import type { Soldier } from '../entities.ts';
import { canStep, FLOW_UNREACHABLE, NEIGHBOURS } from '../navigation.ts';
import { isActiveSoldier, type World } from '../world.ts';
import { killSoldier } from './lifecycle.ts';
import { moveWithCollision } from './movement.ts';

/** Chasing zombies give up when farther than this (flow units: 10 per cell = 4 m) and no noise. */
const CHASE_GIVE_UP = 250;
/** Within this distance a chasing zombie steers straight at its target instead of the flow field. */
const DIRECT_STEER_M = 8;
const IDLE_DIR = 255;
const ATTACK_CD_TICKS = Math.round(ZOMBIE_ATTACK_INTERVAL_S * TICK_HZ);
const PERCEPTION2 = ZOMBIE_PERCEPTION_M * ZOMBIE_PERCEPTION_M;
const SEP2 = ZOMBIE_SEPARATION_M * ZOMBIE_SEPARATION_M;

export function stepHorde(w: World): void {
  const z = w.zombies;
  const g = w.grid;
  const active: Soldier[] = [];
  for (const s of w.soldiers) if (isActiveSoldier(s)) active.push(s);

  for (let s = 0; s < z.highWater; s++) {
    if (!z.isAlive(s)) continue;
    const stats = ZOMBIES[z.kind[s]];
    if (z.attackCd[s] > 0) z.attackCd[s]--;
    const x = z.x[s];
    const y = z.y[s];

    if ((s + w.tick) % 3 === 0) perceive(w, s, active);

    let dx = 0;
    let dy = 0;
    let speed = stats.speed;
    if (z.state[s] === ZombieState.Wandering) {
      if (z.wanderT[s] === 0) {
        z.wanderDir[s] = w.rng.chance(0.3) ? IDLE_DIR : w.rng.int(0, 15);
        z.wanderT[s] = w.rng.int(20, 60);
      } else z.wanderT[s]--;
      const d = z.wanderDir[s];
      if (d !== IDLE_DIR) {
        dx = DIR16_X[d];
        dy = DIR16_Y[d];
        speed *= ZOMBIE_WANDER_SPEED_FACTOR;
      }
    } else {
      let target = z.target[s] !== 0 ? w.soldier(z.target[s]) : undefined;
      if (target && !isActiveSoldier(target)) {
        target = undefined;
        z.target[s] = 0;
      }
      const c = g.cellAt(x, y);
      const here = c < 0 ? FLOW_UNREACHABLE : g.flow[c];
      if (target && dist2(x, y, target.x, target.y) < DIRECT_STEER_M * DIRECT_STEER_M) {
        [dx, dy] = unit(target.x - x, target.y - y);
      } else if (here === FLOW_UNREACHABLE || (here > CHASE_GIVE_UP && g.noise[c] < NOISE_CHASE_THRESHOLD && !target)) {
        z.state[s] = ZombieState.Wandering;
        z.target[s] = 0;
        z.wanderT[s] = 0;
      } else if (here === 0) {
        const n = nearest(active, x, y);
        if (n) [dx, dy] = unit(n.x - x, n.y - y);
      } else {
        const cx = c % g.width;
        const cy = (c - cx) / g.width;
        let best = here;
        let bx = 0;
        let by = 0;
        for (const [ox, oy] of NEIGHBOURS) {
          if (!canStep(g, cx, cy, ox, oy)) continue;
          const f = g.flow[c + oy * g.width + ox];
          if (f < best) {
            best = f;
            bx = ox;
            by = oy;
          }
        }
        if (bx !== 0 || by !== 0) [dx, dy] = unit((cx + bx + 0.5) * CELL_SIZE - x, (cy + by + 0.5) * CELL_SIZE - y);
      }
    }

    // Attack whoever is in reach.
    const victim = nearestWithin(active, x, y, ZOMBIE_ATTACK_RANGE_M);
    if (victim) {
      z.state[s] = ZombieState.Attacking;
      z.target[s] = victim.id;
      dx = 0;
      dy = 0;
      if (z.attackCd[s] === 0) attack(w, s, victim);
    } else if (z.state[s] === ZombieState.Attacking) {
      z.state[s] = ZombieState.Chasing;
    }

    // Velocity with limited acceleration.
    const maxDv = ZOMBIE_ACCEL * TICK_DT;
    let dvx = dx * speed - z.vx[s];
    let dvy = dy * speed - z.vy[s];
    const dv = Math.sqrt(dvx * dvx + dvy * dvy);
    if (dv > maxDv) {
      dvx = (dvx / dv) * maxDv;
      dvy = (dvy / dv) * maxDv;
    }
    let vx = z.vx[s] + dvx;
    let vy = z.vy[s] + dvy;

    // Separation from neighbours (positional correction).
    let px = x;
    let py = y;
    let seen = 0;
    w.forZombiesNear(x, y, ZOMBIE_SEPARATION_M, (o, d2) => {
      if (o === s) return;
      if (d2 < SEP2) {
        const d = Math.sqrt(d2);
        if (d > 1e-4) {
          const push = (ZOMBIE_SEPARATION_M - d) * 0.5;
          px += ((x - z.x[o]) / d) * push;
          py += ((y - z.y[o]) / d) * push;
        } else {
          px += s < o ? -0.05 : 0.05;
        }
      }
      return ++seen >= ZOMBIE_MAX_NEIGHBOURS;
    });

    const moved = moveWithCollision(g, px, py, vx * TICK_DT, vy * TICK_DT);
    if (!moved.okX) vx = 0;
    if (!moved.okY) vy = 0;
    const from = g.cellAt(x, y);
    const to = g.cellAt(moved.x, moved.y);
    if (to !== from) {
      if (w.cellCount[to] >= ZOMBIE_MAX_PER_CELL) {
        // Cell full: stay put this tick.
        z.vx[s] = 0;
        z.vy[s] = 0;
        continue;
      }
      if (from >= 0) w.cellCount[from]--;
      w.cellCount[to]++;
    }
    z.x[s] = moved.x;
    z.y[s] = moved.y;
    z.vx[s] = vx;
    z.vy[s] = vy;
  }
}

function perceive(w: World, s: number, active: readonly Soldier[]): void {
  const z = w.zombies;
  const x = z.x[s];
  const y = z.y[s];
  let best: Soldier | undefined;
  let bestD = PERCEPTION2;
  for (const sol of active) {
    const d = dist2(x, y, sol.x, sol.y);
    if (d < bestD && w.grid.lineOfSight(x, y, sol.x, sol.y)) {
      bestD = d;
      best = sol;
    }
  }
  if (best) {
    z.target[s] = best.id;
    if (z.state[s] === ZombieState.Wandering) z.state[s] = ZombieState.Chasing;
    return;
  }
  if (z.state[s] === ZombieState.Wandering) {
    const c = w.grid.cellAt(x, y);
    if (c >= 0 && w.grid.noise[c] >= NOISE_CHASE_THRESHOLD) z.state[s] = ZombieState.Chasing;
  }
}

function attack(w: World, s: number, victim: Soldier): void {
  const z = w.zombies;
  const stats = ZOMBIES[z.kind[s]];
  z.attackCd[s] = ATTACK_CD_TICKS;
  victim.hp -= stats.damage;
  w.emit({ type: 'soldier_hit', source: s, target: victim.id, x: victim.x, y: victim.y, value: stats.damage });
  if (victim.hp <= 0) {
    killSoldier(w, victim, true);
  } else if (victim.condition === SoldierCondition.Ok && w.rng.chance(stats.biteChance)) {
    victim.condition = SoldierCondition.Bitten;
    victim.turnAt = w.tick + w.rng.int(BITE_TURN_MIN_S * TICK_HZ, BITE_TURN_MAX_S * TICK_HZ);
    w.emit({ type: 'soldier_bitten', source: s, target: victim.id, x: victim.x, y: victim.y });
  }
}

function nearest(list: readonly Soldier[], x: number, y: number): Soldier | undefined {
  let best: Soldier | undefined;
  let bd = Infinity;
  for (const s of list) {
    const d = dist2(x, y, s.x, s.y);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

function nearestWithin(list: readonly Soldier[], x: number, y: number, r: number): Soldier | undefined {
  const n = nearest(list, x, y);
  return n && dist2(x, y, n.x, n.y) <= r * r ? n : undefined;
}

function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function unit(dx: number, dy: number): [number, number] {
  const d = Math.sqrt(dx * dx + dy * dy);
  return d > 1e-6 ? [dx / d, dy / d] : [0, 0];
}
