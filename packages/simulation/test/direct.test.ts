import { describe, expect, it } from 'vitest';
import { ZombieKind, ZombieState } from '@vazante/shared';
import { addSquad, fieldEngine, soldiersOf } from './helpers.ts';

describe('direct control', () => {
  it('moves and fires the controlled soldier from player input only', () => {
    const e = fieldEngine();
    const q = addSquad(e, 'guard', 128, 128);
    const s = soldiersOf(e, q.id)[0];
    e.enqueue({ type: 'set_direct_control', soldier: s.id });
    e.tick();
    expect(e.world.directSoldier).toBe(s.id);
    const x0 = s.x;
    e.enqueue({ type: 'direct_input', soldier: s.id, move: { x: 1, y: 0 }, aim: { x: 0, y: -1 }, fire: false, reload: false });
    e.runTicks(10);
    expect(s.x - x0).toBeGreaterThan(2.5);
    expect(e.world.stats.shotsFired).toBe(0);

    const z = e.world.zombies.spawn(s.x, s.y - 20, ZombieKind.Common, ZombieState.Wandering);
    e.enqueue({ type: 'direct_input', soldier: s.id, move: { x: 0, y: 0 }, aim: { x: 0, y: -1 }, fire: true, reload: false });
    for (let t = 0; t < 50 && e.world.zombies.isAlive(z); t++) e.tick();
    expect(e.world.zombies.isAlive(z)).toBe(false);
    // The other soldiers might have shot too; the controlled one must have spent ammo.
    expect(s.mag).toBeLessThan(30);
  });

  it('forces 1x and refuses other speeds while active, and releases on exit', () => {
    const e = fieldEngine();
    const q = addSquad(e, 'guard', 128, 128);
    const s = soldiersOf(e, q.id)[0];
    e.enqueue({ type: 'set_speed', speed: 4 });
    e.tick();
    expect(e.world.speed).toBe(4);
    e.enqueue({ type: 'set_direct_control', soldier: s.id });
    e.enqueue({ type: 'set_speed', speed: 0 });
    e.tick();
    expect(e.world.speed).toBe(1);
    expect(e.frame(false).events.some((ev) => ev.reason === 'direct_control_active')).toBe(true);
    e.enqueue({ type: 'set_direct_control', soldier: null });
    e.tick();
    expect(e.world.directSoldier).toBeNull();
    expect(s.direct).toBeNull();
  });
});
