export interface Vec2 {
  x: number;
  y: number;
}

/** Ground layer values. */
export enum Ground {
  Street = 0,
  Sidewalk = 1,
  Lot = 2,
  Building = 3,
  Water = 4,
  Park = 5,
}

/** Bits of the `blocked` layer. */
export enum Blocked {
  None = 0,
  StructureWall = 1,
  GateClosed = 2,
  Rubble = 4,
  Wreck = 8,
  /** Low structure (HESCO, nest): blocks movement, not sight. */
  Barrier = 16,
}

export type Formation = 'line' | 'column' | 'wedge' | 'circle';
export const FORMATIONS: readonly Formation[] = ['line', 'column', 'wedge', 'circle'];

export type Stance = 'hold' | 'aggressive' | 'defensive' | 'withdraw';
export const STANCES: readonly Stance[] = ['hold', 'aggressive', 'defensive', 'withdraw'];

export type SimSpeed = 0 | 1 | 2 | 4;

/** Numeric soldier condition used in frames. */
export enum SoldierCondition {
  Ok = 0,
  Bitten = 1,
  Dead = 2,
  Turned = 3,
}

export enum SoldierActivity {
  Idle = 0,
  Moving = 1,
  Engaging = 2,
  Reloading = 3,
  Direct = 4,
}

export enum ZombieState {
  Free = 0,
  Wandering = 1,
  Chasing = 2,
  Attacking = 3,
  Stacked = 4,
  Clinging = 5,
}

export type SquadOrder =
  | { kind: 'idle' }
  | { kind: 'move'; to: Vec2 }
  | { kind: 'hold'; at: Vec2 };

export interface BuildingRect {
  id: number;
  /** Inclusive cell bounds. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  height: number;
}

export interface DistrictInfo {
  id: number;
  name: string;
  /** Inclusive cell bounds (vertical slice districts are rectangles). */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface SiteInfo {
  kind: 'base' | 'depot';
  name: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Static map data, sent once to the client. */
export interface MapInfo {
  seed: number;
  width: number; // cells
  height: number; // cells
  cellSize: number;
  ground: Uint8Array;
  heights: Uint8Array;
  buildings: BuildingRect[];
  districts: DistrictInfo[];
  sites: SiteInfo[];
}
