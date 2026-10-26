import { describe, expect, it } from 'vitest';
import { SimulationEngine } from '../src/index.ts';

function scripted(seed: number, frames: boolean): SimulationEngine {
  const e = SimulationEngine.create(seed, 'last_convoy');
  const [a, b] = e.world.squads;
  for (let t = 0; t < 1200; t++) {
    if (t === 10) e.enqueue({ type: 'move', squads: [a.id], to: { x: 256, y: 256 } });
    if (t === 20) e.enqueue({ type: 'debug_spawn', at: { x: b.ax, y: b.ay - 60 }, count: 40 });
    if (t === 300) e.enqueue({ type: 'formation', squads: [b.id], formation: 'circle' });
    e.tick();
    if (frames) e.frame();
  }
  return e;
}

describe('determinism', () => {
  it('same seed and commands give the same hash', () => {
    expect(scripted(7, false).hashState()).toBe(scripted(7, false).hashState());
  });

  it('different seeds diverge', () => {
    expect(scripted(7, false).hashState()).not.toBe(scripted(8, false).hashState());
  });

  it('reading frames (any camera, any view) never changes the state', () => {
    expect(scripted(3, true).hashState()).toBe(scripted(3, false).hashState());
  });
});
