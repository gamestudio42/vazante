import { CELL_SIZE, COLLISION, SoldierCondition } from '@vazante/shared';
import type { Vehicle } from '../entities.ts';
import type { World } from '../world.ts';
import { moveWithCollision } from './movement.ts';

/** Penetration into the truck rectangle expanded by a soldier's collision radius. */
export function truckPenetration(v: Vehicle, x: number, y: number, centerX = v.x, centerY = v.y, hx = v.hx, hy = v.hy): number {
  const dx = x - centerX;
  const dy = y - centerY;
  const longitudinal = COLLISION.truckLength / 2 + COLLISION.soldierRadius - Math.abs(dx * hx + dy * hy);
  const lateral = COLLISION.truckWidth / 2 + COLLISION.soldierRadius - Math.abs(dx * hy - dy * hx);
  return Math.min(longitudinal, lateral);
}

/** Cell-centre routing reserves half a cell beyond the physical truck body for safe corners. */
export function soldierRouteCellFree(w: World, x: number, y: number): boolean {
  return w.grid.isWalkableAt(x, y) && w.vehicles.every(v => truckPenetration(v, x, y) <= -CELL_SIZE / 2);
}

/** Sweep small steps, sliding along trucks. A unit initially overlapping may move outwards. */
export function moveSoldier(w: World, x: number, y: number, dx: number, dy: number) {
  if (w.vehicles.length === 0) return moveWithCollision(w.grid, x, y, dx, dy);
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / COLLISION.sweepStep));
  let px = x;
  let py = y;
  for (let i = 0; i < steps; i++) {
    const next = moveWithCollision(w.grid, px, py, dx / steps, dy / steps);
    const clear = (nx: number, ny: number) => w.vehicles.every(v => {
      const penetration = truckPenetration(v, nx, ny);
      return penetration <= 0 || penetration < truckPenetration(v, px, py);
    });
    if (clear(next.x, py)) px = next.x;
    if (clear(px, next.y)) py = next.y;
  }
  return { x: px, y: py };
}

/** Moving trucks yield before entering an occupied soldier volume. */
export function truckWouldHitSoldier(w: World, v: Vehicle, nx: number, ny: number, oldHx = v.hx, oldHy = v.hy): boolean {
  const oldX = v.x;
  const oldY = v.y;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(nx - oldX), Math.abs(ny - oldY)) / COLLISION.sweepStep));
  for (const s of w.soldiers) {
    if (s.condition === SoldierCondition.Dead || s.condition === SoldierCondition.Turned) continue;
    const before = truckPenetration(v, s.x, s.y, oldX, oldY, oldHx, oldHy);
    for (let i = 1; i <= steps; i++) {
      const cx = oldX + (nx - oldX) * i / steps;
      const cy = oldY + (ny - oldY) * i / steps;
      const penetration = truckPenetration(v, s.x, s.y, cx, cy);
      if (penetration > 0 && penetration > before) return true;
    }
  }
  return false;
}
