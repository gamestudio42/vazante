import { SOLDIER_STRIDE, SoldierField, type Command, type CrewSeat, type DifficultyId, type Frame, type FromWorker, type MapInfo, type MissionTweaks, type SaveGame, type SimEvent, type ToWorker } from '@vazante/shared';
import { Radio, type RadioContext, type RadioLine } from './radio.ts';

export interface Alert {
  id: number;
  tick: number;
  type: SimEvent['type'];
  reason?: string;
  value?: number;
  /** Soldier, squad or vehicle the event is about. */
  source?: number;
  /** The other party: the bitten soldier (whose biter is `source`), a panicking soldier's squad. */
  target?: number;
  x?: number;
  y?: number;
}

const ALERT_TYPES = new Set<SimEvent['type']>([
  'soldier_bitten',
  'soldier_died',
  'soldier_turned',
  'zombie_risen',
  'out_of_ammo',
  'soldier_panicked',
  'command_rejected',
  'structure_built',
  'structure_destroyed',
  'convoy_blocked',
  'cargo_delivered',
  'vehicle_destroyed',
  'wave_warning',
  'wave_started',
  'district_lost',
  'district_held',
  'mission_won',
  'mission_lost',
  'civilians_boarded',
  'civilians_delivered',
  'objective_done',
  'night_survived',
  'site_secured',
  'site_lost',
  'soldier_cured',
  'squad_recruited',
  'vehicle_repaired',
  'truck_bought',
  'nest_empty',
  'ammo_low',
  'ammo_out',
]);

export interface ClientState {
  map: MapInfo | null;
  frame: Frame | null;
  selected: number[];
  /** Selected vehicle id (exclusive with squad selection). */
  vehicle: number | null;
  /** Selected structure id (exclusive with squads and vehicles). */
  structure: number | null;
  alerts: Alert[];
  /** Latest radio lines, oldest first (contact and arrival calls go here, not to the alerts). */
  radio: RadioLine[];
  limited: boolean;
  /** Set when a save could not be loaded (the game then starts fresh). */
  loadError: string | null;
  version: number;
}

/** Main-thread mirror of the worker simulation. Sends commands, never mutates the world. */
export class GameClient {
  private readonly worker: Worker;
  private listeners = new Set<() => void>();
  private frameListeners = new Set<(f: Frame) => void>();
  private alertSeq = 0;
  private readonly radio = new Radio();
  private lastFrameAt = 0;
  private pendingSaves = new Map<string, (s: SaveGame) => void>();
  state: ClientState = { map: null, frame: null, selected: [], vehicle: null, structure: null, alerts: [], radio: [], limited: false, loadError: null, version: 0 };

  constructor(seed: number, save?: SaveGame, difficulty?: DifficultyId, scenario = 'last_convoy', crew?: CrewSeat[][], tweaks?: MissionTweaks) {
    this.worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev: MessageEvent<FromWorker>) => this.onMessage(ev.data);
    this.post({ type: 'init', seed, scenario: save?.scenario ?? scenario, save, difficulty, crew, tweaks });
  }

  /** Rebuild the (not yet started) scenario at another difficulty. */
  setDifficulty(difficulty: DifficultyId): void {
    this.post({ type: 'set_difficulty', difficulty });
  }

  /** Ask the worker for a full copy of the current state. */
  requestSave(slot: string): Promise<SaveGame> {
    return new Promise((resolve) => {
      this.pendingSaves.set(slot, resolve);
      this.post({ type: 'save', slot });
    });
  }

  private post(msg: ToWorker): void {
    this.worker.postMessage(msg);
  }

  send(cmd: Command): void {
    this.post({ type: 'command', cmd });
  }

  private onMessage(msg: FromWorker): void {
    if (msg.type === 'ready') {
      this.update({ map: msg.map });
    } else if (msg.type === 'saved') {
      this.pendingSaves.get(msg.slot)?.(msg.save);
      this.pendingSaves.delete(msg.slot);
    } else if (msg.type === 'error') {
      this.update({ loadError: msg.reason });
    } else if (msg.type === 'frame') {
      const f = msg.frame;
      const now = performance.now();
      const expected = f.speed === 0 ? Infinity : 100 / f.speed;
      const limited = this.lastFrameAt > 0 && f.speed >= 2 && now - this.lastFrameAt > expected * 3;
      this.lastFrameAt = now;
      let alerts = this.state.alerts;
      const fresh = f.events.filter((e) => ALERT_TYPES.has(e.type));
      if (fresh.length > 0) {
        alerts = [...fresh.map((e) => ({ id: ++this.alertSeq, tick: e.tick, type: e.type, reason: e.reason, value: e.value, source: e.source, target: e.target, x: e.x, y: e.y })).reverse(), ...alerts].slice(0, 30);
      }
      const heard = f.events.length > 0 ? this.radio.hear(f.events, radioContext(f)) : [];
      for (const fn of this.frameListeners) fn(f);
      this.update({ frame: f, alerts, limited, ...(heard.length > 0 ? { radio: this.radio.lines } : {}) });
    }
  }

  select(ids: number[]): void {
    this.update({ selected: ids, vehicle: ids.length ? null : this.state.vehicle, structure: ids.length ? null : this.state.structure });
  }

  selectVehicle(id: number | null): void {
    this.update({ vehicle: id, selected: id === null ? this.state.selected : [], structure: id === null ? this.state.structure : null });
  }

  selectStructure(id: number | null): void {
    this.update({ structure: id, ...(id === null ? {} : { selected: [], vehicle: null }) });
  }

  onFrame(fn: (f: Frame) => void): () => void {
    this.frameListeners.add(fn);
    return () => this.frameListeners.delete(fn);
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getState = (): ClientState => this.state;

  private update(patch: Partial<ClientState>): void {
    this.state = { ...this.state, ...patch, version: this.state.version + 1 };
    for (const fn of this.listeners) fn();
  }
}

/** Who is where in a frame, for attributing radio lines. */
function radioContext(f: Frame): RadioContext {
  let squads: Map<number, number> | null = null;
  return {
    squadOf(id) {
      if (!squads) {
        squads = new Map();
        for (let o = 0; o < f.soldiers.length; o += SOLDIER_STRIDE) squads.set(f.soldiers[o + SoldierField.Id], f.soldiers[o + SoldierField.Squad]);
      }
      return squads.get(id);
    },
    nearestSquad(x, y, maxM) {
      let best: number | undefined;
      let bestD = maxM * maxM;
      for (const q of f.squads) {
        if (q.alive === 0) continue;
        const d = (q.anchorX - x) ** 2 + (q.anchorY - y) ** 2;
        if (d <= bestD) {
          bestD = d;
          best = q.id;
        }
      }
      return best;
    },
  };
}
