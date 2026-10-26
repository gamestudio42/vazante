import { Fnv1a } from '@vazante/kernel';
import {
  SOLDIER_STRIDE,
  WEAPON_IDS,
  ZOMBIE_STRIDE,
  type Command,
  type CommandEnvelope,
  type Frame,
  type MapInfo,
  STRUCTURES,
  type SquadView,
  type StructureView,
  type VehicleView,
  type MissionView,
  type DistrictView,
  SLICE,
  DISTRICT,
  TICK_HZ,
  TRUCK,
} from '@vazante/shared';
import { applyCommand } from './commands.ts';
import { createScenario, type ScenarioId, type ScenarioOptions } from './scenarios/index.ts';
import { stepCombat } from './systems/combat.ts';
import { buildTicks, stepConstruction, stepEmplacements } from './systems/construction.ts';
import { stepFlow } from './systems/flow.ts';
import { stepHorde } from './systems/horde.ts';
import { stepInfection } from './systems/infection.ts';
import { stepResupply, stepVehicles } from './systems/logistics.ts';
import { districtCounts, drivenAlive, stepDistricts, stepMission } from './systems/mission.ts';
import { decayNoise } from './systems/noise.ts';
import { stepUnits } from './systems/units.ts';
import { isActiveSoldier, type World } from './world.ts';

/** The authoritative simulation. Runs in the worker in the game and directly in tests. */
export class SimulationEngine {
  readonly world: World;
  private queue: CommandEnvelope[] = [];
  private seq = 0;
  /** Wall time spent in the last tick (set by the host, not part of the state). */
  lastTickMs = 0;

  constructor(world: World) {
    this.world = world;
  }

  static create(seed: number, scenario: ScenarioId = 'last_convoy', opts?: ScenarioOptions): SimulationEngine {
    return new SimulationEngine(createScenario(scenario, seed, opts));
  }

  get tickCount(): number {
    return this.world.tick;
  }

  /** Change speed immediately (works while paused). Speed is not part of the simulated state. */
  setSpeed(speed: 0 | 1 | 2 | 4): string | null {
    const w = this.world;
    if (w.directSoldier !== null && speed !== 1) {
      w.emit({ type: 'command_rejected', reason: 'direct_control_active' });
      return 'direct_control_active';
    }
    w.speed = speed;
    return null;
  }

  enqueue(cmd: Command): void {
    this.queue.push({ seq: this.seq++, cmd });
  }

  tick(): void {
    const w = this.world;
    const pending = this.queue;
    this.queue = [];
    for (const env of pending) {
      const reason = applyCommand(w, env.cmd);
      if (reason) w.emit({ type: 'command_rejected', reason, value: env.seq });
    }
    stepFlow(w);
    w.rebuildZombieHash();
    stepHorde(w);
    stepUnits(w);
    stepVehicles(w);
    w.rebuildZombieHash();
    stepCombat(w);
    stepEmplacements(w);
    stepInfection(w);
    stepConstruction(w);
    stepResupply(w);
    stepDistricts(w);
    stepMission(w);
    decayNoise(w);
    w.tick++;
  }

  runTicks(n: number): void {
    for (let i = 0; i < n; i++) this.tick();
  }

  /** Static map data for the client. */
  mapInfo(): MapInfo {
    const w = this.world;
    return {
      seed: w.seed,
      width: w.grid.width,
      height: w.grid.height,
      cellSize: 4,
      ground: w.grid.ground.slice(),
      heights: w.grid.heights.slice(),
      buildings: w.buildings.map((b) => ({ ...b })),
      districts: w.districts.map((d) => ({ ...d })),
      sites: w.sites.map((s) => ({ ...s })),
    };
  }

  /** Read-only snapshot for presentation. Drains the pending events; never changes simulation state. */
  frame(includeHash = true): Frame {
    const w = this.world;
    const soldiers = new Float32Array(w.soldiers.length * SOLDIER_STRIDE);
    let ammoTotal = 0;
    let soldiersAlive = 0;
    w.soldiers.forEach((s, i) => {
      const o = i * SOLDIER_STRIDE;
      soldiers[o] = s.id;
      soldiers[o + 1] = s.squad;
      soldiers[o + 2] = s.x;
      soldiers[o + 3] = s.y;
      soldiers[o + 4] = s.fx;
      soldiers[o + 5] = s.fy;
      soldiers[o + 6] = s.hp;
      soldiers[o + 7] = s.ammo + s.mag;
      soldiers[o + 8] = s.condition;
      soldiers[o + 9] = s.activity;
      soldiers[o + 10] = s.mag;
      if (isActiveSoldier(s)) {
        soldiersAlive++;
        ammoTotal += s.ammo + s.mag;
      }
    });
    const z = w.zombies;
    const zombies = new Float32Array(z.alive * ZOMBIE_STRIDE);
    let k = 0;
    for (let s = 0; s < z.highWater; s++) {
      if (!z.isAlive(s)) continue;
      const o = k * ZOMBIE_STRIDE;
      zombies[o] = s;
      zombies[o + 1] = z.x[s];
      zombies[o + 2] = z.y[s];
      zombies[o + 3] = z.vx[s];
      zombies[o + 4] = z.vy[s];
      zombies[o + 5] = z.kind[s] * 16 + z.state[s];
      k++;
    }
    const squads: SquadView[] = w.squads.map((q) => {
      let alive = 0;
      for (const id of q.members) {
        const s = w.soldier(id);
        if (s && isActiveSoldier(s)) alive++;
      }
      return {
        id: q.id,
        name: q.name,
        members: q.members.slice(),
        alive,
        order: structuredCloneOrder(q.order),
        stance: q.stance,
        formation: q.formation,
        anchorX: q.ax,
        anchorY: q.ay,
        path: q.path.slice(q.pathIdx * 2),
      };
    });
    const structures: StructureView[] = w.structures.map((st) => ({
      id: st.id,
      kind: st.kind,
      cx: st.cell % w.grid.width,
      cy: Math.floor(st.cell / w.grid.width),
      hp: st.hp,
      maxHp: STRUCTURES[st.kind].hp,
      progress: Math.min(1, st.work / buildTicks(st.kind)),
      built: st.built,
      open: st.open,
      pile: w.grid.pile[st.cell],
    }));
    const bases = w.bases.map((b) => ({ id: b.id, kind: b.kind, name: b.name, x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, materials: b.materials, ammo: b.ammo }));
    const vehicles: VehicleView[] = w.vehicles.map((v) => ({
      id: v.id,
      kind: v.kind,
      x: v.x,
      y: v.y,
      hx: v.hx,
      hy: v.hy,
      hp: v.hp,
      maxHp: TRUCK.hp,
      cargoAmmo: v.cargoAmmo,
      cargoMaterials: v.cargoMaterials,
      state: v.state,
      policy: v.policy,
      dest: v.dest,
      path: v.path.slice(v.pathIdx * 2),
    }));
    const m = w.mission;
    const cp = m ? w.structure(m.commandPost) : undefined;
    const mission: MissionView | null = m
      ? {
          phase: m.phase,
          wave: m.wave,
          waves: SLICE.waves.length,
          waveState: m.waveState,
          secondsToWave: m.waveState === 'warning' ? Math.max(0, Math.ceil((m.nextAt - w.tick) / TICK_HZ)) : 0,
          waveZombies: m.waveState === 'active' ? drivenAlive(w) : 0,
          civilians: m.civilians,
          civiliansMax: SLICE.civilians,
          commandPostHp: cp ? cp.hp : 0,
          commandPostMaxHp: STRUCTURES.command_post.hp,
          cargoDelivered: m.cargoDelivered,
          reason: m.reason,
        }
      : null;
    const counts = districtCounts(w);
    const districts: DistrictView[] = w.districts.map((d) => {
      const control = w.districtControl[d.id];
      return {
        id: d.id,
        name: d.name,
        control,
        state: control > DISTRICT.heldAbove ? 'held' : control <= DISTRICT.lostAt ? 'lost' : 'contested',
        zombies: counts.zombies[d.id],
        soldiers: counts.soldiers[d.id],
      };
    });
    const events = w.events;
    w.events = [];
    return {
      tick: w.tick,
      speed: w.speed,
      hash: includeHash ? this.hashState() : 0,
      soldiers,
      zombies,
      squads,
      structures,
      bases,
      vehicles,
      mission,
      districts,
      directSoldier: w.directSoldier,
      events,
      stats: {
        zombiesAlive: z.alive,
        zombiesKilled: w.stats.zombiesKilled,
        soldiersAlive,
        shotsFired: w.stats.shotsFired,
        ammoTotal,
        tickMs: this.lastTickMs,
      },
    };
  }

  /** FNV-1a over the whole simulation state. Oracle for determinism and save/load tests. */
  hashState(): number {
    const w = this.world;
    const h = new Fnv1a();
    h.u32(w.tick).u32(w.nextId).u32(w.stats.zombiesKilled).u32(w.stats.shotsFired);
    for (const v of w.rng.getState()) h.u32(v);
    h.u32(w.directSoldier ?? 0);
    h.bytes(w.grid.blocked).bytes(w.grid.noise).bytes(w.grid.flow).bytes(w.grid.structHeight).bytes(w.grid.pile);
    h.byte(w.flowDirty ? 1 : 0);
    for (const b of w.bases) h.u32(b.id).u32(b.materials).u32(b.ammo);
    h.bytes(w.districtControl);
    if (w.mission) {
      const m = w.mission;
      h.byte(1).str(m.phase).u32(m.wave).str(m.waveState).u32(m.nextAt).u32(m.civilians).u32(m.commandPost).u32(m.base).u32(m.truck).byte(m.cargoDelivered ? 1 : 0).str(m.reason);
    } else h.byte(0);
    for (const v of w.vehicles) {
      h.u32(v.id).f64Value(v.x).f64Value(v.y).f64Value(v.hx).f64Value(v.hy).f64Value(v.hp).u32(v.cargoAmmo).u32(v.cargoMaterials);
      h.str(v.state).str(v.policy).u32(v.dest).u32(v.origin).u32(v.pathIdx).u32(v.path.length).u32(v.blockedT).byte(v.rerouted ? 1 : 0).byte(v.blockReported ? 1 : 0);
      for (const p of v.path) h.f64Value(p);
    }
    for (const st of w.structures) {
      h.u32(st.id).str(st.kind).u32(st.cell).u32(st.base).f64Value(st.hp).u32(st.work).byte(st.built ? 1 : 0).byte(st.open ? 1 : 0);
      h.u32(st.target + 1).f64Value(st.fireAcc);
    }
    const z = w.zombies;
    h.u32(z.alive).u32(z.highWater);
    for (let s = 0; s < z.highWater; s++) {
      if (!z.isAlive(s)) {
        h.byte(0);
        continue;
      }
      h.byte(1).u32(s).f64Value(z.x[s]).f64Value(z.y[s]).f64Value(z.vx[s]).f64Value(z.vy[s]);
      h.u32(z.hp[s] & 0xffff).byte(z.state[s]).byte(z.kind[s]).u32(z.attackCd[s]).u32(z.wanderT[s]).byte(z.wanderDir[s]).u32(z.target[s]).u32(z.stack[s] + 1).byte(z.driven[s]);
    }
    for (const v of z.serializeFree()) h.u32(v);
    for (const s of w.soldiers) {
      h.u32(s.id).u32(s.squad).f64Value(s.x).f64Value(s.y).f64Value(s.fx).f64Value(s.fy);
      h.f64Value(s.hp).byte(WEAPON_IDS.indexOf(s.weapon)).u32(s.mag).u32(s.ammo).byte(s.condition).byte(s.activity);
      h.u32(s.reloadT).f64Value(s.fireAcc).u32(s.target + 1).byte(s.moving ? 1 : 0).u32(s.turnAt + 1).u32(s.riseAt + 1);
      h.byte(s.outOfAmmoReported ? 1 : 0);
      if (s.direct) {
        const d = s.direct;
        h.byte(1).f64Value(d.mx).f64Value(d.my).f64Value(d.ax).f64Value(d.ay).byte(d.fire ? 1 : 0).byte(d.reload ? 1 : 0);
      } else h.byte(0);
    }
    for (const q of w.squads) {
      h.u32(q.id).str(q.order.kind).str(q.stance).str(q.formation);
      h.f64Value(q.ax).f64Value(q.ay).f64Value(q.hx).f64Value(q.hy).u32(q.pathIdx).u32(q.path.length).u32(q.buildTask).byte(q.autoBuild ? 1 : 0);
      for (const v of q.path) h.f64Value(v);
      if (q.order.kind !== 'idle') {
        const p = q.order.kind === 'move' ? q.order.to : q.order.at;
        h.f64Value(p.x).f64Value(p.y);
      }
      for (const m of q.members) h.u32(m);
    }
    return h.digest();
  }
}

function structuredCloneOrder<T extends object>(o: T): T {
  return JSON.parse(JSON.stringify(o)) as T;
}
