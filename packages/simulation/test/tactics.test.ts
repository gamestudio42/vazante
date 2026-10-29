import { describe, expect, it } from 'vitest';
import { Ground, STRESS, ZombieKind, ZombieState } from '@vazante/shared';
import { addSquad, fieldEngine, soldiersOf } from './helpers.ts';

describe('suppression', () => {
  it('a non-lethal hit staggers a brute, and a staggered zombie barely moves', () => {
    const e = fieldEngine(2);
    addSquad(e, 'guard', 128, 128);
    const z = e.world.zombies;
    const brute = z.spawn(128, 100, ZombieKind.Brute, ZombieState.Chasing);
    let staggered = false;
    for (let t = 0; t < 40 && !staggered; t++) {
      e.tick();
      staggered = z.isAlive(brute) && z.stagger[brute] > 0;
    }
    expect(staggered).toBe(true);

    const run = (stagger: boolean) => {
      const f = fieldEngine(2);
      const s = f.world.zombies.spawn(40, 40, ZombieKind.Common, ZombieState.Chasing);
      addSquad(f, 'guard', 200, 40);
      for (const so of f.world.soldiers) so.ammo = so.mag = 0;
      const y0 = f.world.zombies.x[s];
      for (let t = 0; t < 10; t++) {
        if (stagger) f.world.zombies.stagger[s] = 5;
        f.tick();
      }
      return Math.abs(f.world.zombies.x[s] - y0);
    };
    expect(run(true)).toBeLessThan(run(false) * 0.4);
  });
});

describe('fire distribution', () => {
  it('a squad facing a cluster spreads its fire instead of all shooting the nearest', () => {
    const e = fieldEngine(4);
    const q = addSquad(e, 'guard', 128, 160);
    for (let i = 0; i < 6; i++) e.world.zombies.spawn(124 + i * 1.6, 135 - (i % 2) * 0.8, ZombieKind.Brute, ZombieState.Wandering);
    e.runTicks(12);
    const targets = new Set(soldiersOf(e, q.id).map((s) => s.target).filter((t) => t >= 0));
    expect(targets.size).toBeGreaterThanOrEqual(3);
  });
});

describe('cover', () => {
  it('a holding squad in hold stance moves up to the wall in front of it', () => {
    const e = fieldEngine(1);
    const g = e.world.grid;
    // A row of ruins two cells in front (north) of the squad.
    for (let cx = 28; cx <= 36; cx++) g.ground[g.idx(cx, 29)] = Ground.Building;
    const q = addSquad(e, 'guard', 128, 128);
    e.enqueue({ type: 'stance', squads: [q.id], stance: 'hold' });
    e.runTicks(80);
    const covered = soldiersOf(e, q.id).filter((s) => s.inCover).length;
    expect(covered).toBeGreaterThanOrEqual(Math.ceil(q.members.length / 2));
    for (const s of soldiersOf(e, q.id)) expect(g.isWalkableAt(s.x, s.y)).toBe(true);
  });

  it('cover softens stress', () => {
    const stressAfter = (cover: boolean) => {
      const e = fieldEngine(1);
      const q = addSquad(e, 'guard', 128, 128);
      const s = soldiersOf(e, q.id)[0];
      for (const so of soldiersOf(e, q.id)) so.ammo = so.mag = 0;
      if (cover) e.world.grid.ground[e.world.grid.cellAt(s.x, s.y) - 1] = Ground.Building;
      for (let i = 0; i < 5; i++) e.world.zombies.spawn(s.x + 6, s.y + i * 0.5 - 1, ZombieKind.Common, ZombieState.Wandering);
      // Freeze the zombies and soldiers to isolate morale.
      for (let t = 0; t < 20; t++) {
        for (let k = 0; k < 5; k++) e.world.zombies.attackCd[k] = 99;
        e.tick();
      }
      return s.stress;
    };
    expect(stressAfter(true)).toBeLessThan(stressAfter(false));
  });
});

describe('morale', () => {
  it('stress rises with zombies close and recovers when they are gone', () => {
    const e = fieldEngine(1);
    const q = addSquad(e, 'guard', 128, 128);
    const s = soldiersOf(e, q.id)[0];
    for (const so of soldiersOf(e, q.id)) so.ammo = so.mag = 0;
    const slots: number[] = [];
    for (let i = 0; i < 6; i++) slots.push(e.world.zombies.spawn(s.x + 5, s.y + i - 3, ZombieKind.Common, ZombieState.Wandering));
    e.runTicks(30);
    const high = s.stress;
    expect(high).toBeGreaterThan(5);
    for (const z of slots) if (e.world.zombies.isAlive(z)) e.world.zombies.kill(z);
    e.runTicks(60);
    expect(s.stress).toBeLessThan(high);
  });

  it('a soldier at breaking point panics, holds fire and runs, then steadies', () => {
    const e = fieldEngine(1);
    const q = addSquad(e, 'guard', 128, 128);
    const s = soldiersOf(e, q.id)[0];
    const z = e.world.zombies.spawn(s.x, s.y - 6, ZombieKind.Brute, ZombieState.Wandering);
    s.stress = 99;
    const events: string[] = [];
    e.tick();
    events.push(...e.frame(false).events.map((ev) => ev.type));
    expect(s.panicT).toBeGreaterThan(0);
    expect(events).toContain('soldier_panicked');
    const d0 = Math.hypot(s.x - e.world.zombies.x[z], s.y - e.world.zombies.y[z]);
    const shots0 = s.mag + s.ammo;
    e.runTicks(10);
    expect(s.target).toBe(-1);
    expect(s.mag + s.ammo).toBe(shots0);
    expect(Math.hypot(s.x - e.world.zombies.x[z], s.y - e.world.zombies.y[z])).toBeGreaterThan(d0);
    e.runTicks(STRESS.panicTicks);
    expect(s.panicT).toBe(0);
    expect(s.stress).toBeLessThanOrEqual(STRESS.afterPanic + 5);
    expect(s.panicCd).toBeGreaterThan(0);
  });

  it('a squad radios first contact once, not every tick', () => {
    const e = fieldEngine(1);
    addSquad(e, 'guard', 128, 128);
    e.world.zombies.spawn(128, 100, ZombieKind.Brute, ZombieState.Wandering);
    let contacts = 0;
    for (let t = 0; t < 60; t++) {
      e.tick();
      contacts += e.frame(false).events.filter((ev) => ev.type === 'squad_contact').length;
    }
    expect(contacts).toBe(1);
  });
});

describe('suppressive fire', () => {
  it('pins a whole cluster of brutes, and fires faster than an aggressive squad', () => {
    const run = (stance: 'aggressive' | 'suppress') => {
      const e = fieldEngine(5);
      const q = addSquad(e, 'guard', 128, 160);
      e.enqueue({ type: 'stance', squads: [q.id], stance });
      const z = e.world.zombies;
      const pack: number[] = [];
      for (let i = 0; i < 5; i++) pack.push(z.spawn(126 + i * 0.8, 120, ZombieKind.Brute, ZombieState.Wandering));
      let pinned = 0;
      for (let t = 0; t < 30; t++) {
        e.tick();
        pinned = Math.max(pinned, pack.filter((s) => z.isAlive(s) && z.stagger[s] > 0).length);
      }
      return { pinned, shots: e.world.stats.shotsFired };
    };
    const agg = run('aggressive');
    const sup = run('suppress');
    expect(sup.pinned).toBeGreaterThanOrEqual(4);
    expect(sup.pinned).toBeGreaterThan(agg.pinned);
    expect(sup.shots).toBeGreaterThan(agg.shots);
  });
});

describe('flank', () => {
  it("infected behind the squad's front wear a soldier down faster than the same number in front", () => {
    const stress = (behind: boolean) => {
      const e = fieldEngine(6);
      const q = addSquad(e, 'guard', 128, 128);
      const s = soldiersOf(e, q.id)[0];
      for (const so of e.world.soldiers) so.ammo = so.mag = 0;
      for (const so of e.world.soldiers) if (so !== s) so.x = 20;
      for (let i = 0; i < 3; i++) e.world.zombies.spawn(s.x - 1 + i, behind ? s.y + 5 : s.y - 5, ZombieKind.Common, ZombieState.Wandering);
      q.hx = 0;
      q.hy = -1;
      s.stress = 0;
      e.tick();
      return s.stress;
    };
    expect(stress(true)).toBeGreaterThan(stress(false) * 1.5);
  });
});
