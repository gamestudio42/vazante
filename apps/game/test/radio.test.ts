import { describe, expect, it } from 'vitest';
import { TICK_HZ, type SimEvent } from '@vazante/shared';
import { Radio, RADIO_LINES, RADIO_VARIANTS, type RadioContext } from '../src/radio.ts';

const ctx: RadioContext = {
  squadOf: (id) => (id < 100 ? 1 : 2),
  nearestSquad: (x) => (x < 50 ? 1 : undefined),
};

const ev = (tick: number, type: SimEvent['type'], extra: Partial<SimEvent> = {}): SimEvent => ({ tick, type, ...extra });

describe('radio', () => {
  it('attributes lines to the squad and the soldier', () => {
    const r = new Radio();
    const [died] = r.hear([ev(10, 'soldier_died', { source: 7 })], ctx);
    expect(died).toMatchObject({ topic: 'died', squad: 1, soldier: 7, tone: 'bad' });
    const [bitten] = r.hear([ev(11, 'soldier_bitten', { source: 999, target: 150 })], ctx);
    expect(bitten).toMatchObject({ topic: 'bitten', squad: 2, soldier: 150 });
    const [wave] = r.hear([ev(12, 'wave_warning', { value: 2 })], ctx);
    expect(wave).toMatchObject({ topic: 'wave', squad: null });
  });

  it('picks the same wording for the same event', () => {
    const a = new Radio().hear([ev(42, 'squad_contact', { source: 3 })], ctx)[0];
    const b = new Radio().hear([ev(42, 'squad_contact', { source: 3 })], ctx)[0];
    expect(a.variant).toBe(b.variant);
    const seen = new Set<number>();
    for (let t = 0; t < 200; t++) seen.add(new Radio().hear([ev(t, 'squad_contact', { source: 3 })], ctx)[0].variant);
    expect(seen.size).toBe(RADIO_VARIANTS.contact);
  });

  it('does not repeat a topic from the same squad within its cooldown', () => {
    const r = new Radio();
    expect(r.hear([ev(0, 'reloading', { source: 1 })], ctx)).toHaveLength(1);
    expect(r.hear([ev(5 * TICK_HZ, 'reloading', { source: 2 })], ctx)).toHaveLength(0);
    // Another squad is its own speaker.
    expect(r.hear([ev(5 * TICK_HZ, 'reloading', { source: 120 })], ctx)).toHaveLength(1);
    expect(r.hear([ev(13 * TICK_HZ, 'reloading', { source: 3 })], ctx)).toHaveLength(1);
  });

  it('spaces chatter but always lets losses through', () => {
    const r = new Radio();
    const burst = r.hear(
      [ev(100, 'squad_arrived', { source: 1 }), ev(100, 'squad_arrived', { source: 2 }), ev(100, 'soldier_died', { source: 3 }), ev(101, 'soldier_died', { source: 4 })],
      ctx,
    );
    expect(burst.map((l) => l.topic)).toEqual(['arrived', 'died', 'died']);
  });

  it('only a squad near a scream calls it out, and keeps the last lines', () => {
    const r = new Radio();
    expect(r.hear([ev(0, 'zombie_scream', { source: 5, x: 200, y: 0 })], ctx)).toHaveLength(0);
    expect(r.hear([ev(0, 'zombie_scream', { source: 5, x: 10, y: 0 })], ctx)[0]).toMatchObject({ topic: 'scream', squad: 1 });
    for (let i = 0; i < 10; i++) r.hear([ev(10 + i, 'soldier_died', { source: i })], ctx);
    expect(r.lines).toHaveLength(RADIO_LINES);
    expect(r.lines[RADIO_LINES - 1].soldier).toBe(9);
    // Events the radio has nothing to say about.
    expect(r.hear([ev(50, 'shot'), ev(50, 'wave_warning', { value: 0 })], ctx)).toHaveLength(0);
  });
});
