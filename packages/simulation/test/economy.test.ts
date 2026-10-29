import { describe, expect, it } from 'vitest';
import { CELL_SIZE, ECONOMY, SoldierCondition, TICK_HZ } from '@vazante/shared';
import { SimulationEngine, type Base } from '../src/index.ts';
import { siteHeld } from '../src/systems/economy.ts';

function survival(seed = 3): SimulationEngine {
  return SimulationEngine.create(seed, 'survival', { zombies: 0 });
}

function site(e: SimulationEngine, role: Base['role']): Base {
  return e.world.bases.find((b) => b.role === role)!;
}

function centre(b: Base): [number, number] {
  return [((b.x0 + b.x1 + 1) / 2) * CELL_SIZE, ((b.y0 + b.y1 + 1) / 2) * CELL_SIZE];
}

/** Put a squad (anchor and members) at a point, as if it had walked there. */
function teleport(e: SimulationEngine, squad: number, [x, y]: [number, number]): void {
  const w = e.world;
  const q = w.squad(squad)!;
  q.ax = x;
  q.ay = y;
  q.path = [];
  q.order = { kind: 'hold', at: { x, y } };
  for (const id of q.members) {
    const s = w.soldier(id)!;
    s.x = x;
    s.y = y;
  }
}

function run(e: SimulationEngine, ticks: number): string[] {
  const out: string[] = [];
  for (let t = 0; t < ticks; t++) {
    e.tick();
    for (const ev of e.frame(false).events) out.push(ev.type);
  }
  return out;
}

describe('economy', () => {
  it('Porto Velário has a supply depot, a hospital and a station; only the base starts secured', () => {
    const e = survival();
    const w = e.world;
    expect(w.economy).toBe(true);
    for (const role of ['command', 'supply', 'hospital', 'station'] as const) expect(site(e, role)).toBeDefined();
    expect(siteHeld(w, site(e, 'command'))).toBe(true);
    expect(siteHeld(w, site(e, 'supply'))).toBe(false);
    expect(e.frame(false).economy).toBe(true);
  });

  it('a squad standing in a depot secures it, and the depot then produces into its own stock', () => {
    const e = survival();
    const w = e.world;
    const depot = site(e, 'supply');
    const before = { materials: depot.materials, ammo: depot.ammo };
    teleport(e, w.squads[0].id, centre(depot));
    const ev = run(e, 40 * TICK_HZ);
    expect(ev).toContain('site_secured');
    expect(siteHeld(w, depot)).toBe(true);
    run(e, ECONOMY.everyS * TICK_HZ);
    expect(depot.materials).toBeGreaterThanOrEqual(before.materials + ECONOMY.siteMaterials);
    expect(depot.ammo).toBeGreaterThanOrEqual(before.ammo + ECONOMY.supplyAmmo);
    const view = e.frame(false).bases.find((b) => b.id === depot.id)!;
    expect(view.held).toBe(true);
    expect(view.income.ammo).toBe(ECONOMY.supplyAmmo);
  });

  it('a secured site falls when the infected outnumber the soldiers there', () => {
    const e = survival();
    const w = e.world;
    const depot = site(e, 'supply');
    depot.control = 100;
    const [x, y] = centre(depot);
    for (let i = 0; i < 30; i++) w.zombies.spawn(x + (i % 6) * 2, y + Math.floor(i / 6) * 2, 0);
    const ev = run(e, 30 * TICK_HZ);
    expect(ev).toContain('site_lost');
    expect(siteHeld(w, depot)).toBe(false);
  });

  it('a secured hospital heals and cures the bitten', () => {
    const e = survival();
    const w = e.world;
    const hospital = site(e, 'hospital');
    hospital.control = 100;
    const q = w.squads[0];
    teleport(e, q.id, centre(hospital));
    const s = w.soldier(q.members[0])!;
    s.hp = 10;
    s.condition = SoldierCondition.Bitten;
    s.turnAt = w.tick + 600;
    const ev = run(e, 2 * TICK_HZ);
    expect(ev).toContain('soldier_cured');
    expect(s.condition).toBe(SoldierCondition.Ok);
    expect(s.turnAt).toBe(-1);
    expect(s.hp).toBeGreaterThan(10);
  });

  it('a secured station recruits a squad there for the base materials', () => {
    const e = survival();
    const w = e.world;
    const station = site(e, 'station');
    const home = site(e, 'command');
    const squads = w.squads.length;
    e.enqueue({ type: 'recruit', kind: 'police' });
    run(e, 1);
    expect(w.squads.length).toBe(squads);

    station.control = 100;
    home.materials = ECONOMY.recruitCost.police + 10;
    e.enqueue({ type: 'recruit', kind: 'police' });
    const ev = run(e, 1);
    expect(ev).toContain('squad_recruited');
    expect(w.squads.length).toBe(squads + 1);
    expect(home.materials).toBe(10);
    const q = w.squads[w.squads.length - 1];
    expect(q.name).toBe(ECONOMY.recruitNames[0]);
    expect(w.siteAt(q.ax, q.ay)?.id).toBe(station.id);

    e.enqueue({ type: 'recruit', kind: 'marines' });
    run(e, 1);
    expect(w.squads.length).toBe(squads + 1);
  });
});
