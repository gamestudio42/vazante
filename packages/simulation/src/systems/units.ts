import { DIR16_X, DIR16_Y, FORMATION_SPACING_M, SoldierActivity, TICK_DT, type Formation } from '@vazante/shared';
import type { Soldier, Squad } from '../entities.ts';
import { isActiveSoldier, type World } from '../world.ts';
import { moveWithCollision } from './movement.ts';

/** Anchor slows down while members lag farther than this behind their slots (metres). */
const LAG_SLOW_M = 4;
const ARRIVE_LAG_M = 1.5;

export function stepUnits(w: World): void {
  for (const q of w.squads) stepSquad(w, q);
  if (w.directSoldier !== null) {
    const s = w.soldier(w.directSoldier);
    if (s && s.direct) stepDirect(w, s);
  }
}

function aiMembers(w: World, q: Squad): Soldier[] {
  const out: Soldier[] = [];
  for (const id of q.members) {
    const s = w.soldier(id);
    if (s && isActiveSoldier(s) && !s.direct) out.push(s);
  }
  return out;
}

function stepSquad(w: World, q: Squad): void {
  const members = aiMembers(w, q);
  if (members.length === 0) return;

  if (q.order.kind === 'move') {
    let lag = 0;
    for (let i = 0; i < members.length; i++) {
      const [sx, sy] = slotPosition(w, q, i, members.length);
      lag += Math.sqrt(dist2(members[i].x, members[i].y, sx, sy));
    }
    lag /= members.length;
    let remaining = q.speed * (lag > LAG_SLOW_M ? 0.4 : 1) * TICK_DT;
    while (remaining > 0 && q.pathIdx * 2 < q.path.length) {
      const tx = q.path[q.pathIdx * 2];
      const ty = q.path[q.pathIdx * 2 + 1];
      const dx = tx - q.ax;
      const dy = ty - q.ay;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1e-6) {
        q.hx = dx / d;
        q.hy = dy / d;
      }
      if (d <= remaining) {
        q.ax = tx;
        q.ay = ty;
        remaining -= d;
        q.pathIdx++;
      } else {
        q.ax += (dx / d) * remaining;
        q.ay += (dy / d) * remaining;
        remaining = 0;
      }
    }
    if (q.pathIdx * 2 >= q.path.length && lag < ARRIVE_LAG_M) {
      q.order = { kind: 'hold', at: { x: q.ax, y: q.ay } };
      q.path = [];
      q.pathIdx = 0;
      w.emit({ type: 'squad_arrived', source: q.id, x: q.ax, y: q.ay });
    }
  }

  for (let i = 0; i < members.length; i++) {
    const s = members[i];
    const [sx, sy] = slotPosition(w, q, i, members.length);
    const dx = sx - s.x;
    const dy = sy - s.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const step = Math.min(d, q.speed * TICK_DT);
    if (d > 0.05) {
      const m = moveWithCollision(w.grid, s.x, s.y, (dx / d) * step, (dy / d) * step);
      s.moving = Math.abs(m.x - s.x) + Math.abs(m.y - s.y) > 0.01;
      s.x = m.x;
      s.y = m.y;
      if (s.moving && s.target < 0) {
        s.fx = dx / d;
        s.fy = dy / d;
      }
    } else {
      s.moving = false;
      if (s.target < 0) {
        s.fx = q.hx;
        s.fy = q.hy;
      }
    }
    if (s.activity !== SoldierActivity.Reloading && s.activity !== SoldierActivity.Engaging) {
      s.activity = s.moving ? SoldierActivity.Moving : SoldierActivity.Idle;
    }
  }
}

function stepDirect(w: World, s: Soldier): void {
  const inp = s.direct!;
  const q = w.squad(s.squad);
  const speed = q ? q.speed : 3;
  const m = moveWithCollision(w.grid, s.x, s.y, inp.mx * speed * TICK_DT, inp.my * speed * TICK_DT);
  s.moving = Math.abs(m.x - s.x) + Math.abs(m.y - s.y) > 0.01;
  s.x = m.x;
  s.y = m.y;
  if (inp.ax !== 0 || inp.ay !== 0) {
    s.fx = inp.ax;
    s.fy = inp.ay;
  }
}

/** Formation offset (forward, lateral) in metres for member i of n. */
export function formationOffset(f: Formation, i: number, n: number): [number, number] {
  const sp = FORMATION_SPACING_M;
  switch (f) {
    case 'line':
      return [0, (i - (n - 1) / 2) * sp];
    case 'column':
      return [-i * sp, 0];
    case 'wedge': {
      if (i === 0) return [0, 0];
      const k = Math.ceil(i / 2);
      return [-k * sp, (i % 2 === 1 ? -1 : 1) * k * sp];
    }
    case 'circle': {
      const r = Math.max(2, (sp * n) / 6.2832);
      const d = Math.round((i * 16) / n) % 16;
      return [DIR16_X[d] * r, DIR16_Y[d] * r];
    }
  }
}

/** World position of slot i; falls back to the anchor when the slot is inside a wall. */
export function slotPosition(w: World, q: Squad, i: number, n: number): [number, number] {
  const [fwd, lat] = formationOffset(q.formation, i, n);
  const x = q.ax + q.hx * fwd - q.hy * lat;
  const y = q.ay + q.hy * fwd + q.hx * lat;
  return w.grid.isWalkableAt(x, y) ? [x, y] : [q.ax, q.ay];
}

function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
