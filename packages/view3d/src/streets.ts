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

/**
 * Where each street's dashed centre line runs. For a cell on a north-south street, `ns` holds
 * twice the street's centre x in cells (west edge + east edge, so a 3-cell street centres mid-cell);
 * `ew` does the same in y for east-west streets. -1 elsewhere, junctions included: there both runs
 * are longer than a street is wide.
 */
export function planCentreLines(map: MapInfo): { ns: Int16Array; ew: Int16Array } {
  const { width: w, height: h } = map;
  const maxW = PRESENTATION.street.centreLineMaxWidthCells;
  const street = (x: number, y: number) => map.ground[y * w + x] === Ground.Street;
  const x0 = new Int16Array(w * h), x1 = new Int16Array(w * h), y0 = new Int16Array(w * h), y1 = new Int16Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; ) {
    if (!street(x, y)) { x++; continue; }
    let e = x;
    while (e + 1 < w && street(e + 1, y)) e++;
    for (let i = x; i <= e; i++) { x0[y * w + i] = x; x1[y * w + i] = e; }
    x = e + 1;
  }
  for (let x = 0; x < w; x++) for (let y = 0; y < h; ) {
    if (!street(x, y)) { y++; continue; }
    let e = y;
    while (e + 1 < h && street(x, e + 1)) e++;
    for (let i = y; i <= e; i++) { y0[i * w + x] = y; y1[i * w + x] = e; }
    y = e + 1;
  }
  const ns = new Int16Array(w * h).fill(-1);
  const ew = new Int16Array(w * h).fill(-1);
  for (let c = 0; c < w * h; c++) {
    if (map.ground[c] !== Ground.Street) continue;
    const across = x1[c] - x0[c] + 1, along = y1[c] - y0[c] + 1;
    if (across >= 2 && across <= maxW && along > maxW) ns[c] = x0[c] + x1[c] + 1;
    const acrossY = y1[c] - y0[c] + 1, alongX = x1[c] - x0[c] + 1;
    if (acrossY >= 2 && acrossY <= maxW && alongX > maxW) ew[c] = y0[c] + y1[c] + 1;
  }
  return { ns, ew };
}
