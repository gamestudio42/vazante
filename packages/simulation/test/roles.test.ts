import { describe, expect, it } from 'vitest';
import { SoldierCondition, TICK_HZ, WEAPONS, ZombieKind, ZombieState } from '@vazante/shared';
import { placeStructure } from '../src/systems/construction.ts';
import { spawnTruck } from '../src/systems/logistics.ts';
import { addSquad, disarm, fieldEngine, soldiersOf } from './helpers.ts';

describe('medic', () => {
  it('heals the most hurt soldier nearby and slows a bite', () => {
    const e = fieldEngine(1, 64);
    const q = addSquad(e, 'marines', 100, 100);
    const team = soldiersOf(e, q.id);
    const medic = team.find((s) => s.role === 'medic')!;
    // Neighbours in the line, within reach.
    const hurt = team[team.indexOf(medic) - 1];
    hurt.hp = 30;
    const bitten = team[team.indexOf(medic) - 2];
    bitten.condition = SoldierCondition.Bitten;
    bitten.turnAt = e.world.tick + 10_000;
    const turnAt = bitten.turnAt;
    e.runTicks(10 * TICK_HZ);
    expect(hurt.hp).toBeGreaterThan(50);
    expect(bitten.turnAt - turnAt).toBeGreaterThanOrEqual(5 * TICK_HZ - 1);
  });

  it('squads without a medic do not heal', () => {
    const e = fieldEngine(1, 64);
    const s = soldiersOf(e, addSquad(e, 'slice', 100, 100).id)[0];
    s.hp = 30;
    e.runTicks(5 * TICK_HZ);
    expect(s.hp).toBe(30);
  });
});

describe('marksman', () => {
  it('shoots the Inchado behind the crowd before the closer common infected', () => {
    const e = fieldEngine(1, 64);
    const w = e.world;
    const q = addSquad(e, 'marines', 60, 60);
    const team = soldiersOf(e, q.id);
    const dmr = team.find((s) => s.weapon === 'dmr')!;
    for (const s of team) if (s !== dmr) disarm(s);
    w.zombies.spawn(dmr.x + 12, dmr.y, ZombieKind.Common, ZombieState.Wandering);
    const bloater = w.zombies.spawn(dmr.x + 40, dmr.y, ZombieKind.Bloater, ZombieState.Wandering);
    e.runTicks(3);
    expect(dmr.target).toBe(bloater);
    expect(WEAPONS.dmr.range).toBeGreaterThan(WEAPONS.rifle.range);
  });
});

describe('engineers', () => {
  it('can place a structure outside the base where they stand, other squads cannot', () => {
    const e = fieldEngine(1, 64);
    const w = e.world;
    // The field is one big zone; give it a small base in a corner.
    w.bases.length = 0;
    w.addBase('Posto', 0, 0, 5, 5, 200, 0);
    const inf = addSquad(e, 'slice', 150, 150);
    expect(placeStructure(w, 'hesco', 150, 160)).toBe('outside_base');
    for (const s of soldiersOf(e, inf.id)) s.x += 80; // away
    addSquad(e, 'engineers', 150, 150, 'E');
    expect(placeStructure(w, 'hesco', 150, 160)).toBeNull();
    expect(w.bases[0].materials).toBeLessThan(200);
    // They build it, twice as fast as a normal crew.
    const st = w.structures[0];
    e.runTicks(200);
    expect(st.built).toBe(true);
  });
});

describe('parked truck', () => {
  it('hands its ammunition cargo to the soldiers next to it', () => {
    const e = fieldEngine(1, 64);
    const w = e.world;
    w.bases.length = 0;
    const q = addSquad(e, 'slice', 150, 150);
    const s = soldiersOf(e, q.id)[0];
    s.ammo = 0;
    const v = spawnTruck(w, 152, 150, 500, 0);
    e.runTicks(3 * TICK_HZ);
    expect(s.ammo).toBeGreaterThan(20);
    expect(v.cargoAmmo).toBeLessThan(500);
  });
});
