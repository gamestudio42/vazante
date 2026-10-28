import { describe, expect, it } from 'vitest';
import { SLICE, ZombieKind, ZombieState } from '@vazante/shared';
import { SimulationEngine } from '../src/index.ts';
import { fieldEngine } from './helpers.ts';

function slice(seed = 3): SimulationEngine {
  return SimulationEngine.create(seed, 'last_convoy', { zombies: 0 });
}

/** Teleport the truck into the base and let it "arrive", skipping the drive. */
function deliver(e: SimulationEngine): void {
  const w = e.world;
  const m = w.mission!;
  const truck = w.vehicle(m.trucks[0])!;
  const base = w.baseById(m.base)!;
  truck.x = ((base.x0 + base.x1) / 2) * 4 + 6;
  truck.y = ((base.y0 + base.y1) / 2) * 4 + 6;
  truck.state = 'moving';
  truck.dest = base.id;
  truck.path = [];
  e.tick();
}

function killDriven(e: SimulationEngine): void {
  const z = e.world.zombies;
  for (let s = 0; s < z.highWater; s++) if (z.isAlive(s) && z.driven[s]) z.kill(s);
}

describe('O Último Comboio', () => {
  it('starts on the delivery stage with the post short of ammo', () => {
    const w = slice().world;
    expect(w.mission!.phase).toBe('active');
    expect(w.mission!.stage).toBe(0);
    expect(w.bases.find((b) => b.kind === 'base')!.ammo).toBe(SLICE.baseAmmo);
    expect(w.vehicles[0].cargoAmmo).toBe(SLICE.truckAmmo);
  });

  it('losing the truck before delivery loses the mission', () => {
    const e = slice();
    e.world.vehicles[0].hp = 0;
    e.runTicks(2);
    expect(e.world.mission!.phase).toBe('lost');
    expect(e.world.mission!.reason).toBe('cargo_lost');
    expect(e.world.speed).toBe(0);
  });

  it('delivery starts three warned waves; clearing them wins', () => {
    const e = slice();
    const w = e.world;
    deliver(e);
    expect(w.mission!.stage).toBe(1);
    const warnings: number[] = [];
    let lastWarnTick = -1;
    for (let t = 0; t < 20000 && w.mission!.phase === 'active'; t++) {
      e.tick();
      const events = e.frame(false).events;
      // A wave enters as several groups from different sides.
      const starts = events.filter((ev) => ev.type === 'wave_started');
      if (starts.length > 0) {
        expect(starts.length).toBeGreaterThan(1);
        expect(new Set(starts.map((ev) => `${ev.x},${ev.y}`)).size).toBe(starts.length);
      }
      for (const ev of events) {
        if (ev.type === 'wave_warning') {
          warnings.push(Number(ev.reason));
          lastWarnTick = w.tick;
        }
        if (ev.type === 'wave_started' && ev === starts[0]) {
          const secs = (w.tick - lastWarnTick) / 10;
          expect(secs).toBeGreaterThanOrEqual(SLICE.warningMinS);
          expect(secs).toBeLessThanOrEqual(SLICE.warningMaxS + 0.2);
          // Wave zombies keep coming however far they spawned.
          e.runTicks(200);
          const z = w.zombies;
          let chasing = 0;
          for (let s = 0; s < z.highWater; s++) if (z.isAlive(s) && z.driven[s] && z.state[s] !== ZombieState.Wandering) chasing++;
          expect(chasing).toBeGreaterThan(0);
          killDriven(e);
        }
      }
    }
    expect(warnings.length).toBe(3);
    expect(w.mission!.phase).toBe('won');
  });

  it('a destroyed command post loses the mission', () => {
    const e = slice();
    const w = e.world;
    const cp = w.structure(w.mission!.commandPost)!;
    cp.hp = 1;
    // Zombies right next to the post.
    const x = w.grid.cellCenterX(cp.cell);
    const y = w.grid.cellCenterY(cp.cell);
    for (let i = 0; i < 8; i++) w.zombies.spawn(x + 2.5 + (i % 2) * 0.5, y - 1 + i * 0.3, ZombieKind.Common, ZombieState.Chasing);
    for (const s of w.soldiers) s.x += 200; // out of the way
    e.runTicks(300);
    expect(w.mission!.phase).toBe('lost');
    expect(w.mission!.reason).toBe('command_post_destroyed');
    expect(w.mission!.civilians).toBe(0);
  });
});

describe('districts', () => {
  it('an undefended district with enough zombies goes from held to lost', () => {
    const e = fieldEngine(1, 32);
    const w = e.world;
    for (let i = 0; i < 30; i++) w.zombies.spawn(10 + (i % 6) * 3, 10 + Math.floor(i / 6) * 3, ZombieKind.Common, ZombieState.Wandering);
    expect(w.districtControl[1]).toBe(100);
    const events: string[] = [];
    for (let t = 0; t < 1100; t++) {
      e.tick();
      for (const ev of e.frame(false).events) events.push(ev.type);
    }
    expect(w.districtControl[1]).toBe(0);
    expect(events).toContain('district_lost');
  });
});
