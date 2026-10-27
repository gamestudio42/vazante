/** Difficulty levels. Veteran is the reference the rest of the balance tables are tuned for. */
export type DifficultyId = 'recruit' | 'veteran' | 'nightmare';

export const DIFFICULTY_IDS: readonly DifficultyId[] = ['recruit', 'veteran', 'nightmare'];

export interface DifficultyStats {
  /** Multiplies the zombies spread over the city at the start and each wave's size. */
  cityZombies: number;
  waveSize: number;
  /** Extra seconds of warning before each wave. */
  warningBonusS: number;
  /** Multiplies zombie damage and the chance a hit is a bite. */
  zombieDamage: number;
  biteChance: number;
  /** Multiplies stress gained under pressure. */
  stress: number;
  /** Added to the starting materials and ammunition at the base. */
  baseMaterials: number;
  baseAmmo: number;
}

export const DIFFICULTY: Readonly<Record<DifficultyId, DifficultyStats>> = {
  recruit: { cityZombies: 0.7, waveSize: 0.65, warningBonusS: 15, zombieDamage: 0.7, biteChance: 0.5, stress: 0.7, baseMaterials: 80, baseAmmo: 300 },
  veteran: { cityZombies: 1, waveSize: 1, warningBonusS: 0, zombieDamage: 1, biteChance: 1, stress: 1, baseMaterials: 0, baseAmmo: 0 },
  nightmare: { cityZombies: 1.3, waveSize: 1.4, warningBonusS: -10, zombieDamage: 1.25, biteChance: 1.4, stress: 1.25, baseMaterials: -40, baseAmmo: -100 },
};
