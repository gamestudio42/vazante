import { describe, expect, it } from 'vitest';
import { SimulationEngine } from '../src/index.ts';

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
});
