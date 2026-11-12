import { expect, test } from 'vitest';
import { Blocked, Ground, checkPlacement } from '@vazante/shared';
import { SimulationEngine, findPath, spawnTruck } from '../src/index.ts';
import { moveSoldier, truckPenetration, truckWouldHitSoldier } from '../src/systems/vehicle-collision.ts';
import { placementContext } from '../src/systems/construction.ts';
import { addSquad, fieldEngine, soldiersOf } from './helpers.ts';
import { BuildTool } from '../../../apps/game/src/build.ts';

test('static props occupy the same cells in navigation, construction preview and simulation', () => {
  const e = SimulationEngine.create(1, 'last_convoy', { zombies: 0 });
  const w = e.world;
  expect(w.props!.some(p => p.kind === 'Tent')).toBe(true);
  expect(w.props!.some(p => p.kind === 'Tank')).toBe(true);
  const tool = new BuildTool(e.mapInfo());
  tool.begin('hesco');
  for (const p of w.props!) {
    const c = w.grid.cellAt(p.x - 1, p.y);
    expect(w.grid.isWalkable(c)).toBe(false);
    expect(w.grid.zombieCost(c, 200)).toBe(-1);
    expect(w.grid.blocked[c] & Blocked.Prop).not.toBe(0);
    tool.hover(w.grid.cellCenterX(c), w.grid.cellCenterY(c), e.frame());
    const engineReason = checkPlacement(placementContext(w), 'hesco', c % w.grid.width, Math.floor(c / w.grid.width)).error;
    expect(tool.reason).toBe(engineReason);
    expect(engineReason).not.toBeNull();
  }
  for (let c = 0; c < w.grid.size; c++) if (w.grid.ground[c] === Ground.Street) expect(w.grid.blocked[c] & Blocked.Prop).toBe(0);
});

test('deployment and depot access remain connected across city seeds', () => {
  for (const scenario of ['last_convoy', 'city_war'] as const) for (const seed of [1, 7, 42]) {
    const e = SimulationEngine.create(seed, scenario, { zombies: 0 });
    const cars = e.mapInfo().props!.filter(p => p.kind === 'Debris_BrokenCar');
    expect(cars.length).toBeGreaterThanOrEqual(scenario === 'last_convoy' ? 8 : 100);
    expect(cars.length).toBeLessThan(scenario === 'last_convoy' ? 40 : 400);
    const g = e.world.grid;
    const home = e.world.bases[0];
    const origin = g.cellAt((home.x0 + home.x1 + 1) * 2, (home.y0 + home.y1 + 1) * 2);
    expect(g.isWalkable(origin)).toBe(true);
    for (const b of e.world.bases) {
      const goal = g.cellAt((b.x0 + b.x1 + 1) * 2, (b.y0 + b.y1 + 1) * 2);
      const route = findPath(g, origin, goal, { maxExpanded: g.size });
      expect(route).not.toBeNull();
      if (origin !== goal) expect(route!.at(-1)).toBe(goal);
    }
    for (const s of e.world.soldiers) expect(g.isWalkableAt(s.x, s.y)).toBe(true);
  }
});

test('direct control cannot walk through a parked truck and can go around it', () => {
  const e = fieldEngine();
  const q = addSquad(e, 'guard', 120, 128);
  const s = soldiersOf(e, q.id)[0];
  s.x = 120; s.y = 128;
  const v = spawnTruck(e.world, 128, 128, 0, 0);
  v.hx = 0; v.hy = 1;
  e.enqueue({ type: 'set_direct_control', soldier: s.id });
  e.enqueue({ type: 'direct_input', soldier: s.id, move: { x: 1, y: 0 }, aim: { x: 1, y: 0 }, fire: false, reload: false });
  for (let i = 0; i < 80; i++) { e.tick(); expect(truckPenetration(v, s.x, s.y)).toBeLessThanOrEqual(1e-6); }
  expect(s.x).toBeLessThan(128);
  const around = moveSoldier(e.world, s.x, s.y, 0, 10);
  const past = moveSoldier(e.world, around.x, around.y, 15, 0);
  expect(past.x).toBeGreaterThan(v.x + 4);
});

test('moving trucks yield to soldiers and overlapping units can escape', () => {
  const e = fieldEngine();
  const q = addSquad(e, 'guard', 128, 128);
  const s = soldiersOf(e, q.id)[0];
  s.x = 128; s.y = 128;
  const v = spawnTruck(e.world, 120, 128, 0, 0);
  v.hx = 1; v.hy = 0;
  expect(truckWouldHitSoldier(e.world, v, 135, 128)).toBe(true);
  expect(v.x).toBe(120);
  const start = truckPenetration(v, 120, 128);
  const escaped = moveSoldier(e.world, 120, 128, 0, 6);
  expect(truckPenetration(v, escaped.x, escaped.y)).toBeLessThan(start);
});

test('ordered squads route around a truck without entering its body', () => {
  const e = fieldEngine();
  const q = addSquad(e, 'guard', 108, 128);
  const v = spawnTruck(e.world, 128, 128, 0, 0);
  e.enqueue({ type: 'move', squads: [q.id], to: { x: 150, y: 128 } });
  for (let i = 0; i < 240; i++) {
    e.tick();
    for (const s of soldiersOf(e, q.id)) expect(truckPenetration(v, s.x, s.y)).toBeLessThanOrEqual(1e-6);
  }
  for (const s of soldiersOf(e, q.id)) expect(s.x).toBeGreaterThan(140);
});

test('collision state survives save/load deterministically', () => {
  const e = SimulationEngine.create(7, 'last_convoy', { zombies: 0 });
  const q = e.world.squads[0];
  e.enqueue({ type: 'move', squads: [q.id], to: { x: q.ax + 16, y: q.ay + 20 } });
  e.runTicks(20);
  const save = e.save();
  const restored = SimulationEngine.load(save);
  restored.world.speed = e.world.speed;
  e.runTicks(100); restored.runTicks(100);
  expect(restored.hashState()).toBe(e.hashState());
  expect(restored.mapInfo().props).toEqual(e.mapInfo().props);
});

test('a commanded truck stops before infantry and resumes after the lane clears', () => {
  const e = fieldEngine();
  const q = addSquad(e, 'guard', 144, 128);
  const s = soldiersOf(e, q.id)[0];
  s.x = 144; s.y = 128;
  const v = spawnTruck(e.world, 128, 128, 0, 0);
  v.hx = 1; v.hy = 0;
  v.path = [160, 128]; v.pathIdx = 0; v.state = 'moving';
  e.runTicks(40);
  expect(v.x).toBeLessThan(144);
  for (const soldier of e.world.soldiers) expect(truckPenetration(v, soldier.x, soldier.y)).toBeLessThanOrEqual(1e-6);
  const stopped = v.x;
  for (const soldier of e.world.soldiers) soldier.y += 20;
  e.world.squads.length = 0;
  e.runTicks(10);
  expect(v.x).toBeGreaterThan(stopped + 2);
});

test('the empty test field remains free of generated scenery', () => {
  const e = fieldEngine();
  expect(e.world.props).toEqual([]);
  expect(e.world.grid.blocked.every(value => value === 0)).toBe(true);
});
