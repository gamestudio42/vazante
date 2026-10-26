import { describe, expect, it } from 'vitest';
import { SimulationEngine, slotPosition } from '../src/index.ts';
import { addSquad, fieldEngine, soldiersOf } from './helpers.ts';

describe('squads', () => {
  it('a move order brings the squad to the target in formation', () => {
    const e = fieldEngine();
    const q = addSquad(e, 'guard', 40, 200);
    e.enqueue({ type: 'move', squads: [q.id], to: { x: 200, y: 60 } });
    let arrived = -1;
    for (let t = 0; t < 1500 && arrived < 0; t++) {
      e.tick();
      if (e.frame(false).events.some((ev) => ev.type === 'squad_arrived')) arrived = t;
    }
    expect(arrived).toBeGreaterThan(0);
    e.runTicks(30);
    expect(Math.abs(q.ax - 200)).toBeLessThan(0.01);
    expect(Math.abs(q.ay - 60)).toBeLessThan(0.01);
    const members = soldiersOf(e, q.id);
    members.forEach((s, i) => {
      const [sx, sy] = slotPosition(e.world, q, i, members.length);
      expect(Math.hypot(s.x - sx, s.y - sy)).toBeLessThan(0.5);
    });
  });

  it('soldiers never stand inside a building while crossing the city', () => {
    const e = SimulationEngine.create(5, 'last_convoy', { zombies: 0 });
    const [a, b] = e.world.squads;
    e.enqueue({ type: 'move', squads: [a.id], to: { x: 460, y: 60 } });
    e.enqueue({ type: 'move', squads: [b.id], to: { x: 260, y: 250 } });
    e.enqueue({ type: 'formation', squads: [b.id], formation: 'wedge' });
    for (let t = 0; t < 3000; t++) {
      e.tick();
      if (t % 10 === 0) for (const s of e.world.soldiers) expect(e.world.grid.isWalkableAt(s.x, s.y)).toBe(true);
    }
  });

  it('rejects moves without a path', () => {
    const e = fieldEngine();
    e.enqueue({ type: 'move', squads: [999], to: { x: 10, y: 10 } });
    e.tick();
    expect(e.frame(false).events.find((ev) => ev.type === 'command_rejected')?.reason).toBe('no_path');
  });
});
