import type { Grid } from './grid.ts';
import { MinHeap } from './heap.ts';

/** 8 neighbours: dx, dy, cost (10 orthogonal, 14 diagonal). Fixed order for determinism. */
export const NEIGHBOURS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 10],
  [-1, 0, 10],
  [0, 1, 10],
  [0, -1, 10],
  [1, 1, 14],
  [-1, 1, 14],
  [1, -1, 14],
  [-1, -1, 14],
];

export const FLOW_UNREACHABLE = 65535;

/** Can a mover step from (cx, cy) by (dx, dy)? Diagonals may not cut corners. */
export function canStep(grid: Grid, cx: number, cy: number, dx: number, dy: number): boolean {
  const nx = cx + dx;
  const ny = cy + dy;
  if (!grid.inBounds(nx, ny) || !grid.isWalkable(grid.idx(nx, ny))) return false;
  if (dx !== 0 && dy !== 0) {
    return grid.isWalkable(grid.idx(cx + dx, cy)) && grid.isWalkable(grid.idx(cx, cy + dy));
  }
  return true;
}

/** canStep with a custom passability test (vehicles: streets and sites only). */
export function canStepWith(grid: Grid, cx: number, cy: number, dx: number, dy: number, ok: (cell: number) => boolean): boolean {
  const nx = cx + dx;
  const ny = cy + dy;
  if (!grid.inBounds(nx, ny) || !ok(grid.idx(nx, ny))) return false;
  if (dx !== 0 && dy !== 0) return ok(grid.idx(cx + dx, cy)) && ok(grid.idx(cx, cy + dy));
  return true;
}

export interface PathOptions {
  maxExpanded?: number;
  passable?: (cell: number) => boolean;
  /** Extra cost to enter a cell (10 = one cell). */
  extraCost?: (cell: number) => number;
}

const heap = new MinHeap();

/**
 * A* on the cell grid with an octile heuristic. Returns the cell path from start (exclusive) to goal (inclusive),
 * or null. If the goal is not walkable, the nearest walkable cell to it found during search is used.
 */
export function findPath(grid: Grid, start: number, goal: number, opts: PathOptions | number = {}): number[] | null {
  if (start < 0 || goal < 0) return null;
  const o = typeof opts === 'number' ? { maxExpanded: opts } : opts;
  const maxExpanded = o.maxExpanded ?? 20000;
  const passable = o.passable;
  const extra = o.extraCost;
  const w = grid.width;
  const gx = goal % w;
  const gy = Math.floor(goal / w);
  const g = new Map<number, number>();
  const came = new Map<number, number>();
  heap.clear();
  g.set(start, 0);
  heap.push(h(start % w, Math.floor(start / w), gx, gy), start);
  let best = start;
  let bestH = h(start % w, Math.floor(start / w), gx, gy);
  let expanded = 0;
  while (heap.size > 0 && expanded < maxExpanded) {
    const cur = heap.pop();
    if (cur === goal) {
      best = goal;
      break;
    }
    expanded++;
    const cx = cur % w;
    const cy = Math.floor(cur / w);
    const cg = g.get(cur)!;
    const ch = h(cx, cy, gx, gy);
    if (ch < bestH) {
      bestH = ch;
      best = cur;
    }
    for (const [dx, dy, cost] of NEIGHBOURS) {
      if (passable ? !canStepWith(grid, cx, cy, dx, dy, passable) : !canStep(grid, cx, cy, dx, dy)) continue;
      const n = cur + dy * w + dx;
      const ng = cg + cost + (extra ? extra(n) : 0);
      const old = g.get(n);
      if (old !== undefined && old <= ng) continue;
      g.set(n, ng);
      came.set(n, cur);
      heap.push(ng + h(cx + dx, cy + dy, gx, gy), n);
    }
  }
  if (best === start) return start === goal ? [] : null;
  const path: number[] = [];
  for (let c = best; c !== start; c = came.get(c)!) path.push(c);
  path.reverse();
  return path;
}

function h(x: number, y: number, gx: number, gy: number): number {
  const dx = Math.abs(x - gx);
  const dy = Math.abs(y - gy);
  return 10 * (dx + dy) - 6 * Math.min(dx, dy);
}

/**
 * Can a zombie flow step from (cx, cy) by (dx, dy)? Structures are allowed (at a cost);
 * diagonals need both orthogonal cells free so the horde does not cut wall corners.
 */
export function zombieCanStep(grid: Grid, cx: number, cy: number, dx: number, dy: number): boolean {
  const nx = cx + dx;
  const ny = cy + dy;
  if (!grid.inBounds(nx, ny) || grid.zombieCost(grid.idx(nx, ny), 1) < 0) return false;
  if (dx !== 0 && dy !== 0) {
    return grid.zombieCost(grid.idx(cx + dx, cy), 1) === 0 && grid.zombieCost(grid.idx(cx, cy + dy), 1) === 0;
  }
  return true;
}

// Scratch buffers for the flow field, grown on demand and reused across calls.
let costBuf = new Int16Array(0);
let openBuf = new Uint8Array(0);
const BUCKETS = 256; // > largest step cost (14 + structure penalty), so the ring never laps itself
const bucketCells: Int32Array[] = Array.from({ length: BUCKETS }, () => new Int32Array(64));
const bucketLen = new Int32Array(BUCKETS);

let pending = 0;
let flowRef: Uint16Array = new Uint16Array(0);

function relax(n: number, nd: number): void {
  const c = costBuf[n];
  if (c < 0) return;
  nd += c;
  if (nd < flowRef[n] && nd < FLOW_UNREACHABLE) {
    flowRef[n] = nd;
    pushBucket(nd, n);
    pending++;
  }
}

function pushBucket(d: number, cell: number): void {
  const b = d & (BUCKETS - 1);
  let arr = bucketCells[b];
  if (bucketLen[b] === arr.length) {
    const grown = new Int32Array(arr.length * 2);
    grown.set(arr);
    bucketCells[b] = arr = grown;
  }
  arr[bucketLen[b]++] = cell;
}

/**
 * Distance field from all source cells into `grid.flow` (Dial's bucket queue: costs are small
 * integers). Unclimbed structures cost `structurePenalty` extra, so the horde detours around short
 * walls and piles up at long ones. Diagonals need both orthogonal cells open (no corner cutting).
 * Distances are unique, so the result is identical to any other exact shortest-path search.
 */
export function computeFlowField(grid: Grid, sources: readonly number[], structurePenalty = 0): void {
  if (structurePenalty + 14 >= BUCKETS) throw new Error('structure penalty too large for the bucket ring');
  const flow = grid.flow;
  const w = grid.width;
  const h = grid.height;
  const size = grid.size;
  if (costBuf.length < size) {
    costBuf = new Int16Array(size);
    openBuf = new Uint8Array(size);
  }
  const cost = costBuf;
  const open = openBuf;
  for (let c = 0; c < size; c++) {
    const k = grid.zombieCost(c, 1);
    cost[c] = k < 0 ? -1 : k === 0 ? 0 : structurePenalty;
    open[c] = k === 0 ? 1 : 0;
  }
  flow.fill(FLOW_UNREACHABLE);
  flowRef = flow;
  bucketLen.fill(0);
  pending = 0;
  for (const s of sources) {
    if (s < 0 || flow[s] === 0) continue;
    flow[s] = 0;
    pushBucket(0, s);
    pending++;
  }
  for (let d = 0; pending > 0; d++) {
    const b = d & (BUCKETS - 1);
    // Steps cost 10..(14 + penalty) < BUCKETS, so nothing is pushed into the bucket being drained.
    const cells = bucketCells[b];
    while (bucketLen[b] > 0) {
      const cur = cells[--bucketLen[b]];
      pending--;
      if (flow[cur] !== d) continue; // stale: a shorter distance was found after it was queued
      const cx = cur % w;
      const cy = (cur - cx) / w;
      const xl = cx > 0;
      const xr = cx < w - 1;
      const yu = cy > 0;
      const yd = cy < h - 1;
      // Orthogonal steps.
      if (xr) relax(cur + 1, d + 10);
      if (xl) relax(cur - 1, d + 10);
      if (yd) relax(cur + w, d + 10);
      if (yu) relax(cur - w, d + 10);
      // Diagonal steps.
      if (xr && yd && open[cur + 1] && open[cur + w]) relax(cur + w + 1, d + 14);
      if (xl && yd && open[cur - 1] && open[cur + w]) relax(cur + w - 1, d + 14);
      if (xr && yu && open[cur + 1] && open[cur - w]) relax(cur - w + 1, d + 14);
      if (xl && yu && open[cur - 1] && open[cur - w]) relax(cur - w - 1, d + 14);
    }
  }

}
