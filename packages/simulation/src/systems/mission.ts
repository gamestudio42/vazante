import { Blocked, CELL_SIZE, DISTRICT, Ground, SLICE, STRUCTURES, TICK_HZ, ZombieState } from '@vazante/shared';
import type { Mission } from '../entities.ts';
import { rollZombieKind } from '../spawn.ts';
import { isActiveSoldier, type World } from '../world.ts';

/** Place the command post at the centre of the base and start the "O Último Comboio" objectives. */
export function startSliceMission(w: World, baseId: number, truckId: number): Mission {
  const base = w.baseById(baseId)!;
  const cx = Math.floor((base.x0 + base.x1) / 2);
  const cy = Math.floor((base.y0 + base.y1) / 2);
  const cell = w.grid.idx(cx, cy);
  const id = w.allocId();
  w.addStructure({ id, kind: 'command_post', cell, base: w.bases.indexOf(base), hp: STRUCTURES.command_post.hp, work: 0, built: true, open: false, target: -1, fireAcc: 0 });
  w.grid.blocked[cell] |= Blocked.StructureWall;
  w.grid.structHeight[cell] = Math.round(STRUCTURES.command_post.height * 10);
  w.flowDirty = true;
  const m: Mission = {
    phase: 'fetch',
    wave: 0,
    waveState: 'none',
    nextAt: 0,
    civilians: SLICE.civilians,
    commandPost: id,
    base: baseId,
    truck: truckId,
    cargoDelivered: false,
    reason: '',
  };
  w.mission = m;
  // The city has fallen: only the district holding the base starts under control.
  const home = w.grid.district[cell];
  for (const d of w.districts) w.districtControl[d.id] = d.id === home ? 100 : 0;
  return m;
}

function end(w: World, m: Mission, won: boolean, reason = ''): void {
  m.phase = won ? 'won' : 'lost';
  m.reason = reason;
  w.speed = 0;
  w.emit({ type: won ? 'mission_won' : 'mission_lost', reason });
}

export function drivenAlive(w: World): number {
  const z = w.zombies;
  let n = 0;
  for (let s = 0; s < z.highWater; s++) if (z.isAlive(s) && z.driven[s] === 1) n++;
  return n;
}

/** Spawn a wave along street cells far from the base, all chasing the base. */
function spawnWave(w: World, m: Mission, count: number): void {
  const g = w.grid;
  const base = w.baseById(m.base)!;
  const bx = ((base.x0 + base.x1 + 1) / 2) * CELL_SIZE;
  const by = ((base.y0 + base.y1 + 1) / 2) * CELL_SIZE;
  const min2 = SLICE.spawnMinDistM * SLICE.spawnMinDistM;
  // One entry point per wave, chosen among far street cells, so the attack has a direction.
  const candidates: number[] = [];
  for (let c = 0; c < g.size; c++) {
    if (g.ground[c] !== Ground.Street || !g.isWalkable(c)) continue;
    const dx = g.cellCenterX(c) - bx;
    const dy = g.cellCenterY(c) - by;
    if (dx * dx + dy * dy >= min2) candidates.push(c);
  }
  if (candidates.length === 0) return;
  const origin = candidates[w.rng.int(0, candidates.length - 1)];
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
  w.emit({ type: 'wave_started', value: m.wave, x: ox, y: oy });
}

export function stepMission(w: World): void {
  const m = w.mission;
  if (!m || m.phase === 'won' || m.phase === 'lost') return;
  const cp = w.structure(m.commandPost);
  if (!cp) {
    m.civilians = 0;
    end(w, m, false, 'command_post_destroyed');
    return;
  }
  m.civilians = Math.ceil((SLICE.civilians * cp.hp) / STRUCTURES.command_post.hp);
  if (!w.soldiers.some(isActiveSoldier)) {
    end(w, m, false, 'no_defenders');
    return;
  }

  if (m.phase === 'fetch') {
    const truck = w.vehicle(m.truck);
    if (!truck || truck.state === 'destroyed') {
      end(w, m, false, 'cargo_lost');
      return;
    }
    if (w.events.some((e) => e.type === 'cargo_delivered' && e.source === m.truck && e.target === m.base)) {
      m.cargoDelivered = true;
      m.phase = 'defend';
      m.waveState = 'calm';
      m.nextAt = w.tick + SLICE.calmS * TICK_HZ;
    }
    return;
  }

  // Defend: calm → warning → active → calm …
  if (m.waveState === 'calm' && w.tick >= m.nextAt) {
    if (m.wave >= SLICE.waves.length) {
      end(w, m, true);
      return;
    }
    const warn = w.rng.int(SLICE.warningMinS, SLICE.warningMaxS);
    m.waveState = 'warning';
    m.nextAt = w.tick + warn * TICK_HZ;
    w.emit({ type: 'wave_warning', value: m.wave + 1, reason: String(warn) });
  } else if (m.waveState === 'warning' && w.tick >= m.nextAt) {
    m.wave++;
    m.waveState = 'active';
    spawnWave(w, m, SLICE.waves[m.wave - 1]);
  } else if (m.waveState === 'active' && w.tick % 10 === 0 && drivenAlive(w) === 0) {
    m.waveState = 'calm';
    m.nextAt = w.tick + (m.wave >= SLICE.waves.length ? 1 : SLICE.calmS * TICK_HZ);
  }
}

/** District control drifts down where zombies outnumber soldiers and back up where soldiers hold. */
export function stepDistricts(w: World): void {
  if (w.tick % DISTRICT.intervalTicks !== 0 || w.districts.length === 0) return;
  const { zombies: zc, soldiers: sc } = districtCounts(w);
  for (const d of w.districts) {
    const before = w.districtControl[d.id];
    let v = before;
    const zs = zc[d.id];
    const ss = sc[d.id];
    if (zs >= DISTRICT.minZombies && zs > ss * DISTRICT.overrunRatio) v = Math.max(0, v - 1);
    else if (ss > 0 && zs <= ss * 2) v = Math.min(100, v + 1);
    w.districtControl[d.id] = v;
    if (before > DISTRICT.lostAt && v <= DISTRICT.lostAt) w.emit({ type: 'district_lost', source: d.id, reason: d.name });
    if (before <= DISTRICT.heldAbove && v > DISTRICT.heldAbove) w.emit({ type: 'district_held', source: d.id, reason: d.name });
  }
}

export function districtCounts(w: World): { zombies: Uint32Array; soldiers: Uint32Array } {
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
