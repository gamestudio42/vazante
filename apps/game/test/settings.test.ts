import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { DIRECT_LOOK } from '@vazante/shared';
import { loadSettings, normalizeLookSettings, saveSettings } from '../src/settings.ts';

let stored: string | null;
beforeEach(() => {
  stored = null;
  vi.stubGlobal('localStorage', {
    getItem: () => stored,
    setItem: (_key: string, value: string) => { stored = value; },
  });
  vi.stubGlobal('location', { search: '' });
  vi.stubGlobal('navigator', { language: 'pt-BR', languages: ['pt-BR'] });
});
afterEach(() => vi.unstubAllGlobals());

test('existing settings acquire the original mouse response without losing progress or preferences', () => {
  stored = JSON.stringify({ locale: 'de', volume: 0.35, tutorialSeen: true, completed: ['last_convoy'] });
  expect(loadSettings()).toMatchObject({
    locale: 'de', volume: 0.35, tutorialSeen: true, completed: ['last_convoy'],
    mouseSensitivity: 1, invertMouseY: false,
  });
});

test('mouse preferences survive storage round trips', () => {
  const s = { ...loadSettings(), mouseSensitivity: 1.75, invertMouseY: true };
  saveSettings(s);
  expect(loadSettings()).toEqual(s);
});

test('invalid or missing mouse preferences fall back and numeric values stay within usable bounds', () => {
  for (const value of [undefined, null, '2', NaN, Infinity, -Infinity, {}, []]) {
    expect(normalizeLookSettings({ mouseSensitivity: value, invertMouseY: value })).toEqual({
      mouseSensitivity: 1, invertMouseY: false,
    });
  }
  expect(normalizeLookSettings({ mouseSensitivity: -10 }).mouseSensitivity).toBe(DIRECT_LOOK.minSensitivity);
  expect(normalizeLookSettings({ mouseSensitivity: 100 }).mouseSensitivity).toBe(DIRECT_LOOK.maxSensitivity);
  stored = JSON.stringify({ mouseSensitivity: 'fast', invertMouseY: 'false', locale: 'pt-BR' });
  expect(loadSettings()).toMatchObject({ mouseSensitivity: 1, invertMouseY: false });
});

test('unreadable storage keeps usable mouse defaults', () => {
  stored = '{broken';
  expect(loadSettings()).toMatchObject({ mouseSensitivity: 1, invertMouseY: false });
  vi.stubGlobal('localStorage', { getItem: () => { throw new Error('unavailable'); }, setItem: () => { throw new Error('unavailable'); } });
  const s = loadSettings();
  expect(s).toMatchObject({ mouseSensitivity: 1, invertMouseY: false });
  expect(() => saveSettings(s)).not.toThrow();
});
