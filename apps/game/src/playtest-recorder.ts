import type { Frame } from '@vazante/shared';
import type { GameClient } from './client.ts';
import { getLocale } from './i18n.ts';
import { exportReport, parseLog, record, startSession, summarize, touch, type PlaytestEvent, type PlaytestLog, type ScenarioSummary } from './playtest.ts';
import type { Shell } from './shell.ts';
import { download } from './storage.ts';

const KEY = 'vazante.playtest';
const FPS_SAMPLE_S = 60;

function read(): PlaytestLog {
  try {
    return parseLog(localStorage.getItem(KEY));
  } catch {
    return parseLog(null);
  }
}

function write(log: PlaytestLog): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(log));
  } catch {
    // Storage full or refused (private window): the log lasts for this page only.
  }
}

/**
 * Watches one page's game (each new game reloads the page) and writes what happened to the
 * playtest log. Observes the client and the shell only; it never sends commands.
 */
export class PlaytestRecorder {
  private log: PlaytestLog = read();
  private id: string | null = null;
  private t0 = 0;
  private tick = 0;
  private stage = -1;
  private screen = '';
  private tutorialStep = -1;
  private direct = false;
  private fpsFrames = 0;
  private fpsTime = 0;

  constructor(
    private readonly client: GameClient,
    private readonly shell: Shell,
    private readonly gpu: string,
  ) {
    client.onFrame((f) => this.onFrame(f));
    shell.subscribe(() => this.onShell());
    const flush = () => this.quit();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.persist();
    });
    this.onShell();
  }

  /** Called every animation frame; samples the frame rate while the game is played. */
  update(dtS: number): void {
    if (!this.id || this.shell.screen !== 'playing') return;
    this.fpsFrames++;
    this.fpsTime += dtS;
    if (this.fpsTime >= FPS_SAMPLE_S) {
      this.add('fps', Math.round(this.fpsFrames / this.fpsTime));
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
  }

  summary(): ScenarioSummary[] {
    return summarize(this.log);
  }

  get sessions(): number {
    return this.log.sessions.length;
  }

  exportFile(): void {
    this.persist();
    const now = Date.now();
    const blob = new Blob([exportReport(this.log, import.meta.env.MODE, now)], { type: 'application/json' });
    download(blob, `vazante-playtest-${new Date(now).toISOString().slice(0, 10)}.json`);
  }

  /** Forget every recorded session, the current one included. */
  clear(): void {
    this.log = parseLog(null);
    this.id = null;
    write(this.log);
  }

  private now(): number {
    return Math.round((performance.now() - this.t0) / 100) / 10;
  }

  /** A session starts when the player reaches the briefing, so menu visits are not counted. */
  private ensureSession(): string {
    if (this.id) return this.id;
    const map = this.client.state.map;
    this.id = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    this.t0 = performance.now();
    this.log = startSession(this.log, {
      id: this.id,
      startedAt: Date.now(),
      scenario: this.shell.scenario,
      difficulty: this.shell.settings.difficulty,
      locale: getLocale(),
      seed: map?.seed ?? 0,
      gpu: this.gpu,
    });
    return this.id;
  }

  private add(kind: PlaytestEvent['kind'], v?: string | number): void {
    const id = this.ensureSession();
    this.log = record(this.log, id, { s: this.now(), tick: this.tick, kind, ...(v === undefined ? {} : { v }) });
    write(this.log);
  }

  private onShell(): void {
    const screen = this.shell.screen;
    if (screen !== this.screen) {
      const first = this.screen === '';
      this.screen = screen;
      if (screen !== 'menu' && !(first && screen === 'paused' && !this.id)) this.add('screen', screen);
    }
    const tut = this.shell.tutorial;
    if (tut.active && tut.step !== this.tutorialStep) {
      this.tutorialStep = tut.step;
      this.add('tutorial', tut.id);
    }
  }

  private onFrame(f: Frame): void {
    this.tick = f.tick;
    if (!this.id) return;
    for (const e of f.events) {
      if (e.type === 'objective_done') this.add('objective', e.value ?? 0);
      else if (e.type === 'wave_started') this.add('wave', e.value ?? 0);
      else if (e.type === 'night_survived') this.add('night', e.value ?? 0);
      else if (e.type === 'mission_won') this.add('won');
      else if (e.type === 'mission_lost') this.add('lost', e.reason);
    }
    const direct = f.directSoldier !== null;
    if (direct !== this.direct) {
      this.direct = direct;
      if (direct) this.add('direct');
    }
    const stage = f.mission?.stage ?? 0;
    if (stage !== this.stage) {
      this.stage = stage;
      this.log = touch(this.log, this.id, { stage });
    }
  }

  private persist(): void {
    if (!this.id) return;
    this.log = touch(this.log, this.id, { s: this.now(), tick: this.tick, screen: this.screen });
    write(this.log);
  }

  private quit(): void {
    if (!this.id) return;
    this.add('quit', this.screen);
    this.persist();
  }
}
