import { decodeSave, encodeSave } from '@vazante/shared';
import { describe, expect, it } from 'vitest';
import { SimulationEngine } from '../src/index.ts';

/** Commands issued on fixed ticks, so two runs can be driven identically. */
function drive(e: SimulationEngine, from: number, to: number): void {
  const [a, b] = e.world.squads;
  const truck = e.world.vehicles[0];
  const base = e.world.bases.find((x) => x.kind === 'base')!;
  for (let t = from; t < to; t++) {
    if (t === 10) e.enqueue({ type: 'move', squads: [a.id], to: { x: base.x0 * 4 - 30, y: base.y0 * 4 } });
    if (t === 20) e.enqueue({ type: 'debug_spawn', at: { x: b.ax, y: b.ay - 60 }, count: 40 });
    if (t === 30) e.enqueue({ type: 'convoy', vehicle: truck.id, to: base.id, policy: 'push_through' });
    if (t === 700) e.enqueue({ type: 'formation', squads: [b.id], formation: 'circle' });
    if (t === 900) e.enqueue({ type: 'build', kind: 'hesco', at: { x: (base.x0 + 1) * 4 + 2, y: (base.y0 + 1) * 4 + 2 } });
    e.tick();
    e.frame(false);
  }
}

describe('save and load', () => {
  const straight = SimulationEngine.create(5);
  drive(straight, 0, 1600);

  it('save mid-combat, load, run 1,000 ticks: same hash as without saving (in memory)', () => {
    const first = SimulationEngine.create(5);
    drive(first, 0, 600);
    const loaded = SimulationEngine.load(first.save());
    expect(loaded.world.tick).toBe(600);
    // The loaded copy is independent of the original.
    drive(first, 600, 700);
    drive(loaded, 600, 1600);
    expect(loaded.hashState()).toBe(straight.hashState());
  });

  it('the same through the file format', () => {
    const first = SimulationEngine.create(5);
    drive(first, 0, 600);
    const loaded = SimulationEngine.load(decodeSave(encodeSave(first.save())));
    drive(loaded, 600, 1600);
    expect(loaded.hashState()).toBe(straight.hashState());
  });

  it('rejects saves that do not match', () => {
    const e = SimulationEngine.create(5);
    e.runTicks(50);
    const save = e.save();
    expect(() => SimulationEngine.load({ ...save, hash: save.hash ^ 1 })).toThrow('save_mismatch');
    expect(() => SimulationEngine.load({ ...save, version: 999 })).toThrow('save_incompatible');
    expect(() => decodeSave('{"format":"other"}')).toThrow('save_invalid');
  });
});

describe('save file encoding', () => {
  it('keeps typed arrays, maps and non-finite numbers', () => {
    const world = { f: new Float32Array([1.5, -2]), u: new Uint16Array([7]), m: new Map([[1, { a: 2 }]]), inf: Infinity, neg: -0, nan: NaN, ok: 3 };
    const out = decodeSave(encodeSave({ format: 'vazante-save', version: 1, scenario: 'x', seed: 1, tick: 2, hash: 3, world })).world as typeof world;
    expect([...out.f]).toEqual([1.5, -2]);
    expect(out.u).toBeInstanceOf(Uint16Array);
    expect(out.m.get(1)).toEqual({ a: 2 });
    expect(out.inf).toBe(Infinity);
    expect(Object.is(out.neg, -0)).toBe(true);
    expect(out.nan).toBeNaN();
    expect(out.ok).toBe(3);
  });
});
