import { describe, expect, it } from 'vitest';
import { DIFFICULTY, SLICE } from '@vazante/shared';
import { SimulationEngine } from '../src/index.ts';

describe('difficulty', () => {
  it('defaults to veteran and leaves the reference scenario unchanged', () => {
    const a = SimulationEngine.create(5);
    const b = SimulationEngine.create(5, 'last_convoy', { difficulty: 'veteran' });
    expect(a.world.difficulty).toBe('veteran');
    a.runTicks(50);
    b.runTicks(50);
    expect(a.hashState()).toBe(b.hashState());
  });

  it('scales the city, the supplies and the starting state per level', () => {
    const make = (d: 'recruit' | 'veteran' | 'nightmare') => SimulationEngine.create(5, 'last_convoy', { difficulty: d }).world;
    const [r, v, n] = [make('recruit'), make('veteran'), make('nightmare')];
    expect(r.zombies.alive).toBeLessThan(v.zombies.alive);
    expect(n.zombies.alive).toBeGreaterThan(v.zombies.alive);
    const home = (w: typeof r) => w.bases.find((b) => b.kind === 'base')!;
    expect(home(r).ammo).toBe(SLICE.baseAmmo + DIFFICULTY.recruit.baseAmmo);
    expect(home(n).materials).toBe(SLICE.baseMaterials + DIFFICULTY.nightmare.baseMaterials);
    expect(make('recruit').zombies.alive).toBe(r.zombies.alive);
  });

  it('is part of the state: same seed, different difficulty, different hash; saves keep it', () => {
    const r = SimulationEngine.create(5, 'last_convoy', { difficulty: 'recruit' });
    const n = SimulationEngine.create(5, 'last_convoy', { difficulty: 'nightmare' });
    expect(r.hashState()).not.toBe(n.hashState());
    n.runTicks(20);
    const loaded = SimulationEngine.load(n.save());
    expect(loaded.world.difficulty).toBe('nightmare');
    expect(loaded.frame(false).difficulty).toBe('nightmare');
  });
});
