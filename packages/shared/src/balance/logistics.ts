/** The base's ammunition counts as low below this many rounds (an alert, and another at zero). */
export const BASE_AMMO_LOW = 800;

/** Soldiers within this distance of a base or depot with stock refill their reserve. */
export const RESUPPLY_RADIUS_M = 30;
/** Rounds per soldier per second while resupplying. */
export const RESUPPLY_ROUNDS_PER_S = 10;

export type RiskPolicy = 'push_through' | 'reroute' | 'halt' | 'return';
export const RISK_POLICIES: readonly RiskPolicy[] = ['push_through', 'reroute', 'halt', 'return'];

export const TRUCK = {
  hp: 400,
  /** Metres per second on a clear road. */
  speed: 7,
  capacityAmmo: 6000,
  capacityMaterials: 400,
  /** The road counts as blocked when this many zombies are within `blockRadiusM` ahead. */
  blockCount: 4,
  blockRadiusM: 3,
  /** Speed factor and damage dealt per tick to zombies in front while pushing through. */
  pushSpeedFactor: 0.35,
  pushDamage: 12,
  /** A rerouted truck that is still blocked after this many seconds halts. */
  rerouteGiveUpS: 6,
  /** Extra A* cost per zombie-occupied cell when rerouting (10 = one cell). */
  rerouteZombieCost: 120,
  radiusM: 1.4,
} as const;

/**
 * A destroyed truck stays as a wreck, cargo and all. Engineers within `reachM` bring it back in
 * `repairS` when `crew` or more are at it (fewer work proportionally slower); it returns with
 * `hpShare` of its HP. Passengers aboard when it is destroyed are lost.
 */
export const WRECK = { repairS: 40, crew: 3, reachM: 10, hpShare: 0.5 } as const;

/**
 * A truck escorting a squad keeps about `behindM` behind its anchor, re-plans every
 * `replanTicks`, waits once within `nearM`, and only drives faster than the squad (by
 * `paceFactor`) while farther than `catchUpM`.
 */
export const TRUCK_ESCORT = {
  behindM: 10,
  nearM: 8,
  catchUpM: 30,
  paceFactor: 1.1,
  replanTicks: 10,
} as const;

/** A drive order lands on the nearest road cell within this many cells of the point. */
export const TRUCK_DRIVE_SEARCH_CELLS = 8;

/** Distance at which zombies can hit a vehicle. */
export const ZOMBIE_VEHICLE_REACH_M = 2.2;
/** Engine noise of a moving truck. */
/** A parked truck hands out its ammunition cargo to the soldiers this close. */
export const TRUCK_RESUPPLY_M = 12;
export const NOISE_TRUCK = 45;
export const NOISE_TRUCK_RADIUS_M = 25;
