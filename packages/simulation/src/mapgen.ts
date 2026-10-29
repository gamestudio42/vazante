import { Rng } from '@vazante/kernel';
import { Ground, type BuildingRect, type DistrictInfo, type SiteInfo, type SiteRole } from '@vazante/shared';
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
    { kind: 'base', name: 'Posto Âncora', role: 'command', ...base },
    { kind: 'depot', name: 'Depósito Norte', role: 'supply', ...depot },
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

const CITY_DISTRICTS = ['Cais Velho', 'Alto da Sé', 'Vila Operária', 'Ribeira', 'Centro', 'Porto Novo'];

/**
 * Porto Velário, the v0.5 city: 512 x 512 cells (2 km). A bay along the south edge, a river running
 * down from the north into it (streets cross it as bridges), wide avenues every few streets, six
 * districts in a 3 x 2 layout, the base on the waterfront and three depots inland.
 */
export function generateCityMap(seed: number, size = 512): GeneratedMap {
  const rng = new Rng(seed ^ 0xc17e);
  const grid = new Grid(size, size);

  // Coast: the land ends at a wavy line near the bottom.
  const coast = new Int32Array(size);
  let c = size - 34;
  for (let x = 0; x < size; x++) {
    c += rng.int(-1, 1);
    c = Math.max(size - 44, Math.min(size - 26, c));
    coast[x] = c;
  }
  // River: a meandering channel from the top edge down to the coast.
  const riverX = new Int32Array(size);
  const riverW = new Int32Array(size);
  let rx = Math.floor(size * 0.38) + rng.int(-20, 20);
  let drift = 0;
  for (let y = 0; y < size; y++) {
    if (y % 24 === 0) drift = rng.int(-1, 1);
    if (y % 3 === 0) rx += drift;
    rx = Math.max(size >> 2, Math.min((size * 3) >> 2, rx));
    riverX[y] = rx;
    riverW[y] = 5 + ((y >> 5) % 3);
  }

  const vertical = cityStreetLines(rng, size);
  const horizontal = cityStreetLines(rng, size);
  const isStreetX = new Uint8Array(size);
  const isStreetY = new Uint8Array(size);
  for (const [start, w] of vertical) for (let i = start; i < start + w && i < size; i++) isStreetX[i] = 1;
  for (const [start, w] of horizontal) for (let i = start; i < start + w && i < size; i++) isStreetY[i] = 1;

  const isWater = (x: number, y: number) => y > coast[x] || (x >= riverX[y] && x < riverX[y] + riverW[y]);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = grid.idx(x, y);
      const street = isStreetX[x] || isStreetY[y];
      // Streets cross the river as bridges, but never run into the bay.
      if (y > coast[x]) grid.ground[i] = Ground.Water;
      else if (street) grid.ground[i] = Ground.Street;
      else if (isWater(x, y)) grid.ground[i] = Ground.Water;
      else if (isStreetX[x - 1] || isStreetX[x + 1] || isStreetY[y - 1] || isStreetY[y + 1]) grid.ground[i] = Ground.Sidewalk;
      else grid.ground[i] = Ground.Lot;
    }
  }
  // A waterfront quay along the coast so the whole shore is walkable.
  for (let x = 0; x < size; x++) {
    for (let y = coast[x] - 2; y <= coast[x]; y++) if (y >= 0 && grid.ground[grid.idx(x, y)] !== Ground.Water) grid.ground[grid.idx(x, y)] = Ground.Sidewalk;
  }

  const midX = Math.floor(size / 2);
  const base: Rect = { x0: midX - 12, y0: size - 70, x1: midX + 11, y1: size - 47 };
  const depots: Array<[string, SiteRole, Rect]> = [
    ['Depósito Norte', 'supply', { x0: size - 60, y0: 10, x1: size - 43, y1: 27 }],
    ['Hospital São Lucas', 'hospital', { x0: 14, y0: 60, x1: 31, y1: 77 }],
    ['Estação Ferroviária', 'station', { x0: size - 90, y0: Math.floor(size * 0.55), x1: size - 73, y1: Math.floor(size * 0.55) + 17 }],
  ];
  const reserved = [base, ...depots.map(([, , r]) => r)];
  for (const r of reserved) {
    for (let y = r.y0; y <= r.y1; y++) {
      for (let x = r.x0; x <= r.x1; x++) {
        const i = grid.idx(x, y);
        if (grid.ground[i] === Ground.Water) grid.ground[i] = Ground.Lot;
      }
    }
  }

  const xs = blockRuns(isStreetX, size);
  const ys = blockRuns(isStreetY, size);
  const buildings: BuildingRect[] = [];
  for (const [by0, by1] of ys) {
    for (const [bx0, bx1] of xs) {
      const block: Rect = { x0: bx0, y0: by0, x1: bx1, y1: by1 };
      if (reserved.some((r) => overlaps(block, r))) continue;
      // Taller towers downtown, low houses towards the edges.
      const cx = (bx0 + bx1) / 2 / size - 0.5;
      const cy = (by0 + by1) / 2 / size - 0.5;
      const centre = 1 - Math.min(1, Math.sqrt(cx * cx + cy * cy) * 2);
      if (rng.chance(0.08)) {
        fillLand(grid, block, Ground.Park);
        continue;
      }
      subdivide(rng, block, (lot) => {
        if (!rng.chance(0.78)) return;
        for (let y = lot.y0; y <= lot.y1; y++) for (let x = lot.x0; x <= lot.x1; x++) if (grid.ground[grid.idx(x, y)] !== Ground.Lot) return;
        const id = buildings.length + 1;
        const floors = rng.int(1, 3 + Math.round(centre * 14));
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

  const third = Math.floor(size / 3);
  const half = size >> 1;
  const districts: DistrictInfo[] = [];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const id = districts.length + 1;
      districts.push({ id, name: CITY_DISTRICTS[id - 1], x0: col * third, y0: row * half, x1: col === 2 ? size - 1 : (col + 1) * third - 1, y1: row === 1 ? size - 1 : half - 1 });
    }
  }
  for (const d of districts) {
    for (let y = d.y0; y <= d.y1; y++) for (let x = d.x0; x <= d.x1; x++) grid.district[grid.idx(x, y)] = d.id;
  }

  const sites: SiteInfo[] = [{ kind: 'base', name: 'Posto Âncora', role: 'command', ...base }, ...depots.map(([name, role, r]) => ({ kind: 'depot' as const, name, role, ...r }))];
  return { grid, buildings, districts, sites };
}

/** Like `streetLines`, with an avenue (4 cells) every fourth street. */
function cityStreetLines(rng: Rng, size: number): Array<[number, number]> {
  const lines: Array<[number, number]> = [[1, 3]];
  let x = 4;
  for (let n = 1; ; n++) {
    x += rng.int(12, 18);
    const w = n % 4 === 0 ? 4 : rng.int(2, 3);
    if (x + w >= size - 4) break;
    lines.push([x, w]);
    x += w;
  }
  lines.push([size - 3, 2]);
  return lines;
}

function fillLand(grid: Grid, r: Rect, g: Ground): void {
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      const i = grid.idx(x, y);
      if (grid.ground[i] === Ground.Lot) grid.ground[i] = g;
    }
  }
}
