import type { Formation, SoldierActivity, SoldierCondition, SquadKind, SquadOrder, Stance, WeaponId } from '@vazante/shared';

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
}
