import type { WeaponId } from './weapons.ts';

export type SquadKind = 'guard' | 'police' | 'marines' | 'slice' | 'engineers';

/** What a soldier does besides shooting. */
export type SoldierRole = 'none' | 'medic' | 'engineer';

export interface SquadTemplate {
  readonly soldierHp: number;
  readonly speed: number; // m/s
  readonly weapons: readonly WeaponId[];
  /** Role per member, in the same order as `weapons` (missing = 'none'). */
  readonly roles?: readonly SoldierRole[];
}

export const SQUADS: Readonly<Record<SquadKind, SquadTemplate>> = {
  guard: { soldierHp: 100, speed: 3.0, weapons: ['rifle', 'rifle', 'rifle', 'rifle', 'rifle', 'rifle', 'rifle', 'lmg'] },
  police: { soldierHp: 80, speed: 3.2, weapons: ['shotgun', 'shotgun', 'shotgun', 'shotgun', 'rifle', 'rifle'] },
  // Two machine guns, a marksman for the Gritadores and Inchados, and a medic.
  marines: {
    soldierHp: 120,
    speed: 3.0,
    weapons: ['rifle', 'rifle', 'rifle', 'rifle', 'rifle', 'rifle', 'lmg', 'lmg', 'dmr', 'rifle'],
    roles: ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'medic'],
  },
  slice: { soldierHp: 100, speed: 3.0, weapons: ['rifle', 'rifle', 'rifle', 'rifle', 'rifle', 'lmg'] },
  // Build outside the bases, twice as fast; short-range guns.
  engineers: { soldierHp: 100, speed: 3.0, weapons: ['shotgun', 'shotgun', 'rifle', 'rifle', 'rifle'], roles: ['engineer', 'engineer', 'engineer', 'engineer', 'engineer'] },
};

/** A medic heals the most hurt soldier within `rangeM`, and slows the infection of the bitten ones there. */
export const MEDIC = { rangeM: 12, healPerS: 3, infectionSlow: 0.5 } as const;

/** Engineers let structures go up within `buildM` of them outside any base, and build `rate` times faster. */
export const ENGINEER = { buildM: 24, rate: 2 } as const;

export const SOLDIER_RADIUS_M = 0.35;
export const FORMATION_SPACING_M = 2;
/** Soldier sight radius (reveal) in metres. */
export const SOLDIER_SIGHT_M = 40;
/** Direct-control speed multiplier (sprint-like responsiveness). */
export const DIRECT_SPEED_FACTOR = 1.35;
/** Player-aimed fire is faster than the squad AI's measured rate. */
export const DIRECT_FIRE_RATE_FACTOR = 1.75;
/** Soldiers within this distance of their slot count as "in formation". */
export const SLOT_TOLERANCE_M = 0.75;
