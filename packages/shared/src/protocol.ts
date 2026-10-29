import type { DifficultyId } from './balance/difficulty.ts';
import type { RiskPolicy } from './balance/logistics.ts';
import type { MissionId, StageKind } from './balance/missions.ts';
import type { StructureKind } from './balance/structures.ts';
import type { SquadKind } from './balance/units.ts';
import type { Command } from './commands.ts';
import type { SaveGame } from './save.ts';
import type { SimEvent } from './events.ts';
import type { Formation, MapInfo, SimSpeed, SquadOrder, Stance } from './types.ts';

/** Stride of the soldier frame array. */
export const SOLDIER_STRIDE = 13;
/** [id, squad, x, y, facingX, facingY, hp, ammoTotal, condition, activity, magazine, stress, flags] */
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
  /** Morale stress 0..100. */
  Stress = 11,
  /** Bit 0: panicking; 1: in cover; 2: medic; 3: engineer; 4: marksman. */
  Flags = 12,
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
  kind: SquadKind;
  members: number[];
  alive: number;
  order: SquadOrder;
  stance: Stance;
  formation: Formation;
  anchorX: number;
  anchorY: number;
  /** Remaining waypoints of the current move, flattened x, y pairs (for path preview). */
  path: number[];
  /** Route points still to come after the current move target, flattened x, y pairs. */
  via: number[];
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

export type VehicleState = 'idle' | 'moving' | 'blocked' | 'destroyed';

export interface VehicleView {
  id: number;
  kind: 'truck';
  x: number;
  y: number;
  hx: number;
  hy: number;
  hp: number;
  maxHp: number;
  cargoAmmo: number;
  cargoMaterials: number;
  state: VehicleState;
  policy: RiskPolicy;
  /** Destination base id, 0 = none. */
  dest: number;
  /** Squad the vehicle follows, 0 = none. */
  escort: number;
  /** Route points still to come after the current drive, flattened x, y pairs. */
  via: number[];
  /** Civilians aboard. */
  passengers: number;
  /** Remaining route, flattened x, y pairs. */
  path: number[];
}

export type MissionPhase = 'active' | 'won' | 'lost';
export type ObjectiveState = 'done' | 'active' | 'pending';

/** One stage of the mission as the objectives panel shows it. */
export interface ObjectiveView {
  kind: StageKind;
  state: ObjectiveState;
  /** Zone, district or destination name for the label. */
  place: string;
  /** Where the truck starts (deliver) or waits (evacuate). */
  from: string;
  /** 0..1 for timed stages and district control; -1 when the stage has no meter. */
  progress: number;
  /** Seconds, civilians or waves the stage asks for (0 when none). */
  total: number;
}

/** A mission area in cells, for the map marker and the minimap. */
export interface ZoneView {
  name: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** The current stage is about this zone. */
  active: boolean;
}

export interface MissionView {
  id: MissionId;
  phase: MissionPhase;
  /** Index of the current stage (equals objectives.length once won). */
  stage: number;
  objectives: ObjectiveView[];
  zones: ZoneView[];
  /** Waves started so far and total in the current waves stage. */
  wave: number;
  waves: number;
  waveState: 'none' | 'warning' | 'active' | 'calm';
  /** Seconds until the next wave hits (during a warning). */
  secondsToWave: number;
  waveZombies: number;
  /** Civilians in the command post (0 and max 0 when the mission has none). */
  civilians: number;
  civiliansMax: number;
  commandPostHp: number;
  commandPostMaxHp: number;
  /** Civilians brought back to the base. */
  evacuated: number;
  /** Why the mission was lost. */
  reason: string;
}

export type DistrictState = 'held' | 'contested' | 'lost';

export interface DistrictView {
  id: number;
  name: string;
  control: number;
  state: DistrictState;
  zombies: number;
  soldiers: number;
}

export interface BaseView {
  id: number;
  kind: 'base' | 'depot';
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
  vehicles: VehicleView[];
  mission: MissionView | null;
  districts: DistrictView[];
  directSoldier: number | null;
  difficulty: DifficultyId;
  /** Fog of war on: `zombies` holds only the ones the player's people can see. */
  fog: boolean;
  events: SimEvent[];
  stats: FrameStats;
}

export type ToWorker =
  | { type: 'init'; seed: number; scenario: string; save?: SaveGame; difficulty?: string }
  /** Rebuild the scenario at another difficulty; ignored once the game has run a tick. */
  | { type: 'set_difficulty'; difficulty: string }
  | { type: 'save'; slot: string }
  | { type: 'command'; cmd: Command }
  | { type: 'request_hash' };

export type FromWorker =
  | { type: 'ready'; map: MapInfo }
  | { type: 'frame'; frame: Frame }
  | { type: 'hash'; tick: number; hash: number }
  | { type: 'saved'; slot: string; save: SaveGame }
  | { type: 'error'; reason: string };
