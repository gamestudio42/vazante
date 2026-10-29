export type StructureKind = 'hesco' | 'wall' | 'gate' | 'mg_nest' | 'command_post';

/** Structures the player can build (the command post is placed by the scenario). */
export const STRUCTURE_KINDS: readonly StructureKind[] = ['hesco', 'wall', 'gate', 'mg_nest'];

export interface StructureStats {
  /** Hit points, in zombie attacks (each attack removes ZOMBIE_STRUCTURE_DAMAGE). */
  readonly hp: number;
  /** Height in metres; zombies climb over once the pile reaches it. */
  readonly height: number;
  /** Construction materials taken from the base stock when placed. */
  readonly materials: number;
  /** Seconds of work with enough builders present. */
  readonly buildTimeS: number;
  /** Stops sight and bullets (concrete, closed gate). HESCO and nests can be fired over. */
  readonly blocksSight: boolean;
}

export const STRUCTURES: Readonly<Record<StructureKind, StructureStats>> = {
  hesco: { hp: 300, height: 2.2, materials: 20, buildTimeS: 15, blocksSight: false },
  wall: { hp: 600, height: 3.5, materials: 40, buildTimeS: 30, blocksSight: true },
  gate: { hp: 450, height: 3.0, materials: 30, buildTimeS: 25, blocksSight: true },
  mg_nest: { hp: 250, height: 1.2, materials: 35, buildTimeS: 20, blocksSight: false },
  command_post: { hp: 800, height: 8, materials: 0, buildTimeS: 0, blocksSight: true },
};

/** Damage one zombie attack does to a structure. */
export const ZOMBIE_STRUCTURE_DAMAGE = 1;
/** Height each stacked zombie adds to the pile at a wall. */
export const PILE_UNIT_M = 0.5;
/** Builders must be within this distance of the structure. */
export const BUILD_RADIUS_M = 10;
export const BUILDERS_REQUIRED = 2;
/** Extra flow-field cost of crossing an unclimbed structure (10 = one cell). Zombies prefer detours shorter than this. */
export const STRUCTURE_FLOW_PENALTY = 200;
/** Share of materials refunded when demolishing a finished structure (blueprints refund fully). */
export const DEMOLISH_REFUND = 0.5;

/** Machine-gun nest: crewed emplacement that fires over walls using the base ammunition stock. */
export const MG_NEST = {
  rangeM: 45,
  shotsPerS: 9,
  accuracy: 0.6,
  damage: 35,
  /**
   * A nest outside every base cannot draw on base stock: it fires from its own box, filled to
   * `fieldAmmo` when built, and an idle truck within `refillM` tops it up from its cargo.
   */
  fieldAmmo: 1500,
  refillM: 15,
} as const;

/** Engineers within BUILD_RADIUS_M of a damaged structure mend `hpPerS` each, `crew` at most at once. */
export const REPAIR = { hpPerS: 3, crew: 3 } as const;

/** Starting stock of each base. */
export const BASE_START = { materials: 400, ammo: 4000 } as const;
