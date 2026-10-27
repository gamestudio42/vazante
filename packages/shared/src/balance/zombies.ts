export enum ZombieKind {
  Common = 0,
  Runner = 1,
  Brute = 2,
  /** Gritador: calls every infected within earshot when it sees a soldier. */
  Screamer = 3,
  /** Inchado: slow and swollen; bursts when it dies, hurting everything close. */
  Bloater = 4,
}

export interface ZombieStats {
  readonly hp: number;
  readonly speed: number; // m/s
  readonly damage: number; // per hit
  readonly biteChance: number;
  readonly share: number; // spawn proportion
}

export const ZOMBIES: readonly ZombieStats[] = [
  { hp: 30, speed: 1.4, damage: 8, biteChance: 0.15, share: 0.85 },
  { hp: 20, speed: 4.0, damage: 6, biteChance: 0.15, share: 0.1 },
  { hp: 120, speed: 1.0, damage: 20, biteChance: 0.1, share: 0.05 },
  { hp: 25, speed: 1.6, damage: 4, biteChance: 0.1, share: 0.03 },
  { hp: 70, speed: 0.9, damage: 10, biteChance: 0.05, share: 0.025 },
];

/** Kinds rolled in the basic roster (the first mission); the full roster rolls them all. */
export const BASIC_ZOMBIE_KINDS = 3;

/** Gritador: a scream every `everyS` while a soldier is within `sightM`, as loud as a blast nearby. */
export const SCREAMER = { everyS: 8, sightM: 30, noise: 160, radiusM: 110 } as const;

/** Inchado burst: damage falls off linearly to zero at `radiusM`. */
export const BLOATER = { radiusM: 4.5, soldierDamage: 45, zombieDamage: 120, structureDamage: 60, stress: 35, noise: 120, noiseRadiusM: 60 } as const;

export const ZOMBIE_PERCEPTION_M = 25;
export const ZOMBIE_ATTACK_RANGE_M = 1.2;
export const ZOMBIE_ATTACK_INTERVAL_S = 1.0;
export const ZOMBIE_RADIUS_M = 0.3;
export const ZOMBIE_SEPARATION_M = 0.6;
export const ZOMBIE_MAX_NEIGHBOURS = 6;
/** A zombie will not step into a 4 m cell that already holds this many. */
export const ZOMBIE_MAX_PER_CELL = 12;
export const ZOMBIE_ACCEL = 4; // m/s^2
export const ZOMBIE_WANDER_SPEED_FACTOR = 0.35;
/** Damage to vehicles per hit (no bite). */
export const ZOMBIE_VEHICLE_DAMAGE = 2;
