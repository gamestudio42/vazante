import { describe, expect, it } from 'vitest';
import { Blocked, CELL_SIZE, CLIMB_INTERVAL_S, TICK_HZ, Ground, SoldierCondition, STRUCTURES, STRUCTURE_KINDS, ZombieKind, ZombieState, checkPlacement, type StructureKind } from '@vazante/shared';
import { buildTicks, placementContext, type SimulationEngine } from '../src/index.ts';
import { addSquad, disarm, fieldEngine, soldiersOf } from './helpers.ts';

const c = (cell: number) => (cell + 0.5) * CELL_SIZE;

function withBase(cells = 64, materials = 100_000, ammo = 100_000): SimulationEngine {
  const e = fieldEngine(1, cells);
  e.world.addBase('Teste', 0, 0, cells - 1, cells - 1, materials, ammo);
  return e;
}

function build(e: SimulationEngine, kind: StructureKind, cx: number, cy: number): void {
  e.enqueue({ type: 'build', kind, at: { x: c(cx), y: c(cy) } });
}

/** Finish every blueprint instantly (skips the builder requirement for scenario setup). */
function finishAll(e: SimulationEngine): void {
  for (const st of e.world.structures) st.work = buildTicks(st.kind);
  e.tick();
}

function rejections(e: SimulationEngine): (string | undefined)[] {
  return e.frame(false).events.filter((x) => x.type === 'command_rejected').map((x) => x.reason);
}

describe('construction', () => {
  it('rejects invalid placements with the same reason the UI computes', () => {
    const e = fieldEngine(1, 32);
    const w = e.world;
    w.addBase('Teste', 4, 4, 15, 15, 30);
    w.grid.ground[w.grid.idx(6, 6)] = Ground.Building;
    addSquad(e, 'slice', 8 * CELL_SIZE + 2, 10 * CELL_SIZE + 2);
    const soldierCell = w.grid.cellAt(w.soldiers[0].x, w.soldiers[0].y);
    const cases: [StructureKind, number, number, string][] = [
      ['hesco', 20, 20, 'outside_base'],
      ['hesco', 6, 6, 'terrain'],
      ['hesco', soldierCell % 32, Math.floor(soldierCell / 32), 'occupied_unit'],
      ['wall', 12, 5, 'no_materials'],
    ];
    for (const [kind, cx, cy, reason] of cases) {
      expect(checkPlacement(placementContext(w), kind, cx, cy).error).toBe(reason);
      build(e, kind, cx, cy);
      e.tick();
      expect(rejections(e)).toEqual([reason]);
    }
    build(e, 'hesco', 12, 5);
    e.tick();
    expect(rejections(e)).toEqual([]);
    expect(w.bases[0].materials).toBe(30 - STRUCTURES.hesco.materials);
    expect(checkPlacement(placementContext(w), 'hesco', 12, 5).error).toBe('occupied_structure');
    build(e, 'hesco', 12, 5);
    e.tick();
    expect(rejections(e)).toEqual(['occupied_structure']);
  });

  it('needs two builders nearby and blocks its cell when finished', () => {
    // Only one soldier left alive near the site: no progress.
    const lone = withBase(32);
    const q1 = addSquad(lone, 'slice', c(10), c(10));
    for (const s of soldiersOf(lone, q1.id).slice(1)) s.condition = SoldierCondition.Dead;
    build(lone, 'wall', 12, 10);
    lone.runTicks(buildTicks('wall') + 5);
    expect(lone.world.structures[0].work).toBe(0);
    expect(lone.world.structures[0].built).toBe(false);

    // A full squad: finished right after the build time.
    const e = withBase(32);
    const w = e.world;
    addSquad(e, 'slice', c(10), c(10));
    build(e, 'wall', 12, 10);
    e.runTicks(buildTicks('wall') - 1);
    const st = w.structures[0];
    expect(st.built).toBe(false);
    e.tick();
    expect(st.built).toBe(true);
    expect(w.grid.blocked[st.cell] & Blocked.StructureWall).toBeTruthy();
    expect(w.grid.isWalkable(st.cell)).toBe(false);
  });

  it('soldiers standing on finished blueprints step off them, so the structures rise', () => {
    const e = withBase();
    const w = e.world;
    // A 3 x 3 patch of blueprints, then a squad told to hold right on top of it.
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) build(e, 'hesco', 20 + dx, 20 + dy);
    e.tick();
    expect(w.structures.length).toBe(9);
    const q = addSquad(e, 'police', c(20), c(20));
    q.autoBuild = false;
    q.order = { kind: 'hold', at: { x: c(20), y: c(20) } };
    for (const st of w.structures) st.work = buildTicks(st.kind);
    e.runTicks(150);
    expect(w.structures.every((st) => st.built)).toBe(true);
  });

  it('idle squads in the base walk to blueprints and build them', () => {
    const e = withBase(48);
    const w = e.world;
    const q = addSquad(e, 'slice', c(10), c(10));
    for (let x = 20; x <= 24; x++) build(e, 'hesco', x, 30);
    e.runTicks(5 * buildTicks('hesco') + 1200);
    expect(w.structures.every((st) => st.built)).toBe(true);
    expect(q.buildTask).toBe(0);
    // A player order cancels the task.
    build(e, 'wall', 40, 40);
    e.runTicks(30);
    expect(q.buildTask).not.toBe(0);
    e.enqueue({ type: 'hold', squads: [q.id] });
    e.runTicks(50);
    expect(q.buildTask).toBe(0);
  });

  it('a new wall reroutes the horde around it', () => {
    const e = withBase(32);
    const w = e.world;
    addSquad(e, 'slice', c(22), c(16));
    for (const s of w.soldiers) disarm(s);
    e.tick();
    const probe = w.grid.idx(8, 16);
    const before = w.grid.flow[probe];
    for (let y = 10; y <= 22; y++) build(e, 'wall', 15, y);
    e.tick();
    finishAll(e);
    e.tick();
    const after = w.grid.flow[probe];
    expect(after).toBeGreaterThan(before);
    expect(after).toBeLessThan(before + 200); // detour, not through the wall
    const slot = w.zombies.spawn(c(8), c(16), ZombieKind.Common, ZombieState.Chasing);
    let enteredWall = false;
    let reached = false;
    for (let t = 0; t < 900 && !reached; t++) {
      e.tick();
      if (w.grid.structure[w.grid.cellAt(w.zombies.x[slot], w.zombies.y[slot])] !== 0) enteredWall = true;
      reached = w.zombies.x[slot] > 16 * CELL_SIZE;
    }
    expect(reached).toBe(true);
    expect(enteredWall).toBe(false);
  });

  it.each(STRUCTURE_KINDS)('%s is damaged and destroyed by zombies', (kind) => {
    const e = withBase(32, 100_000, 0);
    const w = e.world;
    const q = addSquad(e, 'slice', c(24), c(16));
    for (const s of w.soldiers) disarm(s);
    for (let y = 0; y < 32; y++) build(e, kind, 16, y);
    e.tick();
    finishAll(e);
    // Low structures get climbed quickly, so give every piece only a few hit points.
    for (const st of w.structures) st.hp = 3;
    for (let i = 0; i < 40; i++) {
      const s = w.zombies.spawn(c(8 + (i % 5)), c(12 + Math.floor(i / 5)), ZombieKind.Common, ZombieState.Chasing);
      w.zombies.target[s] = soldiersOf(e, q.id)[0].id;
    }
    let destroyed = false;
    let damaged = false;
    for (let t = 0; t < 900 && !destroyed; t++) {
      e.tick();
      damaged ||= w.structures.some((st) => st.hp < 3);
      destroyed = e.frame(false).events.some((x) => x.type === 'structure_destroyed' && x.reason === kind);
    }
    expect(damaged).toBe(true);
    expect(destroyed).toBe(true);
    expect(w.structures.length).toBeLessThan(32);
    const gap = Array.from({ length: 32 }, (_, y) => w.grid.idx(16, y)).find((cell) => w.grid.structure[cell] === 0)!;
    expect(w.grid.blocked[gap]).toBe(Blocked.None);
  });
});

describe('wall stacking', () => {
  /** 200 zombies attack a full-width concrete wall that protects an unarmed squad. */
  function siege(withNest: boolean): { engine: SimulationEngine; crossedAt: number } {
    const e = withBase(64);
    const w = e.world;
    const q = addSquad(e, 'slice', c(44), c(32));
    for (const s of w.soldiers) disarm(s);
    for (let y = 0; y < 64; y++) build(e, 'wall', 32, y);
    if (withNest) build(e, 'mg_nest', 36, 32);
    e.tick();
    finishAll(e);
    const victim = soldiersOf(e, q.id)[0].id;
    let n = 0;
    for (let y = 20; y < 44 && n < 200; y++) {
      for (let x = 14; x < 30 && n < 200; x += 2) {
        const s = w.zombies.spawn(x * CELL_SIZE + 1 + (y % 2), y * CELL_SIZE + 2, ZombieKind.Common, ZombieState.Chasing);
        w.zombies.target[s] = victim;
        n++;
      }
    }
    const wallEdge = 33 * CELL_SIZE;
    let crossedAt = -1;
    for (let t = 0; t < 1200 && crossedAt < 0; t++) {
      e.tick();
      const z = w.zombies;
      for (let s = 0; s < z.highWater; s++) {
        if (z.isAlive(s) && z.x[s] > wallEdge) {
          crossedAt = t;
          break;
        }
      }
    }
    return { engine: e, crossedAt };
  }

  it('an undefended 3.5 m wall is crossed within 60 s', () => {
    const { crossedAt } = siege(false);
    expect(crossedAt).toBeGreaterThanOrEqual(0);
    expect(crossedAt).toBeLessThan(600);
  });

  it('zombies get onto a climbable wall cell at most once per CLIMB_INTERVAL_S', () => {
    const { engine } = siege(false);
    const w = engine.world;
    const z = w.zombies;
    const prev = new Int32Array(z.highWater).fill(-1);
    const entries = new Map<number, number[]>();
    for (let t = 0; t < 400; t++) {
      engine.tick();
      for (let s = 0; s < z.highWater; s++) {
        const cell = z.isAlive(s) ? w.grid.cellAt(z.x[s], z.y[s]) : -1;
        if (cell >= 0 && prev[s] >= 0 && w.grid.structure[prev[s]] === 0 && w.grid.structure[cell] !== 0) {
          const list = entries.get(cell) ?? [];
          list.push(w.tick);
          entries.set(cell, list);
        }
        prev[s] = cell;
      }
    }
    expect(entries.size).toBeGreaterThan(0);
    for (const ticks of entries.values()) {
      for (let i = 1; i < ticks.length; i++) expect(ticks[i] - ticks[i - 1]).toBeGreaterThanOrEqual(CLIMB_INTERVAL_S * TICK_HZ);
    }
  });

  it('with an active MG nest the wall holds for 120 s', () => {
    const { engine, crossedAt } = siege(true);
    expect(crossedAt).toBe(-1);
    expect(engine.world.stats.zombiesKilled).toBeGreaterThan(100);
  });
});

describe('horde routing', () => {
  it('a jammed gap sends part of the horde round to another gap', () => {
    const e = withBase(64);
    const w = e.world;
    const q = addSquad(e, 'slice', c(58), c(12));
    for (const s of w.soldiers) disarm(s);
    // A wall down x = 32 with a one-cell gap near the squad and another 18 cells away.
    for (let y = 0; y < 64; y++) if (y !== 12 && y !== 30) build(e, 'wall', 32, y);
    e.tick();
    finishAll(e);
    const victim = soldiersOf(e, q.id)[0].id;
    let n = 0;
    for (let y = 4; y < 22 && n < 240; y++) {
      for (let x = 10; x < 30 && n < 240; x += 2) {
        const s = w.zombies.spawn(x * CELL_SIZE + 1 + (y % 2), y * CELL_SIZE + 2, ZombieKind.Common, ZombieState.Chasing);
        w.zombies.target[s] = victim;
        n++;
      }
    }
    const z = w.zombies;
    const farGap = new Set<number>();
    for (let t = 0; t < 600; t++) {
      for (const sol of w.soldiers) sol.hp = 1000;
      e.tick();
      for (let s = 0; s < z.highWater; s++) {
        if (z.isAlive(s) && z.y[s] > 26 * CELL_SIZE) farGap.add(s);
      }
    }
    expect(farGap.size).toBeGreaterThan(10);
  });
});

describe('construction determinism', () => {
  it('same commands give the same hash with structures, piles and nests', () => {
    const run = () => {
      const e = withBase(32);
      const q = addSquad(e, 'slice', c(24), c(16));
      for (let y = 0; y < 32; y++) build(e, y === 16 ? 'gate' : 'hesco', 16, y);
      build(e, 'mg_nest', 20, 16);
      e.enqueue({ type: 'debug_spawn', at: { x: c(6), y: c(16) }, count: 80 });
      e.runTicks(400);
      const gate = e.world.structures.find((s) => s.kind === 'gate');
      if (gate) e.enqueue({ type: 'toggle_gate', structure: gate.id });
      e.enqueue({ type: 'move', squads: [q.id], to: { x: c(26), y: c(10) } });
      e.runTicks(200);
      return e.hashState();
    };
    expect(run()).toBe(run());
  });
});
