import { TICK_HZ, type SaveMeta, type SimSpeed } from '@vazante/shared';
import type { AudioDirector } from '@vazante/audio';
import type { GameRenderer } from '@vazante/view3d';
import type { GameClient } from './client.ts';
import { setLocale, t } from './i18n.ts';
import type { InputController } from './input.ts';
import { saveSettings, type Settings } from './settings.ts';
import { deleteSave, download, exportSave, getSave, importSave, listSaves, putSave } from './storage.ts';

export type Screen = 'menu' | 'briefing' | 'playing' | 'paused';
export type Panel = null | 'settings' | 'load';

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
  }

  private setSpeed(speed: SimSpeed): void {
    this.client.send({ type: 'set_speed', speed });
  }

  newGame(): void {
    const base = this.view.map.sites.find((x) => x.kind === 'base');
    const cs = this.view.map.cellSize;
    if (base) this.view.rig.centerOn(((base.x0 + base.x1 + 1) / 2) * cs, ((base.y0 + base.y1 + 1) / 2) * cs);
    this.view.rig.targetYaw = Math.round(this.view.rig.targetYaw / (Math.PI / 4)) * (Math.PI / 4);
    this.screen = 'briefing';
    this.panel = null;
    this.changed();
  }

  start(): void {
    this.screen = 'playing';
    this.setSpeed(1);
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
    if (play) p.set('play', '1');
    else p.delete('play');
    location.search = p.toString();
  }

  mainMenu(): void {
    if (this.screen !== 'menu' && !confirm(t('pause.confirmLeave'))) return;
    const seed = this.client.state.map?.seed ?? 1;
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
