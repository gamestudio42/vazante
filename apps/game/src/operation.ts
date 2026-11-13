import { MISSIONS, OPERATION, REQUISITION_IDS, SoldierCondition, type CrewSeat, type DifficultyId, type MissionId, type MissionTweaks, type RequisitionId } from '@vazante/shared';
import { crewFor, emptyRoster, living, settle, type ReportRow, type Roster } from './roster.ts';

/**
 * Operation: a roguelite run of city missions on one city. The task force is its own and starts
 * from recruits; the fallen stay fallen. After each won mission the player takes one of a few
 * requisitions; the threat grows with every mission; the first lost mission ends the run.
 *
 * The daily operation is the same for everyone on a UTC date: same city, missions and offers.
 * Pure functions on plain data; storage is at the bottom.
 */

export const OPERATION_VERSION = 1;
/** Daily bests kept, newest dates first. */
export const MAX_DAILY = 30;

export interface MissionLog {
  mission: MissionId;
  won: boolean;
  kills: number;
  fallen: number;
}

export interface OperationRun {
  id: string;
  /** The city of every mission in the run. */
  seed: number;
  /** UTC date (YYYY-MM-DD) of a daily operation, null for a random one. */
  daily: string | null;
  difficulty: DifficultyId;
  missions: MissionId[];
  /** The mission being played or next to play. */
  index: number;
  status: 'active' | 'won' | 'lost';
  roster: Roster;
  /** Requisitions offered after the last won mission; empty when none is waiting. */
  offers: RequisitionId[];
  picks: RequisitionId[];
  /** What the next mission starts with, from requisitions. */
  next: { ammo: number; materials: number; recon: boolean; recruitXp: number };
  log: MissionLog[];
  startedAt: number;
}

export interface OperationRecord {
  score: number;
  missions: number;
  at: number;
}

export interface OperationStore {
  version: number;
  run: OperationRun | null;
  best: OperationRecord | null;
  /** Best score per daily date. */
  daily: Record<string, OperationRecord>;
}

export function emptyStore(): OperationStore {
  return { version: OPERATION_VERSION, run: null, best: null, daily: {} };
}

export function parseStore(raw: string | null): OperationStore {
  if (!raw) return emptyStore();
  try {
    const v = JSON.parse(raw) as Partial<OperationStore>;
    if (v.version !== OPERATION_VERSION || typeof v.daily !== 'object' || v.daily === null) return emptyStore();
    return { version: OPERATION_VERSION, run: v.run ?? null, best: v.best ?? null, daily: v.daily };
  } catch {
    return emptyStore();
  }
}

/** The daily operation's date: the same for every player at the same moment. */
export function dailyKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** A city number from text (FNV-1a), in the range the menu uses. */
export function seedFor(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return 1 + ((h >>> 0) % 999_999);
}

/** Small seeded generator (mulberry32) for the run's draws, so a daily run is the same everywhere. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(xs: readonly T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function newRun(seed: number, daily: string | null, difficulty: DifficultyId, now: number): OperationRun {
  return {
    id: `op-${now}`,
    seed,
    daily,
    difficulty,
    missions: shuffle(OPERATION.pool, seeded(seed)).slice(0, OPERATION.missions),
    index: 0,
    status: 'active',
    roster: emptyRoster(),
    offers: [],
    picks: [],
    next: { ammo: 0, materials: 0, recon: false, recruitXp: 0 },
    log: [],
    startedAt: now,
  };
}

/** A daily run: the city and difficulty come from the date. */
export function dailyRun(now: number): OperationRun {
  const day = dailyKey(now);
  return newRun(seedFor(`vazante-daily-${day}`), day, 'veteran', now);
}

export function currentMission(run: OperationRun): MissionId | null {
  return run.status === 'active' ? (run.missions[run.index] ?? null) : null;
}

/** The run can deploy: active, and no requisition waiting to be chosen. */
export function canDeploy(run: OperationRun | null): run is OperationRun {
  return !!run && run.status === 'active' && run.offers.length === 0 && currentMission(run) !== null;
}

/** Threat for the current mission and the requisitions taken for it. */
export function missionTweaks(run: OperationRun): MissionTweaks {
  const threat = 1 + run.index * OPERATION.threatPerMission;
  return {
    zombieScale: threat * (run.next.recon ? 1 - OPERATION.requisitions.recon : 1),
    ammo: run.next.ammo,
    materials: run.next.materials,
  };
}

/** Seats for the current mission, with recruits where the run's task force has gaps. */
export function deploy(run: OperationRun, rand: () => number): { run: OperationRun; crew: CrewSeat[][] } {
  const id = currentMission(run);
  if (!id) return { run, crew: [] };
  const filled = crewFor(run.roster, MISSIONS[id].squads, rand, run.next.recruitXp);
  return { run: { ...run, roster: filled.roster }, crew: filled.crew };
}

/** Requisitions after the run's `index`-th win: drawn from the run's seed, so a daily run offers the same. */
export function drawOffers(seed: number, index: number): RequisitionId[] {
  const rand = seeded((seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0);
  return shuffle(REQUISITION_IDS, rand).slice(0, OPERATION.offers);
}

/**
 * Apply the current mission's result. A win moves to the next mission and offers requisitions
 * (or wins the operation after the last); a loss ends the run.
 */
export function finishMission(
  run: OperationRun,
  won: boolean,
  results: readonly { rid: number; kills: number; condition: SoldierCondition }[],
  now: number,
): { run: OperationRun; report: ReportRow[] } {
  const mission = currentMission(run);
  if (!mission || run.offers.length > 0) return { run, report: [] };
  const done = settle(run.roster, mission, won, results, now);
  const kills = results.reduce((n, r) => n + r.kills, 0);
  const fallen = done.report.filter((r) => r.fate !== 'alive').length;
  const index = won ? run.index + 1 : run.index;
  const last = index >= run.missions.length;
  return {
    run: {
      ...run,
      roster: done.roster,
      index,
      status: !won ? 'lost' : last ? 'won' : 'active',
      offers: won && !last ? drawOffers(run.seed, run.index) : [],
      next: { ammo: 0, materials: 0, recon: false, recruitXp: 0 },
      log: [...run.log, { mission, won, kills, fallen }],
    },
    report: done.report,
  };
}

/** Take one of the offered requisitions. */
export function choose(run: OperationRun, pick: RequisitionId): OperationRun {
  if (!run.offers.includes(pick)) return run;
  const R = OPERATION.requisitions;
  let { roster } = run;
  const next = { ...run.next };
  if (pick === 'ammo') next.ammo += R.ammo;
  if (pick === 'materials') next.materials += R.materials;
  if (pick === 'recon') next.recon = true;
  if (pick === 'veterans') next.recruitXp = R.veteransXp;
  if (pick === 'drill') {
    roster = { ...roster, units: Object.fromEntries(Object.entries(roster.units).map(([k, u]) => [k, u.map((x) => (x ? { ...x, xp: x.xp + R.drillXp } : null))])) };
  }
  return { ...run, roster, next, offers: [], picks: [...run.picks, pick] };
}

/** Points so far: won missions (later ones worth more), every kill, and survivors of a won operation. */
export function scoreOf(run: OperationRun): number {
  const S = OPERATION.score;
  let score = 0;
  run.log.forEach((m, i) => {
    score += m.kills * S.kill;
    if (m.won) score += S.won + i * S.perMission;
  });
  if (run.status === 'won') score += living(run.roster).length * S.survivor;
  return score;
}

/** Missions won in the run. */
export function missionsWon(run: OperationRun): number {
  return run.log.filter((m) => m.won).length;
}

/** Keep a finished run's score in the bests; true when it beats a previous one. */
export function recordRun(store: OperationStore, run: OperationRun, now: number): { store: OperationStore; newBest: boolean } {
  if (run.status === 'active') return { store, newBest: false };
  const rec: OperationRecord = { score: scoreOf(run), missions: missionsWon(run), at: now };
  const beats = (old: OperationRecord | null | undefined) => !old || rec.score > old.score;
  // A run that scored nothing is kept as a record but never celebrated.
  const newBest = rec.score > 0 && beats(run.daily ? store.daily[run.daily] : store.best);
  let daily = store.daily;
  if (run.daily && beats(daily[run.daily])) {
    daily = Object.fromEntries(
      Object.entries({ ...daily, [run.daily]: rec })
        .sort(([a], [b]) => (a < b ? 1 : -1))
        .slice(0, MAX_DAILY),
    );
  }
  return { store: { ...store, best: beats(store.best) ? rec : store.best, daily }, newBest };
}

const KEY = 'vazante.operation';

export function loadOperation(): OperationStore {
  try {
    return parseStore(localStorage.getItem(KEY));
  } catch {
    return emptyStore();
  }
}

export function saveOperation(s: OperationStore): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage refused (private window): the operation lasts for this page.
  }
}
