import { describe, expect, it } from 'vitest';
import { ZombieKind, ZombieState } from '@vazante/shared';
import { isActiveSoldier } from '../src/index.ts';
import { addSquad, fieldEngine, soldiersOf } from './helpers.ts';

function lineBattle(seed: number) {
  const e = fieldEngine(seed);
  const q = addSquad(e, 'guard', 128, 200);
  for (let i = 0; i < 300; i++) {
    const x = 96 + (i % 50) * 1.3;
    const y = 155 - Math.floor(i / 50) * 1.3;
    e.world.zombies.spawn(x, y, ZombieKind.Common, ZombieState.Chasing);
  }
  const ammo0 = soldiersOf(e, q.id).reduce((a, s) => a + s.ammo + s.mag, 0);
  for (let t = 0; t < 3000 && e.world.zombies.alive > 0; t++) e.tick();
  return { e, q, ammo0 };
}

describe('combat', () => {
  it('an idle guard squad beats 300 commons in a line on 10 of 10 seeds', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { e, q } = lineBattle(seed);
      expect(e.world.zombies.alive, `seed ${seed}`).toBe(0);
      expect(soldiersOf(e, q.id).some(isActiveSoldier), `seed ${seed}`).toBe(true);
    }
  });

  it('ammunition spent stays spent', () => {
    const { e, q, ammo0 } = lineBattle(3);
    const ammo1 = soldiersOf(e, q.id).reduce((a, s) => a + s.ammo + s.mag, 0);
    expect(e.world.stats.shotsFired).toBeGreaterThan(0);
    expect(ammo0 - ammo1).toBe(e.world.stats.shotsFired);
  });

  it('soldiers stop firing and report when out of ammo', () => {
    const e = fieldEngine();
    const q = addSquad(e, 'guard', 128, 200);
    const s = soldiersOf(e, q.id)[0];
    for (const o of soldiersOf(e, q.id)) {
      o.ammo = 0;
      o.mag = 1;
    }
    e.world.zombies.spawn(128, 180, ZombieKind.Brute, ZombieState.Wandering);
    let events: string[] = [];
    for (let t = 0; t < 30; t++) {
      e.tick();
      events = events.concat(e.frame(false).events.map((ev) => ev.type));
    }
    expect(events).toContain('out_of_ammo');
    expect(s.mag + s.ammo).toBe(0);
  });

  it('hold only engages inside the front arc', () => {
    const e = fieldEngine();
    const q = addSquad(e, 'guard', 128, 128); // faces north (-y)
    e.enqueue({ type: 'stance', squads: [q.id], stance: 'hold' });
    e.world.zombies.spawn(128, 170, ZombieKind.Brute, ZombieState.Wandering); // behind
    e.runTicks(15);
    expect(e.world.stats.shotsFired).toBe(0);
    e.world.zombies.spawn(128, 90, ZombieKind.Brute, ZombieState.Wandering); // in front
    e.runTicks(15);
    expect(e.world.stats.shotsFired).toBeGreaterThan(0);
  });
});
