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

const heap = new MinHeap();

/**
 * A* on the cell grid with an octile heuristic. Returns the cell path from start (exclusive) to goal (inclusive),
 * or null. If the goal is not walkable, the nearest walkable cell to it found during search is used.
 */
export function findPath(grid: Grid, start: number, goal: number, maxExpanded = 20000): number[] | null {
  if (start < 0 || goal < 0) return null;
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
      if (!canStep(grid, cx, cy, dx, dy)) continue;
      const n = cur + dy * w + dx;
      const ng = cg + cost;
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

/** Dijkstra distance field from all source cells into `grid.flow`. */
export function computeFlowField(grid: Grid, sources: readonly number[]): void {
  const flow = grid.flow;
  const w = grid.width;
  flow.fill(FLOW_UNREACHABLE);
  heap.clear();
  for (const s of sources) {
    if (s < 0 || flow[s] === 0) continue;
    flow[s] = 0;
    heap.push(0, s);
  }
  while (heap.size > 0) {
    const d = heap.topKey();
    const cur = heap.pop();
    if (d > flow[cur]) continue;
    const cx = cur % w;
    const cy = Math.floor(cur / w);
    for (const [dx, dy, cost] of NEIGHBOURS) {
      if (!canStep(grid, cx, cy, dx, dy)) continue;
      const n = cur + dy * w + dx;
      const nd = d + cost;
      if (nd < flow[n] && nd < FLOW_UNREACHABLE) {
        flow[n] = nd;
        heap.push(nd, n);
      }
    }
  }
}
