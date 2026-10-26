import { useEffect, useState, useSyncExternalStore } from 'react';
import { SOLDIER_STRIDE, SoldierField, STANCES, STRUCTURES, STRUCTURE_KINDS, TICK_HZ, type Frame, type SquadView } from '@vazante/shared';
import type { GameRenderer } from '@vazante/view3d';
import type { GameClient } from '../client.ts';
import type { InputController } from '../input.ts';
import { t } from '../i18n.ts';

interface Props {
  client: GameClient;
  input: InputController;
  view: GameRenderer;
}

export function App({ client, input, view }: Props) {
  const state = useSyncExternalStore(client.subscribe, client.getState);
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
  return (
    <>
      <TopBar frame={f} limited={state.limited} band={input.inDirect ? 'direct' : band} />
      {!input.inDirect && <SquadList frame={f} selected={state.selected} onSelect={(id) => input.select([id])} onCenter={(q) => view.rig.centerOn(q.anchorX, q.anchorY)} />}
      {!input.inDirect && <Alerts alerts={state.alerts} onJump={(x, y) => view.rig.centerOn(x, y)} />}
      {!input.inDirect && <SelectionPanel squads={selected} frame={f} input={input} />}
      {!input.inDirect && <BuildPanel frame={f} input={input} />}
      {input.inDirect && <DirectHud frame={f} />}
      {input.box && <div className="box" style={boxStyle(input.box)} />}
      {input.helpVisible && !input.inDirect && (
        <div className="help panel">
          <b>{t('help.title')}</b>
          <pre>{t('help.body')}</pre>
        </div>
      )}
    </>
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
      <span className="band">{t(`band.${band}`)}</span>
      <span className="muted">{t('help.toggle')}</span>
    </div>
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
          <span className="muted">{fmt(a.tick)}</span> {t(`alert.${a.type}`)}
          {a.reason ? ` (${t(a.type.startsWith('structure_') ? `structure.${a.reason}` : `reason.${a.reason}`)})` : ''}
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
          <button key={st} className={q.stance === st ? 'on' : ''} onClick={() => input.setStance(st)}>
            {'ZXCV'[i]} · {t(`stance.${st}`)}
          </button>
        ))}
        <button onClick={() => input.cycleFormation()}>F · {t(`formation.${q.formation}`)}</button>
        <button onClick={() => input.toggleDirect()}>{t('sel.direct')}</button>
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
          <button key={k} className={tool.kind === k ? 'on' : ''} onClick={() => input.setBuild(tool.kind === k ? null : k)} disabled={!base || base.materials < STRUCTURES[k].materials}>
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

function fmt(tick: number): string {
  const s = Math.floor(tick / TICK_HZ);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function boxStyle(b: { x0: number; y0: number; x1: number; y1: number }) {
  return { left: Math.min(b.x0, b.x1), top: Math.min(b.y0, b.y1), width: Math.abs(b.x1 - b.x0), height: Math.abs(b.y1 - b.y0) };
}
