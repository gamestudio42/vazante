/// <reference lib="webworker" />
import { DIFFICULTY_IDS, MAX_TICKS_PER_FRAME, TICK_HZ, type DifficultyId, type FromWorker, type ToWorker } from '@vazante/shared';
import { SimulationEngine } from '@vazante/simulation';

declare const self: DedicatedWorkerGlobalScope;

let engine: SimulationEngine | null = null;
let last = 0;
let acc = 0;

function post(msg: FromWorker, transfer: Transferable[] = []): void {
  self.postMessage(msg, transfer);
}

function loop(): void {
  if (!engine) return;
  const now = performance.now();
  const dt = Math.min(250, now - last);
  last = now;
  const w = engine.world;
  acc += (dt / 1000) * TICK_HZ * w.speed;
  let ran = 0;
  while (acc >= 1 && ran < MAX_TICKS_PER_FRAME) {
    const t0 = performance.now();
    engine.tick();
    engine.lastTickMs = performance.now() - t0;
    acc -= 1;
    ran++;
  }
  // If we cannot keep up, drop the backlog instead of spiralling (UI shows "simulation limited").
  if (acc > MAX_TICKS_PER_FRAME) acc = 0;
  if (ran > 0 || w.speed === 0) {
    const frame = engine.frame(false);
    post({ type: 'frame', frame }, [frame.soldiers.buffer, frame.zombies.buffer]);
  }
  setTimeout(loop, w.speed === 0 ? 50 : 8);
}

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  switch (msg.type) {
    case 'init': {
      const scenario = msg.scenario === 'open_field' ? 'open_field' : 'last_convoy';
      const difficulty = difficultyOf(msg.difficulty);
      if (msg.save) {
        try {
          engine = SimulationEngine.load(msg.save);
        } catch (err) {
          post({ type: 'error', reason: err instanceof Error ? err.message : 'save_invalid' });
          engine = SimulationEngine.create(msg.seed, scenario, { difficulty });
        }
      } else engine = SimulationEngine.create(msg.seed, scenario, { difficulty });
      // Every game opens paused: behind the menu, the briefing or a loaded save.
      engine.world.speed = 0;
      const map = engine.mapInfo();
      post({ type: 'ready', map }, [map.ground.buffer, map.heights.buffer]);
      last = performance.now();
      loop();
      break;
    }
    case 'set_difficulty': {
      // Same city, new numbers: only before the first tick, so nothing the player did is lost.
      const difficulty = difficultyOf(msg.difficulty);
      if (!engine || engine.world.tick > 0 || engine.world.difficulty === difficulty) return;
      engine = SimulationEngine.create(engine.world.seed, 'last_convoy', { difficulty });
      engine.world.speed = 0;
      post({ type: 'frame', frame: engine.frame(false) });
      break;
    }
    case 'command': {
      if (!engine) return;
      const cmd = msg.cmd;
      // Speed is a host concern (it must work while paused) and never changes the simulation rules.
      if (cmd.type === 'set_speed') {
        engine.setSpeed(cmd.speed);
        return;
      }
      if (cmd.type === 'set_direct_control' && cmd.soldier !== null && engine.world.speed === 0) engine.setSpeed(1);
      engine.enqueue(cmd);
      break;
    }
    case 'save':
      if (engine) post({ type: 'saved', slot: msg.slot, save: engine.save() });
      break;
    case 'request_hash':
      if (engine) post({ type: 'hash', tick: engine.world.tick, hash: engine.hashState() });
      break;
  }
};

function difficultyOf(v: string | undefined): DifficultyId {
  return DIFFICULTY_IDS.find((d) => d === v) ?? 'veteran';
}
