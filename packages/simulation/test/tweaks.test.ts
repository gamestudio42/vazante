import { describe, expect, it } from 'vitest';
import { CELL_SIZE, DIFFICULTY, OPERATION, TICK_HZ, ZombieKind, ZombieState } from '@vazante/shared';
import { SimulationEngine } from '../src/index.ts';
import { drivenAlive } from '../src/systems/mission.ts';

const home = (e: SimulationEngine) => e.world.bases.find((b) => b.kind === 'base')!;

describe('operation tweaks', () => {
  it('scale the horde and add to the base stock', () => {
    const plain = SimulationEngine.create(5, 'bridge');
    const tweaked = SimulationEngine.create(5, 'bridge', { tweaks: { zombieScale: 0.5, ammo: 800, materials: 150 } });
    expect(tweaked.world.zombies.alive).toBeLessThan(plain.world.zombies.alive * 0.6);
    expect(home(tweaked).ammo).toBe(home(plain).ammo + 800);
    expect(home(tweaked).materials).toBe(home(plain).materials + 150);
  });

  it('ignore values out of range', () => {
    const plain = SimulationEngine.create(5, 'bridge');
    const bad = SimulationEngine.create(5, 'bridge', { tweaks: { zombieScale: Number.NaN, ammo: -50, materials: Infinity } });
    expect(bad.world.zombies.alive).toBe(plain.world.zombies.alive);
    expect(home(bad).ammo).toBe(home(plain).ammo);
    expect(home(bad).materials).toBe(home(plain).materials);
    expect(bad.hashState()).toBe(plain.hashState());
  });

  it('keep the threat for the waves and pressure groups, through a save', () => {
    const plain = SimulationEngine.create(5, 'bridge');
    const harder = SimulationEngine.create(5, 'bridge', { tweaks: { zombieScale: 1.48 } });
    expect(plain.world.threat).toBeUndefined();
    expect(harder.world.threat).toBe(1.48);
    harder.runTicks(5);
    const back = SimulationEngine.load(harder.save());
    expect(back.world.threat).toBe(1.48);
    expect(back.hashState()).toBe(harder.hashState());
  });

  it('send hunting groups at a task force out in the city, never at one still at the base', () => {
    const every = OPERATION.hunt.everyS * TICK_HZ;
    const make = () => SimulationEngine.create(5, 'supply_line', { zombies: 0, tweaks: { zombieScale: 1.48 } });
    // Still at the base: a group would walk to the command post nobody is defending.
    const waiting = make();
    waiting.runTicks(every + 5);
    expect(waiting.world.zombies.alive).toBe(0);
    // On the way to the depot: hunted.
    const marching = make();
    const w = marching.world;
    const z = w.mission!.zones[0];
    const to = { x: ((z.x0 + z.x1 + 1) / 2) * CELL_SIZE, y: ((z.y0 + z.y1 + 1) / 2) * CELL_SIZE };
    marching.enqueue({ type: 'move', squads: w.squads.map((q) => q.id), to });
    marching.runTicks(every * 4 + 5);
    expect(w.stats.zombiesKilled + w.zombies.alive).toBeGreaterThanOrEqual(Math.round(OPERATION.hunt.perThreat * 0.48));
  });

  it('send no new hunting group while two are still alive', () => {
    const every = OPERATION.hunt.everyS * TICK_HZ;
    const e = SimulationEngine.create(5, 'supply_line', { zombies: 0, tweaks: { zombieScale: 1.48 } });
    const w = e.world;
    const group = Math.round(OPERATION.hunt.perThreat * 0.48 * DIFFICULTY[w.difficulty].waveSize);
    // Nobody shoots back: every group sent stays alive.
    for (const s of w.soldiers) s.ammo = 0;
    const z = w.mission!.zones[0];
    const to = { x: ((z.x0 + z.x1 + 1) / 2) * CELL_SIZE, y: ((z.y0 + z.y1 + 1) / 2) * CELL_SIZE };
    e.enqueue({ type: 'move', squads: w.squads.map((q) => q.id), to });
    let most = 0;
    for (let i = 0; i < 8; i++) {
      e.runTicks(every);
      most = Math.max(most, drivenAlive(w));
    }
    expect(most).toBeGreaterThan(group);
    expect(most).toBeLessThan(group * (OPERATION.hunt.maxAlive + 1));
  });

  it('take a hunter left far behind the squads off the map', () => {
    const e = SimulationEngine.create(5, 'supply_line', { zombies: 0, tweaks: { zombieScale: 1.48 } });
    const w = e.world;
    for (const s of w.soldiers) s.ammo = s.mag = 0;
    // The city's flow field takes a few ticks to build; before it a driven zombie is cut off.
    e.runTicks(TICK_HZ * 3);
    const s0 = w.soldiers[0];
    const z = w.mission!.zones[0];
    const close = w.zombies.spawn(s0.x, s0.y - 20, ZombieKind.Common, ZombieState.Chasing);
    const far = w.zombies.spawn(((z.x0 + z.x1 + 1) / 2) * CELL_SIZE, ((z.y0 + z.y1 + 1) / 2) * CELL_SIZE, ZombieKind.Common, ZombieState.Chasing);
    w.zombies.driven[close] = 1;
    w.zombies.driven[far] = 1;
    e.runTicks(TICK_HZ + 1);
    expect(w.zombies.isAlive(close)).toBe(true);
    expect(w.zombies.driven[close]).toBe(1);
    expect(w.zombies.isAlive(far)).toBe(false);
  });
});
