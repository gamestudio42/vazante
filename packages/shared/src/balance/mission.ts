/** "O Último Comboio" scenario numbers. */
export const SLICE = {
  civilians: 40,
  baseMaterials: 160,
  baseAmmo: 300,
  truckAmmo: 4000,
  truckMaterials: 240,
  /** Zombies per wave, after the cargo reaches the base. */
  waves: [60, 100, 150] as readonly number[],
  /** Warning before each wave (seconds), drawn uniformly. */
  warningMinS: 20,
  warningMaxS: 40,
  /** Quiet time after a wave is cleared before the next warning. */
  calmS: 20,
  /** Wave spawns stay at least this far from the base. */
  spawnMinDistM: 200,
} as const;

/** District control: updated every `intervalTicks`; 100 held, 0 lost. */
export const DISTRICT = {
  intervalTicks: 10,
  /** Zombies per soldier above which a district loses control. */
  overrunRatio: 5,
  minZombies: 15,
  heldAbove: 66,
  lostAt: 0,
} as const;
