import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Building2, Check, ChevronRight, CircleCheck, Lock, Map as MapIcon, Download, FolderOpen, GraduationCap, LogOut, Play, Plus, RefreshCw, Save, Settings as Gear, Skull, Shield, Trash2, Undo2, Upload, X } from 'lucide-react';
import { DIFFICULTY_IDS, MISSION_IDS, TICK_HZ, type MissionId, type SaveMeta } from '@vazante/shared';
import { LOCALES, LOCALE_NAMES, t, type Locale } from '../i18n.ts';
import type { Settings } from '../settings.ts';
import type { Shell } from '../shell.ts';

/** Menus that cover the game: main menu, campaign, briefing, pause, settings, load. */
export function ShellOverlay({ shell, seed }: { shell: Shell; seed: number }) {
  useSyncExternalStore(shell.subscribe, () => shell.version);
  const { screen, panel } = shell;
  return (
    <>
      {panel === 'settings' && <SettingsPanel shell={shell} />}
      {panel === 'load' && <LoadPanel shell={shell} />}
      {panel === 'campaign' && <CampaignPanel shell={shell} />}
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
        <div className="menu-kicker">
          <span className="hazard" />
          {t('menu.subtitle')}
        </div>
        <h1>{t('app.title')}</h1>
      </div>
      <nav className="menu panel">
        {latest && (
          <button className="primary" onClick={() => void shell.loadSlot(latest.slot)}>
            <Play size={16} />
            {t('menu.continue')}
            <span className="muted"> · {slotName(latest)}</span>
          </button>
        )}
        <button className={latest ? '' : 'primary'} onClick={() => shell.newGame()}>
          <Plus size={16} />
          {t('menu.new')}
        </button>
        <button onClick={() => shell.openPanel('campaign')}>
          <MapIcon size={16} />
          {t('menu.campaign')}
          <span className="muted">
            {' '}
            · {shell.settings.completed.length}/{MISSION_IDS.length}
          </span>
        </button>
        <button onClick={() => shell.openCity()}>
          <Building2 size={16} />
          {t('menu.city.war')}
          <span className="muted"> · {t('menu.experimental')}</span>
        </button>
        <button onClick={() => shell.newTutorial()}>
          <GraduationCap size={16} />
          {t('menu.tutorial')}
        </button>
        <button onClick={() => shell.openPanel('load')}>
          <FolderOpen size={16} />
          {t('menu.load')}
        </button>
        <button onClick={() => shell.openPanel('settings')}>
          <Gear size={16} />
          {t('menu.settings')}
        </button>
        {shell.desktop && (
          <button onClick={() => shell.desktop!.quit()}>
            <LogOut size={16} />
            {t('menu.quit')}
          </button>
        )}
        <div className="row muted city">
          {t('menu.city')} #{seed}
          <button onClick={() => shell.restart(seed + 1, false)}>
            <RefreshCw size={12} />
            {t('menu.newCity')}
          </button>
        </div>
      </nav>
      <div className="menu-version muted">{t(shell.desktop ? 'menu.versionDesktop' : 'menu.version')}</div>
    </div>
  );
}

function Briefing({ shell }: { shell: Shell }) {
  const city = shell.scenario === 'city_war';
  const id = (MISSION_IDS as readonly string[]).includes(shell.scenario) ? (shell.scenario as MissionId) : 'last_convoy';
  const kicker = city ? t('menu.experimental') : t('campaign.mission').replace('{n}', String(MISSION_IDS.indexOf(id) + 1)).replace('{t}', String(MISSION_IDS.length));
  return (
    <div className="modal">
      <div className="panel card briefing">
        <div className="summary-kicker">{kicker}</div>
        <h1>{t(city ? 'brief.city.title' : `brief.${id}.title`)}</h1>
        {t(city ? 'brief.city.body' : `brief.${id}.body`)
          .split('\n\n')
          .map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        {!city && <p className="muted tips">{t(`brief.${id}.tips`)}</p>}
        <div className="difficulty" role="radiogroup" aria-label={t('diff.title')}>
          {DIFFICULTY_IDS.map((d) => {
            const Icon = DIFF_ICON[d];
            return (
              <button key={d} role="radio" aria-checked={shell.settings.difficulty === d} className={`diff ${shell.settings.difficulty === d ? 'on' : ''}`} onClick={() => shell.setDifficulty(d)}>
                <span className="diff-name">
                  <Icon size={14} />
                  {t(`diff.${d}`)}
                </span>
                <span className="diff-desc">{t(`diff.${d}.desc`)}</span>
              </button>
            );
          })}
        </div>
        <div className="row between">
          <label className="tut-toggle">
            <input type="checkbox" checked={shell.withTutorial} onChange={(e) => shell.setTutorial(e.target.checked)} />
            <GraduationCap size={14} />
            {t('brief.tutorial')}
          </label>
          <button className="primary big" autoFocus onClick={() => shell.start()}>
            <Play size={16} />
            {t('brief.start')}
          </button>
        </div>
      </div>
    </div>
  );
}

const DIFF_ICON = { recruit: Shield, veteran: Check, nightmare: Skull } as const;

/** One hint at a time over the running game; never blocks the map. */
/** `[K]` becomes a key cap and `**text**` a highlight, so the card shows what to press and where. */
function emphasise(text: string): ReactNode {
  return text.split(/(\[[^\]]+\]|\*\*[^*]+\*\*)/).map((part, i) => {
    if (part.startsWith('[') && part.endsWith(']')) return <kbd key={i}>{part.slice(1, -1)}</kbd>;
    if (part.startsWith('**') && part.endsWith('**')) return <b key={i} className="tut-em">{part.slice(2, -2)}</b>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Pulsing outlines around the interface the current step talks about, and markers over the
 * places in the world it means. Positions are re-read every frame, so they follow the camera
 * and panels that move or resize.
 */
function TutorialSpotlight({ shell }: { shell: Shell }) {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [points, setPoints] = useState<{ x: number; y: number }[]>([]);
  useEffect(() => {
    let raf = 0;
    let last = '';
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const f = shell.tutorial.focus(innerWidth, innerHeight);
      const bs: Box[] = [];
      for (const sel of f.ui) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) bs.push({ x: r.left, y: r.top, w: r.width, h: r.height });
      }
      const ps = f.points.filter((p) => p.x > -40 && p.y > -40 && p.x < innerWidth + 40 && p.y < innerHeight + 40);
      const key = JSON.stringify([bs.map((b) => [b.x, b.y, b.w, b.h].map(Math.round)), ps.map((p) => [Math.round(p.x), Math.round(p.y)])]);
      if (key === last) return;
      last = key;
      setBoxes(bs);
      setPoints(ps);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [shell]);
  return (
    <div className="tut-spot" aria-hidden="true">
      {boxes.map((b, i) => (
        <div key={i} className="tut-box" style={{ left: b.x - 4, top: b.y - 4, width: b.w + 8, height: b.h + 8 }} />
      ))}
      {points.map((p, i) => (
        <div key={i} className="tut-mark" style={{ left: p.x, top: p.y }}>
          <span className="tut-ring" />
          <span className="tut-arrow" />
        </div>
      ))}
    </div>
  );
}

export function TutorialCard({ shell }: { shell: Shell }) {
  const tut = shell.tutorial;
  useSyncExternalStore(tut.subscribe, () => tut.version);
  if (!tut.active || shell.screen !== 'playing') return null;
  const last = tut.step === tut.total - 1;
  return (
    <>
    <TutorialSpotlight shell={shell} />
    <div className={`tutorial panel ${tut.completed ? 'done' : ''}`} role="status">
      <div className="row between tut-head">
        <span className="tut-kicker">
          <GraduationCap size={13} />
          {t('tut.title')} {tut.step + 1}/{tut.total}
        </span>
        <button className="icon" title={t('tut.quit')} aria-label={t('tut.quit')} onClick={() => tut.stop()}>
          <X size={14} />
        </button>
      </div>
      <h3>
        {tut.completed && <Check size={16} />}
        {t(`tut.${tut.id}.h`)}
      </h3>
      <p>{emphasise(t(`tut.${tut.id}`))}</p>
      <div className="row end">
        {tut.manual ? (
          <button className="primary" onClick={() => tut.next()}>
            {last ? t('tut.finish') : t('tut.ok')}
            <ChevronRight size={14} />
          </button>
        ) : tut.completed ? (
          <span className="tut-ok">{t('tut.done')}</span>
        ) : (
          <button onClick={() => tut.next()}>
            {t('tut.skip')}
            <ChevronRight size={14} />
          </button>
        )}
      </div>
    </div>
    </>
  );
}

function PauseMenu({ shell }: { shell: Shell }) {
  return (
    <div className="modal">
      <nav className="menu panel">
        <h2>{t('pause.title')}</h2>
        <button className="primary" autoFocus onClick={() => shell.resume()}>
          <Play size={16} />
          {t('pause.resume')}
        </button>
        <button onClick={() => void shell.saveNew()}>
          <Save size={16} />
          {t('pause.save')}
        </button>
        <button onClick={() => shell.openPanel('load')}>
          <FolderOpen size={16} />
          {t('menu.load')}
        </button>
        <button onClick={() => shell.openPanel('settings')}>
          <Gear size={16} />
          {t('menu.settings')}
        </button>
        <button onClick={() => shell.mainMenu()}>
          <LogOut size={16} />
          {t('pause.mainMenu')}
        </button>
        <div className="muted hint">{t('pause.quickHint')}</div>
      </nav>
    </div>
  );
}

function CampaignPanel({ shell }: { shell: Shell }) {
  return (
    <div className="modal">
      <div className="panel card campaign">
        <h2>
          <MapIcon size={16} />
          {t('menu.campaign')}
        </h2>
        <ol className="missions">
          {MISSION_IDS.map((id, i) => {
            const open = shell.missionUnlocked(id);
            const won = shell.settings.completed.includes(id);
            return (
              <li key={id}>
                <button className={`mission-row ${won ? 'won' : ''}`} disabled={!open} onClick={() => shell.openMission(id)}>
                  <span className="mission-n">{i + 1}</span>
                  <span className="mission-text">
                    <b>{t(`brief.${id}.title`)}</b>
                    <span className="muted">{open ? t(`brief.${id}.tag`) : t('campaign.locked')}</span>
                  </span>
                  {won ? <CircleCheck size={16} className="ok" /> : open ? <ChevronRight size={16} /> : <Lock size={14} />}
                </button>
              </li>
            );
          })}
        </ol>
        <div className="row end">
          <button className="primary" onClick={() => shell.openPanel(null)}>
            <Undo2 size={14} />
            {t('menu.back')}
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsPanel({ shell }: { shell: Shell }) {
  const s = shell.settings;
  const set = (patch: Partial<Settings>) => shell.applySettings({ ...s, ...patch });
  return (
    <div className="modal">
      <div className="panel card settings">
        <h2>
          <Gear size={16} />
          {t('settings.title')}
        </h2>
        <label>
          <span>{t('settings.volume')}</span>
          <input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => set({ volume: Number(e.target.value) })} />
          <span className="muted">{Math.round(s.volume * 100)}%</span>
        </label>
        <label>
          <span>{t('settings.music')}</span>
          <input type="range" min={0} max={1} step={0.05} value={s.musicVolume} onChange={(e) => set({ musicVolume: Number(e.target.value) })} />
          <span className="muted">{Math.round(s.musicVolume * 100)}%</span>
        </label>
        <label>
          <span>{t('settings.language')}</span>
          <select value={s.locale} onChange={(e) => set({ locale: e.target.value as Locale })}>
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_NAMES[l]}
              </option>
            ))}
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
            <Undo2 size={14} />
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
        <h2>
          <Save size={16} />
          {t('load.title')}
        </h2>
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
                <button onClick={() => void shell.exportSlot(m.slot)}>
                  <Download size={13} />
                  {t('load.export')}
                </button>
                <button className="danger" onClick={() => void shell.deleteSlot(m.slot)}>
                  <Trash2 size={13} />
                  {t('load.delete')}
                </button>
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
          <button onClick={() => file.current?.click()}>
            <Upload size={13} />
            {t('load.import')}
          </button>
          <button className="primary" onClick={() => shell.openPanel(null)}>
            <Undo2 size={14} />
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
