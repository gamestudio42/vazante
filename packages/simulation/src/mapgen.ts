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
 * How far each strategic point lies from the base centre, in cells: about where they stood on the
 * first fixed map, so every seed plays at a similar scale.
 */
const SITE_RANGE: Record<Exclude<SiteRole, 'command'>, [number, number]> = {
  supply: [360, 500],
  hospital: [330, 480],
  station: [170, 300],
};

/** Least distance between two depots (cells; 150 = 600 m), loosened in steps when a seed cannot fit it. */
const SITE_GAP = [150, 125, 100] as const;
/** Two depots must lie at least 35 degrees apart as seen from the base (cos 35° ≈ 0.819). */
const SITE_MIN_ANGLE_COS = 0.819;

/**
 * Porto Velário, the v0.5 city: 512 x 512 cells (2 km). A bay along the south edge, a river running
 * down from the north into it (streets cross it as bridges), wide avenues every few streets, six
 * districts in a 3 x 2 layout, the base on the waterfront and three depots inland. Each seed moves
 * the river, the base along the shore and the depots (each in its own district, away from the
 * base's), and changes the block sizes, the avenue rhythm and how many blocks are parks.
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
  let rx = Math.floor(size * rng.range(0.22, 0.78));
  let drift = 0;
  const bend = rng.int(16, 32);
  for (let y = 0; y < size; y++) {
    if (y % bend === 0) drift = rng.int(-1, 1);
    if (y % 3 === 0) rx += drift;
    rx = Math.max(size >> 2, Math.min((size * 3) >> 2, rx));
    riverX[y] = rx;
    riverW[y] = 5 + ((y >> 5) % 3);
  }

  const style: CityStyle = { minBlock: rng.int(10, 14), spread: rng.int(4, 9), avenueEvery: rng.int(3, 5), parks: rng.range(0.05, 0.14) };
  const vertical = cityStreetLines(rng, size, style);
  const horizontal = cityStreetLines(rng, size, style);
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

  const third = Math.floor(size / 3);
  const half = size >> 1;
  const districtOf = (x: number, y: number) => Math.min(2, Math.floor(x / third)) + (y < half ? 0 : 3);
  // Clear of the river by a few cells on every row the rectangle covers.
  const dry = (r: Rect) => {
    for (let y = r.y0; y <= r.y1; y++) if (r.x1 >= riverX[y] - 4 && r.x0 <= riverX[y] + riverW[y] + 4) return false;
    return true;
  };
  // The base sits on the waterfront, somewhere along the middle half of the shore.
  const midX = Math.floor(size / 2);
  let base: Rect = { x0: midX - 12, y0: size - 70, x1: midX + 11, y1: size - 47 };
  for (let i = 0; i < 200; i++) {
    const x0 = rng.int(size >> 2, ((size * 3) >> 2) - 24);
    const r = { x0, y0: size - 70, x1: x0 + 23, y1: size - 47 };
    if (dry(r)) {
      base = r;
      break;
    }
  }
  const roles = [['Depósito Norte', 'supply'], ['Hospital São Lucas', 'hospital'], ['Estação Ferroviária', 'station']] as const;
  // Try the full spacing first, then a little looser; a seed where nothing fits gets the old fixed layout.
  let depots: Array<[string, SiteRole, Rect]> | null = null;
  for (const gap of SITE_GAP) {
    depots = placeSites(rng, size, roles, base, gap, districtOf, dry);
    if (depots) break;
  }
  if (!depots) {
    base = { x0: midX - 12, y0: size - 70, x1: midX + 11, y1: size - 47 };
    depots = [
      ['Depósito Norte', 'supply', { x0: size - 60, y0: 10, x1: size - 43, y1: 27 }],
      ['Hospital São Lucas', 'hospital', { x0: 14, y0: 60, x1: 31, y1: 77 }],
      ['Estação Ferroviária', 'station', { x0: size - 90, y0: Math.floor(size * 0.55), x1: size - 73, y1: Math.floor(size * 0.55) + 17 }],
    ];
  }
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
      if (rng.chance(style.parks)) {
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

/**
 * The three depots for one try: each at its SITE_RANGE from the base, in a district of its own, at
 * least `gap` cells from the others and at least SITE_MIN_ANGLE_COS apart in bearing from the base,
 * so each pulls towards its own side of the city. Null when some depot finds no place.
 */
function placeSites(
  rng: Rng,
  size: number,
  roles: ReadonlyArray<readonly [string, Exclude<SiteRole, 'command'>]>,
  base: Rect,
  gap: number,
  districtOf: (x: number, y: number) => number,
  dry: (r: Rect) => boolean,
): Array<[string, SiteRole, Rect]> | null {
  const bcx = (base.x0 + base.x1) / 2;
  const bcy = (base.y0 + base.y1) / 2;
  const used = [districtOf(bcx, bcy)];
  const out: Array<[string, SiteRole, Rect]> = [];
  for (const [name, role] of roles) {
    const [near, far] = SITE_RANGE[role];
    let pick: Rect | null = null;
    for (let i = 0; i < 2000 && !pick; i++) {
      const x0 = rng.int(8, size - 26);
      const y0 = rng.int(8, size - 100);
      const r = { x0, y0, x1: x0 + 17, y1: y0 + 17 };
      const dx = x0 + 8.5 - bcx;
      const dy = y0 + 8.5 - bcy;
      const d2 = dx * dx + dy * dy;
      if (d2 < near * near || d2 > far * far || used.includes(districtOf(bcx + dx, bcy + dy)) || !dry(r)) continue;
      const clash = out.some(([, , o]) => {
        const ox = (o.x0 + o.x1) / 2 - bcx;
        const oy = (o.y0 + o.y1) / 2 - bcy;
        if ((ox - dx) * (ox - dx) + (oy - dy) * (oy - dy) < gap * gap) return true;
        return (ox * dx + oy * dy) / Math.sqrt((ox * ox + oy * oy) * d2) > SITE_MIN_ANGLE_COS;
      });
      if (!clash) pick = r;
    }
    if (!pick) return null;
    used.push(districtOf((pick.x0 + pick.x1) / 2, (pick.y0 + pick.y1) / 2));
    out.push([name, role, pick]);
  }
  return out;
}

/** Per-seed look of the city: block length range (cells), avenue rhythm and park share. */
interface CityStyle {
  minBlock: number;
  spread: number;
  avenueEvery: number;
  parks: number;
}

/** Like `streetLines`, with an avenue (4 cells) every few streets. */
function cityStreetLines(rng: Rng, size: number, style: CityStyle): Array<[number, number]> {
  const lines: Array<[number, number]> = [[1, 3]];
  let x = 4;
  for (let n = 1; ; n++) {
    x += rng.int(style.minBlock, style.minBlock + style.spread);
    const w = n % style.avenueEvery === 0 ? 4 : rng.int(2, 3);
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
