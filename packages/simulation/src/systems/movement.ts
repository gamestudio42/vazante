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
  const ok = (c: number) => (zombieFrom === SOLDIER ? grid.isWalkable(c) : grid.zombieCanEnter(c, zombieFrom));
  const maxX = grid.widthM - RADIUS;
  const maxY = grid.heightM - RADIUS;
  let okX = true;
  let okY = true;
  let nx = clamp(x + dx, RADIUS, maxX);
  const probeX = nx + (dx > 0 ? RADIUS : dx < 0 ? -RADIUS : 0);
  if (dx !== 0 && !ok(grid.cellAt(probeX, y))) {
    nx = x;
    okX = false;
  }
  let ny = clamp(y + dy, RADIUS, maxY);
  const probeY = ny + (dy > 0 ? RADIUS : dy < 0 ? -RADIUS : 0);
  if (dy !== 0 && !ok(grid.cellAt(nx, probeY))) {
    ny = y;
    okY = false;
  }
  return { x: nx, y: ny, okX, okY };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
