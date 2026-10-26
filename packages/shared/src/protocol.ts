import type { StructureKind } from './balance/structures.ts';
import type { Command } from './commands.ts';
import type { SimEvent } from './events.ts';
import type { Formation, MapInfo, SimSpeed, SquadOrder, Stance } from './types.ts';

/** Stride of the soldier frame array. */
export const SOLDIER_STRIDE = 11;
/** [id, squad, x, y, facingX, facingY, hp, ammoTotal, condition, activity, magazine] */
export enum SoldierField {
  Id = 0,
  Squad = 1,
  X = 2,
  Y = 3,
  FacingX = 4,
  FacingY = 5,
  Hp = 6,
  Ammo = 7,
  Condition = 8,
  Activity = 9,
  Magazine = 10,
}

/** Stride of the zombie frame array. */
export const ZOMBIE_STRIDE = 6;
/** [slot, x, y, headingX, headingY, kind*16 + state] */
export enum ZombieField {
  Slot = 0,
  X = 1,
  Y = 2,
  HeadingX = 3,
  HeadingY = 4,
  KindState = 5,
}

export interface SquadView {
  id: number;
  name: string;
  members: number[];
  alive: number;
  order: SquadOrder;
  stance: Stance;
  formation: Formation;
  anchorX: number;
  anchorY: number;
  /** Remaining waypoints of the current move, flattened x, y pairs (for path preview). */
  path: number[];
}

export interface StructureView {
  id: number;
  kind: StructureKind;
  cx: number;
  cy: number;
  hp: number;
  maxHp: number;
  /** Construction progress 0..1. */
  progress: number;
  built: boolean;
  /** Gates only. */
  open: boolean;
  /** Zombies stacked against or climbing this structure. */
  pile: number;
}

export interface BaseView {
  id: number;
  name: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  materials: number;
  ammo: number;
}

export interface FrameStats {
  zombiesAlive: number;
  zombiesKilled: number;
  soldiersAlive: number;
  shotsFired: number;
  ammoTotal: number;
  tickMs: number;
}

/** Per-tick snapshot for the renderer and HUD. Arrays are transferred. */
export interface Frame {
  tick: number;
  speed: SimSpeed;
  hash: number;
  soldiers: Float32Array;
  zombies: Float32Array;
  squads: SquadView[];
  structures: StructureView[];
  bases: BaseView[];
  directSoldier: number | null;
  events: SimEvent[];
  stats: FrameStats;
}

export type ToWorker =
  | { type: 'init'; seed: number; scenario: string }
  | { type: 'command'; cmd: Command }
  | { type: 'request_hash' };

export type FromWorker =
  | { type: 'ready'; map: MapInfo }
  | { type: 'frame'; frame: Frame }
  | { type: 'hash'; tick: number; hash: number };
