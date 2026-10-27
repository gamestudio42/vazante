import { describe, expect, it } from 'vitest';
import { BLOATER, MISSIONS, SCREAMER, TICK_HZ, ZombieKind, ZombieState } from '@vazante/shared';
import { SimulationEngine } from '../src/index.ts';
import { killZombie } from '../src/systems/infected.ts';
import { addSquad, disarm, fieldEngine, soldiersOf } from './helpers.ts';

describe('Gritador', () => {
  it('a screamer that sees soldiers wakes the wanderers within earshot', () => {
    const e = fieldEngine(1, 64);
    const w = e.world;
    const q = addSquad(e, 'slice', 20, 20);
    for (const s of soldiersOf(e, q.id)) disarm(s);
    w.zombies.spawn(40, 20, ZombieKind.Screamer, ZombieState.Chasing);
    // Far wanderers: out of sight of the squad, inside the scream radius.
    const far: number[] = [];
    for (let i = 0; i < 6; i++) far.push(w.zombies.spawn(40 + i * 3, 110, ZombieKind.Common, ZombieState.Wandering));
    const seen: string[] = [];
    for (let t = 0; t < SCREAMER.everyS * TICK_HZ + 2; t++) {
      e.tick();
      for (const ev of e.frame(false).events) seen.push(ev.type);
    }
    expect(seen).toContain('zombie_scream');
    expect(far.filter((s) => w.zombies.state[s] !== ZombieState.Wandering).length).toBeGreaterThan(3);
  });

  it('a screamer with no soldier in sight stays quiet', () => {
    const e = fieldEngine(1, 64);
    e.world.zombies.spawn(40, 20, ZombieKind.Screamer, ZombieState.Chasing);
    const seen: string[] = [];
    for (let t = 0; t < SCREAMER.everyS * TICK_HZ * 2; t++) {
      e.tick();
      for (const ev of e.frame(false).events) seen.push(ev.type);
    }
    expect(seen).not.toContain('zombie_scream');
  });
});

describe('Inchado', () => {
  it('bursts on death: hurts the soldiers and zombies close by, chains into other bloaters', () => {
    const e = fieldEngine(1, 64);
    const w = e.world;
    const q = addSquad(e, 'slice', 100, 100);
    const near = soldiersOf(e, q.id)[0];
    near.x = 101;
    near.y = 100;
    const hp = near.hp;
    const a = w.zombies.spawn(100, 100, ZombieKind.Bloater, ZombieState.Wandering);
    const b = w.zombies.spawn(101.5, 100, ZombieKind.Bloater, ZombieState.Wandering);
    const c = w.zombies.spawn(104.5, 100, ZombieKind.Common, ZombieState.Wandering);
    const far = w.zombies.spawn(100, 130, ZombieKind.Common, ZombieState.Wandering);
    w.rebuildZombieHash();
    killZombie(w, a, 0);
    const bursts = w.events.filter((ev) => ev.type === 'zombie_burst').length;
    expect(bursts).toBe(2); // b chained
    expect(w.zombies.isAlive(b)).toBe(false);
    expect(w.zombies.isAlive(c)).toBe(false);
    expect(w.zombies.isAlive(far)).toBe(true);
    expect(near.hp).toBeLessThan(hp);
    expect(hp - near.hp).toBeLessThanOrEqual(BLOATER.soldierDamage * 2);
    expect(w.stats.zombiesKilled).toBe(3);
  });

  it('the first mission keeps to the basic roster; the city missions roll every kind', () => {
    const count = (e: SimulationEngine, k: ZombieKind) => {
      const z = e.world.zombies;
      let n = 0;
      for (let s = 0; s < z.highWater; s++) if (z.isAlive(s) && z.kind[s] === k) n++;
      return n;
    };
    const slice = SimulationEngine.create(1, 'last_convoy');
    expect(count(slice, ZombieKind.Screamer) + count(slice, ZombieKind.Bloater)).toBe(0);
    const city = SimulationEngine.create(1, 'hospital');
    expect(MISSIONS.hospital.zombieKinds).toBe(5);
    expect(count(city, ZombieKind.Screamer)).toBeGreaterThan(30);
    expect(count(city, ZombieKind.Bloater)).toBeGreaterThan(30);
  });
});
