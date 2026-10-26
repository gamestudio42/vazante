import { useRef, useSyncExternalStore } from 'react';
import { TICK_HZ, type SaveMeta } from '@vazante/shared';
import { t, type Locale } from '../i18n.ts';
import type { Settings } from '../settings.ts';
import type { Shell } from '../shell.ts';

/** Menus that cover the game: main menu, briefing, pause, settings, load. */
export function ShellOverlay({ shell, seed }: { shell: Shell; seed: number }) {
  useSyncExternalStore(shell.subscribe, () => shell.version);
  const { screen, panel } = shell;
  return (
    <>
      {panel === 'settings' && <SettingsPanel shell={shell} />}
      {panel === 'load' && <LoadPanel shell={shell} />}
      {!panel && screen === 'menu' && <MainMenu shell={shell} seed={seed} />}
      {!panel && screen === 'briefing' && <Briefing shell={shell} />}
      {!panel && screen === 'paused' && <PauseMenu shell={shell} />}
      {shell.toast && (
        <div key={shell.toast.id} className="toast panel">
          {shell.toast.text}
        </div>
      )}
    </>
  );
}

function MainMenu({ shell, seed }: { shell: Shell; seed: number }) {
  const latest = shell.saves[0];
  return (
    <div className="menu-screen">
      <div className="menu-title">
        <h1>{t('app.title')}</h1>
        <div className="muted">{t('menu.subtitle')}</div>
      </div>
      <nav className="menu panel">
        {latest && (
          <button className="primary" onClick={() => void shell.loadSlot(latest.slot)}>
            {t('menu.continue')}
            <span className="muted"> · {slotName(latest)}</span>
          </button>
        )}
        <button className={latest ? '' : 'primary'} onClick={() => shell.newGame()}>
          {t('menu.new')}
        </button>
        <button onClick={() => shell.openPanel('load')}>{t('menu.load')}</button>
        <button onClick={() => shell.openPanel('settings')}>{t('menu.settings')}</button>
        {shell.desktop && <button onClick={() => shell.desktop!.quit()}>{t('menu.quit')}</button>}
        <div className="row muted city">
          {t('menu.city')} #{seed}
          <button onClick={() => shell.restart(seed + 1, false)}>{t('menu.newCity')}</button>
        </div>
      </nav>
      <div className="menu-version muted">{t(shell.desktop ? 'menu.versionDesktop' : 'menu.version')}</div>
    </div>
  );
}

function Briefing({ shell }: { shell: Shell }) {
  return (
    <div className="modal">
      <div className="panel card briefing">
        <h1>{t('brief.title')}</h1>
        {t('brief.body')
          .split('\n\n')
          .map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        <p className="muted tips">{t('brief.tips')}</p>
        <div className="row end">
          <button className="primary" autoFocus onClick={() => shell.start()}>
            {t('brief.start')}
          </button>
        </div>
      </div>
    </div>
  );
}

function PauseMenu({ shell }: { shell: Shell }) {
  return (
    <div className="modal">
      <nav className="menu panel">
        <h2>{t('pause.title')}</h2>
        <button className="primary" autoFocus onClick={() => shell.resume()}>
          {t('pause.resume')}
        </button>
        <button onClick={() => void shell.saveNew()}>{t('pause.save')}</button>
        <button onClick={() => shell.openPanel('load')}>{t('menu.load')}</button>
        <button onClick={() => shell.openPanel('settings')}>{t('menu.settings')}</button>
        <button onClick={() => shell.mainMenu()}>{t('pause.mainMenu')}</button>
        <div className="muted hint">{t('pause.quickHint')}</div>
      </nav>
    </div>
  );
}

function SettingsPanel({ shell }: { shell: Shell }) {
  const s = shell.settings;
  const set = (patch: Partial<Settings>) => shell.applySettings({ ...s, ...patch });
  return (
    <div className="modal">
      <div className="panel card settings">
        <h2>{t('settings.title')}</h2>
        <label>
          <span>{t('settings.volume')}</span>
          <input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => set({ volume: Number(e.target.value) })} />
          <span className="muted">{Math.round(s.volume * 100)}%</span>
        </label>
        <label>
          <span>{t('settings.language')}</span>
          <select value={s.locale} onChange={(e) => set({ locale: e.target.value as Locale })}>
            <option value="pt-BR">Português (Brasil)</option>
            <option value="en">English</option>
          </select>
          <span />
        </label>
        <label>
          <span>{t('settings.uiScale')}</span>
          <input type="range" min={0.8} max={1.5} step={0.05} value={s.uiScale} onChange={(e) => set({ uiScale: Number(e.target.value) })} />
          <span className="muted">{Math.round(s.uiScale * 100)}%</span>
        </label>
        <label>
          <span>{t('settings.autosave')}</span>
          <select value={s.autosaveS} onChange={(e) => set({ autosaveS: Number(e.target.value) })}>
            <option value={0}>{t('settings.autosaveOff')}</option>
            {[1, 2, 5].map((m) => (
              <option key={m} value={m * 60}>
                {t('settings.autosaveEvery').replace('{n}', String(m))}
              </option>
            ))}
          </select>
          <span />
        </label>
        <label>
          <span>{t('settings.edgePan')}</span>
          <input type="checkbox" checked={s.edgePan} onChange={(e) => set({ edgePan: e.target.checked })} />
          <span className="muted">{s.edgePan ? t('settings.on') : t('settings.off')}</span>
        </label>
        <div className="row end">
          <button className="primary" onClick={() => shell.openPanel(null)}>
            {t('menu.back')}
          </button>
        </div>
      </div>
    </div>
  );
}

function LoadPanel({ shell }: { shell: Shell }) {
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className="modal">
      <div className="panel card saves">
        <h2>{t('load.title')}</h2>
        {shell.saves.length === 0 && <p className="muted">{t('load.empty')}</p>}
        <div className="save-list">
          {shell.saves.map((m) => (
            <div key={m.slot} className="save-row">
              <div>
                <div>{slotName(m)}</div>
                <div className="muted">
                  {new Date(m.savedAt).toLocaleString()} · {t('load.time')} {clock(m.tick)} · {t('load.seed')} #{m.seed}
                </div>
              </div>
              <div className="row">
                <button className="primary" onClick={() => void shell.loadSlot(m.slot)}>
                  {t('load.load')}
                </button>
                <button onClick={() => void shell.exportSlot(m.slot)}>{t('load.export')}</button>
                <button onClick={() => void shell.deleteSlot(m.slot)}>{t('load.delete')}</button>
              </div>
            </div>
          ))}
        </div>
        <div className="row end">
          <input
            ref={file}
            type="file"
            accept=".vazante,application/json,application/gzip"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void shell.importFile(f);
            }}
          />
          <button onClick={() => file.current?.click()}>{t('load.import')}</button>
          <button className="primary" onClick={() => shell.openPanel(null)}>
            {t('menu.back')}
          </button>
        </div>
      </div>
    </div>
  );
}

function slotName(m: SaveMeta): string {
  if (m.slot === 'auto') return t('load.slot.auto');
  if (m.slot === 'quick') return t('load.slot.quick');
  if (m.slot === 'import') return t('load.slot.import');
  return t('load.slot.manual');
}

function clock(tick: number): string {
  const s = Math.floor(tick / TICK_HZ);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
