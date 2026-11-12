import { Ground, PRESENTATION, type MapInfo } from '@vazante/shared';

/** Zebra crossings from sidewalk corners, only where the full road reaches another sidewalk. */
export function planCrossings(map: MapInfo): Uint8Array {
  const marks = new Uint8Array(map.width * map.height);
  const ground = (x: number, y: number) => x < 0 || y < 0 || x >= map.width || y >= map.height ? -1 : map.ground[y * map.width + x];
  for (let y = 1; y < map.height - 1; y++) for (let x = 1; x < map.width - 1; x++) {
    if (ground(x, y) !== Ground.Sidewalk) continue;
    const ns = ground(x, y - 1) === Ground.Street || ground(x, y + 1) === Ground.Street;
    const ew = ground(x - 1, y) === Ground.Street || ground(x + 1, y) === Ground.Street;
    if (!ns || !ew) continue;
    for (const [dx, dy, bit] of [[1, 0, 1], [-1, 0, 1], [0, 1, 2], [0, -1, 2]]) {
      const cells: number[] = [];
      for (let step = 1; step <= PRESENTATION.street.crossingMaxCells; step++) {
        const cx = x + dx * step, cy = y + dy * step;
        const g = ground(cx, cy);
        if (g === Ground.Sidewalk && cells.length > 0) {
          for (const c of cells) marks[c] |= bit;
          break;
        }
        if (g !== Ground.Street) break;
        cells.push(cy * map.width + cx);
      }
    }
  }
  return marks;
}

/** Larger neighbourhood patches share tree density, height and foliage colour. */
export function vegetationStyle(map: MapInfo, x: number, y: number): number {
  const district = map.districts.find(d => x >= d.x0 && x <= d.x1 && y >= d.y0 && y <= d.y1);
  return ((district?.id ?? 0) + map.seed) % PRESENTATION.street.foliage.length;
}

