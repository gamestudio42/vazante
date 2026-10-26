import { Blocked, CELL_SIZE, Ground, PILE_UNIT_M } from '@vazante/shared';

/** Cell grid stored as a structure of arrays. Index = y * width + x. */
export class Grid {
  readonly width: number;
  readonly height: number;
  readonly size: number;
  readonly ground: Uint8Array;
  readonly heights: Uint8Array;
  readonly buildingId: Int32Array;
  readonly blocked: Uint8Array;
  readonly district: Uint8Array;
  readonly noise: Uint8Array;
  /** Flow-field distance to the nearest human, 10 per orthogonal cell; 65535 = unreachable. */
  readonly flow: Uint16Array;
  /** Structure id occupying the cell (finished or blueprint), 0 = none. */
  readonly structure: Int32Array;
  /** Height of the finished structure in decimetres (0 = none). */
  readonly structHeight: Uint8Array;
  /** Zombies stacked against or climbing the structure in this cell (derived each tick). */
  readonly pile: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.size = width * height;
    this.ground = new Uint8Array(this.size).fill(Ground.Lot);
    this.heights = new Uint8Array(this.size);
    this.buildingId = new Int32Array(this.size);
    this.blocked = new Uint8Array(this.size);
    this.district = new Uint8Array(this.size);
    this.noise = new Uint8Array(this.size);
    this.flow = new Uint16Array(this.size).fill(65535);
    this.structure = new Int32Array(this.size);
    this.structHeight = new Uint8Array(this.size);
    this.pile = new Uint8Array(this.size);
  }

  get widthM(): number {
    return this.width * CELL_SIZE;
  }

  get heightM(): number {
    return this.height * CELL_SIZE;
  }

  inBounds(cx: number, cy: number): boolean {
    return cx >= 0 && cy >= 0 && cx < this.width && cy < this.height;
  }

  idx(cx: number, cy: number): number {
    return cy * this.width + cx;
  }

  /** Cell index for a world position in metres, or -1 outside the map. */
  cellAt(x: number, y: number): number {
    const cx = Math.floor(x / CELL_SIZE);
    const cy = Math.floor(y / CELL_SIZE);
    return this.inBounds(cx, cy) ? cy * this.width + cx : -1;
  }

  isWalkable(cell: number): boolean {
    if (cell < 0) return false;
    const g = this.ground[cell];
    return g !== Ground.Building && g !== Ground.Water && this.blocked[cell] === Blocked.None;
  }

  /** True if the cell holds a finished structure that blocks movement. */
  isStructureBlocking(cell: number): boolean {
    return (this.blocked[cell] & (Blocked.StructureWall | Blocked.GateClosed | Blocked.Barrier)) !== 0;
  }

  /** True once enough zombies are piled against the structure in this cell to climb it. */
  isClimbable(cell: number): boolean {
    return this.pile[cell] * PILE_UNIT_M * 10 >= this.structHeight[cell];
  }

  /**
   * Zombie movement: like isWalkable, but finished structures can be crossed once the pile reaches
   * their height, and a zombie already inside a structure cell (climbing) may keep moving.
   */
  zombieCanEnter(cell: number, fromCell: number): boolean {
    if (cell < 0) return false;
    const g = this.ground[cell];
    if (g === Ground.Building || g === Ground.Water) return false;
    const b = this.blocked[cell];
    if (b === Blocked.None || cell === fromCell) return true;
    if ((b & (Blocked.Rubble | Blocked.Wreck)) !== 0) return false;
    return this.isClimbable(cell);
  }

  /**
   * Extra flow-field cost to enter a cell for the horde: -1 impassable, 0 normal, `penalty`
   * for a structure that still needs stacking to cross.
   */
  zombieCost(cell: number, penalty: number): number {
    const g = this.ground[cell];
    if (g === Ground.Building || g === Ground.Water) return -1;
    const b = this.blocked[cell];
    if (b === Blocked.None) return 0;
    if ((b & (Blocked.Rubble | Blocked.Wreck)) !== 0) return -1;
    return this.isClimbable(cell) ? 0 : penalty;
  }

  isWalkableAt(x: number, y: number): boolean {
    return this.isWalkable(this.cellAt(x, y));
  }

  /** True if the cell stops bullets and sight. */
  blocksSight(cell: number): boolean {
    return this.ground[cell] === Ground.Building || (this.blocked[cell] & (Blocked.StructureWall | Blocked.GateClosed)) !== 0;
  }

  /** Line of sight between two points (metres), sampled every half cell. Elevated shooters can ignore structures. */
  lineOfSight(x0: number, y0: number, x1: number, y1: number, overStructures = false): boolean {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.ceil(dist / (CELL_SIZE * 0.5));
    if (steps <= 1) return true;
    const sx = dx / steps;
    const sy = dy / steps;
    let px = x0;
    let py = y0;
    for (let i = 1; i < steps; i++) {
      px += sx;
      py += sy;
      const c = this.cellAt(px, py);
      if (c < 0) return false;
      if (overStructures ? this.ground[c] === Ground.Building : this.blocksSight(c)) return false;
    }
    return true;
  }

  cellCenterX(cell: number): number {
    return ((cell % this.width) + 0.5) * CELL_SIZE;
  }

  cellCenterY(cell: number): number {
    return (Math.floor(cell / this.width) + 0.5) * CELL_SIZE;
  }

  /** Raise noise to at least `value` in every cell whose centre is within `radiusM` (+ half a cell) of a point. */
  stampNoise(x: number, y: number, value: number, radiusM: number): void {
    const reach = radiusM + CELL_SIZE * 0.5;
    const reach2 = reach * reach;
    const x0 = Math.max(0, Math.floor((x - reach) / CELL_SIZE));
    const x1 = Math.min(this.width - 1, Math.floor((x + reach) / CELL_SIZE));
    const y0 = Math.max(0, Math.floor((y - reach) / CELL_SIZE));
    const y1 = Math.min(this.height - 1, Math.floor((y + reach) / CELL_SIZE));
    for (let yy = y0; yy <= y1; yy++) {
      const dy = (yy + 0.5) * CELL_SIZE - y;
      for (let xx = x0; xx <= x1; xx++) {
        const dx = (xx + 0.5) * CELL_SIZE - x;
        if (dx * dx + dy * dy > reach2) continue;
        const i = yy * this.width + xx;
        if (this.noise[i] < value) this.noise[i] = value;
      }
    }
  }
}
