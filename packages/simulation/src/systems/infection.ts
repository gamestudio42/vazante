import { SoldierCondition } from '@vazante/shared';
import type { World } from '../world.ts';
import { turnSoldier } from './lifecycle.ts';

/** Bitten soldiers turn; soldiers killed by zombies rise. */
export function stepInfection(w: World): void {
  for (const s of w.soldiers) {
    if (s.condition === SoldierCondition.Bitten && s.turnAt >= 0 && w.tick >= s.turnAt) turnSoldier(w, s);
    else if (s.condition === SoldierCondition.Dead && s.riseAt >= 0 && w.tick >= s.riseAt) turnSoldier(w, s);
  }
}
