import { describe, expect, it } from 'vitest';
import { SoldierCondition, ZombieKind, ZombieState } from '@vazante/shared';
import { addSquad, disarm, fieldEngine, soldiersOf } from './helpers.ts';
import { killSoldier } from '../src/systems/lifecycle.ts';

describe('infection', () => {
  it('a bitten soldier turns between 60 and 180 s later', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const e = fieldEngine(seed);
      const q = addSquad(e, 'guard', 128, 128);
      const s = soldiersOf(e, q.id)[0];
      for (const o of soldiersOf(e, q.id)) disarm(o);
      s.hp = 1e6;
      const z = e.world.zombies.spawn(s.x, s.y + 0.5, ZombieKind.Common, ZombieState.Chasing);
      let bittenAt = -1;
      for (let t = 0; t < 2000 && bittenAt < 0; t++) {
        e.tick();
        if (s.condition === SoldierCondition.Bitten) bittenAt = e.world.tick;
      }
      expect(bittenAt).toBeGreaterThan(0);
      e.world.zombies.kill(z);
      const before = e.world.zombies.alive;
      const turned = () => e.world.soldiers.filter((x) => x.condition === SoldierCondition.Turned).length;
      const turnedBefore = turned();
      let turnedAt = -1;
      for (let t = 0; t < 2000 && turnedAt < 0; t++) {
        e.tick();
        if (s.condition === SoldierCondition.Turned) turnedAt = e.world.tick;
      }
      const dt = turnedAt - bittenAt;
      expect(dt).toBeGreaterThanOrEqual(600);
      expect(dt).toBeLessThanOrEqual(1801);
      // Each soldier who turned (squadmates the zombie also bit included) rose as one infected.
      expect(e.world.zombies.alive).toBe(before + turned() - turnedBefore);
    }
  });

  it('killed by zombies rises after 20 s; killed by explosion does not', () => {
    const e = fieldEngine();
    const q = addSquad(e, 'guard', 128, 128);
    const [a, b] = soldiersOf(e, q.id);
    killSoldier(e.world, a, true);
    killSoldier(e.world, b, false);
    const t0 = e.world.tick;
    e.runTicks(199);
    expect(a.condition).toBe(SoldierCondition.Dead);
    e.runTicks(2);
    expect(a.condition).toBe(SoldierCondition.Turned);
    expect(b.condition).toBe(SoldierCondition.Dead);
    e.runTicks(1000);
    expect(b.condition).toBe(SoldierCondition.Dead);
    expect(e.world.tick - t0).toBe(1201);
  });
});
