/** Cosmetic tuning only: none of these values may affect simulation or visibility. */
export const PRESENTATION = {
  directCamera: { clearance: 0.6, distance: 12, height: 8, targetHeight: 1.5, returnSeconds: 0.3, hideSoldierBelowM: 2.5, showSoldierAboveM: 3 },
  post: {
    saturation: 1.04,
    surfaceDither: 0.22,
    shadowLift: 0.2,
    shadowLiftEnd: 0.35,
    outlineTactical: 0.62,
    outlineStrategic: 0.28,
    vignetteTactical: 0.18,
    vignetteStrategic: 0.08,
    skyElevation: 0.65,
  },
  facade: {
    detailFadeStart: 0.18,
    detailFadeEnd: 0.55,
  },
  architecture: {
    inset: 0.3,
    trimProjection: 0.12,
    corniceHeight: 0.28,
    corniceWidth: 0.24,
    floorHeight: 3,
    shopHeight: 2.6,
    neighborhoodCells: 16,
    industrialMaxHeight: 12,
    industrialMinWidth: 8,
    balconyRows: 3,
    civicColumns: 3,
    maxDetails: 22,
    waterfrontCells: 12,
    referenceRadiusM: 40,
    roofRise: 2.4,
    roofMaxFraction: 0.25,
    roofSetback: 1.2,
    pitchedMaxHeight: 15,
    podiumHeight: 0.45,
    canopyDepth: 0.5,
    canopyWidthFraction: 0.65,
    pavingSlabTexels: 4,
    pavingJointShade: 0.84,
    pavingVariation: 0.035,
    wearMin: 0.12,
    wearRange: 0.3,
  },
  street: {
    crossingMaxCells: 12,
    /** Widest street (cells) that gets a centre line; avenues are 4, wider runs are junctions. */
    centreLineMaxWidthCells: 6,
    stripeTexels: 2,
    crossingHalfWidthTexels: 2,
    signHeight: 2.4,
    signSize: 0.8,
    foliage: [0x3f6b35, 0x566c38, 0x315c48],
    treeDensityModulo: [2, 3, 2],
    treeScale: [1, 0.85, 1.15],
  },
  surface: {
    detailFadeStartM: 0.12,
    detailFadeEndM: 0.65,
    grainStrength: 0.12,
    pavementTileM: 0.75,
  },
} as const;

/**
 * A mission's look. Cosmetic only: the clock, sight ranges and the hash are the same under every
 * mood. `light` multiplies the sun and the ambient light, `sky` the sky and the fog, `grade` the
 * final image (after saturation); `saturation` scales PRESENTATION.post.saturation and `vignette`
 * is added to the view's vignette.
 */
export interface Mood {
  light: readonly [number, number, number];
  sky: readonly [number, number, number];
  grade: readonly [number, number, number];
  saturation: number;
  vignette: number;
}

export type MoodId = 'clear' | 'amber' | 'overcast' | 'haze' | 'ember' | 'dust' | 'sodium' | 'storm';

export const MOODS: Readonly<Record<MoodId, Mood>> = {
  /** No change: survival and the sandbox, where a long day should look like a day. */
  clear: { light: [1, 1, 1], sky: [1, 1, 1], grade: [1, 1, 1], saturation: 1, vignette: 0 },
  /** O Último Comboio: the last warm light of the day. */
  amber: { light: [1.06, 0.98, 0.86], sky: [1.08, 0.96, 0.84], grade: [1.04, 1, 0.93], saturation: 1.06, vignette: 0.04 },
  /** Hospital São Lucas: flat, cold and washed out. */
  overcast: { light: [0.9, 0.97, 1], sky: [0.86, 0.94, 0.98], grade: [0.95, 1, 1.01], saturation: 0.78, vignette: 0.06 },
  /** A Ponte: river haze, blue and soft. */
  haze: { light: [0.92, 0.98, 1.06], sky: [0.9, 1, 1.1], grade: [0.95, 1, 1.07], saturation: 0.86, vignette: 0.05 },
  /** Retomar a Ribeira: smoke over a burning district. */
  ember: { light: [1.1, 0.9, 0.76], sky: [1.12, 0.84, 0.7], grade: [1.07, 0.97, 0.88], saturation: 1.1, vignette: 0.1 },
  /** Linha de Suprimento: dry yellow dust on the road. */
  dust: { light: [1.1, 1.02, 0.78], sky: [1.08, 1, 0.78], grade: [1.06, 1.02, 0.84], saturation: 0.88, vignette: 0.03 },
  /** Plantão Noturno: teal shadow, for the orange street lamps to stand against. */
  sodium: { light: [0.92, 1, 1.02], sky: [0.8, 1, 1.06], grade: [0.94, 1.02, 1.04], saturation: 1.12, vignette: 0.1 },
  /** O Último Trem: heavy steel sky before the storm. */
  storm: { light: [0.84, 0.9, 0.98], sky: [0.72, 0.8, 0.9], grade: [0.94, 0.98, 1.03], saturation: 0.74, vignette: 0.14 },
};

/** The mood of each mission, by mission id; anything else is `clear`. */
export const MISSION_MOOD: Readonly<Record<string, MoodId>> = {
  last_convoy: 'amber',
  hospital: 'overcast',
  bridge: 'haze',
  retake: 'ember',
  supply_line: 'dust',
  night_shift: 'sodium',
  last_train: 'storm',
  survival: 'clear',
};

export function moodFor(mission: string | undefined): Mood {
  return MOODS[(mission && MISSION_MOOD[mission]) || 'clear'];
}

/** Camera scenes around a mission. The player's first click, key or wheel ends the opening. */
export const SCENES = {
  /** Opening: the view starts this wide (metres of visible height) and closes in on the base. */
  openingSpan: 320,
  openingSeconds: 4,
  /** The mission title stays on screen this long. */
  titleSeconds: 5,
  /** Victory: the camera circles the field at this many radians a second. */
  victoryOrbit: 0.04,
} as const;

/** How the image changes when the mission ends, eased in over `seconds`. */
export const OUTCOME_GRADE = {
  seconds: 2.5,
  /** Defeat drains the colour and closes the frame. */
  lost: { saturation: 0.3, vignette: 0.3 },
  /** Victory is a little richer. */
  won: { saturation: 1.12, vignette: 0 },
} as const;
