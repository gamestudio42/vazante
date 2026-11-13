import { MISSION_IDS, TICK_HZ, type DifficultyId, type RequisitionId, type Frame, type MissionId, type SaveMeta, type SimSpeed } from '@vazante/shared';
import type { AudioDirector } from '@vazante/audio';
import type { GameRenderer } from '@vazante/view3d';
import type { GameClient } from './client.ts';
import { setLocale, t } from './i18n.ts';
import type { InputController } from './input.ts';
import type { PlaytestRecorder } from './playtest-recorder.ts';
import { newGameSeed, saveSettings, type Settings, type SurvivalRecord } from './settings.ts';
import { Tutorial } from './tutorial.ts';
import { crewResults, emptyRoster, loadRoster, namesByRid, saveRoster, settle, type ReportRow, type Roster, type Trooper } from './roster.ts';
import { canDeploy, choose, dailyKey, dailyRun, finishMission, loadOperation, newRun, recordRun, saveOperation, type OperationStore } from './operation.ts';
import { deleteSave, download, exportSave, getSave, importSave, listSaves, putSave } from './storage.ts';

export type Screen = 'menu' | 'briefing' | 'playing' | 'paused';
export type Panel = null | 'settings' | 'load' | 'campaign' | 'operation';

/** Desktop hooks exposed by the Electron preload; absent in the browser. */
interface DesktopBridge {
  quit(): void;
}

/**
 * Game flow around the simulation: main menu → briefing → game ⇄ pause, plus saves and settings.
 * Owns the speed while a menu is open, so the world never runs behind a menu.
 */
export class Shell {
  screen: Screen;
  panel: Panel = null;
  saves: SaveMeta[] = [];
  toast: { id: number; text: string } | null = null;
  version = 0;
  private listeners = new Set<() => void>();
  private resumeSpeed: SimSpeed = 1;
  private lastAutosaveTick = 0;
  private toastSeq = 0;
  readonly tutorial: Tutorial;
  /** Local playtest log, set once the game has started. */
  playtest: PlaytestRecorder | null = null;
  /** Campaign roster as stored; `report` is this game's result once it is settled. */
  roster: Roster = loadRoster();
  report: ReportRow[] | null = null;
  /** The guided tutorial ran in this game: practice, so the roster is not touched. */
  get practiceGame(): boolean {
    return this.practice;
  }
  private names = namesByRid(this.roster);
  /** Operation runs and bests as stored. */
  operation: OperationStore = loadOperation();
  /** This game is the current mission of the Operation run. */
  inOperation = false;
  /** The finished run beat the best score (overall, or the day's for a daily run). */
  operationNewBest = false;
  /** The guided tutorial ran in this game: practice, so the roster is not touched. */
  private practice = false;
  /** Start the guided tutorial when the briefing closes (on until it was finished or skipped once). */
  withTutorial: boolean;
  readonly desktop: DesktopBridge | null = (window as unknown as { vazanteDesktop?: DesktopBridge }).vazanteDesktop ?? null;

  constructor(
    private readonly client: GameClient,
    private readonly input: InputController,
    private readonly view: GameRenderer,
    private readonly audio: AudioDirector,
    public settings: Settings,
    initial: Screen,
  ) {
    this.screen = initial;
    this.withTutorial = !settings.tutorialSeen;
    this.tutorial = new Tutorial(client, view, () => this.applySettings({ ...this.settings, tutorialSeen: true }));
    input.onEscape = () => this.escape();
    input.onQuickSave = () => void this.save('quick');
    input.onQuickLoad = () => void this.loadSlot('quick');
    this.applySettings(settings);
    this.syncInput();
    if (initial === 'menu') {
      const m = view.map;
      view.rig.centerOn((m.width * m.cellSize) / 2, (m.height * m.cellSize) / 2);
    }
    void this.refreshSaves();
    client.onFrame((f) => {
      if (this.screen !== 'playing' || this.settings.autosaveS <= 0) return;
      if (f.mission && (f.mission.phase === 'won' || f.mission.phase === 'lost')) return;
      if (this.lastAutosaveTick === 0) this.lastAutosaveTick = f.tick;
      if (f.tick - this.lastAutosaveTick >= this.settings.autosaveS * TICK_HZ) {
        this.lastAutosaveTick = f.tick;
        void this.save('auto');
      }
    });
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private changed(): void {
    this.version++;
    this.syncInput();
    for (const fn of this.listeners) fn();
  }

  private syncInput(): void {
    this.input.enabled = this.screen === 'playing';
  }

  /** Slow orbit behind the main menu. */
  update(dtS: number): void {
    if (this.screen === 'menu') this.view.rig.targetYaw += dtS * 0.05;
    if (this.screen === 'playing') this.tutorial.update(performance.now());
  }

  /** This game deploys the Operation's task force: no tutorial, the run's difficulty, its names. */
  enterOperation(): void {
    this.inOperation = true;
    this.withTutorial = false;
    this.names = namesByRid(this.operation.run!.roster);
  }

  /** Difficulty of the next game; rebuilds the waiting scenario so the briefing starts on it. */
  setDifficulty(d: DifficultyId): void {
    // An Operation keeps the difficulty it started with.
    if (this.inOperation) return;
    this.applySettings({ ...this.settings, difficulty: d });
    this.client.setDifficulty(d);
    this.changed();
  }

  setTutorial(on: boolean): void {
    this.withTutorial = on;
    this.changed();
  }

  /** Survival in Porto Velário: a horde every night until the base falls. */
  openSurvival(): void {
    this.openScenario('survival');
  }

  /** A campaign mission: a fresh page on its map, straight to the briefing. */
  openMission(id: MissionId): void {
    this.openScenario(id);
  }

  /** Each new game is on a new city, unless a city number is fixed in the menu. */
  private openScenario(id: string): void {
    const p = new URLSearchParams(location.search);
    p.set('scenario', id);
    p.set('seed', String(newGameSeed(this.settings)));
    p.set('play', '1');
    p.delete('load');
    p.delete('op');
    location.search = p.toString();
  }

  /** The first mission is always open; each win opens the next. `?unlock=1` opens them all. */
  missionUnlocked(id: MissionId): boolean {
    const i = MISSION_IDS.indexOf(id);
    if (i <= 0 || new URLSearchParams(location.search).has('unlock')) return true;
    return this.settings.completed.includes(MISSION_IDS[i - 1]);
  }

  /** Keep a finished survival run if it beats the best at its difficulty; true when it does. */
  recordSurvival(difficulty: DifficultyId, run: SurvivalRecord): boolean {
    const best = this.settings.survivalBest[difficulty];
    if (best && (best.nights > run.nights || (best.nights === run.nights && best.killed >= run.killed))) return false;
    this.applySettings({ ...this.settings, survivalBest: { ...this.settings.survivalBest, [difficulty]: run } });
    return true;
  }

  /** Roster soldier behind a roster id, for names in the HUD. */
  trooper(rid: number): Trooper | undefined {
    return this.names.get(rid);
  }

  /**
   * Write a finished campaign mission into the roster, once per game: survivors gain experience,
   * the fallen go to the memorial. A game with the guided tutorial on changes nothing.
   */
  settleMission(frame: Frame): ReportRow[] {
    if (this.report) return this.report;
    const m = frame.mission;
    if (!m || m.phase === 'active' || frame.crew.length === 0) return (this.report = []);
    if (this.inOperation) return (this.report = this.settleOperation(m.phase === 'won', crewResults(frame.crew, frame.soldiers)));
    const done = settle(loadRoster(), m.id, m.phase === 'won', crewResults(frame.crew, frame.soldiers), Date.now());
    if (!this.practice) this.setRoster(done.roster);
    this.report = done.report;
    return this.report;
  }

  /** The Operation mission's result goes into the run; a finished run goes into the bests. */
  private settleOperation(won: boolean, results: Parameters<typeof finishMission>[2]): ReportRow[] {
    const store = loadOperation();
    if (!store.run) return [];
    const done = finishMission(store.run, won, results, Date.now());
    let next: OperationStore = { ...store, run: done.run };
    if (done.run.status !== 'active') {
      const rec = recordRun(next, done.run, Date.now());
      next = rec.store;
      this.operationNewBest = rec.newBest;
    }
    this.setOperation(next);
    return done.report;
  }

  private setOperation(s: OperationStore): void {
    this.operation = s;
    saveOperation(s);
    this.changed();
  }

  /** A new Operation (today's daily one, or a random city), replacing any run in progress. */
  startOperation(daily: boolean): void {
    const now = Date.now();
    const run = daily ? dailyRun(now) : newRun(newGameSeed(this.settings), null, this.settings.difficulty, now);
    this.setOperation({ ...loadOperation(), run });
    this.deployOperation();
  }

  /** Today's daily date, for the menu. */
  get today(): string {
    return dailyKey(Date.now());
  }

  /** Take a requisition offered after a won Operation mission. */
  chooseRequisition(pick: RequisitionId): void {
    const store = loadOperation();
    if (store.run) this.setOperation({ ...store, run: choose(store.run, pick) });
  }

  /** Open the run's next mission on its city. */
  deployOperation(): void {
    const run = this.operation.run;
    if (!canDeploy(run)) return;
    const p = new URLSearchParams(location.search);
    p.set('scenario', run.missions[run.index]);
    p.set('seed', String(run.seed));
    p.set('op', String(run.index));
    p.set('play', '1');
    p.delete('load');
    location.search = p.toString();
  }

  /** Give up the run: it ends with the score it has and counts for the bests. */
  abandonOperation(): void {
    const store = loadOperation();
    if (!store.run || store.run.status !== 'active') return;
    const run = { ...store.run, status: 'lost' as const, offers: [] };
    this.setOperation({ ...recordRun(store, run, Date.now()).store, run });
  }

  /** Start the campaign roster over: every soldier and the memorial are cleared. */
  resetRoster(): void {
    this.setRoster(emptyRoster());
    this.changed();
  }

  private setRoster(r: Roster): void {
    this.roster = r;
    this.names = namesByRid(r);
    saveRoster(r);
  }

  completeMission(id: MissionId): void {
    if (this.inOperation || this.settings.completed.includes(id)) return;
    this.applySettings({ ...this.settings, completed: [...this.settings.completed, id] });
  }

  get scenario(): string {
    return new URLSearchParams(location.search).get('scenario') ?? 'last_convoy';
  }

  /** Main menu "Tutorial": a recruit game with the guide on. */
  newTutorial(): void {
    this.withTutorial = true;
    this.setDifficulty('recruit');
    this.newGame();
  }

  private setSpeed(speed: SimSpeed): void {
    this.client.send({ type: 'set_speed', speed });
  }

  newGame(): void {
    const base = this.view.map.sites.find((x) => x.kind === 'base');
    const cs = this.view.map.cellSize;
    if (base) this.view.rig.centerOn(((base.x0 + base.x1 + 1) / 2) * cs, ((base.y0 + base.y1 + 1) / 2) * cs);
    // Settle on the nearest diagonal: the three-quarter view shows two facades of every building.
    const q = Math.PI / 2;
    this.view.rig.targetYaw = Math.round((this.view.rig.targetYaw - Math.PI / 4) / q) * q + Math.PI / 4;
    this.screen = 'briefing';
    this.panel = null;
    this.changed();
  }

  start(): void {
    this.screen = 'playing';
    this.setSpeed(1);
    if (this.withTutorial) {
      this.practice = true;
      this.tutorial.begin();
    }
    this.changed();
  }

  pause(): void {
    if (this.screen !== 'playing') return;
    const speed = this.client.state.frame?.speed ?? 1;
    this.resumeSpeed = speed === 0 ? 1 : speed;
    this.setSpeed(0);
    this.screen = 'paused';
    this.changed();
  }

  resume(): void {
    this.screen = 'playing';
    this.panel = null;
    const f = this.client.state.frame;
    if (!f?.mission || (f.mission.phase !== 'won' && f.mission.phase !== 'lost')) this.setSpeed(this.resumeSpeed);
    this.changed();
  }

  escape(): void {
    if (this.panel) this.openPanel(null);
    else if (this.screen === 'playing') this.pause();
    else if (this.screen === 'paused') this.resume();
  }

  openPanel(p: Panel): void {
    this.panel = p;
    if (p === 'load') void this.refreshSaves();
    this.changed();
  }

  notify(text: string): void {
    const id = ++this.toastSeq;
    this.toast = { id, text };
    this.changed();
    setTimeout(() => {
      if (this.toast?.id === id) {
        this.toast = null;
        this.changed();
      }
    }, 3500);
  }

  async refreshSaves(): Promise<void> {
    this.saves = await listSaves();
    this.changed();
  }

  async save(slot: string): Promise<void> {
    const save = await this.client.requestSave(slot);
    await putSave(slot, save);
    this.notify(slot === 'auto' ? t('toast.autosaved') : t('toast.saved'));
    await this.refreshSaves();
  }

  async saveNew(): Promise<void> {
    await this.save(`save-${Date.now()}`);
  }

  /** Loading restarts the page with the save, so no state from the old game can leak in. */
  async loadSlot(slot: string): Promise<void> {
    const save = await getSave(slot);
    if (!save) {
      this.notify(t('toast.noQuick'));
      return;
    }
    const p = new URLSearchParams(location.search);
    p.set('load', slot);
    p.set('seed', String(save.seed));
    p.delete('play');
    location.search = p.toString();
  }

  async exportSlot(slot: string): Promise<void> {
    const save = await getSave(slot);
    if (save) download(await exportSave(save), `vazante-${slot}.vazante`);
  }

  async deleteSlot(slot: string): Promise<void> {
    await deleteSave(slot);
    await this.refreshSaves();
  }

  async importFile(file: File): Promise<void> {
    try {
      await putSave('import', await importSave(file));
    } catch {
      this.notify(t('toast.importFailed'));
      return;
    }
    await this.loadSlot('import');
  }

  /** New game: a fresh page on the given city. `play` skips the main menu. */
  restart(seed: number, play: boolean): void {
    const p = new URLSearchParams(location.search);
    p.set('seed', String(seed >>> 0));
    p.delete('load');
    p.delete('op');
    if (play) p.set('play', '1');
    else p.delete('play');
    location.search = p.toString();
  }

  mainMenu(): void {
    if (this.screen !== 'menu' && !confirm(t('pause.confirmLeave'))) return;
    const seed = this.client.state.map?.seed ?? 1;
    const p = new URLSearchParams(location.search);
    if (p.has('scenario')) {
      p.delete('scenario');
      p.delete('op');
      p.delete('load');
      p.delete('play');
      location.search = p.toString();
      return;
    }
    this.restart(seed, false);
  }

  applySettings(s: Settings): void {
    this.settings = s;
    saveSettings(s);
    setLocale(s.locale);
    document.documentElement.lang = s.locale;
    document.documentElement.style.setProperty('--ui', String(s.uiScale));
    this.audio.setVolume(s.volume);
    this.audio.setMusicVolume(s.musicVolume);
    this.input.edgePan = s.edgePan;
    this.changed();
  }
}
