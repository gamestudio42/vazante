import { STRUCTURES, type StructureKind } from './balance/structures.ts';
import { Ground } from './types.ts';

export type PlacementError = 'out_of_bounds' | 'outside_base' | 'terrain' | 'occupied_structure' | 'occupied_unit' | 'no_materials';

export interface PlacementBase {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  materials: number;
}

/** What placement needs to know. The engine builds it from the world, the UI from the map and the last frame. */
export interface PlacementContext {
  width: number;
  height: number;
  ground: ArrayLike<number>;
  bases: readonly PlacementBase[];
  /** True if a structure, blueprint or other obstacle already occupies the cell. */
  structureAt(cell: number): boolean;
  /** True if a soldier stands in the cell (zombies only delay completion). */
  unitIn(cell: number): boolean;
}

export interface PlacementResult {
  error: PlacementError | null;
  /** Index into `bases` of the base that pays, or -1. */
  base: number;
}

/**
 * Single source of truth for placement rules, shared by the engine (which rejects commands)
 * and the UI (which colours the ghost), so both report the same reason.
 */
export function checkPlacement(ctx: PlacementContext, kind: StructureKind, cx: number, cy: number): PlacementResult {
  if (cx < 0 || cy < 0 || cx >= ctx.width || cy >= ctx.height) return { error: 'out_of_bounds', base: -1 };
  const base = ctx.bases.findIndex((b) => cx >= b.x0 && cx <= b.x1 && cy >= b.y0 && cy <= b.y1);
  if (base < 0) return { error: 'outside_base', base: -1 };
  const cell = cy * ctx.width + cx;
  const g = ctx.ground[cell];
  if (g === Ground.Building || g === Ground.Water) return { error: 'terrain', base };
  if (ctx.structureAt(cell)) return { error: 'occupied_structure', base };
  if (ctx.unitIn(cell)) return { error: 'occupied_unit', base };
  if (ctx.bases[base].materials < STRUCTURES[kind].materials) return { error: 'no_materials', base };
  return { error: null, base };
}
