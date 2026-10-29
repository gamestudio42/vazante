import { ECONOMY, MISSIONS, SLICE, STRUCTURES, TICK_HZ, type MissionView, type ObjectiveView, type StageDef } from '@vazante/shared';
import type { Mission } from '../entities.ts';
import type { World } from '../world.ts';
import { drivenAlive, nextHourTick, zoneSite } from './mission.ts';

/** What the objectives panel shows for one stage. */
function objective(w: World, m: Mission, st: StageDef, i: number): ObjectiveView {
  const state = i < m.stage || m.phase === 'won' ? 'done' : i === m.stage ? 'active' : 'pending';
  const current = state === 'active';
  const o: ObjectiveView = { kind: st.kind, state, place: '', from: '', progress: -1, total: 0 };
  const base = w.baseById(m.base);
  switch (st.kind) {
    case 'deliver': {
      const v = w.vehicle(m.trucks[st.truck]);
      o.place = st.to !== undefined ? m.zones[st.to].name : (base?.name ?? '');
      o.away = st.to !== undefined;
      o.from = v ? (w.baseById(v.origin)?.name ?? '') : '';
      // After an evacuation the truck leaves from the evacuation zone.
      const evac = MISSIONS[m.id].stages.slice(0, i).find((s) => s.kind === 'evacuate' && s.truck === st.truck);
      if (evac && evac.kind === 'evacuate') o.from = m.zones[evac.zone].name;
      break;
    }
    case 'reach':
      o.place = m.zones[st.zone].name;
      break;
    case 'secure': {
      o.place = m.zones[st.zone].name;
      const site = zoneSite(w, m, st.zone);
      o.progress = state === 'done' ? 1 : site ? Math.min(1, (site.control ?? 0) / (ECONOMY.heldAbove + 1)) : 0;
      break;
    }
    case 'hold':
      o.place = m.zones[st.zone].name;
      o.total = st.seconds;
      o.progress = state === 'done' ? 1 : current ? m.progress / (st.seconds * TICK_HZ) : 0;
      break;
    case 'evacuate':
      o.place = m.zones[st.zone].name;
      o.total = st.civilians;
      o.progress = state === 'done' ? 1 : current ? m.progress / (st.seconds * TICK_HZ) : 0;
      break;
    case 'retake': {
      o.place = st.district;
      const d = w.districts.find((x) => x.name === st.district);
      o.progress = state === 'done' ? 1 : d ? Math.min(1, w.districtControl[d.id] / st.control) : 0;
      break;
    }
    case 'waves':
      o.total = st.waves.length;
      if (st.zone !== undefined) o.place = m.zones[st.zone].name;
      break;
    case 'endless':
      // Nights survived so far.
      o.total = m.wave;
      o.place = base?.name ?? '';
      break;
  }
  return o;
}

export function missionView(w: World, m: Mission): MissionView {
  const def = MISSIONS[m.id];
  const st = def.stages[Math.min(m.stage, def.stages.length - 1)];
  const cp = m.commandPost ? w.structure(m.commandPost) : undefined;
  const activeZone = m.phase === 'active' && (st.kind === 'reach' || st.kind === 'hold' || st.kind === 'evacuate' || st.kind === 'waves' || st.kind === 'secure') ? (st.zone ?? -1) : st.kind === 'deliver' && m.phase === 'active' ? (st.to ?? -1) : -1;
  return {
    id: m.id,
    phase: m.phase,
    stage: m.stage,
    objectives: def.stages.map((s, i) => objective(w, m, s, i)),
    zones: m.zones.map((z, i) => ({ ...z, active: i === activeZone })),
    wave: m.wave,
    waves: st.kind === 'waves' ? st.waves.length : 0,
    waveState: st.kind === 'waves' || st.kind === 'endless' ? m.waveState : 'none',
    secondsToWave: secondsToWave(w, m, st),
    waveZombies: m.waveState === 'active' ? drivenAlive(w) : 0,
    civilians: m.civilians,
    civiliansMax: m.commandPost ? SLICE.civilians : 0,
    commandPostHp: cp ? cp.hp : 0,
    commandPostMaxHp: m.commandPost ? STRUCTURES.command_post.hp : 0,
    evacuated: m.evacuated,
    reason: m.reason,
  };
}

/** Seconds until the next wave hits; in survival, until nightfall all through the day too. */
function secondsToWave(w: World, m: Mission, st: StageDef): number {
  if (st.kind === 'endless' && m.waveState === 'calm')
    return Math.ceil((nextHourTick(w.tick, st.rules.nightfallHour) - w.tick) / TICK_HZ);
  return m.waveState === 'warning' ? Math.max(0, Math.ceil((m.nextAt - w.tick) / TICK_HZ)) : 0;
}
