import { useEffect, useState, useSyncExternalStore } from 'react';
import { clockHours, daylight, RISK_POLICIES, SOLDIER_STRIDE, SoldierField, STANCES, STRUCTURES, STRUCTURE_KINDS, TICK_HZ, type Frame, type SquadView } from '@vazante/shared';
import type { GameRenderer } from '@vazante/view3d';
import type { GameClient } from '../client.ts';
import type { InputController } from '../input.ts';
import { t } from '../i18n.ts';
import type { Shell } from '../shell.ts';
import { ShellOverlay } from './Shell.tsx';
import { Minimap } from './Minimap.tsx';

interface Props {
  client: GameClient;
  input: InputController;
  view: GameRenderer;
  shell: Shell;
}

export function App({ client, input, view, shell }: Props) {
  const state = useSyncExternalStore(client.subscribe, client.getState);
  useSyncExternalStore(shell.subscribe, () => shell.version);
  const [, force] = useState(0);
  useEffect(() => input.subscribe(() => force((n) => n + 1)), [input]);
  const [band, setBand] = useState(view.rig.band);
  useEffect(() => {
    const id = setInterval(() => setBand(view.rig.band), 200);
    return () => clearInterval(id);
  }, [view]);

  const f = state.frame;
  if (!f) return <div className="boot">{t('boot.loading')}</div>;

  const selected = f.squads.filter((q) => state.selected.includes(q.id));
  const seed = state.map?.seed ?? 1;
  if (shell.screen === 'menu') return <ShellOverlay shell={shell} seed={seed} />;
  const ended = f.mission && (f.mission.phase === 'won' || f.mission.phase === 'lost');
  return (
    <>
      <div className="hud">
      <TopBar frame={f} limited={state.limited} band={input.inDirect ? 'direct' : band} />
      {!input.inDirect && (
        <div className="leftcol">
          {f.mission && <MissionPanel frame={f} />}
          <SquadList frame={f} selected={state.selected} onSelect={(id) => input.select([id])} onCenter={(q) => view.rig.centerOn(q.anchorX, q.anchorY)} />
          <VehicleList frame={f} selected={state.vehicle} onSelect={(id) => input.selectVehicle(id)} onCenter={(x, y) => view.rig.centerOn(x, y)} />
          <DistrictList frame={f} />
        </div>
      )}
      {!input.inDirect && <Alerts alerts={state.alerts} onJump={(x, y) => view.rig.centerOn(x, y)} />}
      {!input.inDirect && (
        <div className="bottomcol">
          <BuildPanel frame={f} input={input} />
          {state.vehicle !== null ? <VehiclePanel frame={f} id={state.vehicle} input={input} /> : <SelectionPanel squads={selected} frame={f} input={input} />}
        </div>
      )}
      {input.inDirect && <DirectHud frame={f} />}
      {!input.inDirect && <Minimap client={client} view={view} />}
      {input.helpVisible && !input.inDirect && (
        <div className="help panel">
          <b>{t('help.title')}</b>
          <pre>{t('help.body')}</pre>
        </div>
      )}
      {ended && shell.screen === 'playing' && <Summary frame={f} shell={shell} seed={seed} />}
      <ShellOverlay shell={shell} seed={seed} />
      </div>
      {input.box && <div className="box" style={boxStyle(input.box)} />}
    </>
  );
}

function MissionPanel({ frame }: { frame: Frame }) {
  const m = frame.mission!;
  const base = frame.bases.find((b) => b.kind === 'base');
  const depot = frame.bases.find((b) => b.kind === 'depot');
  const hpPct = Math.round((100 * m.commandPostHp) / m.commandPostMaxHp);
  let waveLine = t('mission.waves.locked');
  if (m.phase === 'defend' || m.phase === 'won') {
    if (m.waveState === 'warning') waveLine = t('mission.waves.warning').replace('{n}', String(m.wave + 1)).replace('{s}', String(m.secondsToWave));
    else if (m.waveState === 'active') waveLine = t('mission.waves.active').replace('{n}', String(m.wave)).replace('{z}', String(m.waveZombies));
    else waveLine = t('mission.waves.calm').replace('{n}', String(m.wave));
  }
  return (
    <div className="mission panel">
      <b>{t('mission.title')}</b>
      <div className={m.cargoDelivered ? 'obj done' : 'obj'}>
        {m.cargoDelivered ? '✓' : '1.'} {t('mission.fetch').replace('{depot}', depot?.name ?? '').replace('{base}', base?.name ?? '')}
      </div>
      <div className={m.phase === 'won' ? 'obj done' : m.phase === 'defend' ? 'obj' : 'obj muted'}>
        {m.phase === 'won' ? '✓' : '2.'} {t('mission.defend').replace('{w}', String(m.waves))} · {waveLine}
      </div>
      <div className="row muted">
        {t('mission.civilians')} {m.civilians}/{m.civiliansMax} · {t('mission.post')} {hpPct}%
      </div>
      <div className="bar">
        <div style={{ width: `${hpPct}%` }} />
      </div>
    </div>
  );
}

function VehicleList({ frame, selected, onSelect, onCenter }: { frame: Frame; selected: number | null; onSelect: (id: number) => void; onCenter: (x: number, y: number) => void }) {
  if (frame.vehicles.length === 0) return null;
  return (
    <div className="squads panel">
      <b>{t('vehicles.title')}</b>
      {frame.vehicles.map((v) => (
        <div key={v.id} className={`squad ${selected === v.id ? 'sel' : ''}`} onClick={() => onSelect(v.id)} onDoubleClick={() => onCenter(v.x, v.y)}>
          <div>
            {t('vehicle.truck')} <span className="muted">{t(`vstate.${v.state}`)}</span>
          </div>
          <div className="muted">
            ♥ {Math.max(0, Math.round(v.hp))} · ▮ {v.cargoAmmo} · ▦ {v.cargoMaterials}
          </div>
        </div>
      ))}
    </div>
  );
}

function DistrictList({ frame }: { frame: Frame }) {
  if (frame.districts.length < 2) return null;
  return (
    <div className="squads panel districts">
      <b>{t('districts.title')}</b>
      {frame.districts.map((d) => (
        <div key={d.id} className="district">
          <span className={`dot ${d.state}`} /> {d.name} <span className="muted">{t(`dstate.${d.state}`)} · {d.control}%</span>
        </div>
      ))}
    </div>
  );
}

function VehiclePanel({ frame, id, input }: { frame: Frame; id: number; input: InputController }) {
  const v = frame.vehicles.find((x) => x.id === id);
  if (!v) return <div className="selection panel muted">{t('sel.none')}</div>;
  const cs = 4;
  const here = frame.bases.find((b) => v.x >= b.x0 * cs && v.x < (b.x1 + 1) * cs && v.y >= b.y0 * cs && v.y < (b.y1 + 1) * cs);
  const dead = v.state === 'destroyed';
  return (
    <div className="selection panel">
      <div className="row">
        <b>{t('vehicle.truck')}</b>
        <span className="muted">
          ♥ {Math.max(0, Math.round(v.hp))}/{v.maxHp} · ▮ {v.cargoAmmo} · ▦ {v.cargoMaterials} · {t(`vstate.${v.state}`)}
          {here ? ` · ${here.name}` : ''}
        </span>
      </div>
      {!dead && (
        <>
          <div className="row">
            <span className="muted">{t('convoy.policy')}</span>
            {RISK_POLICIES.map((p) => (
              <button key={p} className={v.policy === p ? 'on' : ''} title={t(`policy.${p}.hint`)} onClick={() => input.setVehiclePolicy(p)}>
                {t(`policy.${p}`)}
              </button>
            ))}
          </div>
          <div className="row">
            {frame.bases.map((b) => (
              <button key={b.id} disabled={here?.id === b.id} onClick={() => input.sendConvoy(b.id, v.policy)}>
                → {b.name}
              </button>
            ))}
            {v.state !== 'idle' && <button onClick={() => input.stopVehicle()}>{t('convoy.stop')}</button>}
            {here && v.state === 'idle' && (
              <>
                <button disabled={here.ammo === 0} onClick={() => input.loadVehicle(1000, 0)}>
                  {t('convoy.loadAmmo')}
                </button>
                <button disabled={here.materials === 0} onClick={() => input.loadVehicle(0, 100)}>
                  {t('convoy.loadMat')}
                </button>
                <button disabled={v.cargoAmmo + v.cargoMaterials === 0} onClick={() => input.loadVehicle(-v.cargoAmmo, -v.cargoMaterials)}>
                  {t('convoy.unload')}
                </button>
              </>
            )}
          </div>
          <div className="row muted hint">{t('convoy.hint')}</div>
        </>
      )}
    </div>
  );
}

function Summary({ frame, shell, seed }: { frame: Frame; shell: Shell; seed: number }) {
  const m = frame.mission!;
  const won = m.phase === 'won';
  const lost = frame.soldiers.length / SOLDIER_STRIDE - frame.stats.soldiersAlive;
  const restart = (next: boolean) => shell.restart(seed + (next ? 1 : 0), true);
  return (
    <div className="summary">
      <div className="panel card">
        <h1 className={won ? 'won' : 'lost'}>{won ? t('summary.won') : t('summary.lost')}</h1>
        {!won && <p className="muted">{t(`loss.${m.reason}`)}</p>}
        <table>
          <tbody>
            <tr>
              <td>{t('summary.civilians')}</td>
              <td>
                {m.civilians}/{m.civiliansMax}
              </td>
            </tr>
            <tr>
              <td>{t('summary.cargo')}</td>
              <td>{m.cargoDelivered ? t('summary.yes') : t('summary.no')}</td>
            </tr>
            <tr>
              <td>{t('summary.waves')}</td>
              <td>
                {m.wave}/{m.waves}
              </td>
            </tr>
            <tr>
              <td>{t('summary.casualties')}</td>
              <td>{lost}</td>
            </tr>
            <tr>
              <td>{t('summary.killed')}</td>
              <td>{frame.stats.zombiesKilled}</td>
            </tr>
            <tr>
              <td>{t('summary.time')}</td>
              <td>{fmt(frame.tick)}</td>
            </tr>
          </tbody>
        </table>
        <div className="row">
          <button onClick={() => restart(false)}>{t('summary.retry')}</button>
          <button onClick={() => restart(true)}>{t('summary.next')}</button>
          <button onClick={() => shell.restart(seed, false)}>{t('pause.mainMenu')}</button>
        </div>
      </div>
    </div>
  );
}

function TopBar({ frame, limited, band }: { frame: Frame; limited: boolean; band: string }) {
  const secs = Math.floor(frame.tick / TICK_HZ);
  const clock = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  return (
    <div className="topbar panel">
      <span className="title">{t('app.title')}</span>
      <span>
        {t('top.time')} {clock}
      </span>
      <DayClock tick={frame.tick} />
      <span className={frame.speed === 0 ? 'paused' : ''}>{frame.speed === 0 ? t('top.paused') : `${frame.speed}x`}</span>
      {limited && <span className="warn">{t('top.limited')}</span>}
      <span>
        {t('top.soldiers')} {frame.stats.soldiersAlive}
      </span>
      <span>
        {t('top.zombies')} {frame.stats.zombiesAlive}
      </span>
      <span>
        {t('top.killed')} {frame.stats.zombiesKilled}
      </span>
      <span>
        {t('top.ammo')} {frame.stats.ammoTotal}
      </span>
      {frame.bases[0] && (
        <span className={frame.bases[0].ammo < 200 ? 'warn' : ''}>
          {t('top.baseAmmo')} {frame.bases[0].ammo}
        </span>
      )}
      <span className="band">{t(`band.${band}`)}</span>
      <span className="muted">{t('help.toggle')}</span>
    </div>
  );
}

function DayClock({ tick }: { tick: number }) {
  const h = clockHours(tick);
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const day = daylight(h);
  return (
    <span className={day < 0.5 ? 'night' : ''} title={t(day < 0.5 ? 'top.night' : 'top.day')}>
      {day < 0.5 ? '☾' : '☀'} {String(hh).padStart(2, '0')}:{String(mm).padStart(2, '0')}
    </span>
  );
}

function squadStats(frame: Frame, q: SquadView) {
  let hp = 0;
  let ammo = 0;
  for (let i = 0; i < frame.soldiers.length / SOLDIER_STRIDE; i++) {
    const o = i * SOLDIER_STRIDE;
    if (frame.soldiers[o + SoldierField.Squad] !== q.id) continue;
    if (frame.soldiers[o + SoldierField.Condition] > 1) continue;
    hp += frame.soldiers[o + SoldierField.Hp];
    ammo += frame.soldiers[o + SoldierField.Ammo];
  }
  return { hp: q.alive ? Math.round(hp / q.alive) : 0, ammo };
}

function SquadList({ frame, selected, onSelect, onCenter }: { frame: Frame; selected: number[]; onSelect: (id: number) => void; onCenter: (q: SquadView) => void }) {
  return (
    <div className="squads panel">
      <b>{t('squads.title')}</b>
      {frame.squads.map((q) => {
        const s = squadStats(frame, q);
        return (
          <div
            key={q.id}
            className={`squad ${selected.includes(q.id) ? 'sel' : ''} ${q.alive === 0 ? 'dead' : ''}`}
            onClick={() => onSelect(q.id)}
            onDoubleClick={() => onCenter(q)}
          >
            <div className="row">
              <span className={`dot c${(q.id - 1) % 4}`} /> {q.name}
              <span className="muted">
                {q.alive}/{q.members.length} {t('squad.alive')}
              </span>
            </div>
            <div className="row muted">
              ♥ {s.hp} · ▮ {s.ammo} · {t(`order.${q.order.kind}`)} · {t(`stance.${q.stance}`)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Alerts({ alerts, onJump }: { alerts: GameClient['state']['alerts']; onJump: (x: number, y: number) => void }) {
  if (alerts.length === 0) return null;
  return (
    <div className="alerts panel">
      <b>{t('alerts.title')}</b>
      {alerts.slice(0, 8).map((a) => (
        <div key={a.id} className={`alert a-${a.type}`} onClick={() => a.x !== undefined && onJump(a.x, a.y!)}>
          <span className="muted">{fmt(a.tick)}</span> {alertText(a)}
        </div>
      ))}
    </div>
  );
}

function SelectionPanel({ squads, frame, input }: { squads: SquadView[]; frame: Frame; input: InputController }) {
  if (squads.length === 0) return <div className="selection panel muted">{t('sel.none')}</div>;
  const q = squads[0];
  const s = squadStats(frame, q);
  return (
    <div className="selection panel">
      <div className="row">
        <b>{squads.map((x) => x.name).join(', ')}</b>
        <span className="muted">
          ♥ {s.hp} · ▮ {s.ammo} · {t(`order.${q.order.kind}`)}
        </span>
      </div>
      <div className="row">
        {STANCES.map((st, i) => (
          <button key={st} className={q.stance === st ? 'on' : ''} title={t(`tip.stance.${st}`)} onClick={() => input.setStance(st)}>
            {'ZXCV'[i]} · {t(`stance.${st}`)}
          </button>
        ))}
        <button title={t('tip.formation')} onClick={() => input.cycleFormation()}>F · {t(`formation.${q.formation}`)}</button>
        <button title={t('tip.direct')} onClick={() => input.toggleDirect()}>{t('sel.direct')}</button>
      </div>
    </div>
  );
}

function BuildPanel({ frame, input }: { frame: Frame; input: InputController }) {
  const base = frame.bases[0];
  const tool = input.build;
  return (
    <div className="build panel">
      <div className="row">
        <b>{t('build.title')}</b>
        {base && (
          <span className="muted">
            {base.name} · {t('build.stock')} {base.materials} · {t('build.ammo')} {base.ammo}
          </span>
        )}
      </div>
      <div className="row">
        {STRUCTURE_KINDS.map((k, i) => (
          <button
            key={k}
            className={tool.kind === k ? 'on' : ''}
            title={`${t(`tip.${k}`)}\n${t('tip.stats').replace('{hp}', String(STRUCTURES[k].hp)).replace('{h}', String(STRUCTURES[k].height)).replace('{m}', String(STRUCTURES[k].materials))}`}
            onClick={() => input.setBuild(tool.kind === k ? null : k)} disabled={!base || base.materials < STRUCTURES[k].materials}>
            {i + 1} · {t(`structure.${k}`)} <span className="muted">{STRUCTURES[k].materials}</span>
          </button>
        ))}
      </div>
      <div className={`row hint ${tool.reason ? 'warn' : 'muted'}`}>{tool.active ? (tool.reason ? t(`reason.${tool.reason}`) : t('build.hint')) : t('build.edit')}</div>
    </div>
  );
}

function DirectHud({ frame }: { frame: Frame }) {
  const id = frame.directSoldier;
  let hp = 0;
  let mag = 0;
  let total = 0;
  for (let i = 0; i < frame.soldiers.length / SOLDIER_STRIDE; i++) {
    const o = i * SOLDIER_STRIDE;
    if (frame.soldiers[o + SoldierField.Id] !== id) continue;
    hp = frame.soldiers[o + SoldierField.Hp];
    mag = frame.soldiers[o + SoldierField.Magazine];
    total = frame.soldiers[o + SoldierField.Ammo];
  }
  return (
    <>
      <div className="crosshair">+</div>
      <div className="direct panel">
        ♥ {Math.max(0, Math.round(hp))} · ▮ {mag} / {total - mag}
        <div className="muted">{document.pointerLockElement ? t('direct.exit') : t('direct.lock')}</div>
      </div>
    </>
  );
}

function alertText(a: GameClient['state']['alerts'][number]): string {
  const base = t(`alert.${a.type}`)
    .replace('{n}', String(a.value ?? ''))
    .replace('{s}', a.reason ?? '');
  switch (a.type) {
    case 'structure_built':
    case 'structure_destroyed':
      return `${base} (${t(`structure.${a.reason}`)})`;
    case 'convoy_blocked':
      return `${base} (${t(`policy.${a.reason}`)})`;
    case 'district_lost':
    case 'district_held':
      return `${base}: ${a.reason}`;
    case 'cargo_delivered':
      return `${base}: ▮ ${a.value} · ▦ ${a.reason}`;
    case 'mission_lost':
      return `${base}: ${t(`loss.${a.reason}`)}`;
    case 'wave_warning':
    case 'wave_started':
    case 'mission_won':
      return base;
    default:
      return a.reason ? `${base} (${t(`reason.${a.reason}`)})` : base;
  }
}

function fmt(tick: number): string {
  const s = Math.floor(tick / TICK_HZ);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function boxStyle(b: { x0: number; y0: number; x1: number; y1: number }) {
  return { left: Math.min(b.x0, b.x1), top: Math.min(b.y0, b.y1), width: Math.abs(b.x1 - b.x0), height: Math.abs(b.y1 - b.y0) };
}
