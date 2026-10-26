import type { Grid } from '../grid.ts';

const RADIUS = 0.3;

export interface MoveResult {
  x: number;
  y: number;
  okX: boolean;
  okY: boolean;
}

const SOLDIER = -2;

/**
 * Axis-separated move. Soldiers use plain walkability; zombies pass `zombieFrom` (their current cell)
 * so they can climb piled-up structures and keep moving while inside one.
 */
export function moveWithCollision(grid: Grid, x: number, y: number, dx: number, dy: number, zombieFrom = SOLDIER): MoveResult {
  return moveWithCollisionInto({ x: 0, y: 0, okX: true, okY: true }, grid, x, y, dx, dy, zombieFrom);
}

/** Same as moveWithCollision, writing into `out` (no allocation; the horde calls it per zombie per tick). */
export function moveWithCollisionInto(out: MoveResult, grid: Grid, x: number, y: number, dx: number, dy: number, zombieFrom = SOLDIER): MoveResult {
  const maxX = grid.widthM - RADIUS;
  const maxY = grid.heightM - RADIUS;
  let okX = true;
  let okY = true;
  let nx = clamp(x + dx, RADIUS, maxX);
  const probeX = nx + (dx > 0 ? RADIUS : dx < 0 ? -RADIUS : 0);
  if (dx !== 0 && !passable(grid, grid.cellAt(probeX, y), zombieFrom)) {
    nx = x;
    okX = false;
  }
  let ny = clamp(y + dy, RADIUS, maxY);
  const probeY = ny + (dy > 0 ? RADIUS : dy < 0 ? -RADIUS : 0);
  if (dy !== 0 && !passable(grid, grid.cellAt(nx, probeY), zombieFrom)) {
    ny = y;
    okY = false;
  }
  out.x = nx;
  out.y = ny;
  out.okX = okX;
  out.okY = okY;
  return out;
}

function passable(grid: Grid, c: number, zombieFrom: number): boolean {
  return zombieFrom === SOLDIER ? grid.isWalkable(c) : grid.zombieCanEnter(c, zombieFrom);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
