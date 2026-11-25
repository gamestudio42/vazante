import { DIRECT_LOOK, type DifficultyId, type MissionId } from '@vazante/shared';
import { browserLocale, isLocale, type Locale } from './i18n.ts';

export interface Settings {
  volume: number;
  musicVolume: number;
  locale: Locale;
  uiScale: number;
  /** Seconds of game time between autosaves; 0 turns autosave off. */
  autosaveS: number;
  edgePan: boolean;
  /** Multiplier of the original mouse response in direct control. */
  mouseSensitivity: number;
  invertMouseY: boolean;
  /** Difficulty for the next new game. */
  difficulty: DifficultyId;
  /** The tutorial was finished or skipped once. */
  tutorialSeen: boolean;
  /** Campaign missions won at least once. */
  completed: MissionId[];
  /** Best survival run per difficulty: most nights, then most kills. */
  survivalBest: Partial<Record<DifficultyId, SurvivalRecord>>;
  /** City number every new game uses; absent: a new city each game. */
  fixedCity?: number;
}

export interface SurvivalRecord {
  nights: number;
  killed: number;
}

const KEY = 'vazante.settings';
const DEFAULTS: Settings = { volume: 0.8, musicVolume: 0.7, locale: 'pt-BR', uiScale: 1, autosaveS: 120, edgePan: false, mouseSensitivity: DIRECT_LOOK.defaultSensitivity, invertMouseY: DIRECT_LOOK.defaultInvertY, difficulty: 'veteran', tutorialSeen: false, completed: [], survivalBest: {} };

/** Older or malformed preferences must never produce a frozen or non-finite camera. */
export function normalizeLookSettings(s: { mouseSensitivity?: unknown; invertMouseY?: unknown }): Pick<Settings, 'mouseSensitivity' | 'invertMouseY'> {
  return {
    mouseSensitivity: typeof s.mouseSensitivity === 'number' && Number.isFinite(s.mouseSensitivity)
      ? Math.max(DIRECT_LOOK.minSensitivity, Math.min(DIRECT_LOOK.maxSensitivity, s.mouseSensitivity))
      : DIRECT_LOOK.defaultSensitivity,
    invertMouseY: typeof s.invertMouseY === 'boolean' ? s.invertMouseY : DIRECT_LOOK.defaultInvertY,
  };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
    const s = { ...DEFAULTS, ...saved, ...normalizeLookSettings(saved) };
    // First run: the browser's language, until the player picks one.
    if (!isLocale(saved.locale)) s.locale = browserLocale();
    const lang = new URLSearchParams(location.search).get('lang');
    if (isLocale(lang)) s.locale = lang;
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

/** The city for a new game: the fixed one when set, otherwise a random one. */
export function newGameSeed(s: Settings): number {
  return s.fixedCity ?? 1 + Math.floor(Math.random() * 999_999);
}
