/**
 * Playtest log: what each session did, kept in this browser only and exported by the player as a
 * JSON file to send to the team. Nothing is ever sent over the network.
 *
 * The functions on `PlaytestLog` data are pure, so the log can be tested without a browser.
 */

export const PLAYTEST_VERSION = 1;
/** Oldest sessions are dropped beyond this many. */
export const MAX_SESSIONS = 60;
/** Events kept per session; later ones replace the oldest, except the first (`start`). */
export const MAX_EVENTS = 300;

export type PlaytestKind =
  | 'start'
  | 'screen'
  | 'objective'
  | 'wave'
  | 'night'
  | 'won'
  | 'lost'
  | 'tutorial'
  | 'direct'
  | 'fps'
  | 'quit';

export interface PlaytestEvent {
  /** Seconds of wall time since the session started. */
  s: number;
  /** Simulation tick when it happened. */
  tick: number;
  kind: PlaytestKind;
  /** Short detail: screen name, stage index, loss reason, tutorial step, fps. */
  v?: string | number;
}

export interface PlaytestSession {
  id: string;
  /** Epoch ms. */
  startedAt: number;
  scenario: string;
  difficulty: string;
  locale: string;
  seed: number;
  /** Renderer reported by WebGL, for performance reports. */
  gpu: string;
  /** Last known state, kept current so a closed tab still says where the player stopped. */
  last: { s: number; tick: number; stage: number; screen: string };
  outcome: 'won' | 'lost' | null;
  events: PlaytestEvent[];
}

export interface PlaytestLog {
  version: number;
  sessions: PlaytestSession[];
}

export function emptyLog(): PlaytestLog {
  return { version: PLAYTEST_VERSION, sessions: [] };
}

/** Reads a stored log; anything unreadable or from another version starts a new one. */
export function parseLog(raw: string | null): PlaytestLog {
  if (!raw) return emptyLog();
  try {
    const v = JSON.parse(raw) as Partial<PlaytestLog>;
    if (v.version !== PLAYTEST_VERSION || !Array.isArray(v.sessions)) return emptyLog();
    return { version: PLAYTEST_VERSION, sessions: v.sessions };
  } catch {
    return emptyLog();
  }
}

export function startSession(log: PlaytestLog, s: Omit<PlaytestSession, 'last' | 'outcome' | 'events'>): PlaytestLog {
  const session: PlaytestSession = { ...s, last: { s: 0, tick: 0, stage: 0, screen: 'menu' }, outcome: null, events: [{ s: 0, tick: 0, kind: 'start' }] };
  return { ...log, sessions: [...log.sessions, session].slice(-MAX_SESSIONS) };
}

/** Appends an event to the session with `id`; `won`/`lost` also set the outcome. */
export function record(log: PlaytestLog, id: string, ev: PlaytestEvent): PlaytestLog {
  return {
    ...log,
    sessions: log.sessions.map((x) => {
      if (x.id !== id) return x;
      let events = [...x.events, ev];
      if (events.length > MAX_EVENTS) events = [events[0], ...events.slice(events.length - MAX_EVENTS + 1)];
      const outcome = ev.kind === 'won' || ev.kind === 'lost' ? ev.kind : x.outcome;
      return { ...x, events, outcome, last: { ...x.last, s: ev.s, tick: ev.tick } };
    }),
  };
}

/** Updates where the session stands without adding an event. */
export function touch(log: PlaytestLog, id: string, last: Partial<PlaytestSession['last']>): PlaytestLog {
  return { ...log, sessions: log.sessions.map((x) => (x.id === id ? { ...x, last: { ...x.last, ...last } } : x)) };
}

export interface ScenarioSummary {
  scenario: string;
  /** Sessions that left the briefing. */
  played: number;
  won: number;
  lost: number;
  /** Played but closed without a result. */
  abandoned: number;
  /** Median minutes of play per session that left the briefing. */
  medianMinutes: number;
  /** For abandoned sessions: how many stopped at each stage index. */
  abandonedAtStage: Record<number, number>;
}

function played(x: PlaytestSession): boolean {
  return x.events.some((e) => e.kind === 'screen' && e.v === 'playing');
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Per-scenario totals: where players win, lose and give up. */
export function summarize(log: PlaytestLog): ScenarioSummary[] {
  const by = new Map<string, PlaytestSession[]>();
  for (const x of log.sessions) {
    if (!played(x)) continue;
    by.set(x.scenario, [...(by.get(x.scenario) ?? []), x]);
  }
  return [...by.entries()].map(([scenario, xs]) => {
    const abandonedAtStage: Record<number, number> = {};
    for (const x of xs) if (!x.outcome) abandonedAtStage[x.last.stage] = (abandonedAtStage[x.last.stage] ?? 0) + 1;
    return {
      scenario,
      played: xs.length,
      won: xs.filter((x) => x.outcome === 'won').length,
      lost: xs.filter((x) => x.outcome === 'lost').length,
      abandoned: xs.filter((x) => !x.outcome).length,
      medianMinutes: Math.round(median(xs.map((x) => x.last.s / 60)) * 10) / 10,
      abandonedAtStage,
    };
  });
}

/** The file a tester sends back: summary first, raw sessions after. */
export function exportReport(log: PlaytestLog, build: string, now: number): string {
  return JSON.stringify({ game: 'vazante', build, exportedAt: new Date(now).toISOString(), summary: summarize(log), sessions: log.sessions }, null, 1);
}
