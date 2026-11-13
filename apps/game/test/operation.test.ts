import { describe, expect, it } from 'vitest';
import { MISSIONS, OPERATION, SoldierCondition } from '@vazante/shared';
import { canDeploy, choose, dailyKey, dailyRun, deploy, drawOffers, emptyStore, finishMission, missionTweaks, newRun, parseStore, recordRun, scoreOf, seedFor, type OperationRun } from '../src/operation.ts';
import { living } from '../src/roster.ts';

const rand = () => 0.5;

/** Deploy the current mission and end it with every soldier in `condition` and `kills` each. */
function play(run: OperationRun, won: boolean, kills = 10, condition = SoldierCondition.Ok): OperationRun {
  const d = deploy(run, rand);
  const results = d.crew.flat().map((s) => ({ rid: s.rid, kills, condition }));
  return finishMission(d.run, won, results, 1000).run;
}

describe('operation', () => {
  it('draws distinct city missions from the pool, the same for the same seed', () => {
    const a = newRun(42, null, 'veteran', 0);
    expect(a.missions).toHaveLength(OPERATION.missions);
    expect(new Set(a.missions).size).toBe(OPERATION.missions);
    for (const m of a.missions) expect(MISSIONS[m].map).toBe('city');
    expect(newRun(42, null, 'veteran', 5).missions).toEqual(a.missions);
  });

  it('gives everyone the same daily operation on a UTC date', () => {
    const morning = Date.UTC(2026, 10, 13, 1);
    const night = Date.UTC(2026, 10, 13, 23);
    expect(dailyKey(morning)).toBe('2026-11-13');
    expect(dailyRun(morning).seed).toBe(dailyRun(night).seed);
    expect(dailyRun(morning).missions).toEqual(dailyRun(night).missions);
    expect(dailyRun(Date.UTC(2026, 10, 14)).seed).not.toBe(dailyRun(morning).seed);
    expect(seedFor('x')).toBeGreaterThanOrEqual(1);
    expect(seedFor('x')).toBeLessThanOrEqual(999_999);
  });

  it('keeps the task force between missions and grows the threat', () => {
    let run = newRun(7, null, 'veteran', 0);
    expect(missionTweaks(run).zombieScale).toBe(1);
    const first = deploy(run, rand);
    run = play(run, true);
    expect(run.index).toBe(1);
    expect(run.offers).toEqual(drawOffers(7, 0));
    expect(canDeploy(run)).toBe(false);
    run = choose(run, run.offers[0]);
    expect(canDeploy(run)).toBe(true);
    expect(missionTweaks(run).zombieScale).toBeCloseTo(run.next.recon ? (1 + OPERATION.threatPerMission) * (1 - OPERATION.requisitions.recon) : 1 + OPERATION.threatPerMission);
    // Survivors of the first mission are still on the roster with its experience.
    const rids = new Set(living(run.roster).map((x) => x.rid));
    for (const s of first.crew.flat()) expect(rids.has(s.rid)).toBe(true);
  });

  it('ends on the first lost mission and sends the fallen to the memorial', () => {
    let run = newRun(7, null, 'veteran', 0);
    run = play(run, false, 3, SoldierCondition.Dead);
    expect(run.status).toBe('lost');
    expect(run.roster.fallen.length).toBeGreaterThan(0);
    expect(living(run.roster)).toHaveLength(0);
    expect(canDeploy(run)).toBe(false);
    // A finished run takes no more results.
    expect(finishMission(run, true, [], 0).run).toBe(run);
  });

  it('applies requisitions to the next mission only', () => {
    let run = play(newRun(7, null, 'veteran', 0), true);
    run = { ...run, offers: ['ammo', 'recon', 'veterans'] };
    run = choose(run, 'drill');
    expect(run.picks).toEqual([]);
    run = choose(run, 'ammo');
    expect(missionTweaks(run).ammo).toBe(OPERATION.requisitions.ammo);
    run = { ...run, offers: ['veterans'] };
    run = choose(run, 'veterans');
    // The next mission's squads might differ: any recruit it brings starts as a private.
    const before = new Set(living(run.roster).map((x) => x.rid));
    const d = deploy(run, rand);
    for (const x of living(d.run.roster)) if (!before.has(x.rid)) expect(x.xp).toBe(OPERATION.requisitions.veteransXp);
    run = finishMission(d.run, true, [], 0).run;
    expect(run.next).toEqual({ ammo: 0, materials: 0, recon: false, recruitXp: 0 });
  });

  it('drill trains every living soldier at once', () => {
    let run = play(newRun(7, null, 'veteran', 0), true, 0);
    const xp = living(run.roster).map((x) => x.xp);
    run = choose({ ...run, offers: ['drill'] }, 'drill');
    expect(living(run.roster).map((x) => x.xp)).toEqual(xp.map((v) => v + OPERATION.requisitions.drillXp));
  });

  it('scores a won operation and keeps the best and the daily best', () => {
    let run = newRun(7, '2026-11-13', 'veteran', 0);
    for (let i = 0; i < OPERATION.missions; i++) {
      run = play(run, true, 10);
      if (run.offers.length) run = choose(run, run.offers[0]);
    }
    expect(run.status).toBe('won');
    const S = OPERATION.score;
    const kills = run.log.reduce((n, m) => n + m.kills, 0);
    const expected = OPERATION.missions * S.won + S.perMission * ((OPERATION.missions * (OPERATION.missions - 1)) / 2) + kills * S.kill + living(run.roster).length * S.survivor;
    expect(scoreOf(run)).toBe(expected);

    const first = recordRun(emptyStore(), run, 5);
    expect(first.newBest).toBe(true);
    expect(first.store.daily['2026-11-13'].score).toBe(expected);
    expect(first.store.best?.missions).toBe(OPERATION.missions);
    const worse = recordRun(first.store, { ...run, log: [] , status: 'lost' }, 6);
    expect(worse.newBest).toBe(false);
    expect(worse.store.daily['2026-11-13'].score).toBe(expected);
    expect(parseStore(JSON.stringify(first.store))).toEqual(first.store);
    const nothing = recordRun(emptyStore(), { ...run, log: [], status: 'lost', roster: { ...run.roster, units: {} } }, 7);
    expect(nothing.newBest).toBe(false);
    expect(nothing.store.best?.score).toBe(0);
    expect(parseStore('{"version":9}')).toEqual(emptyStore());
  });
});
