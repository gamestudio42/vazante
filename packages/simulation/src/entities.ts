import type { Formation, MissionId, RiskPolicy, SoldierActivity, SoldierCondition, SoldierRole, SquadKind, SquadOrder, Stance, StructureKind, VehicleState, WeaponId } from '@vazante/shared';

export interface DirectInput {
  mx: number;
  my: number;
  ax: number;
  ay: number;
  fire: boolean;
  reload: boolean;
}

export interface Soldier {
  id: number;
  squad: number;
  x: number;
  y: number;
  /** Unit facing vector. */
  fx: number;
  fy: number;
  hp: number;
  maxHp: number;
  weapon: WeaponId;
  /** Medic or engineer; absent in saves made before roles. */
  role?: SoldierRole;
  /** Rounds in the loaded magazine. */
  mag: number;
  /** Reserve rounds, not counting the magazine. */
  ammo: number;
  condition: SoldierCondition;
  activity: SoldierActivity;
  reloadT: number;
  fireAcc: number;
  /** Zombie slot being engaged, -1 = none. */
  target: number;
  moving: boolean;
  /** Tick when a bitten soldier turns, -1 = not bitten. */
  turnAt: number;
  /** Tick when a soldier killed by zombies rises, -1 = never. */
  riseAt: number;
  outOfAmmoReported: boolean;
  direct: DirectInput | null;
  /** Morale stress 0..100; see STRESS. */
  stress: number;
  /** Ticks left running in panic (0 = steady) and ticks before another break is possible. */
  panicT: number;
  panicCd: number;
  /** Next to a built structure this tick (braced, steadier). */
  inCover: boolean;
}

export interface Squad {
  id: number;
  name: string;
  kind: SquadKind;
  members: number[];
  order: SquadOrder;
  stance: Stance;
  formation: Formation;
  speed: number;
  /** Anchor (formation origin) position and heading. */
  ax: number;
  ay: number;
  hx: number;
  hy: number;
  /** Waypoints of the current move as flattened x, y pairs in metres. */
  path: number[];
  /** Index of the next waypoint pair. */
  pathIdx: number;
  /** Structure this squad was sent to build automatically (0 = none). Cleared by player orders. */
  buildTask: number;
  /** Idle in a base, this squad helps build. A player "hold" turns it off, a move turns it back on. */
  autoBuild: boolean;
  /** Cover cell chosen for each formation slot while holding (-1 = use the slot). */
  cover: number[];
  /** Any member engaging last tick, and ticks before the next contact call. */
  engaged: boolean;
  contactCd: number;
}

export interface Structure {
  id: number;
  kind: StructureKind;
  cell: number;
  /** Base that paid for it (index into world.bases). */
  base: number;
  hp: number;
  /** Ticks of construction work done. */
  work: number;
  built: boolean;
  open: boolean;
  /** MG nest: zombie slot being engaged (-1 none) and fractional shots owed. */
  target: number;
  fireAcc: number;
}

export interface Base {
  id: number;
  kind: 'base' | 'depot';
  /** Depots hold stock but cannot be built on. */
  buildable: boolean;
  name: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  materials: number;
  ammo: number;
}

export interface Vehicle {
  id: number;
  kind: 'truck';
  x: number;
  y: number;
  hx: number;
  hy: number;
  hp: number;
  cargoAmmo: number;
  cargoMaterials: number;
  state: VehicleState;
  policy: RiskPolicy;
  /** Destination and origin base ids (0 = none). */
  dest: number;
  origin: number;
  path: number[];
  pathIdx: number;
  /** Ticks spent blocked since the last reroute. */
  blockedT: number;
  rerouted: boolean;
  blockReported: boolean;
  /** Civilians aboard. */
  passengers: number;
}

/** A mission area in cells. */
export interface MissionZone {
  name: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Mission {
  id: MissionId;
  phase: 'active' | 'won' | 'lost';
  /** Index of the current stage in the mission definition. */
  stage: number;
  /** Ticks of progress in a timed stage (hold, evacuate). */
  progress: number;
  /** Tick of the next pressure group in the current stage (0 = none). */
  pressureAt: number;
  /** Waves started so far in the current waves stage. */
  wave: number;
  waveState: 'none' | 'warning' | 'active' | 'calm';
  /** Tick at which the current warning or calm ends. */
  nextAt: number;
  civilians: number;
  /** Command post structure id (0 = none). */
  commandPost: number;
  base: number;
  /** Mission trucks by index in the definition (vehicle ids). */
  trucks: number[];
  zones: MissionZone[];
  /** Civilians brought back to the base. */
  evacuated: number;
  reason: string;
}
