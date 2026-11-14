import type { MissionId } from './missions.ts';

/**
 * Operation: a run of city missions on one city with a task force of its own. Each won mission
 * opens a choice of requisitions; the run ends at the first lost mission. See docs/balancing.md.
 */
export const OPERATION = {
  /** Missions in a run, drawn from `pool` in an order fixed by the run's seed. */
  missions: 5,
  pool: ['hospital', 'bridge', 'retake', 'supply_line', 'night_shift', 'last_train'] as readonly MissionId[],
  /** Wandering zombies, waves and pressure groups grow by this share for each mission already played (fifth: ×1.48). */
  threatPerMission: 0.12,
  /** Requisitions offered after a won mission; one is taken. */
  offers: 3,
  requisitions: {
    /** Added to the base stock of the next mission. */
    ammo: 800,
    materials: 150,
    /** Share of the next mission's threat removed (wandering zombies, waves and pressure groups). */
    recon: 0.2,
    /** Experience for every living soldier, at once. */
    drillXp: 25,
    /** Experience the next mission's recruits start with (private). */
    veteransXp: 25,
  },
  score: {
    /** Per won mission, plus `perMission` for each mission before it. */
    won: 1000,
    perMission: 250,
    kill: 1,
    /** Per soldier alive when the whole operation is won. */
    survivor: 50,
  },
} as const;

export type RequisitionId = 'ammo' | 'materials' | 'recon' | 'drill' | 'veterans';

export const REQUISITION_IDS: readonly RequisitionId[] = ['ammo', 'materials', 'recon', 'drill', 'veterans'];

/** Changes to a mission's start, set outside the simulation (Operation requisitions and threat). */
export interface MissionTweaks {
  /** Multiplies the wandering zombies, the waves and the pressure groups. */
  zombieScale?: number;
  /** Added to the base stock. */
  ammo?: number;
  materials?: number;
}
