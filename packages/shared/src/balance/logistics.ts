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

/** Distance at which zombies can hit a vehicle. */
export const ZOMBIE_VEHICLE_REACH_M = 2.2;
/** Engine noise of a moving truck. */
export const NOISE_TRUCK = 45;
export const NOISE_TRUCK_RADIUS_M = 25;
