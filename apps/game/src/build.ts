import { SOLDIER_STRIDE, STRUCTURES, SoldierField, checkPlacement, type Frame, type MapInfo, type PlacementContext, type PlacementError, type StructureKind } from '@vazante/shared';

export interface GhostCell {
  cx: number;
  cy: number;
  ok: boolean;
}

/**
 * Build mode state: chosen structure, drag line, and the ghost cells with their validity.
 * Validity comes from the same `checkPlacement` the engine runs, fed from the map and the latest frame.
 */
export class BuildTool {
  kind: StructureKind | null = null;
  private anchor: { cx: number; cy: number } | null = null;
  cells: GhostCell[] = [];
  /** First rejection reason in the preview, for the hint text. */
  reason: PlacementError | null = null;

  constructor(private readonly map: MapInfo) {}

  get active(): boolean {
    return this.kind !== null;
  }

  begin(kind: StructureKind): void {
    this.kind = kind;
    this.anchor = null;
  }

  cancel(): void {
    this.kind = null;
    this.anchor = null;
    this.cells = [];
    this.reason = null;
  }

  cellOf(x: number, y: number): { cx: number; cy: number } {
    return { cx: Math.floor(x / this.map.cellSize), cy: Math.floor(y / this.map.cellSize) };
  }

  press(x: number, y: number): void {
    this.anchor = this.cellOf(x, y);
  }

  /** Recompute the preview for the cursor at (x, y) metres. */
  hover(x: number, y: number, frame: Frame | null): void {
    if (!this.kind) return;
    const end = this.cellOf(x, y);
    const line = this.anchor ? straightLine(this.anchor, end) : [end];
    const ctx = this.context(frame);
    // Materials run out along a long line: charge each valid cell as the engine will.
    const stock = ctx.bases.map((b) => ({ ...b }));
    const c2 = { ...ctx, bases: stock };
    this.reason = null;
    this.cells = line.map(({ cx, cy }) => {
      const r = checkPlacement(c2, this.kind!, cx, cy);
      if (r.error) {
        this.reason ??= r.error;
        return { cx, cy, ok: false };
      }
      stock[r.base].materials -= costOf(this.kind!);
      return { cx, cy, ok: true };
    });
  }

  /** Release: returns the cells to build (valid ones) and keeps the tool armed. */
  release(): GhostCell[] {
    this.anchor = null;
    return this.cells.filter((c) => c.ok);
  }

  private context(frame: Frame | null): PlacementContext {
    const m = this.map;
    const taken = new Set<number>();
    const units = new Set<number>();
    if (frame) {
      for (const s of frame.structures) taken.add(s.cy * m.width + s.cx);
      for (let i = 0; i < frame.soldiers.length; i += SOLDIER_STRIDE) {
        const cond = frame.soldiers[i + SoldierField.Condition];
        if (cond > 1) continue;
        const cx = Math.floor(frame.soldiers[i + SoldierField.X] / m.cellSize);
        const cy = Math.floor(frame.soldiers[i + SoldierField.Y] / m.cellSize);
        units.add(cy * m.width + cx);
      }
    }
    return {
      width: m.width,
      height: m.height,
      ground: m.ground,
      bases: frame?.bases ?? [],
      structureAt: (cell) => taken.has(cell),
      unitIn: (cell) => units.has(cell),
    };
  }
}

function costOf(kind: StructureKind): number {
  return STRUCTURES[kind].materials;
}

/** Cells from a to b along the dominant axis (walls are built straight). */
function straightLine(a: { cx: number; cy: number }, b: { cx: number; cy: number }): { cx: number; cy: number }[] {
  const out: { cx: number; cy: number }[] = [];
  if (Math.abs(b.cx - a.cx) >= Math.abs(b.cy - a.cy)) {
    const s = Math.sign(b.cx - a.cx) || 1;
    for (let x = a.cx; x !== b.cx + s; x += s) out.push({ cx: x, cy: a.cy });
  } else {
    const s = Math.sign(b.cy - a.cy);
    for (let y = a.cy; y !== b.cy + s; y += s) out.push({ cx: a.cx, cy: y });
  }
  return out.slice(0, 64);
}
