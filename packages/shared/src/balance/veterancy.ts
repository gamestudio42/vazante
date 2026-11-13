/**
 * Veterancy for the persistent campaign roster: soldiers who survive missions and kill infected
 * earn experience and rank, and rank steadies their aim and nerve. See docs/balancing.md.
 */
export const VETERANCY = {
  /** Experience needed to hold each rank: recruit, private, corporal, sergeant, veteran. */
  ranks: [0, 25, 75, 175, 350],
  /** Experience per infected killed. */
  killXp: 1,
  /** Experience for surviving a mission that was won, and one that was lost. */
  wonXp: 15,
  lostXp: 5,
  /** Added to the hit chance per rank (veteran: +0.08). */
  accuracyPerRank: 0.02,
  /** Stress gain falls by this share per rank (veteran: ×0.68). */
  stressPerRank: 0.08,
} as const;

export const MAX_RANK = VETERANCY.ranks.length - 1;

/** Highest rank whose threshold the experience reaches. */
export function rankForXp(xp: number): number {
  let r = 0;
  for (let i = 1; i < VETERANCY.ranks.length; i++) if (xp >= VETERANCY.ranks[i]) r = i;
  return r;
}

/** Clamp a rank coming from outside the simulation (stored rosters, messages). */
export function clampRank(rank: number): number {
  return Number.isInteger(rank) && rank > 0 ? Math.min(rank, MAX_RANK) : 0;
}
