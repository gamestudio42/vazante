import { describe, expect, it } from 'vitest';
import { MISSIONS, MISSION_MOOD, MOODS, OUTCOME_GRADE, moodFor } from '@vazante/shared';
import { SimulationEngine } from '../src/index.ts';

describe('mission moods', () => {
  it('every mission has a mood and unknown scenarios are clear', () => {
    for (const id of Object.keys(MISSIONS)) expect(MOODS[MISSION_MOOD[id]]).toBeDefined();
    expect(moodFor('city_war')).toBe(MOODS.clear);
    expect(moodFor(undefined)).toBe(MOODS.clear);
    expect(moodFor('hospital')).toBe(MOODS.overcast);
  });

  it('stay within a range that keeps the scene readable', () => {
    for (const m of Object.values(MOODS)) {
      for (const v of [...m.light, ...m.sky, ...m.grade]) {
        expect(v).toBeGreaterThanOrEqual(0.7);
        expect(v).toBeLessThanOrEqual(1.15);
      }
      expect(m.saturation).toBeGreaterThanOrEqual(0.7);
      expect(m.saturation).toBeLessThanOrEqual(1.15);
      expect(m.vignette).toBeLessThanOrEqual(0.15);
    }
    expect(OUTCOME_GRADE.lost.saturation).toBeLessThan(0.5);
  });

  it('are cosmetic: the frame carries no mood and the world is the same', () => {
    const e = SimulationEngine.create(4, 'hospital');
    expect(Object.keys(e.frame(false))).not.toContain('mood');
  });
});
