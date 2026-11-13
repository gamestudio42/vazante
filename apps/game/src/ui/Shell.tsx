import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Calendar, Check, ChevronRight, CircleCheck, Dices, Flag, Lock, Map as MapIcon, Download, FolderOpen, GraduationCap, LogOut, Moon, Play, Plus, RefreshCw, Save, Settings as Gear, Skull, Shield, Trash2, Undo2, Upload, X } from 'lucide-react';
import { DIFFICULTY_IDS, MISSION_IDS, OPERATION, TICK_HZ, type MissionId, type RequisitionId, type SaveMeta } from '@vazante/shared';
import { LOCALES, LOCALE_NAMES, t, type Locale } from '../i18n.ts';
import type { Settings } from '../settings.ts';
import type { Shell } from '../shell.ts';
import { rankForXp } from '@vazante/shared';
import { living, type Roster, type Trooper } from '../roster.ts';
import { canDeploy, missionTweaks, scoreOf, type OperationRun } from '../operation.ts';
import { soldierLabel } from './soldier.ts';

/** Menus that cover the game: main menu, campaign, briefing, pause, settings, load. */
export function ShellOverlay({ shell, seed }: { shell: Shell; seed: number }) {
  useSyncExternalStore(shell.subscribe, () => shell.version);
  const { screen, panel } = shell;
  return (
    <>
      {panel === 'settings' && <SettingsPanel shell={shell} />}
      {panel === 'load' && <LoadPanel shell={shell} />}
      {panel === 'campaign' && <CampaignPanel shell={shell} />}
      {panel === 'operation' && <OperationPanel shell={shell} />}
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
  const survivalBest = shell.settings.survivalBest[shell.settings.difficulty];
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
        <button onClick={() => shell.openPanel('operation')}>
          <Flag size={16} />
          {t('op.title')}
          <span className="muted">
            {' '}
            · {shell.operation.run?.status === 'active' ? t('op.mission').replace('{n}', String(shell.operation.run.index + 1)).replace('{t}', String(OPERATION.missions)) : t('op.tag')}
          </span>
        </button>
        <button onClick={() => shell.openSurvival()}>
          <Moon size={16} />
          {t('menu.survival')}
          <span className="muted">
            {' '}
            · {survivalBest ? t('menu.survival.best').replace('{n}', String(survivalBest.nights)) : t('menu.survival.tag')}
          </span>
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
        <div className="row muted city" title={t('menu.cityHint')}>
          {t('menu.city')} #{seed}
          <label>
            {t('menu.fixCity')}
            <input
              type="number"
              min={1}
              placeholder={t('menu.cityRandom')}
              value={shell.settings.fixedCity ?? ''}
              onChange={(e) => {
                const n = Math.floor(Number(e.target.value));
                shell.applySettings({ ...shell.settings, fixedCity: n > 0 ? n : undefined });
              }}
            />
          </label>
          <button onClick={() => shell.restart(shell.settings.fixedCity ?? 1 + Math.floor(Math.random() * 999_999), false)}>
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
  const survival = shell.scenario === 'survival';
  const id: MissionId = survival ? 'survival' : (MISSION_IDS as readonly string[]).includes(shell.scenario) ? (shell.scenario as MissionId) : 'last_convoy';
  const run = shell.inOperation ? shell.operation.run : null;
  const kicker = run
    ? `${t('op.mission').replace('{n}', String(run.index + 1)).replace('{t}', String(run.missions.length))}${run.daily ? ` · ${t('op.daily')}` : ''}`
    : city ? t('menu.experimental') : survival ? t('brief.survival.kicker') : t('campaign.mission').replace('{n}', String(MISSION_IDS.indexOf(id) + 1)).replace('{t}', String(MISSION_IDS.length));
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
        {run && <OperationBrief run={run} />}
        {!run && (
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
        )}
        <div className="row between">
          {run ? (
            <span />
          ) : (
            <label className="tut-toggle">
              <input type="checkbox" checked={shell.withTutorial} onChange={(e) => shell.setTutorial(e.target.checked)} />
              <GraduationCap size={14} />
              {t('brief.tutorial')}
            </label>
          )}
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
        <RosterView shell={shell} />
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

/** What the Operation brings to this mission: its threat, its requisitions and the task force. */
function OperationBrief({ run }: { run: OperationRun }) {
  const tw = missionTweaks(run);
  const R = OPERATION.requisitions;
  const notes = [t('op.threat').replace('{x}', (tw.zombieScale ?? 1).toFixed(2))];
  if (run.next.ammo) notes.push(t('req.ammo.desc').replace('{n}', String(run.next.ammo)));
  if (run.next.materials) notes.push(t('req.materials.desc').replace('{n}', String(run.next.materials)));
  if (run.next.recon) notes.push(t('req.recon.desc').replace('{n}', String(Math.round(R.recon * 100))));
  if (run.next.recruitXp) notes.push(t('req.veterans.desc'));
  return (
    <div className="op-brief">
      <OperationTrack run={run} />
      <span className="muted">{notes.join(' · ')}</span>
    </div>
  );
}

const REQ_AMOUNT: Record<RequisitionId, number> = {
  ammo: OPERATION.requisitions.ammo,
  materials: OPERATION.requisitions.materials,
  recon: Math.round(OPERATION.requisitions.recon * 100),
  drill: OPERATION.requisitions.drillXp,
  veterans: 0,
};

/** The requisitions offered after a won mission; one must be taken before the next mission. */
export function RequisitionChoice({ shell, run }: { shell: Shell; run: OperationRun }) {
  if (run.offers.length === 0) return null;
  return (
    <div className="requisitions" role="group" aria-label={t('op.choose')}>
      <div className="troop-head">{t('op.choose')}</div>
      {run.offers.map((r) => (
        <button key={r} className="requisition" onClick={() => shell.chooseRequisition(r)}>
          <b>{t(`req.${r}`)}</b>
          <span className="muted">{t(`req.${r}.desc`).replace('{n}', String(REQ_AMOUNT[r]))}</span>
        </button>
      ))}
    </div>
  );
}

/** The run's missions as numbered marks: won, lost, next. */
export function OperationTrack({ run }: { run: OperationRun }) {
  return (
    <ol className="op-track">
      {run.missions.map((m, i) => {
        const log = run.log[i];
        return (
          <li key={m} className={log?.won ? 'done' : log ? 'lost' : i === run.index && run.status === 'active' ? 'now' : ''} title={t(`brief.${m}.title`)}>
            {i + 1}
          </li>
        );
      })}
    </ol>
  );
}

/** Operation: today's daily run or a random one, the run in progress, and the bests. */
function OperationPanel({ shell }: { shell: Shell }) {
  const { run, best, daily } = shell.operation;
  const today = daily[shell.today];
  const active = run?.status === 'active' ? run : null;
  const start = (isDaily: boolean) => {
    if (active && !confirm(t('op.replaceConfirm'))) return;
    shell.startOperation(isDaily);
  };
  return (
    <div className="modal">
      <div className="panel card campaign operation">
        <h2>
          <Flag size={16} />
          {t('op.title')}
        </h2>
        <p className="muted">{t('op.body')}</p>
        {active ? (
          <div className="op-run">
            <OperationRunView run={active} />
            <RequisitionChoice shell={shell} run={active} />
            <div className="row">
              {canDeploy(active) && (
                <button className="primary" onClick={() => shell.deployOperation()}>
                  <Play size={14} />
                  {t('op.continue').replace('{m}', t(`brief.${active.missions[active.index]}.title`))}
                </button>
              )}
              <button
                onClick={() => {
                  if (confirm(t('op.abandonConfirm'))) shell.abandonOperation();
                }}
              >
                <X size={14} />
                {t('op.abandon')}
              </button>
            </div>
          </div>
        ) : (
          <p className="muted">{t('op.none')}</p>
        )}
        <div className="op-start">
          <button className={active ? '' : 'primary'} onClick={() => start(true)}>
            <Calendar size={16} />
            <span className="mission-text">
              <b>{t('op.daily')}</b>
              <span className="muted">{t('op.dailyHint').replace('{d}', shell.today)}</span>
            </span>
            {today && <span className="op-score">{today.score}</span>}
          </button>
          <button onClick={() => start(false)}>
            <Dices size={16} />
            <span className="mission-text">
              <b>{t('op.random')}</b>
              <span className="muted">
                {t('op.randomHint')} · {t(`diff.${shell.settings.difficulty}`)}
              </span>
            </span>
          </button>
        </div>
        {best && (
          <p className="muted">
            {t('op.best')}: <b>{best.score}</b> · {best.missions}/{OPERATION.missions}
          </p>
        )}
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

/** Missions of a run with their results, its score and its task force. */
export function OperationRunView({ run }: { run: OperationRun }) {
  return (
    <>
      <ol className="missions op-missions">
        {run.missions.map((m, i) => {
          const log = run.log[i];
          return (
            <li key={m} className={`mission-row ${log?.won ? 'won' : log ? 'lost' : i === run.index ? 'now' : ''}`}>
              <span className="mission-n">{i + 1}</span>
              <span className="mission-text">
                <b>{t(`brief.${m}.title`)}</b>
                {log && (
                  <span className="muted">
                    {log.kills} {t('top.killed').toLowerCase()} · {t('op.fallen').replace('{n}', String(log.fallen))}
                  </span>
                )}
              </span>
              {log?.won ? <CircleCheck size={16} className="ok" /> : log ? <Skull size={14} /> : null}
            </li>
          );
        })}
      </ol>
      <p className="op-line">
        {t('op.score')}: <b>{scoreOf(run)}</b> · {t('roster.title')}: {living(run.roster).length}
        {run.roster.fallen.length > 0 && ` · ${t('op.fallen').replace('{n}', String(run.roster.fallen.length))}`}
      </p>
    </>
  );
}

/** The soldiers who carry over between missions, and the memorial of those who fell. */
function RosterView({ shell }: { shell: Shell }) {
  const r: Roster = shell.roster;
  const units = Object.entries(r.units).filter(([, u]) => u.some(Boolean));
  if (units.length === 0 && r.fallen.length === 0) return <p className="muted roster-empty">{t('roster.empty')}</p>;
  const label = (key: string) => {
    const [kind, n] = key.split(':');
    return `${t(`squadKind.${kind}`)}${Number(n) > 0 ? ` ${Number(n) + 1}` : ''}`;
  };
  return (
    <div className="roster">
      <h3>{t('roster.title')}</h3>
      {units.map(([key, u]) => (
        <div key={key} className="roster-unit">
          <span className="roster-kind">{label(key)}</span>
          <ul>
            {u
              .filter((x): x is Trooper => x !== null)
              .map((x) => (
                <li key={x.rid} title={t('roster.record').replace('{m}', String(x.missions)).replace('{k}', String(x.kills))}>
                  <b>{soldierLabel(rankForXp(x.xp), x.name)}</b>
                  <span className="muted">
                    {x.missions}·{x.kills}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ))}
      {r.fallen.length > 0 && (
        <>
          <h3>
            <Skull size={14} /> {t('roster.memorial')}
          </h3>
          <ul className="memorial">
            {r.fallen.slice(0, 12).map((x) => (
              <li key={`${x.rid}-${x.at}`}>
                <b>{soldierLabel(x.rank, x.name)}</b>
                <span className="muted">
                  {t(`roster.fate.${x.fate}`)} · {t(`brief.${x.mission}.title`)} · {x.kills}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="row">
        <button
          onClick={() => {
            if (confirm(t('roster.resetConfirm'))) shell.resetRoster();
          }}
        >
          <RefreshCw size={14} />
          {t('roster.reset')}
        </button>
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
        {shell.playtest && <PlaytestRow shell={shell} />}
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

/** Export or clear the local playtest log; the file is what testers send back. */
function PlaytestRow({ shell }: { shell: Shell }) {
  const rec = shell.playtest;
  const [count, setCount] = useState(rec?.sessions ?? 0);
  if (!rec) return null;
  return (
    <div className="playtest">
      <span>{t('settings.playtest')}</span>
      <p className="muted">{t('settings.playtestHint').replace('{n}', String(count))}</p>
      <div className="row">
        <button onClick={() => rec.exportFile()} disabled={count === 0}>
          <Download size={14} />
          {t('settings.playtestExport')}
        </button>
        <button
          onClick={() => {
            rec.clear();
            setCount(0);
          }}
          disabled={count === 0}
        >
          <Trash2 size={14} />
          {t('settings.playtestClear')}
        </button>
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
