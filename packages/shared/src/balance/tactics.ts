/** Squad tactics: suppression, fire distribution, cover and morale. See docs/balancing.md. */

/**
 * Suppression: a hit that does not kill staggers the zombie for this many ticks (per weapon), during
 * which it moves at STAGGER_SPEED_FACTOR and cannot attack. Sustained fire holds a line back.
 */
export const STAGGER_TICKS = { rifle: 4, lmg: 3, shotgun: 9 } as const;
export const STAGGER_SPEED_FACTOR = 0.15;
/** Brutes shrug off part of it. */
export const BRUTE_STAGGER_FACTOR = 0.5;

/** Fire distribution: a zombie already targeted by n squadmates counts as this much farther per mate. */
export const TARGET_SHARE_PENALTY = 0.8;

/** Braced against cover (next to a built structure): hit chance and morale. */
export const COVER_ACCURACY_BONUS = 1.15;
export const COVER_STRESS_FACTOR = 0.55;
/** A holding squad in hold or defensive stance looks this far (cells) from each slot for cover. */
export const COVER_SEARCH_CELLS = 2;
/** Cover positions are refreshed every N ticks. */
export const COVER_INTERVAL_TICKS = 10;

/** Morale: stress 0..100. Rates are per second. */
export const STRESS = {
  /** Gain per zombie within nearM (counted up to maxNear). */
  perNear: 3,
  nearM: 8,
  maxNear: 10,
  /** One-off gains when something happens within witnessM. */
  witnessM: 15,
  mateBitten: 12,
  mateDown: 22,
  selfBitten: 30,
  outOfAmmo: 6,
  /** Away from site lights at night. */
  dark: 1,
  /** Recovery when no zombie is near; faster inside a base or depot. */
  recover: 8,
  recoverAtSite: 16,
  /** At least this many active squadmates within cohesionM steady each other. */
  cohesionMates: 3,
  cohesionM: 10,
  cohesionFactor: 0.75,
  /** Hit chance falls linearly to (1 - aimPenalty) at full stress. */
  aimPenalty: 0.35,
  /** At or above `panic`, a soldier breaks and runs for panicTicks, then cannot break again for panicCooldownTicks. */
  panic: 92,
  panicTicks: 30,
  panicCooldownTicks: 300,
  afterPanic: 60,
  /** Ticks between two 'squad_contact' radio calls from the same squad. */
  contactCooldownTicks: 300,
} as const;
