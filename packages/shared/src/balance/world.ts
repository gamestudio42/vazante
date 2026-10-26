/** Global simulation constants. See docs/balancing.md. */
export const TICK_HZ = 10;
export const TICK_DT = 1 / TICK_HZ;
export const CELL_SIZE = 4; // metres
export const SECTOR_CELLS = 16; // 64 m
export const ZOMBIE_POOL_CAPACITY = 16_384;
export const MAX_TICKS_PER_FRAME = 8;

/** Turn delay after a bite, in seconds (uniform). */
export const BITE_TURN_MIN_S = 60;
export const BITE_TURN_MAX_S = 180;
/** A soldier killed by zombies rises after this many seconds. */
export const RISE_AFTER_DEATH_S = 20;

/** Noise layer (0..255). */
export const NOISE_SHOT = 60;
export const NOISE_SHOT_RADIUS_M = 40;
export const NOISE_EXPLOSION = 200;
export const NOISE_EXPLOSION_RADIUS_M = 150;
export const NOISE_CHASE_THRESHOLD = 40;
/** Noise decays by this numerator over 10 each tick (10% decay). */
export const NOISE_DECAY_NUM = 9;

/** Flow field is recomputed every N ticks. */
export const FLOW_INTERVAL_TICKS = 5;
/** Soldiers re-evaluate targets every N ticks. */
export const RETARGET_INTERVAL_TICKS = 5;
