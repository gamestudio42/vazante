import type { DayClock } from "../daynight.ts";
import { SLICE } from "./mission.ts";
import type { SquadKind } from "./units.ts";
import { BASIC_ZOMBIE_KINDS, ZOMBIES } from "./zombies.ts";

/**
 * Campaign missions as data. A mission is a map, the forces it starts with and a list of stages
 * played in order; `systems/mission.ts` runs any of them. Zones and districts are named, so the
 * same definition works on every seed of its map.
 */
export type MissionId =
  | "last_convoy"
  | "hospital"
  | "bridge"
  | "retake"
  | "supply_line"
  | "night_shift"
  | "last_train"
  | "survival";

/** The campaign, in order. Survival is played from the main menu and is not part of it. */
export const MISSION_IDS: readonly MissionId[] = [
  "last_convoy",
  "hospital",
  "bridge",
  "retake",
  "supply_line",
  "night_shift",
  "last_train",
];

/**
 * Where a zone is: a base or depot by name, the nearest river bridge at least `minM` from the
 * base, or the street nearest a point of a district (`at` as fractions of its rectangle).
 */
export type ZoneRef =
  | { site: string }
  | { bridge: { minM: number } }
  | { district: string; at: readonly [number, number]; name: string };

/** Driven zombies sent at the defenders while a stage runs: `size` every `everyS` seconds, each group `grow` bigger than the last. */
export interface Pressure {
  everyS: number;
  size: number;
  grow?: number;
}

export type StageDef =
  /** Bring truck `truck` to the base, or to the site of zone `to` (cargo or evacuees). Losing it fails the mission. */
  | { kind: "deliver"; truck: number; to?: number }
  /** Secure the site of zone `zone` as a strategic point (missions with `economy`). */
  | { kind: "secure"; zone: number }
  /** Any soldier inside the zone. */
  | { kind: "reach"; zone: number }
  /** Soldiers inside the zone for `seconds` (the clock only runs while held). */
  | { kind: "hold"; zone: number; seconds: number; pressure?: Pressure }
  /** Truck parked in the zone with soldiers guarding it boards `civilians` over `seconds`. */
  | {
      kind: "evacuate";
      zone: number;
      truck: number;
      seconds: number;
      civilians: number;
      pressure?: Pressure;
    }
  /** Warned waves of driven zombies, aimed at the base or at a zone; the stage ends when the last one is cleared. */
  | { kind: "waves"; waves: readonly number[]; zone?: number }
  /** Raise a district's control above `control`. */
  | { kind: "retake"; district: string; control: number }
  /** Survival: never ends. See SurvivalRules. */
  | { kind: "endless"; rules: SurvivalRules };

/**
 * Survival in Porto Velário. Every nightfall a warned horde of `nightHorde` zombies, `grow` bigger
 * each night, comes at the base from several sides, and `baseShare` of that many infected already
 * in the city near the base join it. After `repopGraceS`, every `repopEveryS` the city refills by
 * `repopSize` wandering infected coming in within `repopEdgeM` of the map edge, far from the
 * player, while fewer than `cap` (`capGrow` more each night) walk it.
 */
export interface SurvivalRules {
  nightHorde: number;
  grow: number;
  baseShare: number;
  /** Seconds of warning before the horde at nightfall. */
  warnS: number;
  /** Hour the horde comes and hour any stragglers give up (the next dawn). */
  nightfallHour: number;
  dawnHour: number;
  repopGraceS: number;
  repopEveryS: number;
  repopSize: number;
  repopEdgeM: number;
  cap: number;
  capGrow: number;
  /** Refills keep at least this far from the base and from every soldier. */
  repopClearM: number;
}

export type StageKind = StageDef["kind"];

export interface MissionDef {
  id: MissionId;
  map: "slice" | "city";
  /** Squads at the base, left to right. */
  squads: readonly { kind: SquadKind; name: string }[];
  /** Trucks: parked at a site by name ('base' = the player's base), with cargo. */
  trucks: readonly { at: string; ammo: number; materials: number }[];
  zones: readonly ZoneRef[];
  /** Wandering zombies over the map at veteran difficulty. */
  zombies: number;
  /** Zombie kinds that spawn, in ZOMBIES order (3 = common, runner, brute). */
  zombieKinds: number;
  /** Zombies keep at least this far from the base at the start. */
  clearRadiusM: number;
  /** Base stock at veteran difficulty. */
  materials: number;
  ammo: number;
  /** A command post with civilians at the base centre; losing it loses the mission. */
  commandPost: boolean;
  /** Districts and sites produce (see ECONOMY). */
  economy?: boolean;
  /** A day of its own instead of DAY (survival: a longer day that starts in the morning). */
  day?: DayClock;
  stages: readonly StageDef[];
}

export const MISSIONS: Readonly<Record<MissionId, MissionDef>> = {
  last_convoy: {
    id: "last_convoy",
    map: "slice",
    squads: [
      { kind: "slice", name: "Alfa" },
      { kind: "slice", name: "Bravo" },
    ],
    trucks: [
      { at: "depot", ammo: SLICE.truckAmmo, materials: SLICE.truckMaterials },
    ],
    zones: [],
    zombies: 200,
    zombieKinds: BASIC_ZOMBIE_KINDS,
    clearRadiusM: 150,
    materials: SLICE.baseMaterials,
    ammo: SLICE.baseAmmo,
    commandPost: true,
    stages: [
      { kind: "deliver", truck: 0 },
      { kind: "waves", waves: SLICE.waves },
    ],
  },
  hospital: {
    id: "hospital",
    map: "city",
    squads: [
      { kind: "slice", name: "Alfa" },
      { kind: "police", name: "Bravo" },
      { kind: "marines", name: "Charlie" },
    ],
    trucks: [{ at: "base", ammo: 0, materials: 0 }],
    zones: [{ site: "Hospital São Lucas" }],
    zombies: 3000,
    zombieKinds: ZOMBIES.length,
    clearRadiusM: 250,
    materials: 320,
    ammo: 1200,
    commandPost: true,
    stages: [
      { kind: "reach", zone: 0 },
      {
        kind: "evacuate",
        zone: 0,
        truck: 0,
        seconds: 60,
        civilians: 30,
        pressure: { everyS: 25, size: 50 },
      },
      { kind: "deliver", truck: 0 },
    ],
  },
  bridge: {
    id: "bridge",
    map: "city",
    squads: [
      { kind: "slice", name: "Alfa" },
      { kind: "engineers", name: "Bravo" },
      { kind: "police", name: "Charlie" },
    ],
    trucks: [{ at: "base", ammo: 3000, materials: 320 }],
    zones: [{ bridge: { minM: 350 } }],
    zombies: 3000,
    zombieKinds: ZOMBIES.length,
    clearRadiusM: 250,
    materials: 320,
    ammo: 1200,
    commandPost: false,
    stages: [
      { kind: "reach", zone: 0 },
      {
        kind: "hold",
        zone: 0,
        seconds: 300,
        pressure: { everyS: 25, size: 120, grow: 0.2 },
      },
    ],
  },
  supply_line: {
    id: "supply_line",
    map: "city",
    squads: [
      { kind: "slice", name: "Alfa" },
      { kind: "engineers", name: "Bravo" },
      { kind: "police", name: "Charlie" },
    ],
    trucks: [{ at: "base", ammo: 0, materials: 0 }],
    zones: [{ site: "Depósito Norte" }, { site: "Posto Âncora" }],
    zombies: 3200,
    zombieKinds: ZOMBIES.length,
    clearRadiusM: 250,
    materials: 200,
    ammo: 900,
    commandPost: true,
    economy: true,
    stages: [
      { kind: "reach", zone: 0 },
      { kind: "secure", zone: 0 },
      { kind: "deliver", truck: 0 },
      { kind: "reach", zone: 1 },
      { kind: "waves", waves: [120, 170] },
    ],
  },
  night_shift: {
    id: "night_shift",
    map: "city",
    squads: [
      { kind: "slice", name: "Alfa" },
      { kind: "marines", name: "Bravo" },
      { kind: "engineers", name: "Charlie" },
    ],
    trucks: [{ at: "base", ammo: 2500, materials: 250 }],
    zones: [{ site: "Hospital São Lucas" }],
    zombies: 3200,
    zombieKinds: ZOMBIES.length,
    clearRadiusM: 250,
    materials: 200,
    ammo: 1200,
    commandPost: false,
    economy: true,
    stages: [
      { kind: "reach", zone: 0 },
      { kind: "secure", zone: 0 },
      { kind: "waves", waves: [200, 280, 360], zone: 0 },
    ],
  },
  last_train: {
    id: "last_train",
    map: "city",
    squads: [
      { kind: "slice", name: "Alfa" },
      { kind: "marines", name: "Bravo" },
      { kind: "police", name: "Charlie" },
      { kind: "engineers", name: "Delta" },
    ],
    trucks: [{ at: "base", ammo: 0, materials: 0 }],
    zones: [{ site: "Posto Âncora" }, { site: "Estação Ferroviária" }],
    zombies: 4500,
    zombieKinds: ZOMBIES.length,
    clearRadiusM: 250,
    materials: 400,
    ammo: 1500,
    commandPost: false,
    economy: true,
    stages: [
      { kind: "reach", zone: 1 },
      { kind: "secure", zone: 1 },
      {
        kind: "evacuate",
        zone: 0,
        truck: 0,
        seconds: 45,
        civilians: 40,
        pressure: { everyS: 20, size: 90 },
      },
      { kind: "deliver", truck: 0, to: 1 },
      {
        kind: "hold",
        zone: 1,
        seconds: 180,
        pressure: { everyS: 15, size: 160, grow: 0.25 },
      },
    ],
  },
  survival: {
    id: "survival",
    map: "city",
    squads: [
      { kind: "slice", name: "Alfa" },
      { kind: "marines", name: "Bravo" },
      { kind: "engineers", name: "Charlie" },
      { kind: "police", name: "Delta" },
    ],
    trucks: [
      { at: "base", ammo: 0, materials: 0 },
      { at: "Depósito Norte", ammo: 3000, materials: 200 },
    ],
    zones: [],
    zombies: 4000,
    zombieKinds: ZOMBIES.length,
    clearRadiusM: 300,
    materials: 500,
    ammo: 2500,
    commandPost: true,
    economy: true,
    day: { lengthS: 2400, startHour: 8 },
    stages: [
      {
        kind: "endless",
        rules: {
          nightHorde: 160,
          grow: 0.6,
          baseShare: 1,
          warnS: 45,
          nightfallHour: 19,
          dawnHour: 6,
          repopGraceS: 600,
          repopEveryS: 90,
          repopSize: 40,
          repopEdgeM: 250,
          cap: 4000,
          capGrow: 0.1,
          repopClearM: 180,
        },
      },
    ],
  },
  retake: {
    id: "retake",
    map: "city",
    squads: [
      { kind: "marines", name: "Alfa" },
      { kind: "engineers", name: "Bravo" },
      { kind: "police", name: "Charlie" },
      { kind: "marines", name: "Delta" },
    ],
    trucks: [{ at: "Estação Ferroviária", ammo: 5000, materials: 300 }],
    zones: [
      { district: "Ribeira", at: [0.75, 0.2], name: "Ribeira: mercado" },
      { district: "Ribeira", at: [0.4, 0.5], name: "Ribeira: praça" },
      { district: "Ribeira", at: [0.6, 0.8], name: "Ribeira: cais" },
    ],
    zombies: 3500,
    zombieKinds: ZOMBIES.length,
    clearRadiusM: 250,
    materials: 400,
    ammo: 1500,
    commandPost: false,
    stages: [
      {
        kind: "hold",
        zone: 0,
        seconds: 60,
        pressure: { everyS: 25, size: 55, grow: 0.15 },
      },
      {
        kind: "hold",
        zone: 1,
        seconds: 60,
        pressure: { everyS: 25, size: 70, grow: 0.15 },
      },
      {
        kind: "hold",
        zone: 2,
        seconds: 60,
        pressure: { everyS: 25, size: 85, grow: 0.15 },
      },
      { kind: "waves", waves: [280, 400, 520], zone: 2 },
    ],
  },
};

/** Pressure groups spawn this far from the zone they attack. */
export const PRESSURE_SPAWN_M = { min: 120, max: 220 } as const;

/** A zone is held when a soldier is within the site rectangle grown by this many metres. */
export const ZONE_PAD_M = 8;
