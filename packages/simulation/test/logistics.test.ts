import { describe, expect, it } from 'vitest';
import { CELL_SIZE, Ground, RESUPPLY_ROUNDS_PER_S, TRUCK, WEAPONS, ZombieKind, ZombieState, type RiskPolicy } from '@vazante/shared';
import { SimulationEngine, spawnTruck } from '../src/index.ts';
import { addSquad, disarm, fieldEngine, soldiersOf } from './helpers.ts';

const c = (cell: number) => (cell + 0.5) * CELL_SIZE;

describe('resupply', () => {
  it('refills only near a base with stock, at the balance rate', () => {
    const e = fieldEngine(1, 64);
    const w = e.world;
    const base = w.addBase('Base', 0, 0, 9, 9, 0, 1000);
    const near = addSquad(e, 'slice', c(5), c(5), 'Perto');
    const far = addSquad(e, 'slice', c(55), c(55), 'Longe');
    for (const s of w.soldiers) disarm(s);
    e.runTicks(10);
    const perSoldier = RESUPPLY_ROUNDS_PER_S; // one second
    for (const s of soldiersOf(e, near.id)) expect(s.ammo + s.mag).toBe(perSoldier);
    for (const s of soldiersOf(e, far.id)) expect(s.ammo + s.mag).toBe(0);
    expect(base.ammo).toBe(1000 - 6 * perSoldier);
  });

  it('stops at the weapon capacity and when the stock runs out', () => {
    const e = fieldEngine(1, 32);
    const w = e.world;
    const base = w.addBase('Base', 0, 0, 9, 9, 0, 50);
    const q = addSquad(e, 'slice', c(5), c(5));
    const s0 = soldiersOf(e, q.id)[0];
    s0.ammo = WEAPONS[s0.weapon].ammoPerSoldier - s0.mag - 3;
    for (const s of soldiersOf(e, q.id).slice(1)) disarm(s);
    e.runTicks(100);
    expect(s0.ammo + s0.mag).toBe(WEAPONS[s0.weapon].ammoPerSoldier);
    expect(base.ammo).toBe(0);
  });
});

/** A straight street from a base (west) to a depot (east). */
function roadEngine(): { e: SimulationEngine; truckId: number; baseId: number; depotId: number } {
  const e = fieldEngine(1, 64);
  const w = e.world;
  for (let x = 0; x < 64; x++) for (let y = 0; y < 64; y++) w.grid.ground[w.grid.idx(x, y)] = y >= 31 && y <= 33 ? Ground.Street : Ground.Lot;
  const base = w.addBase('Base', 0, 28, 5, 36, 0, 0);
  const depot = w.addBase('Depósito', 58, 28, 63, 36, 0, 0, 'depot');
  const t = spawnTruck(w, c(60), c(32), 3000, 100);
  return { e, truckId: t.id, baseId: base.id, depotId: depot.id };
}

function blockRoad(e: SimulationEngine, n = 10): void {
  for (let i = 0; i < n; i++) e.world.zombies.spawn(c(30) + (i % 5) * 0.6, c(31) + Math.floor(i / 5) * 2 + 1, ZombieKind.Common, ZombieState.Wandering);
}

describe('trucks and convoys', () => {
  it('drives only on streets and delivers cargo on arrival', () => {
    const { e, truckId, baseId } = roadEngine();
    const w = e.world;
    e.enqueue({ type: 'convoy', vehicle: truckId, to: baseId, policy: 'halt' });
    let delivered = false;
    const base = w.baseById(baseId)!;
    for (let t = 0; t < 600 && !delivered; t++) {
      e.tick();
      const v = w.vehicle(truckId)!;
      const cell = w.grid.cellAt(v.x, v.y);
      const inSite = w.siteAt(v.x, v.y) !== undefined;
      expect(w.grid.ground[cell] === Ground.Street || inSite).toBe(true);
      delivered = e.frame(false).events.some((x) => x.type === 'cargo_delivered');
      // Cargo stays on the truck until it arrives.
      if (!delivered) expect(base.ammo).toBe(0);
    }
    expect(delivered).toBe(true);
    expect(base.ammo).toBe(3000);
    expect(base.materials).toBe(100);
    expect(w.vehicle(truckId)!.cargoAmmo).toBe(0);
  });

  it('a destroyed truck delivers nothing', () => {
    const { e, truckId, baseId } = roadEngine();
    const w = e.world;
    const v = w.vehicle(truckId)!;
    v.hp = 6;
    for (let i = 0; i < 12; i++) w.zombies.spawn(v.x + (i % 4) - 1.5, v.y + Math.floor(i / 4) - 1, ZombieKind.Common, ZombieState.Chasing);
    e.enqueue({ type: 'convoy', vehicle: truckId, to: baseId, policy: 'push_through' });
    e.runTicks(600);
    expect(v.state).toBe('destroyed');
    expect(v.cargoAmmo).toBe(0);
    expect(w.baseById(baseId)!.ammo).toBe(0);
  });

  const run = (policy: RiskPolicy) => {
    const r = roadEngine();
    blockRoad(r.e, 12);
    r.e.enqueue({ type: 'convoy', vehicle: r.truckId, to: r.baseId, policy });
    const events: string[] = [];
    for (let t = 0; t < 400; t++) {
      r.e.tick();
      for (const x of r.e.frame(false).events) events.push(x.type);
    }
    return { ...r, v: r.e.world.vehicle(r.truckId)!, events };
  };

  it('halt: stops at a blocked road and reports it', () => {
    const { v, events, e, baseId } = run('halt');
    expect(events).toContain('convoy_blocked');
    expect(v.state === 'blocked' || v.state === 'destroyed').toBe(true);
    expect(e.world.baseById(baseId)!.ammo).toBe(0);
  });

  it('push_through: rams through and arrives', () => {
    const { v, events, e, baseId } = run('push_through');
    expect(events).toContain('convoy_blocked');
    expect(events).toContain('cargo_delivered');
    expect(v.hp).toBeLessThan(TRUCK.hp);
    expect(e.world.baseById(baseId)!.ammo).toBe(3000);
  });

  it('return: turns back to where it came from', () => {
    const { v, e, depotId } = run('return');
    expect(v.dest === depotId || e.world.siteAt(v.x, v.y)?.id === depotId).toBe(true);
  });

  it('the slice truck reaches the base through the city', () => {
    const e = SimulationEngine.create(5, 'last_convoy', { zombies: 0 });
    const w = e.world;
    const truck = w.vehicles[0];
    const base = w.bases.find((b) => b.kind === 'base')!;
    const before = base.ammo;
    e.enqueue({ type: 'convoy', vehicle: truck.id, to: base.id, policy: 'push_through' });
    e.runTicks(1200);
    expect(base.ammo).toBe(before + 4000);
    expect(w.mission!.stage).toBe(1);
  });
});

describe('driving and escorting', () => {
  it('drives to the road nearest a point and parks there', () => {
    const { e, truckId } = roadEngine();
    const w = e.world;
    // A point beside the street: the truck stops on the street next to it.
    e.enqueue({ type: 'drive', vehicle: truckId, to: { x: c(30), y: c(36) } });
    e.runTicks(300);
    const v = w.vehicle(truckId)!;
    expect(v.state).toBe('idle');
    expect(Math.abs(v.x - c(30))).toBeLessThan(CELL_SIZE * 1.5);
    expect(w.grid.ground[w.grid.cellAt(v.x, v.y)]).toBe(Ground.Street);
    expect(v.cargoAmmo).toBe(3000);
  });

  it('follows a squad at its pace and waits behind it', () => {
    const { e, truckId } = roadEngine();
    const w = e.world;
    const q = addSquad(e, 'slice', c(54), c(32));
    e.enqueue({ type: 'escort', vehicle: truckId, squad: q.id });
    e.enqueue({ type: 'move', squads: [q.id], to: { x: c(10), y: c(32) } });
    let maxGap = 0;
    for (let t = 0; t < 900; t++) {
      e.tick();
      const v = w.vehicle(truckId)!;
      if (t > 100) maxGap = Math.max(maxGap, Math.abs(v.x - q.ax));
      // Never drives ahead of the squad it escorts.
      if (t > 30) expect(v.x).toBeGreaterThan(q.ax - 4);
    }
    const v = w.vehicle(truckId)!;
    expect(q.order.kind).toBe('hold');
    expect(maxGap).toBeLessThan(30);
    expect(v.state).toBe('idle');
    expect(v.x - q.ax).toBeGreaterThan(4);
    expect(v.x - q.ax).toBeLessThan(20);
    expect(e.frame(false).vehicles[0].escort).toBe(q.id);
    // Escorting stops on request.
    e.enqueue({ type: 'escort', vehicle: truckId, squad: null });
    e.runTicks(2);
    expect(e.frame(false).vehicles[0].escort).toBe(0);
  });
});
