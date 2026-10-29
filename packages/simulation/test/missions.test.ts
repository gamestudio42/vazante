import { describe, expect, it } from 'vitest';
import { CELL_SIZE, MISSION_IDS, TICK_HZ, type MissionId } from '@vazante/shared';
import { SimulationEngine } from '../src/index.ts';
import type { MissionZone } from '../src/entities.ts';

function mission(id: MissionId, seed = 3): SimulationEngine {
  return SimulationEngine.create(seed, id, { zombies: 0 });
}

function centre(z: MissionZone): [number, number] {
  return [((z.x0 + z.x1 + 1) / 2) * CELL_SIZE, ((z.y0 + z.y1 + 1) / 2) * CELL_SIZE];
}

/** Put every squad (anchor and members) at a point, as if they had walked there. */
function teleportSquads(e: SimulationEngine, x: number, y: number): void {
  const w = e.world;
  for (const q of w.squads) {
    q.ax = x;
    q.ay = y;
    q.path = [];
    q.order = { kind: 'idle' };
    for (const id of q.members) {
      const s = w.soldier(id)!;
      s.x = x;
      s.y = y;
    }
  }
}

/** Remove the driven zombies the stage sends, so tests measure the rules, not the fight. */
function killDriven(e: SimulationEngine): void {
  const z = e.world.zombies;
  for (let s = 0; s < z.highWater; s++) if (z.isAlive(s) && z.driven[s]) z.kill(s);
}

function events(e: SimulationEngine, ticks: number, each?: () => void): string[] {
  const out: string[] = [];
  for (let t = 0; t < ticks; t++) {
    e.tick();
    for (const ev of e.frame(false).events) out.push(ev.type);
    each?.();
  }
  return out;
}

describe('campaign missions', () => {
  it('every mission builds on several seeds with its squads, trucks and zones', () => {
    for (const id of MISSION_IDS) {
      for (const seed of [1, 2, 9]) {
        const w = mission(id, seed).world;
        const m = w.mission!;
        expect(m.phase).toBe('active');
        expect(m.stage).toBe(0);
        expect(w.squads.length).toBeGreaterThan(1);
        for (const t of m.trucks) expect(w.vehicle(t)).toBeDefined();
        for (const z of m.zones) expect(z.x1 - z.x0).toBeGreaterThan(0);
      }
    }
  });

  it('Hospital São Lucas: reach, board the survivors with the truck parked and guarded, drive them home', () => {
    const e = mission('hospital');
    const w = e.world;
    const m = w.mission!;
    const [hx, hy] = centre(m.zones[0]);
    teleportSquads(e, hx, hy);
    e.tick();
    expect(m.stage).toBe(1);

    // Boarding waits for the truck.
    events(e, 100, () => killDriven(e));
    expect(m.progress).toBe(0);
    const truck = w.vehicle(m.trucks[0])!;
    truck.x = hx + 4;
    truck.y = hy + 4;
    const seen = events(e, 61 * TICK_HZ, () => killDriven(e));
    expect(seen).toContain('civilians_boarded');
    expect(seen).toContain('wave_started'); // pressure groups while boarding
    expect(m.stage).toBe(2);
    expect(truck.passengers).toBe(30);

    // Drive home (teleported to the base gate).
    const base = w.baseById(m.base)!;
    truck.x = ((base.x0 + base.x1) / 2) * CELL_SIZE + 6;
    truck.y = ((base.y0 + base.y1) / 2) * CELL_SIZE + 6;
    truck.state = 'moving';
    truck.dest = base.id;
    truck.path = [];
    e.tick();
    expect(m.phase).toBe('won');
    expect(m.evacuated).toBe(30);
  });

  it('Hospital São Lucas: losing the truck with the survivors loses the mission', () => {
    const e = mission('hospital');
    const w = e.world;
    const m = w.mission!;
    m.stage = 2;
    w.vehicle(m.trucks[0])!.hp = 0;
    e.runTicks(2);
    expect(m.phase).toBe('lost');
    expect(m.reason).toBe('evacuees_lost');
  });

  it('A Ponte: the bridge is away from the base and the clock only runs while it is held', () => {
    const e = mission('bridge');
    const w = e.world;
    const m = w.mission!;
    const base = w.baseById(m.base)!;
    const [zx, zy] = centre(m.zones[0]);
    expect(Math.hypot(zx - ((base.x0 + base.x1) / 2) * CELL_SIZE, zy - ((base.y0 + base.y1) / 2) * CELL_SIZE)).toBeGreaterThan(300);
    e.runTicks(20);
    expect(m.stage).toBe(0);

    teleportSquads(e, zx, zy);
    e.tick();
    expect(m.stage).toBe(1);
    events(e, 100, () => killDriven(e));
    const held = m.progress;
    expect(held).toBeGreaterThan(90);
    // Walk away: the clock stops.
    teleportSquads(e, zx + 200, zy);
    events(e, 50, () => killDriven(e));
    expect(m.progress).toBe(held);
    teleportSquads(e, zx, zy);
    const seen = events(e, 300 * TICK_HZ, () => killDriven(e));
    expect(seen).toContain('wave_started');
    expect(m.phase).toBe('won');
  });

  it('Retomar a Ribeira: three points inside the district held in turn, then the final waves', () => {
    const e = mission('retake');
    const w = e.world;
    const m = w.mission!;
    const d = w.districts.find((x) => x.name === 'Ribeira')!;
    expect(m.zones.length).toBe(3);
    for (let i = 0; i < 3; i++) {
      const [zx, zy] = centre(m.zones[i]);
      expect(w.grid.district[w.grid.idx(Math.floor(zx / CELL_SIZE), Math.floor(zy / CELL_SIZE))]).toBe(d.id);
      expect(m.stage).toBe(i);
      teleportSquads(e, zx, zy);
      events(e, 61 * TICK_HZ, () => killDriven(e));
    }
    expect(m.stage).toBe(3);
    const seen = events(e, 200 * TICK_HZ, () => killDriven(e));
    expect(seen.filter((t) => t === 'wave_started').length).toBeGreaterThan(0);
  });

  it('Linha de Suprimento: soldiers at the depot secure it before the truck can bring its stock home', () => {
    const e = mission('supply_line');
    const w = e.world;
    const m = w.mission!;
    const depot = w.bases.find((b) => b.name === m.zones[0].name)!;
    teleportSquads(e, ...centre(m.zones[0]));
    events(e, 5);
    expect(m.stage).toBe(1);
    expect(depot.ammo).toBe(0);
    const ev = events(e, 60 * TICK_HZ);
    expect(ev).toContain('site_secured');
    expect(m.stage).toBe(2);
    // Secured, the depot produces into its own stock for the truck to fetch.
    events(e, 60 * TICK_HZ);
    expect(depot.ammo).toBeGreaterThan(0);
  });

  it('O Último Trem: the survivors are delivered to the station, not to the base', () => {
    const e = mission('last_train');
    const w = e.world;
    const m = w.mission!;
    const station = w.bases.find((b) => b.name === m.zones[1].name)!;
    m.stage = 3;
    w.emit({ type: 'civilians_delivered', source: m.trucks[0], target: m.base, value: 40 });
    events(e, 1);
    expect(m.stage).toBe(3);
    w.emit({ type: 'civilians_delivered', source: m.trucks[0], target: station.id, value: 40 });
    events(e, 1);
    expect(m.stage).toBe(4);
    expect(m.evacuated).toBe(40);
  });
});
