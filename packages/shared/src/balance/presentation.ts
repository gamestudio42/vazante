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
    maxDetails: 12,
    wearMin: 0.12,
    wearRange: 0.3,
  },
  surface: {
    detailFadeStartM: 0.12,
    detailFadeEndM: 0.65,
    grainStrength: 0.12,
    pavementTileM: 0.75,
  },
} as const;
