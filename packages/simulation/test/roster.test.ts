import { describe, expect, it } from 'vitest';
import { MISSIONS, SQUADS, VETERANCY, ZombieKind, ZombieState, clampRank, rankForXp } from '@vazante/shared';
import { SimulationEngine } from '../src/index.ts';
import { addSquad, fieldEngine, soldiersOf } from './helpers.ts';
import { addStress } from '../src/systems/morale.ts';

describe('veterancy rules', () => {
  it('ranks follow the experience thresholds', () => {
    expect(rankForXp(0)).toBe(0);
    expect(rankForXp(VETERANCY.ranks[1] - 1)).toBe(0);
    expect(rankForXp(VETERANCY.ranks[1])).toBe(1);
    expect(rankForXp(10_000)).toBe(VETERANCY.ranks.length - 1);
    expect(clampRank(-2)).toBe(0);
    expect(clampRank(99)).toBe(VETERANCY.ranks.length - 1);
    expect(clampRank(1.5)).toBe(0);
  });
});

describe('campaign crew in the simulation', () => {
  const crewOf = (rank: number) =>
    MISSIONS.last_convoy.squads.map((q, i) => SQUADS[q.kind].weapons.map((_, k) => ({ rid: 100 + i * 10 + k, rank })));

  it('a mission seats the roster soldiers in their squads, with their rank, and shows them in the frame', () => {
    const e = SimulationEngine.create(3, 'last_convoy', { crew: crewOf(2) });
    const squads = e.world.squads;
    expect(e.world.soldier(squads[0].members[0])).toMatchObject({ rid: 100, rank: 2 });
    expect(e.world.soldier(squads[1].members[2])).toMatchObject({ rid: 112, rank: 2 });
    const f = e.frame(false);
    expect(f.crew).toHaveLength(squads.reduce((n, q) => n + q.members.length, 0));
    expect(f.crew[0]).toMatchObject({ rid: 100, rank: 2, kills: 0 });
  });

  it('without a crew nothing changes: the same hash as before rosters', () => {
    const a = SimulationEngine.create(3, 'last_convoy');
    const b = SimulationEngine.create(3, 'last_convoy', { crew: [] });
    expect(a.hashState()).toBe(b.hashState());
    expect(a.frame(false).crew).toEqual([]);
  });

  it('ranks change the hash, survive a save and load, and stay deterministic', () => {
    const a = SimulationEngine.create(3, 'last_convoy', { crew: crewOf(3) });
    const b = SimulationEngine.create(3, 'last_convoy', { crew: crewOf(0) });
    expect(a.hashState()).not.toBe(b.hashState());
    a.runTicks(50);
    const loaded = SimulationEngine.load(a.save());
    a.runTicks(200);
    loaded.runTicks(200);
    expect(loaded.hashState()).toBe(a.hashState());
  });
});

describe('kills and rank in combat', () => {
  /** A squad facing a line of brutes; returns the brutes left and each soldier's kills. */
  const fight = (rank: number) => {
    const e = fieldEngine(5);
    const q = addSquad(e, 'guard', 128, 180);
    const soldiers = soldiersOf(e, q.id);
    soldiers.forEach((s, i) => {
      s.rid = i + 1;
      if (rank) s.rank = rank;
    });
    for (let i = 0; i < 40; i++) e.world.zombies.spawn(100 + (i % 20) * 3, 100 - Math.floor(i / 20) * 4, ZombieKind.Common, ZombieState.Wandering);
    e.runTicks(120);
    return { killed: e.world.stats.zombiesKilled, kills: soldiers.map((s) => s.kills ?? 0) };
  };

  it('each kill is credited to the soldier who fired it', () => {
    const { killed, kills } = fight(0);
    expect(killed).toBeGreaterThan(0);
    expect(kills.reduce((a, b) => a + b, 0)).toBe(killed);
  });

  it('veterans kill more in the same fight', () => {
    expect(fight(4).killed).toBeGreaterThan(fight(0).killed);
  });

  it('veterans take less stress from the same scare', () => {
    const e = fieldEngine(1);
    const [rookie, vet] = soldiersOf(e, addSquad(e, 'guard', 128, 128).id);
    vet.rank = 4;
    addStress(rookie, 50);
    addStress(vet, 50);
    expect(vet.stress).toBeCloseTo(rookie.stress * (1 - 4 * VETERANCY.stressPerRank));
  });
});
