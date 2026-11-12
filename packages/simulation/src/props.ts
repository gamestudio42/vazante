import { Blocked, CELL_SIZE, COLLISION, Ground, type StaticProp, type SiteInfo } from '@vazante/shared';
import type { Grid } from './grid.ts';

/** Reserve solid set dressing on lots only, keeping roads and the central deployment cross open. */
export function placeStaticProps(grid: Grid, sites: readonly SiteInfo[]): StaticProp[] {
  const out: StaticProp[] = [];
  if (sites.length === 0) return out;
  for (const site of sites) {
    const mx = (site.x0 + site.x1 + 1) * CELL_SIZE / 2;
    const my = (site.y0 + site.y1 + 1) * CELL_SIZE / 2;
    let tents = 0;
    let containers = 0;
    let tank = false;
    for (let cy = site.y0 + 1; cy < site.y1; cy += 2) {
      for (let cx = site.x0 + 1; cx < site.x1 - 1; cx += 3) {
        const x = (cx + 1) * CELL_SIZE;
        const y = (cy + 0.5) * CELL_SIZE;
        if (Math.abs(x - mx) < COLLISION.siteClearance || Math.abs(y - my) < COLLISION.siteClearance) continue;
        // The initial truck at the base parks twelve metres south-east of its centre.
        if (site.kind === 'base' && Math.abs(x - mx - 12) < 8 && Math.abs(y - my - 12) < 8) continue;
        const cells = [grid.idx(cx, cy), grid.idx(cx + 1, cy)];
        if (cells.some(c => grid.ground[c] !== Ground.Lot || grid.blocked[c] !== 0)) continue;
        const kind: StaticProp['kind'] = site.kind === 'base' && !tank ? 'Tank'
          : containers < (site.kind === 'base' ? 3 : 5) ? 'Container_Long' : 'Tent';
        if (kind === 'Tent' && (site.kind !== 'base' || tents >= COLLISION.maxTents)) continue;
        for (const c of cells) grid.blocked[c] |= Blocked.Prop;
        out.push({ kind, x, y, yaw: 0, length: COLLISION.props[kind].length, width: COLLISION.props[kind].width });
        if (kind === 'Tank') tank = true;
        else if (kind === 'Container_Long') containers++;
        else tents++;
      }
    }
  }
  // Scan every vacant verge cell, along the street edge. Coarse sampling used to miss
  // nearly every two-cell parking space on the slice map.
  const cars: StaticProp[] = [];
  const carSectors = new Set<number>();
  for (let cy = 1; cy < grid.height - 2; cy++) for (let cx = 1; cx < grid.width - 2; cx++) {
    const key = (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) >>> 0;
    if (key % COLLISION.carCandidateModulo !== 0 || sites.some(s => cx >= s.x0 - 2 && cx <= s.x1 + 2 && cy >= s.y0 - 2 && cy <= s.y1 + 2)) continue;
    const sector = Math.floor(cy / COLLISION.carSectorCells) * grid.width + Math.floor(cx / COLLISION.carSectorCells);
    if (carSectors.has(sector)) continue;
    const cells = [grid.idx(cx, cy), grid.idx(cx + 1, cy)];
    if (cells.some(c => grid.ground[c] !== Ground.Lot || grid.blocked[c] !== 0)) continue;
    const verge = cells.some(c => [c - grid.width, c + grid.width].some(n => grid.ground[n] === Ground.Sidewalk || grid.ground[n] === Ground.Street));
    if (!verge) continue;
    const x = (cx + 1) * CELL_SIZE;
    const y = (cy + 0.5) * CELL_SIZE;
    if (cars.some(p => (p.x - x) ** 2 + (p.y - y) ** 2 < COLLISION.carSpacingM ** 2)) continue;
    cells.forEach(c => grid.blocked[c] |= Blocked.Prop);
    const size = COLLISION.props.Debris_BrokenCar;
    const car: StaticProp = { kind: 'Debris_BrokenCar', x, y, yaw: 0, length: size.length, width: size.width };
    out.push(car); cars.push(car); carSectors.add(sector);
  }
  // Move roadside dressing onto vacant lots so a narrow street never closes cosmetically.
  for (let cy = 1; cy < grid.height - 1; cy += 3) for (let cx = 1; cx < grid.width - 2; cx += 3) {
    const key = (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) >>> 0;
    if (key % 97 !== 0 || sites.some(s => cx >= s.x0 - 2 && cx <= s.x1 + 2 && cy >= s.y0 - 2 && cy <= s.y1 + 2)) continue;
    const kind: StaticProp['kind'] = key % 3 === 0 ? 'Debris_BrokenCar' : key % 3 === 1 ? 'Barrier_Large' : 'SackTrench';
    const size = COLLISION.props[kind];
    const cells = size.length > CELL_SIZE ? [grid.idx(cx, cy), grid.idx(cx + 1, cy)] : [grid.idx(cx, cy)];
    if (cells.some(c => grid.ground[c] !== Ground.Lot || grid.blocked[c] !== 0)) continue;
    cells.forEach(c => grid.blocked[c] |= Blocked.Prop);
    out.push({ kind, x: cx * CELL_SIZE + size.length / 2, y: (cy + 0.5) * CELL_SIZE, yaw: 0, length: size.length, width: size.width });
  }
  return out;
}
