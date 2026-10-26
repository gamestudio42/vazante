import type { Command, Frame, FromWorker, MapInfo, SimEvent, ToWorker } from '@vazante/shared';

export interface Alert {
  id: number;
  tick: number;
  type: SimEvent['type'];
  reason?: string;
  x?: number;
  y?: number;
}

const ALERT_TYPES = new Set<SimEvent['type']>(['soldier_bitten', 'soldier_died', 'soldier_turned', 'zombie_risen', 'out_of_ammo', 'squad_arrived', 'command_rejected', 'structure_built', 'structure_destroyed']);

export interface ClientState {
  map: MapInfo | null;
  frame: Frame | null;
  selected: number[];
  alerts: Alert[];
  limited: boolean;
  version: number;
}

/** Main-thread mirror of the worker simulation. Sends commands, never mutates the world. */
export class GameClient {
  private readonly worker: Worker;
  private listeners = new Set<() => void>();
  private frameListeners = new Set<(f: Frame) => void>();
  private alertSeq = 0;
  private lastFrameAt = 0;
  state: ClientState = { map: null, frame: null, selected: [], alerts: [], limited: false, version: 0 };

  constructor(seed: number) {
    this.worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev: MessageEvent<FromWorker>) => this.onMessage(ev.data);
    this.post({ type: 'init', seed, scenario: 'last_convoy' });
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
    } else if (msg.type === 'frame') {
      const f = msg.frame;
      const now = performance.now();
      const expected = f.speed === 0 ? Infinity : 100 / f.speed;
      const limited = this.lastFrameAt > 0 && f.speed >= 2 && now - this.lastFrameAt > expected * 3;
      this.lastFrameAt = now;
      let alerts = this.state.alerts;
      const fresh = f.events.filter((e) => ALERT_TYPES.has(e.type));
      if (fresh.length > 0) {
        alerts = [...fresh.map((e) => ({ id: ++this.alertSeq, tick: e.tick, type: e.type, reason: e.reason, x: e.x, y: e.y })).reverse(), ...alerts].slice(0, 30);
      }
      for (const fn of this.frameListeners) fn(f);
      this.update({ frame: f, alerts, limited });
    }
  }

  select(ids: number[]): void {
    this.update({ selected: ids });
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
