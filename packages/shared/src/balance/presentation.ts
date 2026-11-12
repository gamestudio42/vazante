/** Cosmetic tuning only: none of these values may affect simulation or visibility. */
export const PRESENTATION = {
  post: {
    saturation: 1.04,
    shadowLift: 0.2,
    shadowLiftEnd: 0.35,
    outlineTactical: 0.62,
    outlineStrategic: 0.28,
    vignetteTactical: 0.18,
    vignetteStrategic: 0.08,
    skyElevation: 0.65,
  },
  facade: {
    detailFadeStart: 0.25,
    detailFadeEnd: 0.75,
  },
} as const;
