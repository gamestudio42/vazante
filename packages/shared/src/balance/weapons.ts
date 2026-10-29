export type WeaponId = 'rifle' | 'lmg' | 'shotgun' | 'dmr';

export interface WeaponStats {
  readonly range: number; // m
  readonly shotsPerSecond: number;
  readonly damage: number;
  readonly pellets: number;
  readonly accuracy: number;
  readonly magazine: number;
  readonly ammoPerSoldier: number; // total including the loaded magazine
  readonly reloadSeconds: number;
}

export const WEAPONS: Readonly<Record<WeaponId, WeaponStats>> = {
  rifle: { range: 60, shotsPerSecond: 2, damage: 34, pellets: 1, accuracy: 0.55, magazine: 30, ammoPerSoldier: 180, reloadSeconds: 2.5 },
  lmg: { range: 80, shotsPerSecond: 8, damage: 30, pellets: 1, accuracy: 0.35, magazine: 100, ammoPerSoldier: 500, reloadSeconds: 5 },
  shotgun: { range: 15, shotsPerSecond: 1, damage: 60, pellets: 6, accuracy: 0.5, magazine: 8, ammoPerSoldier: 40, reloadSeconds: 4 },
  // Marksman rifle: slow, long and deadly; marksmen pick the special infected first.
  dmr: { range: 110, shotsPerSecond: 0.8, damage: 90, pellets: 1, accuracy: 0.8, magazine: 10, ammoPerSoldier: 120, reloadSeconds: 3 },
};

export const WEAPON_IDS: readonly WeaponId[] = ['rifle', 'lmg', 'shotgun', 'dmr'];

/** Stance factor on hit chance. */
export const ACCURACY_STATIONARY = 1.0;
export const ACCURACY_MOVING = 0.6;
/** Bonus accuracy when the player aims in direct control. */
export const DIRECT_CONTROL_ACCURACY_BONUS = 0.2;
/** Half-width of the aim corridor for direct-control shots, metres. */
export const DIRECT_AIM_CORRIDOR_M = 1.0;
