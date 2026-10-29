import {
  Blocked,
  CELL_SIZE,
  DAY,
  DIFFICULTY,
  DISTRICT,
  Ground,
  MISSIONS,
  PRESSURE_SPAWN_M,
  SLICE,
  STRUCTURES,
  TICK_HZ,
  ZONE_PAD_M,
  ZombieState,
  type MissionDef,
  type Pressure,
  type DayClock,
  type SurvivalRules,
  type ZoneRef,
} from "@vazante/shared";
import type { Base, Mission, MissionZone } from "../entities.ts";
import { siteHeld } from "./economy.ts";
import { FLOW_UNREACHABLE } from "../navigation.ts";
import { rollZombieKind } from "../spawn.ts";
import { isActiveSoldier, type World } from "../world.ts";

/**
 * Start a campaign mission on a world whose squads and trucks are already placed: the command
 * post at the base centre (when the mission has one), the zones resolved on this map, and only the
 * district holding the base under control.
 */
export function startMission(
  w: World,
  def: MissionDef,
  trucks: number[],
): Mission {
  const base = w.bases.find((b) => b.kind === "base")!;
  const cx = Math.floor((base.x0 + base.x1) / 2);
  const cy = Math.floor((base.y0 + base.y1) / 2);
  const cell = w.grid.idx(cx, cy);
  let commandPost = 0;
  if (def.commandPost) {
    commandPost = w.allocId();
    w.addStructure({
      id: commandPost,
      kind: "command_post",
      cell,
      base: w.bases.indexOf(base),
      hp: STRUCTURES.command_post.hp,
      work: 0,
      built: true,
      open: false,
      target: -1,
      fireAcc: 0,
    });
    w.grid.blocked[cell] |= Blocked.StructureWall;
    w.grid.structHeight[cell] = Math.round(STRUCTURES.command_post.height * 10);
    w.flowDirty = true;
  }
  const m: Mission = {
    id: def.id,
    phase: "active",
    stage: 0,
    progress: 0,
    pressureAt: 0,
    wave: 0,
    waveState: "none",
    nextAt: 0,
    civilians: def.commandPost ? SLICE.civilians : 0,
    commandPost,
    base: base.id,
    trucks,
    zones: def.zones.map((z) => resolveZone(w, z, base)),
    evacuated: 0,
    reason: "",
  };
  w.mission = m;
  const home = w.grid.district[cell];
  for (const d of w.districts)
    w.districtControl[d.id] = d.id === home ? 100 : 0;
  enterStage(w, m);
  return m;
}

function resolveZone(
  w: World,
  ref: ZoneRef,
  base: { x0: number; y0: number; x1: number; y1: number },
): MissionZone {
  if ("district" in ref) return districtZone(w, ref);
  if ("site" in ref) {
    const s = w.bases.find((b) => b.name === ref.site);
    if (!s) throw new Error(`mission zone: no site ${ref.site}`);
    return { name: s.name, x0: s.x0, y0: s.y0, x1: s.x1, y1: s.y1 };
  }
  // The street cell over the river nearest the base but at least minM away, and a square around it.
  const g = w.grid;
  const bx = (base.x0 + base.x1) / 2;
  const by = (base.y0 + base.y1) / 2;
  const min = ref.bridge.minM / CELL_SIZE;
  let best = -1;
  let bd = Infinity;
  for (let y = 2; y < g.height - 2; y++) {
    for (let x = 2; x < g.width - 2; x++) {
      if (g.ground[g.idx(x, y)] !== Ground.Street || !overRiver(w, x, y))
        continue;
      const d = (x - bx) * (x - bx) + (y - by) * (y - by);
      if (d >= min * min && d < bd) {
        bd = d;
        best = g.idx(x, y);
      }
    }
  }
  if (best < 0) throw new Error("mission zone: no bridge on this map");
  const x = best % g.width;
  const y = (best - x) / g.width;
  const r = 6;
  return {
    name: "Ponte da Ribeira",
    x0: Math.max(0, x - r),
    y0: Math.max(0, y - r),
    x1: Math.min(g.width - 1, x + r),
    y1: Math.min(g.height - 1, y + r),
  };
}

/** The street cell nearest a point of a district, and a square around it. */
function districtZone(
  w: World,
  ref: { district: string; at: readonly [number, number]; name: string },
): MissionZone {
  const d = w.districts.find((x) => x.name === ref.district);
  if (!d) throw new Error(`mission zone: no district ${ref.district}`);
  const g = w.grid;
  const px = d.x0 + (d.x1 - d.x0) * ref.at[0];
  const py = d.y0 + (d.y1 - d.y0) * ref.at[1];
  let best = -1;
  let bd = Infinity;
  for (let y = d.y0; y <= d.y1; y++) {
    for (let x = d.x0; x <= d.x1; x++) {
      if (g.ground[g.idx(x, y)] !== Ground.Street) continue;
      const dd = (x - px) * (x - px) + (y - py) * (y - py);
      if (dd < bd) {
        bd = dd;
        best = g.idx(x, y);
      }
    }
  }
  if (best < 0) throw new Error(`mission zone: no street in ${ref.district}`);
  const x = best % g.width;
  const y = (best - x) / g.width;
  const r = 5;
  return {
    name: ref.name,
    x0: Math.max(0, x - r),
    y0: Math.max(0, y - r),
    x1: Math.min(g.width - 1, x + r),
    y1: Math.min(g.height - 1, y + r),
  };
}

/** A street cell with water on both sides along a row or a column: a bridge deck. */
function overRiver(w: World, x: number, y: number): boolean {
  const g = w.grid;
  const water = (xx: number, yy: number) =>
    xx >= 0 &&
    yy >= 0 &&
    xx < g.width &&
    yy < g.height &&
    g.ground[g.idx(xx, yy)] === Ground.Water;
  const side = (dx: number, dy: number) => {
    for (let k = 1; k <= 8; k++) if (water(x + dx * k, y + dy * k)) return true;
    return false;
  };
  // The street must run across the water: both sides wet across, dry along.
  return (
    (side(0, -1) && side(0, 1) && !water(x - 1, y) && !water(x + 1, y)) ||
    (side(-1, 0) && side(1, 0) && !water(x, y - 1) && !water(x, y + 1))
  );
}

function end(w: World, m: Mission, won: boolean, reason = ""): void {
  m.phase = won ? "won" : "lost";
  m.reason = reason;
  w.speed = 0;
  w.emit({ type: won ? "mission_won" : "mission_lost", reason });
}

export function drivenAlive(w: World): number {
  const z = w.zombies;
  let n = 0;
  for (let s = 0; s < z.highWater; s++)
    if (z.isAlive(s) && z.driven[s] === 1) n++;
  return n;
}

/** Place `count` driven zombies around a street cell drawn from `candidates`. */
function spawnGroup(
  w: World,
  candidates: number[],
  count: number,
): [number, number] | null {
  if (candidates.length === 0) return null;
  const origin = candidates[w.rng.int(0, candidates.length - 1)];
  spawnAround(w, origin, count);
  return [w.grid.cellCenterX(origin), w.grid.cellCenterY(origin)];
}

/** Up to `count` driven zombies scattered around a cell. */
function spawnAround(w: World, origin: number, count: number): void {
  const g = w.grid;
  const ox = g.cellCenterX(origin);
  const oy = g.cellCenterY(origin);
  let placed = 0;
  for (let i = 0; i < count * 20 && placed < count; i++) {
    const x = ox + w.rng.range(-6, 6) * CELL_SIZE;
    const y = oy + w.rng.range(-6, 6) * CELL_SIZE;
    if (!g.isWalkableAt(x, y)) continue;
    const s = w.zombies.spawn(x, y, rollZombieKind(w), ZombieState.Chasing);
    if (s < 0) break;
    w.zombies.driven[s] = 1;
    placed++;
  }
}

/**
 * `n` entry cells far apart from each other: the first at random, each next one the farthest
 * from those already chosen among a random sample.
 */
function spreadOrigins(w: World, candidates: number[], n: number): number[] {
  const g = w.grid;
  const out = [candidates[w.rng.int(0, candidates.length - 1)]];
  while (out.length < n) {
    let best = -1;
    let bestD = -1;
    for (let k = 0; k < ORIGIN_SAMPLES; k++) {
      const c = candidates[w.rng.int(0, candidates.length - 1)];
      let d = Infinity;
      for (const o of out) {
        const dx = g.cellCenterX(c) - g.cellCenterX(o);
        const dy = g.cellCenterY(c) - g.cellCenterY(o);
        d = Math.min(d, dx * dx + dy * dy);
      }
      if (d > bestD) {
        bestD = d;
        best = c;
      }
    }
    out.push(best);
  }
  return out;
}

/** A wave splits into one group per this many zombies (at most WAVE_GROUPS_MAX), from different sides. */
const WAVE_GROUP_SIZE = 30;
const WAVE_GROUPS_MAX = 4;
const ORIGIN_SAMPLES = 48;

/** Walkable street cells at a distance from (x, y) in metres between `min` and `max`. */
function streetsAround(
  w: World,
  x: number,
  y: number,
  min: number,
  max: number,
): number[] {
  const g = w.grid;
  const out: number[] = [];
  const min2 = min * min;
  const max2 = max * max;
  for (let c = 0; c < g.size; c++) {
    if (g.ground[c] !== Ground.Street || !g.isWalkable(c)) continue;
    const dx = g.cellCenterX(c) - x;
    const dy = g.cellCenterY(c) - y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min2 && d2 <= max2) out.push(c);
  }
  return out;
}

/**
 * A wave: a few entry points far from the base and from each other. In the city it stays
 * within WAVE_CITY_MAX_M: farther out the defenders' scent does not reach and the wave would wander.
 */
function spawnWave(w: World, m: Mission, count: number, zone?: number): void {
  const base = w.baseById(m.base)!;
  const [bx, by] =
    zone !== undefined
      ? zoneCentre(m.zones[zone])
      : [
          ((base.x0 + base.x1 + 1) / 2) * CELL_SIZE,
          ((base.y0 + base.y1 + 1) / 2) * CELL_SIZE,
        ];
  const city = MISSIONS[m.id].map === "city";
  let cells =
    zone !== undefined
      ? streetsAround(w, bx, by, WAVE_ZONE_SPAWN_M.min, WAVE_ZONE_SPAWN_M.max)
      : streetsAround(
          w,
          bx,
          by,
          SLICE.spawnMinDistM,
          city ? WAVE_CITY_MAX_M : Infinity,
        );
  // Courtyards and the far bank can be cut off from the defenders; a wave there would never arrive.
  if (city) cells = cells.filter((c) => w.grid.flow[c] !== FLOW_UNREACHABLE);
  if (cells.length === 0) return;
  // Several groups from different sides, so the wave arrives as a front and not as one file.
  const groups = Math.max(1, Math.min(WAVE_GROUPS_MAX, Math.round(count / WAVE_GROUP_SIZE)));
  const origins = spreadOrigins(w, cells, groups);
  for (let k = 0; k < groups; k++) {
    const share = Math.floor(count / groups) + (k < count % groups ? 1 : 0);
    spawnAround(w, origins[k], share);
    w.emit({ type: "wave_started", value: m.wave, x: w.grid.cellCenterX(origins[k]), y: w.grid.cellCenterY(origins[k]) });
  }
}

/** City waves start at most this far from the base. */
const WAVE_CITY_MAX_M = 500;
/** Waves aimed at a zone start this far from it, and give up after this long. */
const WAVE_ZONE_SPAWN_M = { min: 150, max: 260 } as const;
const WAVE_ZONE_TIMEOUT_S = 240;

function zoneCentre(z: MissionZone): [number, number] {
  return [
    ((z.x0 + z.x1 + 1) / 2) * CELL_SIZE,
    ((z.y0 + z.y1 + 1) / 2) * CELL_SIZE,
  ];
}

/** Pressure starts once the zone is first held, so the walk there is not under fire. */
function pressure(w: World, m: Mission, zone: MissionZone, p: Pressure): void {
  if (m.pressureAt === 0) {
    if (zoneHeld(w, zone)) m.pressureAt = w.tick + p.everyS * TICK_HZ;
    return;
  }
  if (w.tick < m.pressureAt) return;
  m.pressureAt = w.tick + p.everyS * TICK_HZ;
  const [x, y] = zoneCentre(zone);
  // m.wave counts the groups sent in this stage.
  const size = p.size * (1 + (p.grow ?? 0) * m.wave++);
  const at = spawnGroup(
    w,
    streetsAround(w, x, y, PRESSURE_SPAWN_M.min, PRESSURE_SPAWN_M.max),
    Math.round(size * DIFFICULTY[w.difficulty].waveSize),
  );
  if (at) w.emit({ type: "wave_started", value: 0, x: at[0], y: at[1] });
}

/** Any active soldier inside the zone (grown by ZONE_PAD_M). */
export function zoneHeld(w: World, z: MissionZone): boolean {
  const x0 = z.x0 * CELL_SIZE - ZONE_PAD_M;
  const y0 = z.y0 * CELL_SIZE - ZONE_PAD_M;
  const x1 = (z.x1 + 1) * CELL_SIZE + ZONE_PAD_M;
  const y1 = (z.y1 + 1) * CELL_SIZE + ZONE_PAD_M;
  return w.soldiers.some(
    (s) =>
      isActiveSoldier(s) && s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1,
  );
}

function inZone(z: MissionZone, x: number, y: number): boolean {
  const cx = Math.floor(x / CELL_SIZE);
  const cy = Math.floor(y / CELL_SIZE);
  return cx >= z.x0 && cx <= z.x1 && cy >= z.y0 && cy <= z.y1;
}

/** Set up the stage the mission just entered. */
function enterStage(w: World, m: Mission): void {
  const st = MISSIONS[m.id].stages[m.stage];
  m.progress = 0;
  m.pressureAt = 0;
  m.wave = 0;
  if (st.kind === "waves") {
    m.wave = 0;
    m.waveState = "calm";
    m.nextAt = w.tick + SLICE.calmS * TICK_HZ;
  }
  if (st.kind === "endless") {
    m.waveState = "calm";
    m.nextAt = nextHourTick(w.tick, st.rules.nightfallHour, w.day) - st.rules.warnS * TICK_HZ;
    if (m.nextAt < w.tick) m.nextAt = w.tick;
  }
}

function advance(w: World, m: Mission): void {
  w.emit({ type: "objective_done", value: m.stage });
  const done = MISSIONS[m.id].stages[m.stage];
  // Pressure groups left over become ordinary infected, so a later waves stage does not wait on them.
  if ((done.kind === "hold" || done.kind === "evacuate") && done.pressure)
    w.zombies.driven.fill(0);
  m.stage++;
  if (m.stage >= MISSIONS[m.id].stages.length) {
    end(w, m, true);
    return;
  }
  enterStage(w, m);
}

/** A truck the remaining stages still need. */
/** A wreck can still come back: an engineer is alive, or a held station can sell or recruit. */
function canRecover(w: World): boolean {
  if (w.soldiers.some((s) => s.role === "engineer" && isActiveSoldier(s))) return true;
  const station = w.economy ? w.bases.find((b) => b.role === "station") : undefined;
  return !!station && siteHeld(w, station);
}

function truckNeeded(def: MissionDef, stage: number, truck: number): boolean {
  for (let i = stage; i < def.stages.length; i++) {
    const st = def.stages[i];
    if ((st.kind === "deliver" || st.kind === "evacuate") && st.truck === truck)
      return true;
  }
  return false;
}

export function stepMission(w: World): void {
  const m = w.mission;
  if (!m || m.phase !== "active") return;
  const def = MISSIONS[m.id];
  if (m.commandPost) {
    const cp = w.structure(m.commandPost);
    if (!cp) {
      m.civilians = 0;
      end(w, m, false, "command_post_destroyed");
      return;
    }
    m.civilians = Math.ceil(
      (SLICE.civilians * cp.hp) / STRUCTURES.command_post.hp,
    );
  }
  if (!w.soldiers.some(isActiveSoldier)) {
    end(w, m, false, "no_defenders");
    return;
  }
  for (let i = 0; i < m.trucks.length; i++) {
    const v = w.vehicle(m.trucks[i]);
    if (!truckNeeded(def, m.stage, i)) continue;
    // A wreck can be repaired (or, at a held station, replaced): the mission goes on while
    // someone can still do that. Civilians aboard when it was hit are lost for good.
    const peopleLost = w.events.some((e) => e.type === "vehicle_destroyed" && e.source === m.trucks[i] && (e.value ?? 0) > 0);
    if (!v || peopleLost || (v.state === "destroyed" && !canRecover(w))) {
      end(
        w,
        m,
        false,
        m.evacuated > 0 ||
          def.stages.slice(0, m.stage).some((s) => s.kind === "evacuate")
          ? "evacuees_lost"
          : "cargo_lost",
      );
      return;
    }
  }

  const st = def.stages[m.stage];
  switch (st.kind) {
    case "deliver": {
      const id = m.trucks[st.truck];
      const to = st.to !== undefined ? zoneSite(w, m, st.to)?.id : m.base;
      for (const e of w.events) {
        if (e.source !== id || e.target !== to) continue;
        if (e.type === "civilians_delivered") m.evacuated += e.value ?? 0;
        if (e.type === "cargo_delivered" || e.type === "civilians_delivered") {
          advance(w, m);
          return;
        }
      }
      return;
    }
    case "reach":
      if (zoneHeld(w, m.zones[st.zone])) advance(w, m);
      return;
    case "secure": {
      const site = zoneSite(w, m, st.zone);
      if (site && siteHeld(w, site)) advance(w, m);
      return;
    }
    case "hold": {
      const z = m.zones[st.zone];
      if (st.pressure) pressure(w, m, z, st.pressure);
      if (zoneHeld(w, z) && ++m.progress >= st.seconds * TICK_HZ) advance(w, m);
      return;
    }
    case "evacuate": {
      const z = m.zones[st.zone];
      if (st.pressure) pressure(w, m, z, st.pressure);
      const v = w.vehicle(m.trucks[st.truck])!;
      if (
        v.state === "idle" &&
        inZone(z, v.x, v.y) &&
        zoneHeld(w, z) &&
        ++m.progress >= st.seconds * TICK_HZ
      ) {
        v.passengers = st.civilians;
        w.emit({
          type: "civilians_boarded",
          source: v.id,
          x: v.x,
          y: v.y,
          value: st.civilians,
        });
        advance(w, m);
      }
      return;
    }
    case "retake": {
      const d = w.districts.find((x) => x.name === st.district);
      if (d && w.districtControl[d.id] > st.control) advance(w, m);
      return;
    }
    case "waves":
      stepWaves(w, m, st.waves, st.zone);
      return;
    case "endless":
      stepSurvival(w, m, st.rules);
      return;
  }
}

/** The base or depot a site zone stands for. */
export function zoneSite(w: World, m: Mission, zone: number): Base | undefined {
  const name = m.zones[zone]?.name;
  return w.bases.find((b) => b.name === name);
}

/** The first tick at or after `tick` when the clock reads `hour`. */
export function nextHourTick(tick: number, hour: number, clock: DayClock = DAY): number {
  const day = clock.lengthS * TICK_HZ;
  const offset = Math.round(((((hour - clock.startHour) % 24) + 24) % 24) / 24 * day);
  return offset + Math.max(0, Math.ceil((tick - offset) / day)) * day;
}

/**
 * Survival: calm through the day, a warning before nightfall, then the night's horde; the night
 * counts as survived once the horde is gone or dawn breaks. The city refills all along.
 */
function stepSurvival(w: World, m: Mission, r: SurvivalRules): void {
  if (w.tick >= r.repopGraceS * TICK_HZ && w.tick % (r.repopEveryS * TICK_HZ) === 0) repopulate(w, m, r);
  if (m.waveState === "calm" && w.tick >= m.nextAt) {
    m.waveState = "warning";
    m.nextAt = nextHourTick(w.tick, r.nightfallHour, w.day);
    w.emit({
      type: "wave_warning",
      value: m.wave + 1,
      reason: String(Math.ceil((m.nextAt - w.tick) / TICK_HZ)),
    });
  } else if (m.waveState === "warning" && w.tick >= m.nextAt) {
    m.waveState = "active";
    const size = Math.round(
      r.nightHorde * (1 + r.grow * m.wave) * DIFFICULTY[w.difficulty].waveSize,
    );
    spawnWave(w, m, size);
    rouseNearBase(w, m, Math.round(size * r.baseShare));
    m.nextAt = nextHourTick(w.tick, r.dawnHour, w.day);
  } else if (
    m.waveState === "active" &&
    (w.tick >= m.nextAt || (w.tick % 10 === 0 && drivenAlive(w) === 0))
  ) {
    // Stragglers at dawn go back to wandering the streets.
    w.zombies.driven.fill(0);
    m.wave++;
    m.waveState = "calm";
    w.emit({ type: "night_survived", value: m.wave });
    m.nextAt = Math.max(
      w.tick,
      nextHourTick(w.tick, r.nightfallHour, w.day) - r.warnS * TICK_HZ,
    );
  }
}

/** Infected already in the city near the base join the night's attack: up to `n`, nearest first. */
function rouseNearBase(w: World, m: Mission, n: number): void {
  if (n <= 0) return;
  const base = w.baseById(m.base)!;
  const bx = ((base.x0 + base.x1 + 1) / 2) * CELL_SIZE;
  const by = ((base.y0 + base.y1 + 1) / 2) * CELL_SIZE;
  const z = w.zombies;
  const near: [number, number][] = [];
  const max2 = ROUSE_M * ROUSE_M;
  for (let s = 0; s < z.highWater; s++) {
    if (!z.isAlive(s) || z.driven[s] === 1) continue;
    const dx = z.x[s] - bx;
    const dy = z.y[s] - by;
    const d2 = dx * dx + dy * dy;
    if (d2 <= max2) near.push([d2, s]);
  }
  near.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const [, s] of near.slice(0, n)) {
    z.driven[s] = 1;
    if (z.state[s] === ZombieState.Wandering)
      z.state[s] = ZombieState.Chasing;
  }
}

/** Infected within this distance of the base can be roused by a night's horde. */
const ROUSE_M = 600;

/** Wandering infected drift back into the city from its edges, out of sight of the base and of every soldier. */
function repopulate(w: World, m: Mission, r: SurvivalRules): void {
  const cap = Math.round(
    r.cap * (1 + r.capGrow * m.wave) * DIFFICULTY[w.difficulty].cityZombies,
  );
  const n = Math.min(r.repopSize, cap - w.zombies.alive);
  if (n <= 0) return;
  const g = w.grid;
  const base = w.baseById(m.base)!;
  const bx = ((base.x0 + base.x1 + 1) / 2) * CELL_SIZE;
  const by = ((base.y0 + base.y1 + 1) / 2) * CELL_SIZE;
  const clear2 = r.repopClearM * r.repopClearM;
  const far = (x: number, y: number): boolean => {
    if ((x - bx) ** 2 + (y - by) ** 2 < clear2) return false;
    for (const s of w.soldiers)
      if (isActiveSoldier(s) && (x - s.x) ** 2 + (y - s.y) ** 2 < clear2)
        return false;
    return true;
  };
  const edge = r.repopEdgeM;
  const nearEdge = (x: number, y: number): boolean =>
    x < edge || y < edge || x > g.widthM - edge || y > g.heightM - edge;
  let placed = 0;
  for (let i = 0; i < n * 40 && placed < n; i++) {
    const c = w.rng.int(0, g.size - 1);
    if (g.ground[c] !== Ground.Street || !g.isWalkable(c)) continue;
    const x = g.cellCenterX(c);
    const y = g.cellCenterY(c);
    if (!nearEdge(x, y) || !far(x, y)) continue;
    if (w.zombies.spawn(x, y, rollZombieKind(w), ZombieState.Wandering) < 0) break;
    placed++;
  }
}

/** Calm → warning → active → calm …; the stage ends after the calm that follows the last wave. */
function stepWaves(
  w: World,
  m: Mission,
  waves: readonly number[],
  zone?: number,
): void {
  if (m.waveState === "calm" && w.tick >= m.nextAt) {
    if (m.wave >= waves.length) {
      advance(w, m);
      return;
    }
    const warn = Math.max(
      5,
      w.rng.int(SLICE.warningMinS, SLICE.warningMaxS) +
        DIFFICULTY[w.difficulty].warningBonusS,
    );
    m.waveState = "warning";
    m.nextAt = w.tick + warn * TICK_HZ;
    w.emit({ type: "wave_warning", value: m.wave + 1, reason: String(warn) });
  } else if (m.waveState === "warning" && w.tick >= m.nextAt) {
    m.wave++;
    m.waveState = "active";
    spawnWave(
      w,
      m,
      Math.round(waves[m.wave - 1] * DIFFICULTY[w.difficulty].waveSize),
      zone,
    );
    if (zone !== undefined) m.nextAt = w.tick + WAVE_ZONE_TIMEOUT_S * TICK_HZ;
  } else if (
    m.waveState === "active" &&
    zone !== undefined &&
    w.tick >= m.nextAt
  ) {
    // Stragglers lost in the streets join the ordinary infected instead of holding the next wave back.
    w.zombies.driven.fill(0);
    m.waveState = "calm";
    m.nextAt = w.tick + (m.wave >= waves.length ? 1 : SLICE.calmS * TICK_HZ);
  } else if (m.waveState === "active" && w.tick % 10 === 0) {
    const left = drivenAlive(w);
    // A few stragglers stuck somewhere in the streets do not hold the stage forever.
    m.progress = left <= WAVE_STRAGGLERS ? m.progress + 10 : 0;
    if (left === 0 || m.progress >= WAVE_STRAGGLERS_S * TICK_HZ) {
      w.zombies.driven.fill(0);
      m.progress = 0;
      m.waveState = "calm";
      m.nextAt = w.tick + (m.wave >= waves.length ? 1 : SLICE.calmS * TICK_HZ);
    }
  }
}

/** A wave counts as beaten once no more than this many of it are left for this long. */
const WAVE_STRAGGLERS = 5;
const WAVE_STRAGGLERS_S = 45;

/** District control drifts down where zombies outnumber soldiers and back up where soldiers hold. */
export function stepDistricts(w: World): void {
  if (w.tick % DISTRICT.intervalTicks !== 0 || w.districts.length === 0) return;
  const { zombies: zc, soldiers: sc } = districtCounts(w);
  for (const d of w.districts) {
    const before = w.districtControl[d.id];
    let v = before;
    const zs = zc[d.id];
    const ss = sc[d.id];
    if (zs >= DISTRICT.minZombies && zs > ss * DISTRICT.overrunRatio)
      v = Math.max(0, v - 1);
    else if (ss > 0 && zs <= ss * 2) v = Math.min(100, v + 1);
    w.districtControl[d.id] = v;
    // Where strategic points are the goal, districts are only names on the map: no alerts.
    if (w.economy) continue;
    if (before > DISTRICT.lostAt && v <= DISTRICT.lostAt)
      w.emit({ type: "district_lost", source: d.id, reason: d.name });
    if (before <= DISTRICT.heldAbove && v > DISTRICT.heldAbove)
      w.emit({ type: "district_held", source: d.id, reason: d.name });
  }
}

export function districtCounts(w: World): {
  zombies: Uint32Array;
  soldiers: Uint32Array;
} {
  const zc = new Uint32Array(256);
  const sc = new Uint32Array(256);
  const g = w.grid;
  const z = w.zombies;
  for (let s = 0; s < z.highWater; s++) {
    if (!z.isAlive(s)) continue;
    const c = g.cellAt(z.x[s], z.y[s]);
    if (c >= 0) zc[g.district[c]]++;
  }
  for (const s of w.soldiers) {
    if (!isActiveSoldier(s)) continue;
    const c = g.cellAt(s.x, s.y);
    if (c >= 0) sc[g.district[c]]++;
  }
  return { zombies: zc, soldiers: sc };
}
