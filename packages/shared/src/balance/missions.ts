import { SLICE } from './mission.ts';
import type { SquadKind } from './units.ts';
import { BASIC_ZOMBIE_KINDS, ZOMBIES } from './zombies.ts';

/**
 * Campaign missions as data. A mission is a map, the forces it starts with and a list of stages
 * played in order; `systems/mission.ts` runs any of them. Zones and districts are named, so the
 * same definition works on every seed of its map.
 */
export type MissionId = 'last_convoy' | 'hospital' | 'bridge' | 'retake';

export const MISSION_IDS: readonly MissionId[] = ['last_convoy', 'hospital', 'bridge', 'retake'];

/** Where a zone is: a base or depot by name, or the nearest river bridge at least `minM` from the base. */
export type ZoneRef = { site: string } | { bridge: { minM: number } };

/** Driven zombies sent at the defenders while a stage runs: `size` every `everyS` seconds. */
export interface Pressure {
  everyS: number;
  size: number;
}

export type StageDef =
  /** Bring truck `truck` to the base (cargo or evacuees). Losing it fails the mission. */
  | { kind: 'deliver'; truck: number }
  /** Any soldier inside the zone. */
  | { kind: 'reach'; zone: number }
  /** Soldiers inside the zone for `seconds` (the clock only runs while held). */
  | { kind: 'hold'; zone: number; seconds: number; pressure?: Pressure }
  /** Truck parked in the zone with soldiers guarding it boards `civilians` over `seconds`. */
  | { kind: 'evacuate'; zone: number; truck: number; seconds: number; civilians: number; pressure?: Pressure }
  /** Warned waves of driven zombies; the stage ends when the last one is cleared. */
  | { kind: 'waves'; waves: readonly number[] }
  /** Raise a district's control above `control`. */
  | { kind: 'retake'; district: string; control: number };

export type StageKind = StageDef['kind'];

export interface MissionDef {
  id: MissionId;
  map: 'slice' | 'city';
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
  stages: readonly StageDef[];
}

export const MISSIONS: Readonly<Record<MissionId, MissionDef>> = {
  last_convoy: {
    id: 'last_convoy',
    map: 'slice',
    squads: [
      { kind: 'slice', name: 'Alfa' },
      { kind: 'slice', name: 'Bravo' },
    ],
    trucks: [{ at: 'depot', ammo: SLICE.truckAmmo, materials: SLICE.truckMaterials }],
    zones: [],
    zombies: 200,
    zombieKinds: BASIC_ZOMBIE_KINDS,
    clearRadiusM: 150,
    materials: SLICE.baseMaterials,
    ammo: SLICE.baseAmmo,
    commandPost: true,
    stages: [
      { kind: 'deliver', truck: 0 },
      { kind: 'waves', waves: SLICE.waves },
    ],
  },
  hospital: {
    id: 'hospital',
    map: 'city',
    squads: [
      { kind: 'slice', name: 'Alfa' },
      { kind: 'police', name: 'Bravo' },
      { kind: 'slice', name: 'Charlie' },
    ],
    trucks: [{ at: 'base', ammo: 0, materials: 0 }],
    zones: [{ site: 'Hospital São Lucas' }],
    zombies: 3000,
    zombieKinds: ZOMBIES.length,
    clearRadiusM: 250,
    materials: 320,
    ammo: 1200,
    commandPost: true,
    stages: [
      { kind: 'reach', zone: 0 },
      { kind: 'evacuate', zone: 0, truck: 0, seconds: 60, civilians: 30, pressure: { everyS: 25, size: 50 } },
      { kind: 'deliver', truck: 0 },
    ],
  },
  bridge: {
    id: 'bridge',
    map: 'city',
    squads: [
      { kind: 'marines', name: 'Alfa' },
      { kind: 'slice', name: 'Bravo' },
      { kind: 'police', name: 'Charlie' },
    ],
    trucks: [{ at: 'base', ammo: 3000, materials: 320 }],
    zones: [{ bridge: { minM: 350 } }],
    zombies: 3000,
    zombieKinds: ZOMBIES.length,
    clearRadiusM: 250,
    materials: 320,
    ammo: 1200,
    commandPost: false,
    stages: [
      { kind: 'reach', zone: 0 },
      { kind: 'hold', zone: 0, seconds: 240, pressure: { everyS: 40, size: 90 } },
    ],
  },
  retake: {
    id: 'retake',
    map: 'city',
    squads: [
      { kind: 'marines', name: 'Alfa' },
      { kind: 'slice', name: 'Bravo' },
      { kind: 'police', name: 'Charlie' },
      { kind: 'marines', name: 'Delta' },
    ],
    trucks: [{ at: 'Estação Ferroviária', ammo: 5000, materials: 300 }],
    zones: [],
    zombies: 3500,
    zombieKinds: ZOMBIES.length,
    clearRadiusM: 250,
    materials: 400,
    ammo: 1500,
    commandPost: true,
    stages: [
      { kind: 'retake', district: 'Ribeira', control: 66 },
      { kind: 'waves', waves: [150, 220, 300] },
    ],
  },
};

/** Pressure groups spawn this far from the zone they attack. */
export const PRESSURE_SPAWN_M = { min: 120, max: 220 } as const;

/** A zone is held when a soldier is within the site rectangle grown by this many metres. */
export const ZONE_PAD_M = 8;
