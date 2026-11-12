/** Authoritative occupied footprints; render assets fit inside these metre dimensions. */
export const COLLISION = {
  soldierRadius: 0.3,
  sweepStep: 0.15,
  truckLength: 7,
  truckWidth: 2.5,
  siteClearance: 8,
  maxTents: 8,
  carSpacingM: 24,
  carCandidateModulo: 11,
  carSectorCells: 32,
  props: {
    Tent: { length: 8, width: 4 },
    Container_Long: { length: 8, width: 4 },
    Tank: { length: 8, width: 4 },
    Debris_BrokenCar: { length: 8, width: 4 },
    Barrier_Large: { length: 4, width: 4 },
    SackTrench: { length: 4, width: 4 },
  },
} as const;
