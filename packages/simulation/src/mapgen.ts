import { Rng } from '@vazante/kernel';
import { Ground, type BuildingRect, type DistrictInfo, type SiteInfo } from '@vazante/shared';
import { Grid } from './grid.ts';

export interface GeneratedMap {
  grid: Grid;
  buildings: BuildingRect[];
  districts: DistrictInfo[];
  sites: SiteInfo[];
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const DISTRICT_NAMES = ['Cais Velho', 'Alto da Sé', 'Vila Operária', 'Ribeira'];

/**
 * Vertical-slice map: 128 x 128 cells (512 m), a street grid with jitter, blocks of buildings,
 * four quadrant districts, the base (south-west) and the supply depot (north-east).
 */
export function generateSliceMap(seed: number, size = 128): GeneratedMap {
  const rng = new Rng(seed ^ 0x5eed);
  const grid = new Grid(size, size);
  const base: Rect = { x0: 6, y0: size - 30, x1: 29, y1: size - 7 };
  const depot: Rect = { x0: size - 26, y0: 6, x1: size - 9, y1: 23 };

  const vertical = streetLines(rng, size);
  const horizontal = streetLines(rng, size);
  const isStreetX = new Uint8Array(size);
  const isStreetY = new Uint8Array(size);
  for (const [start, w] of vertical) for (let i = start; i < start + w && i < size; i++) isStreetX[i] = 1;
  for (const [start, w] of horizontal) for (let i = start; i < start + w && i < size; i++) isStreetY[i] = 1;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = grid.idx(x, y);
      if (isStreetX[x] || isStreetY[y]) grid.ground[i] = Ground.Street;
      else if (isStreetX[x - 1] || isStreetX[x + 1] || isStreetY[y - 1] || isStreetY[y + 1]) grid.ground[i] = Ground.Sidewalk;
      else grid.ground[i] = Ground.Lot;
    }
  }

  // Blocks are the runs between streets (sidewalk excluded).
  const xs = blockRuns(isStreetX, size);
  const ys = blockRuns(isStreetY, size);
  const buildings: BuildingRect[] = [];
  for (const [by0, by1] of ys) {
    for (const [bx0, bx1] of xs) {
      const block: Rect = { x0: bx0, y0: by0, x1: bx1, y1: by1 };
      if (overlaps(block, base) || overlaps(block, depot)) continue;
      if (rng.chance(0.1)) {
        fill(grid, block, Ground.Park);
        continue;
      }
      subdivide(rng, block, (lot) => {
        if (!rng.chance(0.8)) return;
        const id = buildings.length + 1;
        const floors = rng.int(2, 10);
        const h = floors * 3;
        buildings.push({ id, ...lot, height: h });
        for (let y = lot.y0; y <= lot.y1; y++) {
          for (let x = lot.x0; x <= lot.x1; x++) {
            const i = grid.idx(x, y);
            grid.ground[i] = Ground.Building;
            grid.buildingId[i] = id;
            grid.heights[i] = h;
          }
        }
      });
    }
  }

  const half = size >> 1;
  const districts: DistrictInfo[] = [
    { id: 1, name: DISTRICT_NAMES[0], x0: 0, y0: 0, x1: half - 1, y1: half - 1 },
    { id: 2, name: DISTRICT_NAMES[1], x0: half, y0: 0, x1: size - 1, y1: half - 1 },
    { id: 3, name: DISTRICT_NAMES[2], x0: 0, y0: half, x1: half - 1, y1: size - 1 },
    { id: 4, name: DISTRICT_NAMES[3], x0: half, y0: half, x1: size - 1, y1: size - 1 },
  ];
  for (const d of districts) {
    for (let y = d.y0; y <= d.y1; y++) for (let x = d.x0; x <= d.x1; x++) grid.district[grid.idx(x, y)] = d.id;
  }

  const sites: SiteInfo[] = [
    { kind: 'base', name: 'Posto Âncora', ...base },
    { kind: 'depot', name: 'Depósito Norte', ...depot },
  ];
  return { grid, buildings, districts, sites };
}

/** Street lines as [start, width], always one at both map edges so the network is connected. */
function streetLines(rng: Rng, size: number): Array<[number, number]> {
  const lines: Array<[number, number]> = [[1, 2]];
  let x = 3;
  for (;;) {
    x += rng.int(12, 18);
    const w = rng.int(2, 3);
    if (x + w >= size - 4) break;
    lines.push([x, w]);
    x += w;
  }
  lines.push([size - 3, 2]);
  return lines;
}

/** Runs of non-street indices, shrunk by one for the sidewalk. */
function blockRuns(isStreet: Uint8Array, size: number): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  let start = -1;
  for (let i = 0; i <= size; i++) {
    const street = i === size || isStreet[i] === 1;
    if (!street && start < 0) start = i;
    if (street && start >= 0) {
      const a = start + 1;
      const b = i - 2;
      if (b - a >= 2) runs.push([a, b]);
      start = -1;
    }
  }
  return runs;
}

/** Split a block into lots of 3 to 7 cells with a one-cell alley gap on some sides. */
function subdivide(rng: Rng, block: Rect, place: (lot: Rect) => void): void {
  for (let y = block.y0; y <= block.y1; ) {
    const h = Math.min(rng.int(3, 7), block.y1 - y + 1);
    for (let x = block.x0; x <= block.x1; ) {
      const w = Math.min(rng.int(3, 7), block.x1 - x + 1);
      const gapX = rng.chance(0.35) ? 1 : 0;
      const gapY = rng.chance(0.35) ? 1 : 0;
      const lot: Rect = { x0: x, y0: y, x1: x + w - 1 - gapX, y1: y + h - 1 - gapY };
      if (lot.x1 >= lot.x0 && lot.y1 >= lot.y0) place(lot);
      x += w;
    }
    y += h;
  }
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;
}

function fill(grid: Grid, r: Rect, g: Ground): void {
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) grid.ground[grid.idx(x, y)] = g;
}
