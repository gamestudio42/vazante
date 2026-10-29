import { describe, expect, it } from 'vitest';
import { CELL_SIZE, MISSIONS, TICK_HZ, ZombieState } from '@vazante/shared';
import { SimulationEngine } from '../src/index.ts';
import { nextHourTick } from '../src/systems/mission.ts';

const rules = (() => {
  const st = MISSIONS.survival.stages[0];
  if (st.kind !== 'endless') throw new Error('survival is one endless stage');
  return st.rules;
})();

/**
 * The night cycle is tested on the campaign's short day (first nightfall at 19:00, three hours
 * after the 16:00 start) so the tests run fast; survival's own day is checked on its own.
 */
const NIGHTFALL = nextHourTick(0, rules.nightfallHour);

function survival(seed = 3): SimulationEngine {
  const e = SimulationEngine.create(seed, 'survival', { zombies: 0 });
  const w = e.world;
  w.day = undefined;
  w.mission!.nextAt = NIGHTFALL - rules.warnS * TICK_HZ;
  return e;
}

function run(e: SimulationEngine, ticks: number): string[] {
  const out: string[] = [];
  for (let t = 0; t < ticks; t++) {
    e.tick();
    for (const ev of e.frame(false).events) out.push(ev.type);
  }
  return out;
}

function baseCentre(e: SimulationEngine): [number, number] {
  const w = e.world;
  const b = w.baseById(w.mission!.base)!;
  return [((b.x0 + b.x1 + 1) / 2) * CELL_SIZE, ((b.y0 + b.y1 + 1) / 2) * CELL_SIZE];
}

describe('survival', () => {
  it('finds the next time the clock reads an hour', () => {
    const day = 1200 * TICK_HZ;
    expect(nextHourTick(0, 19)).toBe(day / 8);
    expect(nextHourTick(day / 8, 19)).toBe(day / 8);
    expect(nextHourTick(day / 8 + 1, 19)).toBe(day / 8 + day);
    expect(nextHourTick(0, 6)).toBe((14 / 24) * day);
  });

  it('plays on a 40-minute day that starts in the morning, so the first night is 11 game hours away', () => {
    const e = SimulationEngine.create(3, 'survival', { zombies: 0 });
    const day = MISSIONS.survival.day!;
    expect(e.world.day).toEqual(day);
    const nightfall = nextHourTick(0, rules.nightfallHour, day);
    expect(nightfall).toBe((11 / 24) * day.lengthS * TICK_HZ);
    expect(e.world.mission!.nextAt).toBe(nightfall - rules.warnS * TICK_HZ);
    expect(e.frame(false).day).toEqual(day);
  });

  it('warns before nightfall, sends the horde at nightfall and counts the night once it is gone', () => {
    const e = survival();
    const w = e.world;
    const m = w.mission!;
    expect(m.waveState).toBe('calm');
    expect(e.frame(false).mission!.secondsToWave).toBe(NIGHTFALL / TICK_HZ);

    const warnAt = NIGHTFALL - rules.warnS * TICK_HZ;
    let ev = run(e, warnAt + 1);
    expect(ev).toContain('wave_warning');
    expect(m.waveState).toBe('warning');

    ev = run(e, NIGHTFALL - w.tick + 1);
    expect(m.waveState).toBe('active');
    expect(ev.filter((t) => t === 'wave_started').length).toBeGreaterThan(1);
    let driven = 0;
    const z = w.zombies;
    for (let s = 0; s < z.highWater; s++) if (z.isAlive(s) && z.driven[s]) driven++;
    expect(driven).toBeGreaterThanOrEqual(rules.nightHorde * 0.8);

    for (let s = 0; s < z.highWater; s++) if (z.isAlive(s) && z.driven[s]) z.kill(s);
    ev = run(e, 20);
    expect(ev).toContain('night_survived');
    expect(m.wave).toBe(1);
    expect(m.waveState).toBe('calm');
    expect(m.phase).toBe('active');
    // The next warning comes before the next nightfall.
    expect(m.nextAt).toBe(NIGHTFALL + 1200 * TICK_HZ - rules.warnS * TICK_HZ);
  });

  it('rouses the infected near the base when the horde comes', () => {
    const e = survival();
    const w = e.world;
    const [bx, by] = baseCentre(e);
    run(e, NIGHTFALL - 2);
    const near: number[] = [];
    for (let i = 0; near.length < 20 && i < 2000; i++) {
      const x = bx + w.rng.range(-350, 350);
      const y = by + w.rng.range(-350, 350);
      if ((x - bx) ** 2 + (y - by) ** 2 < 250 ** 2 || !w.grid.isWalkableAt(x, y)) continue;
      near.push(w.zombies.spawn(x, y, 0, ZombieState.Wandering));
    }
    run(e, 3);
    expect(w.mission!.waveState).toBe('active');
    expect(near.filter((s) => w.zombies.isAlive(s) && w.zombies.driven[s] === 1).length).toBe(near.length);
  });

  it('after a quiet start, refills the city from its edges, far from the base and from every soldier', () => {
    const e = survival();
    const w = e.world;
    run(e, rules.repopEveryS * TICK_HZ);
    expect(w.zombies.alive).toBe(0);
    // Skip ahead to the end of the quiet start.
    w.tick = rules.repopGraceS * TICK_HZ - 1;
    run(e, rules.repopEveryS * TICK_HZ * 3 + 1);
    expect(w.zombies.alive).toBe(rules.repopSize * 3);
    // Those placed early have had a few minutes to wander inwards.
    const edge = rules.repopEdgeM + 40;
    for (let s = 0; s < w.zombies.highWater; s++) {
      if (!w.zombies.isAlive(s)) continue;
      const x = w.zombies.x[s];
      const y = w.zombies.y[s];
      expect(x < edge || y < edge || x > w.grid.widthM - edge || y > w.grid.heightM - edge).toBe(true);
    }
    const [bx, by] = baseCentre(e);
    const z = w.zombies;
    const clear = rules.repopClearM - 30;
    for (let s = 0; s < z.highWater; s++) {
      if (!z.isAlive(s)) continue;
      expect(Math.sqrt((z.x[s] - bx) ** 2 + (z.y[s] - by) ** 2)).toBeGreaterThan(clear);
    }
  });

  it('never wins, and is lost when the command post falls', () => {
    const e = survival();
    const w = e.world;
    const m = w.mission!;
    run(e, 10);
    w.removeStructure(w.structure(m.commandPost)!);
    const ev = run(e, 2);
    expect(ev).toContain('mission_lost');
    expect(m.phase).toBe('lost');
    expect(m.reason).toBe('command_post_destroyed');
  });
});
