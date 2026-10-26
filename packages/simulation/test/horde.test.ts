import { describe, expect, it } from 'vitest';
import { Ground, ZombieKind, ZombieState } from '@vazante/shared';
import { addSquad, disarm, fieldEngine, soldiersOf } from './helpers.ts';

describe('horde', () => {
  it('a zombie 20 m from a visible soldier reaches contact within 20 s', () => {
    const e = fieldEngine();
    const q = addSquad(e, 'guard', 128, 128);
    for (const s of soldiersOf(e, q.id)) disarm(s);
    const slot = e.world.zombies.spawn(128, 108, ZombieKind.Common, ZombieState.Wandering);
    let contact = -1;
    for (let t = 0; t < 200 && contact < 0; t++) {
      e.tick();
      if (e.world.zombies.state[slot] === ZombieState.Attacking) contact = t;
    }
    expect(contact).toBeGreaterThan(0);
    expect(contact).toBeLessThanOrEqual(200);
  });

  it('gunfire makes zombies behind a wall start chasing', () => {
    const e = fieldEngine();
    const g = e.world.grid;
    // A building block between the squad and the hidden zombie.
    for (let y = 24; y <= 27; y++) for (let x = 25; x <= 38; x++) g.ground[g.idx(x, y)] = Ground.Building;
    const q = addSquad(e, 'guard', 128, 128);
    const hidden = e.world.zombies.spawn(128, 92, ZombieKind.Common, ZombieState.Wandering);
    e.world.zombies.spawn(150, 122, ZombieKind.Common, ZombieState.Wandering); // visible, gets shot
    expect(g.lineOfSight(128, 128, 128, 92)).toBe(false);
    let chasing = false;
    for (let t = 0; t < 50 && !chasing; t++) {
      e.tick();
      chasing = e.world.zombies.state[hidden] === ZombieState.Chasing || e.world.zombies.state[hidden] === ZombieState.Attacking;
    }
    expect(chasing).toBe(true);
    expect(q).toBeDefined();
  });

  it('separation keeps at most 12 zombies per 4 m cell', () => {
    const e = fieldEngine();
    const q = addSquad(e, 'guard', 128, 128);
    for (const s of soldiersOf(e, q.id)) {
      disarm(s);
      s.hp = 1e9;
    }
    for (let i = 0; i < 300; i++) e.world.zombies.spawn(90 + (i % 30) * 1.3, 40 + Math.floor(i / 30) * 1.3, ZombieKind.Common, ZombieState.Chasing);
    e.runTicks(400);
    const counts = new Map<number, number>();
    const z = e.world.zombies;
    for (let s = 0; s < z.highWater; s++) {
      if (!z.isAlive(s)) continue;
      const c = e.world.grid.cellAt(z.x[s], z.y[s]);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(12);
  });

  it('zombies never enter a building cell', () => {
    const e = fieldEngine();
    const g = e.world.grid;
    for (let y = 28; y <= 35; y++) for (let x = 20; x <= 44; x++) g.ground[g.idx(x, y)] = Ground.Building;
    const q = addSquad(e, 'guard', 128, 180);
    for (const s of soldiersOf(e, q.id)) {
      disarm(s);
      s.hp = 1e9;
    }
    for (let i = 0; i < 200; i++) e.world.zombies.spawn(90 + (i % 40) * 2, 60 + Math.floor(i / 40) * 2, ZombieKind.Common, ZombieState.Chasing);
    for (let t = 0; t < 600; t++) {
      e.tick();
      const z = e.world.zombies;
      for (let s = 0; s < z.highWater; s++) if (z.isAlive(s)) expect(g.isWalkableAt(z.x[s], z.y[s])).toBe(true);
    }
  });
});
