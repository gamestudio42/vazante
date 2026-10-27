import type { DifficultyId, MissionId } from '@vazante/shared';
import type { Locale } from './i18n.ts';

export interface Settings {
  volume: number;
  musicVolume: number;
  locale: Locale;
  uiScale: number;
  /** Seconds of game time between autosaves; 0 turns autosave off. */
  autosaveS: number;
  edgePan: boolean;
  /** Difficulty for the next new game. */
  difficulty: DifficultyId;
  /** The tutorial was finished or skipped once. */
  tutorialSeen: boolean;
  /** Campaign missions won at least once. */
  completed: MissionId[];
}

const KEY = 'vazante.settings';
const DEFAULTS: Settings = { volume: 0.8, musicVolume: 0.7, locale: 'pt-BR', uiScale: 1, autosaveS: 120, edgePan: false, difficulty: 'veteran', tutorialSeen: false, completed: [] };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    const s = { ...DEFAULTS, ...(raw ? (JSON.parse(raw) as Partial<Settings>) : {}) };
    const lang = new URLSearchParams(location.search).get('lang');
    if (lang === 'en' || lang === 'pt-BR') s.locale = lang;
    return s;
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private windows can refuse storage; settings then last for the session.
  }
}
