import { describe, expect, it } from 'vitest';
import { FOG, ZOMBIE_STRIDE } from '@vazante/shared';
import { SimulationEngine } from '../src/index.ts';

describe('fog of war', () => {
  it('frames carry only the zombies in sight, and the rules still see them all', () => {
    const e = SimulationEngine.create(1, 'hospital');
    const w = e.world;
    const f = e.frame(false);
    expect(f.fog).toBe(true);
    expect(f.stats.zombiesAlive).toBe(w.zombies.alive);
    const sent = f.zombies.length / ZOMBIE_STRIDE;
    expect(sent).toBeLessThan(w.zombies.alive / 10);
    // Every zombie sent is near one of ours (the base margin counts too).
    for (let i = 0; i < f.zombies.length; i += ZOMBIE_STRIDE) {
      const x = f.zombies[i + 1];
      const y = f.zombies[i + 2];
      const near = w.soldiers.some((s) => Math.hypot(s.x - x, s.y - y) <= FOG.marksmanM + 4) || w.vehicles.some((v) => Math.hypot(v.x - x, v.y - y) <= FOG.vehicleM + 4);
      const home = w.bases.find((b) => b.kind === 'base')!;
      const inBase = x >= home.x0 * 4 - FOG.baseMarginM - 4 && x <= (home.x1 + 1) * 4 + FOG.baseMarginM + 4 && y >= home.y0 * 4 - FOG.baseMarginM - 4 && y <= (home.y1 + 1) * 4 + FOG.baseMarginM + 4;
      expect(near || inBase).toBe(true);
    }
    // A zombie walked next to a soldier shows up.
    const s = w.soldiers[0];
    const slot = w.zombies.spawn(s.x + 20, s.y, 0, 1);
    expect(slot).toBeGreaterThanOrEqual(0);
    const g = e.frame(false);
    let found = false;
    for (let i = 0; i < g.zombies.length; i += ZOMBIE_STRIDE) if (g.zombies[i] === slot) found = true;
    expect(found).toBe(true);
  });
});
