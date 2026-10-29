import { CELL_SIZE, FOG } from '@vazante/shared';
import { isActiveSoldier, type World } from './world.ts';

/**
 * Mark in `out` (one byte per grid cell) every cell within sight of the player: active soldiers,
 * vehicles, built structures and the home base. Presentation only; the rules never read it.
 */
export function markVisible(w: World, out: Uint8Array): void {
  out.fill(0);
  const g = w.grid;
  const disc = (x: number, y: number, r: number) => {
    const cr = Math.ceil(r / CELL_SIZE);
    const cx = Math.floor(x / CELL_SIZE);
    const cy = Math.floor(y / CELL_SIZE);
    const r2 = (r / CELL_SIZE) * (r / CELL_SIZE);
    for (let dy = -cr; dy <= cr; dy++) {
      const yy = cy + dy;
      if (yy < 0 || yy >= g.height) continue;
      for (let dx = -cr; dx <= cr; dx++) {
        const xx = cx + dx;
        if (xx < 0 || xx >= g.width || dx * dx + dy * dy > r2) continue;
        out[yy * g.width + xx] = 1;
      }
    }
  };
  for (const s of w.soldiers) if (isActiveSoldier(s)) disc(s.x, s.y, s.weapon === 'dmr' ? FOG.marksmanM : FOG.soldierM);
  for (const v of w.vehicles) if (v.state !== 'destroyed') disc(v.x, v.y, FOG.vehicleM);
  for (const st of w.structures) if (st.built) disc(g.cellCenterX(st.cell), g.cellCenterY(st.cell), FOG.structureM);
  const m = Math.ceil(FOG.baseMarginM / CELL_SIZE);
  for (const b of w.bases) {
    if (b.kind !== 'base') continue;
    for (let y = Math.max(0, b.y0 - m); y <= Math.min(g.height - 1, b.y1 + m); y++)
      for (let x = Math.max(0, b.x0 - m); x <= Math.min(g.width - 1, b.x1 + m); x++) out[y * g.width + x] = 1;
  }
}
