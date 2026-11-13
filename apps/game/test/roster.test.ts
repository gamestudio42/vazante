import { describe, expect, it } from 'vitest';
import { MISSIONS, SOLDIER_STRIDE, SQUADS, SoldierCondition, VETERANCY } from '@vazante/shared';
import { MAX_FALLEN, SURNAMES, crewFor, crewResults, emptyRoster, namesByRid, parseRoster, pickName, settle, slotKeys, type Roster } from '../src/roster.ts';

/** A repeatable stand-in for Math.random. */
function seq(): () => number {
  let i = 0;
  return () => ((i++ * 0.37) % 1 + 1) % 1;
}

const convoy = MISSIONS.last_convoy.squads;
const size = (k: keyof typeof SQUADS) => SQUADS[k].weapons.length;

describe('campaign roster', () => {
  it('keys squads by kind and order, so two line squads keep their own people', () => {
    expect(slotKeys([{ kind: 'slice' }, { kind: 'marines' }, { kind: 'slice' }])).toEqual(['slice:0', 'marines:0', 'slice:1']);
  });

  it('fills every slot with a named recruit, and the same soldiers come back next time', () => {
    const first = crewFor(emptyRoster(), convoy, seq());
    expect(first.crew.map((c) => c.length)).toEqual(convoy.map((q) => size(q.kind)));
    expect(first.crew.flat().every((s) => s.rank === 0 && s.rid > 0)).toBe(true);
    const rids = first.crew.flat().map((s) => s.rid);
    expect(new Set(rids).size).toBe(rids.length);
    const names = [...namesByRid(first.roster).values()].map((x) => x.name);
    expect(new Set(names).size).toBe(names.length);

    const again = crewFor(first.roster, convoy, seq());
    expect(again.crew).toEqual(first.crew);
    expect(again.roster.nextRid).toBe(first.roster.nextRid);
  });

  it('survivors gain experience and rank; the fallen go to the memorial and are replaced', () => {
    const filled = crewFor(emptyRoster(), convoy, seq());
    const crew = filled.crew;
    let roster = filled.roster;
    const [hero, dead, turned, bitten] = crew[0];
    // Already close to the first promotion.
    roster = { ...roster, units: { ...roster.units, 'slice:0': roster.units['slice:0'].map((x) => (x && x.rid === hero.rid ? { ...x, xp: VETERANCY.ranks[1] - 5 } : x)) } };
    const done = settle(
      roster,
      'last_convoy',
      true,
      [
        { rid: hero.rid, kills: 12, condition: SoldierCondition.Ok },
        { rid: dead.rid, kills: 3, condition: SoldierCondition.Dead },
        { rid: turned.rid, kills: 0, condition: SoldierCondition.Turned },
        { rid: bitten.rid, kills: 1, condition: SoldierCondition.Bitten },
      ],
      1000,
    );
    const byRid = new Map(done.report.map((r) => [r.rid, r]));
    expect(byRid.get(hero.rid)).toMatchObject({ fate: 'alive', kills: 12, rankBefore: 0, rankAfter: 1 });
    expect(byRid.get(dead.rid)?.fate).toBe('killed');
    expect(byRid.get(turned.rid)?.fate).toBe('turned');
    expect(byRid.get(bitten.rid)?.fate).toBe('infected');
    const h = namesByRid(done.roster).get(hero.rid)!;
    expect(h).toMatchObject({ xp: VETERANCY.ranks[1] - 5 + 12 + VETERANCY.wonXp, kills: 12, missions: 1 });
    expect(done.roster.fallen.map((x) => x.rid).sort()).toEqual([dead.rid, turned.rid, bitten.rid].sort());
    expect(done.roster.fallen[0]).toMatchObject({ mission: 'last_convoy', at: 1000 });

    // Next mission: the hero returns ranked, the three empty slots get new recruits.
    const next = crewFor(done.roster, convoy, seq());
    const seats = next.crew[0];
    expect(seats.find((s) => s.rid === hero.rid)?.rank).toBe(1);
    for (const gone of [dead, turned, bitten]) expect(seats.some((s) => s.rid === gone.rid)).toBe(false);
    expect(seats).toHaveLength(size('slice'));
  });

  it('a lost mission still counts, with less experience', () => {
    const { roster, crew } = crewFor(emptyRoster(), convoy, seq());
    const rid = crew[0][0].rid;
    const done = settle(roster, 'last_convoy', false, [{ rid, kills: 2, condition: SoldierCondition.Ok }], 0);
    expect(namesByRid(done.roster).get(rid)?.xp).toBe(2 + VETERANCY.lostXp);
  });

  it('soldiers no longer on the roster (an old save) change nothing', () => {
    const { roster } = crewFor(emptyRoster(), convoy, seq());
    const done = settle(roster, 'last_convoy', true, [{ rid: 9999, kills: 50, condition: SoldierCondition.Ok }], 0);
    expect(done.report).toEqual([]);
    expect(done.roster.units).toEqual(roster.units);
  });

  it('reads the fate of each roster soldier from the frame', () => {
    const soldiers = new Float32Array(2 * SOLDIER_STRIDE);
    soldiers[0] = 7;
    soldiers[8] = SoldierCondition.Ok;
    soldiers[SOLDIER_STRIDE] = 8;
    soldiers[SOLDIER_STRIDE + 8] = SoldierCondition.Turned;
    const res = crewResults(
      [
        { id: 7, rid: 1, rank: 0, kills: 4 },
        { id: 8, rid: 2, rank: 1, kills: 0 },
      ],
      soldiers,
    );
    expect(res).toEqual([
      { rid: 1, kills: 4, condition: SoldierCondition.Ok },
      { rid: 2, kills: 0, condition: SoldierCondition.Turned },
    ]);
  });

  it('avoids the names of the living and the fallen while it can', () => {
    let r: Roster = emptyRoster();
    r = { ...r, units: { x: SURNAMES.slice(0, SURNAMES.length - 2).map((name, i) => ({ rid: i + 1, name, xp: 0, kills: 0, missions: 0 })) } };
    r = { ...r, fallen: [{ rid: 999, name: SURNAMES[SURNAMES.length - 1], rank: 0, kills: 0, missions: 1, mission: 'bridge', fate: 'killed', at: 0 }] };
    expect(pickName(r, () => 0.99)).toBe(SURNAMES[SURNAMES.length - 2]);
  });

  it('keeps the memorial bounded and rejects unreadable data', () => {
    let roster: Roster = { ...emptyRoster(), fallen: Array.from({ length: MAX_FALLEN }, (_, i) => ({ rid: i, name: 'X', rank: 0, kills: 0, missions: 1, mission: 'bridge', fate: 'killed' as const, at: i })) };
    const filled = crewFor(roster, convoy, seq());
    roster = settle(filled.roster, 'bridge', false, [{ rid: filled.crew[0][0].rid, kills: 0, condition: SoldierCondition.Dead }], 5).roster;
    expect(roster.fallen).toHaveLength(MAX_FALLEN);
    expect(roster.fallen[0].at).toBe(5);
    expect(parseRoster(JSON.stringify(roster))).toEqual(roster);
    expect(parseRoster('{')).toEqual(emptyRoster());
    expect(parseRoster(JSON.stringify({ version: 2 }))).toEqual(emptyRoster());
  });
});
