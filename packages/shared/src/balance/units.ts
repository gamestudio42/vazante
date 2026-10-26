import type { WeaponId } from './weapons.ts';

export type SquadKind = 'guard' | 'police' | 'marines' | 'slice';

export interface SquadTemplate {
  readonly soldierHp: number;
  readonly speed: number; // m/s
  readonly weapons: readonly WeaponId[];
}

export const SQUADS: Readonly<Record<SquadKind, SquadTemplate>> = {
  guard: { soldierHp: 100, speed: 3.0, weapons: ['rifle', 'rifle', 'rifle', 'rifle', 'rifle', 'rifle', 'rifle', 'lmg'] },
  police: { soldierHp: 80, speed: 3.2, weapons: ['shotgun', 'shotgun', 'shotgun', 'shotgun', 'rifle', 'rifle'] },
  marines: { soldierHp: 120, speed: 3.0, weapons: ['rifle', 'rifle', 'rifle', 'rifle', 'rifle', 'rifle', 'rifle', 'rifle', 'lmg', 'lmg'] },
  slice: { soldierHp: 100, speed: 3.0, weapons: ['rifle', 'rifle', 'rifle', 'rifle', 'rifle', 'lmg'] },
};

export const SOLDIER_RADIUS_M = 0.35;
export const FORMATION_SPACING_M = 2;
/** Soldier sight radius (reveal) in metres. */
export const SOLDIER_SIGHT_M = 40;
/** Direct-control speed multiplier (sprint-like responsiveness). */
export const DIRECT_SPEED_FACTOR = 1.0;
/** Soldiers within this distance of their slot count as "in formation". */
export const SLOT_TOLERANCE_M = 0.75;
