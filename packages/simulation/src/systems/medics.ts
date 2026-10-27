import { MEDIC, TICK_DT, SoldierCondition } from '@vazante/shared';
import type { Soldier } from '../entities.ts';
import { isActiveSoldier, type World } from '../world.ts';

/**
 * Each medic treats the most hurt soldier within MEDIC.rangeM (themself included) and slows the
 * infection of every bitten soldier there: their turn comes later by MEDIC.infectionSlow per tick.
 * A panicking medic treats no one.
 */
export function stepMedics(w: World): void {
  const r2 = MEDIC.rangeM * MEDIC.rangeM;
  const heal = MEDIC.healPerS * TICK_DT;
  const slowEvery = Math.round(1 / MEDIC.infectionSlow);
  for (const m of w.soldiers) {
    if (m.role !== 'medic' || !isActiveSoldier(m) || m.panicT > 0 || m.direct) continue;
    let worst: Soldier | undefined;
    let worstFrac = 1;
    for (const s of w.soldiers) {
      if (!isActiveSoldier(s) || (s.x - m.x) * (s.x - m.x) + (s.y - m.y) * (s.y - m.y) > r2) continue;
      if (s.condition === SoldierCondition.Bitten && s.turnAt >= 0 && w.tick % slowEvery === 0) s.turnAt++;
      const frac = s.hp / s.maxHp;
      if (frac < worstFrac) {
        worstFrac = frac;
        worst = s;
      }
    }
    if (worst) worst.hp = Math.min(worst.maxHp, worst.hp + heal);
  }
}
