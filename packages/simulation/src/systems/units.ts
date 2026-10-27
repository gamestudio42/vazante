import {
  COVER_INTERVAL_TICKS,
  COVER_SEARCH_CELLS,
  DIRECT_SPEED_FACTOR,
  DIR16_X,
  DIR16_Y,
  FORMATION_SPACING_M,
  SoldierActivity,
  TICK_DT,
  type Formation,
} from "@vazante/shared";
import type { Soldier, Squad } from "../entities.ts";
import { findPath } from "../navigation.ts";
import { isActiveSoldier, type World } from "../world.ts";
import { isCover, isObstacle } from "./morale.ts";
import { moveWithCollision } from "./movement.ts";

/** A panicking soldier runs from zombies this close, slightly faster than the squad walks. */
const PANIC_FLEE_M = 15;
const PANIC_SPEED_FACTOR = 1.2;

/** Anchor slows down while members lag farther than this behind their slots (metres). */
const LAG_SLOW_M = 4;
const ARRIVE_LAG_M = 1.5;
/** A move whose anchor ends a path farther than this from the goal plans another leg. */
const LEG_DONE_M = 8;
/** The squad of the soldier under direct control forms up this far behind him. */
const FOLLOW_BEHIND_M = 4;

export function stepUnits(w: World): void {
  for (const q of w.squads) stepSquad(w, q);
  if (w.directSoldier !== null) {
    const s = w.soldier(w.directSoldier);
    if (s && s.direct) stepDirect(w, s);
  }
}

/** Give a squad a move order with an A* path. Returns false (order unchanged) if there is no path. */
export function planMove(
  w: World,
  q: Squad,
  toX: number,
  toY: number,
): boolean {
  const goal = w.grid.cellAt(toX, toY);
  const cells = findPath(w.grid, w.grid.cellAt(q.ax, q.ay), goal);
  if (!cells) return false;
  const path: number[] = [];
  for (const c of cells)
    path.push(w.grid.cellCenterX(c), w.grid.cellCenterY(c));
  if (cells.length > 0 && cells[cells.length - 1] === goal) {
    path[path.length - 2] = toX;
    path[path.length - 1] = toY;
  }
  q.order = { kind: "move", to: { x: toX, y: toY } };
  q.path = path;
  q.pathIdx = 0;
  return true;
}

function replan(w: World, q: Squad): void {
  if (q.order.kind !== "move") return;
  const to = q.order.to;
  const cells = findPath(
    w.grid,
    w.grid.cellAt(q.ax, q.ay),
    w.grid.cellAt(to.x, to.y),
  );
  q.path = [];
  q.pathIdx = 0;
  if (!cells) {
    q.order = { kind: "hold", at: { x: q.ax, y: q.ay } };
    return;
  }
  for (const c of cells)
    q.path.push(w.grid.cellCenterX(c), w.grid.cellCenterY(c));
}

/**
 * Squads ordered together hold one shared formation facing (hx, hy). Slots go out by where each
 * squad stands now (left to right for a line, front to back for a column), so none crosses
 * through another; all of them take the first squad's formation.
 */
export function groupSquads(
  w: World,
  qs: Squad[],
  hx: number,
  hy: number,
): void {
  if (qs.length < 2) {
    for (const q of qs) q.slotBase = q.slotTotal = 0;
    return;
  }
  const f = qs[0].formation;
  const key = (q: Squad): number =>
    f === "column" ? -(q.ax * hx + q.ay * hy) : q.ay * hx - q.ax * hy;
  const sorted = [...qs].sort((a, b) => key(a) - key(b) || a.id - b.id);
  const sizes = sorted.map((q) => aiMembers(w, q).length);
  const total = sizes.reduce((a, b) => a + b, 0);
  let base = 0;
  sorted.forEach((q, k) => {
    q.formation = f;
    q.slotBase = base;
    q.slotTotal = total;
    base += sizes[k];
  });
}

/** The squad forms up behind the soldier under direct control, facing where he walks. */
function follow(w: World, q: Squad, s: Soldier): void {
  const inp = s.direct!;
  const m = Math.sqrt(inp.mx * inp.mx + inp.my * inp.my);
  if (m > 0.1) {
    q.hx = inp.mx / m;
    q.hy = inp.my / m;
  }
  const bx = s.x - q.hx * FOLLOW_BEHIND_M;
  const by = s.y - q.hy * FOLLOW_BEHIND_M;
  const behind = w.grid.isWalkableAt(bx, by);
  q.ax = behind ? bx : s.x;
  q.ay = behind ? by : s.y;
  // Holding where he is, so when control is handed back the squad stays put.
  q.order = { kind: "hold", at: { x: q.ax, y: q.ay } };
  q.path = [];
  q.pathIdx = 0;
  q.slotBase = q.slotTotal = 0;
  q.face = undefined;
  q.buildTask = 0;
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
  const leader =
    w.directSoldier !== null ? w.soldier(w.directSoldier) : undefined;
  const following =
    leader !== undefined &&
    leader.squad === q.id &&
    leader.direct !== null &&
    isActiveSoldier(leader);
  if (following) follow(w, q, leader);

  if (q.order.kind === "move" && q.pathIdx * 2 < q.path.length) {
    // A structure finished on the route: plan again from where the squad is.
    const next = w.grid.cellAt(
      q.path[q.pathIdx * 2],
      q.path[q.pathIdx * 2 + 1],
    );
    if (!w.grid.isWalkable(next)) replan(w, q);
  }

  if (q.order.kind === "move") {
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
    // Long trips across the city come back as partial paths (the search is capped): at the end
    // of one, plan the next leg from here. A leg that gains nothing means the goal is out of reach.
    if (
      q.pathIdx * 2 >= q.path.length &&
      q.order.kind === "move" &&
      dist2(q.ax, q.ay, q.order.to.x, q.order.to.y) > LEG_DONE_M * LEG_DONE_M
    ) {
      const before = dist2(q.ax, q.ay, q.order.to.x, q.order.to.y);
      replan(w, q);
      const end =
        q.path.length >= 2
          ? dist2(
              q.path[q.path.length - 2],
              q.path[q.path.length - 1],
              q.order.kind === "move" ? q.order.to.x : 0,
              q.order.kind === "move" ? q.order.to.y : 0,
            )
          : before;
      if (end >= before - 1) {
        q.path = [];
        q.pathIdx = 0;
      }
    }
    // Arrived when the members have caught up, or when none of them can move any closer.
    if (
      q.pathIdx * 2 >= q.path.length &&
      (lag < ARRIVE_LAG_M || members.every((s) => !s.moving))
    ) {
      q.order = { kind: "hold", at: { x: q.ax, y: q.ay } };
      if (q.face) {
        q.hx = q.face.x;
        q.hy = q.face.y;
        q.face = undefined;
      }
      q.path = [];
      q.pathIdx = 0;
      w.emit({ type: "squad_arrived", source: q.id, x: q.ax, y: q.ay });
    }
  }

  const seeksCover =
    !following &&
    q.order.kind === "hold" &&
    (q.stance === "hold" || q.stance === "defensive");
  // Keeping up with the leader takes his pace.
  const speed = following ? q.speed * DIRECT_SPEED_FACTOR : q.speed;
  if (!seeksCover) q.cover.length = 0;
  else if (
    q.cover.length !== members.length ||
    (w.tick + q.id) % COVER_INTERVAL_TICKS === 0
  )
    pickCover(w, q, members.length);

  for (let i = 0; i < members.length; i++) {
    const s = members[i];
    if (s.panicT > 0) {
      flee(w, q.speed * PANIC_SPEED_FACTOR, s);
      continue;
    }
    let [sx, sy] = slotPosition(w, q, i, members.length);
    const cov = seeksCover ? q.cover[i] : -1;
    if (cov >= 0) {
      sx = w.grid.cellCenterX(cov);
      sy = w.grid.cellCenterY(cov);
    }
    const dx = sx - s.x;
    const dy = sy - s.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const step = Math.min(d, speed * TICK_DT);
    if (d > 0.05) {
      const m = moveWithCollision(
        w.grid,
        s.x,
        s.y,
        (dx / d) * step,
        (dy / d) * step,
      );
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
    if (
      s.activity !== SoldierActivity.Reloading &&
      s.activity !== SoldierActivity.Engaging
    ) {
      s.activity = s.moving ? SoldierActivity.Moving : SoldierActivity.Idle;
    }
  }
}

/**
 * For each slot, the closest free cover cell within COVER_SEARCH_CELLS whose obstacle faces the
 * enemy (the squad heading), or -1 to stay on the slot.
 */
function pickCover(w: World, q: Squad, n: number): void {
  const g = w.grid;
  q.cover.length = 0;
  for (let i = 0; i < n; i++) {
    const [sx, sy] = slotPosition(w, q, i, n);
    const home = g.cellAt(sx, sy);
    let best = -1;
    let bestD = Infinity;
    if (home >= 0) {
      const hx = home % g.width;
      const hy = (home - hx) / g.width;
      const r = COVER_SEARCH_CELLS;
      for (let oy = -r; oy <= r; oy++) {
        for (let ox = -r; ox <= r; ox++) {
          if (!g.inBounds(hx + ox, hy + oy)) continue;
          const c = g.idx(hx + ox, hy + oy);
          if (!isCover(g, c) || !facesFront(w, q, c) || q.cover.includes(c))
            continue;
          const d = ox * ox + oy * oy;
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
      }
    }
    q.cover.push(best);
  }
}

/** The cell has an obstacle on the side the squad faces. */
function facesFront(w: World, q: Squad, cell: number): boolean {
  const g = w.grid;
  const cx = cell % g.width;
  const cy = (cell - cx) / g.width;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      if (ox * q.hx + oy * q.hy < 0.5 || !g.inBounds(cx + ox, cy + oy))
        continue;
      if (isObstacle(g, g.idx(cx + ox, cy + oy))) return true;
    }
  }
  return false;
}

/** Run straight away from the nearest zombie. */
function flee(w: World, speed: number, s: Soldier): void {
  let best = -1;
  let bd = Infinity;
  w.forZombiesNear(s.x, s.y, PANIC_FLEE_M, (slot, d2) => {
    if (d2 < bd && w.zombies.isAlive(slot)) {
      bd = d2;
      best = slot;
    }
  });
  s.activity = SoldierActivity.Moving;
  if (best < 0) {
    s.moving = false;
    return;
  }
  let dx = s.x - w.zombies.x[best];
  let dy = s.y - w.zombies.y[best];
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > 1e-6) {
    dx /= d;
    dy /= d;
  } else {
    dx = -s.fx;
    dy = -s.fy;
  }
  const m = moveWithCollision(
    w.grid,
    s.x,
    s.y,
    dx * speed * TICK_DT,
    dy * speed * TICK_DT,
  );
  s.moving = Math.abs(m.x - s.x) + Math.abs(m.y - s.y) > 0.01;
  s.x = m.x;
  s.y = m.y;
  s.fx = dx;
  s.fy = dy;
}

function stepDirect(w: World, s: Soldier): void {
  const inp = s.direct!;
  const q = w.squad(s.squad);
  const speed = (q ? q.speed : 3) * DIRECT_SPEED_FACTOR;
  const m = moveWithCollision(
    w.grid,
    s.x,
    s.y,
    inp.mx * speed * TICK_DT,
    inp.my * speed * TICK_DT,
  );
  s.moving = Math.abs(m.x - s.x) + Math.abs(m.y - s.y) > 0.01;
  s.x = m.x;
  s.y = m.y;
  if (inp.ax !== 0 || inp.ay !== 0) {
    s.fx = inp.ax;
    s.fy = inp.ay;
  }
}

/** Formation offset (forward, lateral) in metres for member i of n. */
export function formationOffset(
  f: Formation,
  i: number,
  n: number,
): [number, number] {
  const sp = FORMATION_SPACING_M;
  switch (f) {
    case "line":
      return [0, (i - (n - 1) / 2) * sp];
    case "column":
      return [-i * sp, 0];
    case "wedge": {
      if (i === 0) return [0, 0];
      const k = Math.ceil(i / 2);
      return [-k * sp, (i % 2 === 1 ? -1 : 1) * k * sp];
    }
    case "circle": {
      const r = Math.max(2, (sp * n) / 6.2832);
      const d = Math.round((i * 16) / n) % 16;
      return [DIR16_X[d] * r, DIR16_Y[d] * r];
    }
  }
}

/** World position of slot i; falls back to the anchor when the slot is inside a wall. */
export function slotPosition(
  w: World,
  q: Squad,
  i: number,
  n: number,
): [number, number] {
  // A group takes its shared slots once it has arrived; on the way each squad keeps its own.
  const base = q.slotBase ?? 0;
  const [fwd, lat] =
    q.slotTotal && q.order.kind !== "move"
      ? formationOffset(q.formation, base + i, Math.max(q.slotTotal, base + n))
      : formationOffset(q.formation, i, n);
  const x = q.ax + q.hx * fwd - q.hy * lat;
  const y = q.ay + q.hy * fwd + q.hx * lat;
  return w.grid.isWalkableAt(x, y) ? [x, y] : [q.ax, q.ay];
}

function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
