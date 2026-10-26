import { SoldierActivity, SoldierCondition, ZombieKind, ZombieState, RISE_AFTER_DEATH_S, TICK_HZ } from '@vazante/shared';
import type { Soldier } from '../entities.ts';
import type { World } from '../world.ts';

/** Kill a soldier. Soldiers killed by zombies rise later unless the body is destroyed. */
export function killSoldier(w: World, s: Soldier, byZombie: boolean): void {
  if (s.condition === SoldierCondition.Dead || s.condition === SoldierCondition.Turned) return;
  s.condition = SoldierCondition.Dead;
  s.hp = 0;
  s.target = -1;
  s.activity = SoldierActivity.Idle;
  s.turnAt = -1;
  s.riseAt = byZombie ? w.tick + RISE_AFTER_DEATH_S * TICK_HZ : -1;
  releaseDirect(w, s);
  w.emit({ type: 'soldier_died', source: s.id, x: s.x, y: s.y });
}

/** A soldier becomes a zombie at its position. */
export function turnSoldier(w: World, s: Soldier): void {
  const wasDead = s.condition === SoldierCondition.Dead;
  s.condition = SoldierCondition.Turned;
  s.hp = 0;
  s.turnAt = -1;
  s.riseAt = -1;
  s.target = -1;
  releaseDirect(w, s);
  const slot = w.zombies.spawn(s.x, s.y, ZombieKind.Common, ZombieState.Chasing);
  w.emit({ type: wasDead ? 'zombie_risen' : 'soldier_turned', source: s.id, target: slot, x: s.x, y: s.y });
}

export function releaseDirect(w: World, s: Soldier): void {
  if (w.directSoldier === s.id) {
    w.directSoldier = null;
    w.emit({ type: 'direct_control', source: s.id, value: 0 });
  }
  s.direct = null;
}
