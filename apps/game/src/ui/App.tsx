import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  ArrowRight,
  Ban,
  Biohazard,
  BrickWall,
  CircleCheck,
  Clock,
  Crosshair,
  DoorOpen,
  FastForward,
  Flag,
  Gamepad2,
  Hammer,
  Heart,
  Map as MapIcon,
  Moon,
  Package,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Shield,
  ShieldAlert,
  Skull,
  Square,
  Sun,
  Swords,
  Target,
  TriangleAlert,
  Truck,
  Undo2,
  Users,
  Boxes,
  Footprints,
  Siren,
  Hand,
  Brain,
  ShieldHalf,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import {
  clockHours,
  daylight,
  RISK_POLICIES,
  SOLDIER_STRIDE,
  SoldierCondition,
  SoldierField,
  STANCES,
  STRUCTURES,
  STRUCTURE_KINDS,
  TICK_HZ,
  type Frame,
  type RiskPolicy,
  type SimSpeed,
  type Stance,
  type StructureKind,
  type SquadView,
} from '@vazante/shared';
import type { GameRenderer } from '@vazante/view3d';
import type { GameClient } from '../client.ts';
import type { InputController } from '../input.ts';
import { t } from '../i18n.ts';
import type { Shell } from '../shell.ts';
import { ShellOverlay, TutorialCard } from './Shell.tsx';
import { Minimap } from './Minimap.tsx';

interface Props {
  client: GameClient;
  input: InputController;
  view: GameRenderer;
  shell: Shell;
}

const STANCE_ICON: Record<Stance, LucideIcon> = { hold: Hand, aggressive: Swords, defensive: Shield, withdraw: Undo2 };
const STRUCTURE_ICON: Record<StructureKind, LucideIcon> = { hesco: Boxes, wall: BrickWall, gate: DoorOpen, mg_nest: Crosshair, command_post: Flag };
const POLICY_ICON: Record<RiskPolicy, LucideIcon> = { push_through: FastForward, reroute: RotateCcw, halt: Square, return: Undo2 };
const SPEEDS: SimSpeed[] = [0, 1, 2, 4];

export function App({ client, input, view, shell }: Props) {
  const state = useHudState(client);
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
        <TopBar frame={f} limited={state.limited} band={input.inDirect ? 'direct' : band} onSpeed={(speed) => client.send({ type: 'set_speed', speed })} />
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
            <PanelHead icon={Radio}>{t('help.title')}</PanelHead>
            <pre>{t('help.body')}</pre>
          </div>
        )}
        {!ended && <TutorialCard shell={shell} />}
        {ended && shell.screen === 'playing' && <Summary frame={f} shell={shell} seed={seed} />}
        <ShellOverlay shell={shell} seed={seed} />
      </div>
      {input.box && <div className="box" style={boxStyle(input.box)} />}
    </>
  );
}

/** Frame-only HUD changes (numbers, bars) redraw at most this often; selection and alerts redraw at once. */
const HUD_MS = 200;

/**
 * The client publishes every simulation frame (10 to 40 a second). Re-rendering the whole HUD that
 * often costs layout and compositing on weak GPUs for numbers nobody reads that fast, so ordinary
 * frames are coalesced and anything the player just did goes through immediately.
 */
function useHudState(client: GameClient) {
  const [snap, setSnap] = useState(client.getState);
  useEffect(() => {
    let shown = client.getState();
    let last = 0;
    let timer = 0;
    const push = () => {
      timer = 0;
      last = performance.now();
      shown = client.getState();
      setSnap(shown);
    };
    const off = client.subscribe(() => {
      const s = client.getState();
      const urgent =
        !shown.frame ||
        s.selected !== shown.selected ||
        s.vehicle !== shown.vehicle ||
        s.alerts !== shown.alerts ||
        s.map !== shown.map ||
        s.limited !== shown.limited ||
        s.frame?.speed !== shown.frame.speed ||
        s.frame?.directSoldier !== shown.frame.directSoldier;
      if (urgent || performance.now() - last >= HUD_MS) {
        clearTimeout(timer);
        push();
      } else if (!timer) timer = window.setTimeout(push, HUD_MS - (performance.now() - last));
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [client]);
  return snap;
}

// ----- Building blocks -----

function PanelHead({ icon: Icon, children, extra }: { icon: LucideIcon; children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="phead">
      <Icon size={13} strokeWidth={2.2} />
      <b>{children}</b>
      {extra && <span className="phead-extra">{extra}</span>}
    </div>
  );
}

function Meter({ value, kind = 'hp', thin }: { value: number; kind?: 'hp' | 'ammo' | 'post' | 'wave' | 'morale'; thin?: boolean }) {
  const v = Math.max(0, Math.min(1, value));
  const level = kind === 'hp' || kind === 'post' || kind === 'morale' ? (v < 0.3 ? 'low' : v < 0.6 ? 'mid' : '') : kind === 'ammo' && v < 0.2 ? 'low' : '';
  return (
    <div className={`meter m-${kind} ${level} ${thin ? 'thin' : ''}`}>
      <div style={{ width: `${v * 100}%` }} />
    </div>
  );
}

function Stat({ icon: Icon, children, title, className }: { icon: LucideIcon; children: ReactNode; title?: string; className?: string }) {
  return (
    <span className={`stat ${className ?? ''}`} title={title}>
      <Icon size={12} strokeWidth={2.2} />
      {children}
    </span>
  );
}

function Key({ k }: { k: string }) {
  return <kbd>{k}</kbd>;
}

// ----- Top bar -----

function TopBar({ frame, limited, band, onSpeed }: { frame: Frame; limited: boolean; band: string; onSpeed: (s: SimSpeed) => void }) {
  const lowAmmo = frame.bases[0] && frame.bases[0].ammo < 200;
  return (
    <div className="topbar panel">
      <span className="brand">{t('app.title')}</span>
      <span className="sep" />
      <span className="chip" title={t('top.time')}>
        <Clock size={13} />
        {fmt(frame.tick)}
      </span>
      <DayClock tick={frame.tick} />
      <span className="speed" role="group" aria-label={t('top.time')}>
        {SPEEDS.map((s) => (
          <button key={s} className={frame.speed === s ? 'on' : ''} title={s === 0 ? `${t('top.paused')} (Space)` : `${s}x (F${s === 4 ? 3 : s})`} onClick={() => onSpeed(s === 0 && frame.speed === 0 ? 1 : s)}>
            {s === 0 ? <Pause size={12} /> : s === 1 ? <Play size={12} /> : `${s}x`}
          </button>
        ))}
      </span>
      {frame.speed === 0 && <span className="paused">{t('top.paused')}</span>}
      {limited && <span className="warn">{t('top.limited')}</span>}
      <span className="sep" />
      <span className="chip" title={t('top.soldiers')}>
        <Users size={13} />
        {frame.stats.soldiersAlive}
      </span>
      <span className="chip danger" title={t('top.zombies')}>
        <Biohazard size={13} />
        {frame.stats.zombiesAlive}
      </span>
      <span className="chip" title={t('top.killed')}>
        <Skull size={13} />
        {frame.stats.zombiesKilled}
      </span>
      <span className="chip" title={t('top.ammo')}>
        <Target size={13} />
        {frame.stats.ammoTotal}
      </span>
      {frame.bases[0] && (
        <span className={`chip ${lowAmmo ? 'warn' : ''}`} title={t('top.baseAmmo')}>
          <Package size={13} />
          {frame.bases[0].ammo}
        </span>
      )}
      <span className="sep" />
      <span className="band">
        {band === 'direct' ? <Gamepad2 size={13} /> : <MapIcon size={13} />}
        {t(`band.${band}`)}
      </span>
      <span className="muted helpkey">{t('help.toggle')}</span>
    </div>
  );
}

function DayClock({ tick }: { tick: number }) {
  const h = clockHours(tick);
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const night = daylight(h) < 0.5;
  return (
    <span className={`chip ${night ? 'night' : 'day'}`} title={t(night ? 'top.night' : 'top.day')}>
      {night ? <Moon size={13} /> : <Sun size={13} />}
      {String(hh).padStart(2, '0')}:{String(mm).padStart(2, '0')}
    </span>
  );
}

// ----- Left column -----

function MissionPanel({ frame }: { frame: Frame }) {
  const m = frame.mission!;
  const base = frame.bases.find((b) => b.kind === 'base');
  const depot = frame.bases.find((b) => b.kind === 'depot');
  const hp = m.commandPostHp / m.commandPostMaxHp;
  let waveLine = t('mission.waves.locked');
  if (m.phase === 'defend' || m.phase === 'won') {
    if (m.waveState === 'warning') waveLine = t('mission.waves.warning').replace('{n}', String(m.wave + 1)).replace('{s}', String(m.secondsToWave));
    else if (m.waveState === 'active') waveLine = t('mission.waves.active').replace('{n}', String(m.wave)).replace('{z}', String(m.waveZombies));
    else waveLine = t('mission.waves.calm').replace('{n}', String(m.wave));
  }
  const waveDone = m.phase === 'won';
  const defending = m.phase === 'defend';
  return (
    <div className="mission panel">
      <PanelHead icon={Flag}>{t('mission.title')}</PanelHead>
      <Objective done={m.cargoDelivered} active={!m.cargoDelivered}>
        {t('mission.fetch').replace('{depot}', depot?.name ?? '').replace('{base}', base?.name ?? '')}
      </Objective>
      <Objective done={waveDone} active={defending}>
        {t('mission.defend').replace('{w}', String(m.waves))}
        <div className={`wave ${m.waveState === 'warning' && defending ? 'warn' : m.waveState === 'active' && defending ? 'danger' : 'muted'}`}>
          {m.waveState === 'warning' && defending && <Siren size={12} />}
          {waveLine}
        </div>
        <div className="pips waves">
          {Array.from({ length: m.waves }, (_, i) => (
            <span key={i} className={i < m.wave - (m.waveState === 'active' ? 1 : 0) || waveDone ? 'done' : i === m.wave - 1 && m.waveState === 'active' ? 'now' : ''} />
          ))}
        </div>
      </Objective>
      <div className="mrow">
        <Stat icon={Users} title={t('mission.civilians')}>
          {t('mission.civilians')} <b>{m.civilians}</b>/{m.civiliansMax}
        </Stat>
      </div>
      <div className="mrow">
        <Stat icon={ShieldAlert} title={t('mission.post')}>
          {t('mission.post')} <b>{Math.round(hp * 100)}%</b>
        </Stat>
      </div>
      <Meter value={hp} kind="post" />
    </div>
  );
}

function Objective({ done, active, children }: { done: boolean; active: boolean; children: ReactNode }) {
  return (
    <div className={`obj ${done ? 'done' : active ? 'active' : 'muted'}`}>
      <span className="check">{done ? <CircleCheck size={14} /> : <span className="box-icon" />}</span>
      <div>{children}</div>
    </div>
  );
}

interface Member {
  hp: number;
  condition: number;
  panic: boolean;
}

/** Highest values seen per squad: what full health and a full load mean for the bars. */
const peaks = new Map<number, { hp: number; ammo: number }>();
let lastTick = 0;

function squadStats(frame: Frame, q: SquadView) {
  if (frame.tick < lastTick) peaks.clear();
  lastTick = frame.tick;
  let hp = 0;
  let ammo = 0;
  let top = 0;
  let stress = 0;
  let panic = 0;
  let cover = 0;
  const members: Member[] = [];
  for (let i = 0; i < frame.soldiers.length / SOLDIER_STRIDE; i++) {
    const o = i * SOLDIER_STRIDE;
    if (frame.soldiers[o + SoldierField.Squad] !== q.id) continue;
    const c = frame.soldiers[o + SoldierField.Condition];
    const h = frame.soldiers[o + SoldierField.Hp];
    const flags = frame.soldiers[o + SoldierField.Flags];
    members.push({ hp: h, condition: c, panic: (flags & 1) !== 0 });
    if (c > SoldierCondition.Bitten) continue;
    stress += frame.soldiers[o + SoldierField.Stress];
    if (flags & 1) panic++;
    if (flags & 2) cover++;
    hp += h;
    top = Math.max(top, h);
    ammo += frame.soldiers[o + SoldierField.Ammo];
  }
  const p = peaks.get(q.id) ?? { hp: 1, ammo: 1 };
  p.hp = Math.max(p.hp, top);
  p.ammo = Math.max(p.ammo, ammo);
  peaks.set(q.id, p);
  const avg = q.alive ? hp / q.alive : 0;
  const morale = q.alive ? 1 - stress / q.alive / 100 : 0;
  return { hp: Math.round(avg), hpFrac: avg / p.hp, ammo, ammoFrac: ammo / p.ammo, members, maxHp: p.hp, morale, panic, cover };
}

function SquadList({ frame, selected, onSelect, onCenter }: { frame: Frame; selected: number[]; onSelect: (id: number) => void; onCenter: (q: SquadView) => void }) {
  return (
    <div className="squads panel">
      <PanelHead icon={Users}>{t('squads.title')}</PanelHead>
      {frame.squads.map((q) => {
        const s = squadStats(frame, q);
        const StanceIcon = STANCE_ICON[q.stance];
        return (
          <div
            key={q.id}
            className={`squad c${(q.id - 1) % 4} ${selected.includes(q.id) ? 'sel' : ''} ${q.alive === 0 ? 'dead' : ''}`}
            onClick={() => onSelect(q.id)}
            onDoubleClick={() => onCenter(q)}
          >
            <span className="hotkey">{q.name[0]}</span>
            <div className="squad-body">
              <div className="row between">
                <span className="name">{q.name}</span>
                <span className="badges">
                  <span className="badge" title={t(`stance.${q.stance}`)}>
                    <StanceIcon size={11} />
                    {t(`stance.${q.stance}`)}
                  </span>
                  <span className={`badge order-${q.order.kind}`}>
                    {q.order.kind === 'move' ? <Footprints size={11} /> : q.order.kind === 'hold' ? <Shield size={11} /> : null}
                    {t(`order.${q.order.kind}`)}
                  </span>
                </span>
              </div>
              <div className="pips" title={`${q.alive}/${q.members.length} ${t('squad.alive')}`}>
                {s.members.map((m, i) => (
                  <span key={i} className={m.condition === SoldierCondition.Dead || m.condition === SoldierCondition.Turned ? 'gone' : m.panic ? 'panic' : m.condition === SoldierCondition.Bitten ? 'bitten' : m.hp / s.maxHp < 0.5 ? 'hurt' : 'ok'} />
                ))}
                <span className="pips-label">
                  {q.alive}/{q.members.length} {t('squad.alive')}
                </span>
              </div>
              <div className="bars">
                <Heart size={11} />
                <Meter value={s.hpFrac} kind="hp" thin />
                <span className="num">{s.hp}</span>
                <Target size={11} />
                <Meter value={s.ammoFrac} kind="ammo" thin />
                <span className="num">{s.ammo}</span>
              </div>
              {q.alive > 0 && (
                <div className="bars morale" title={t('squad.morale')}>
                  <Brain size={11} />
                  <Meter value={s.morale} kind="morale" thin />
                  <span className={`morale-tag ${s.panic ? 'panic' : s.morale < 0.4 ? 'shaken' : ''}`}>
                    {s.panic ? (
                      <>
                        <Zap size={10} />
                        {t('morale.panic')}
                      </>
                    ) : (
                      t(s.morale < 0.4 ? 'morale.shaken' : 'morale.steady')
                    )}
                  </span>
                  {s.cover > 0 && (
                    <span className="morale-tag cover" title={t('morale.cover')}>
                      <ShieldHalf size={10} />
                      {s.cover}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VehicleList({ frame, selected, onSelect, onCenter }: { frame: Frame; selected: number | null; onSelect: (id: number) => void; onCenter: (x: number, y: number) => void }) {
  if (frame.vehicles.length === 0) return null;
  return (
    <div className="squads panel">
      <PanelHead icon={Truck}>{t('vehicles.title')}</PanelHead>
      {frame.vehicles.map((v) => (
        <div key={v.id} className={`squad vehicle ${selected === v.id ? 'sel' : ''} ${v.state === 'destroyed' ? 'dead' : ''}`} onClick={() => onSelect(v.id)} onDoubleClick={() => onCenter(v.x, v.y)}>
          <span className="hotkey">
            <Truck size={12} />
          </span>
          <div className="squad-body">
            <div className="row between">
              <span className="name">{t('vehicle.truck')}</span>
              <span className={`badge vs-${v.state}`}>{t(`vstate.${v.state}`)}</span>
            </div>
            <div className="bars">
              <Heart size={11} />
              <Meter value={v.hp / v.maxHp} kind="hp" thin />
              <span className="num">{Math.max(0, Math.round(v.hp))}</span>
            </div>
            <div className="row cargo">
              <Stat icon={Target}>{v.cargoAmmo}</Stat>
              <Stat icon={Boxes}>{v.cargoMaterials}</Stat>
            </div>
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
      <PanelHead icon={MapIcon}>{t('districts.title')}</PanelHead>
      {frame.districts.map((d) => (
        <div key={d.id} className="district">
          <div className="row between">
            <span>
              <span className={`dot ${d.state}`} /> {d.name}
            </span>
            <span className={`dstate ${d.state}`}>{t(`dstate.${d.state}`)}</span>
          </div>
          <div className={`meter thin m-district ${d.state}`}>
            <div style={{ width: `${d.control}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ----- Alerts -----

const ALERT_STYLE: Partial<Record<GameClient['state']['alerts'][number]['type'], { icon: LucideIcon; tone: string }>> = {
  soldier_bitten: { icon: TriangleAlert, tone: 'warn' },
  soldier_died: { icon: Skull, tone: 'danger' },
  soldier_turned: { icon: Biohazard, tone: 'danger' },
  zombie_risen: { icon: Biohazard, tone: 'danger' },
  out_of_ammo: { icon: Target, tone: 'warn' },
  soldier_panicked: { icon: Zap, tone: 'warn' },
  squad_contact: { icon: Crosshair, tone: 'info' },
  squad_arrived: { icon: Flag, tone: 'info' },
  command_rejected: { icon: Ban, tone: 'warn' },
  structure_built: { icon: Hammer, tone: 'ok' },
  structure_destroyed: { icon: BrickWall, tone: 'danger' },
  convoy_blocked: { icon: Truck, tone: 'warn' },
  cargo_delivered: { icon: Package, tone: 'ok' },
  vehicle_destroyed: { icon: Truck, tone: 'danger' },
  wave_warning: { icon: Siren, tone: 'warn' },
  wave_started: { icon: Siren, tone: 'danger' },
  district_lost: { icon: MapIcon, tone: 'danger' },
  district_held: { icon: MapIcon, tone: 'ok' },
  mission_won: { icon: CircleCheck, tone: 'ok' },
  mission_lost: { icon: Skull, tone: 'danger' },
};

function Alerts({ alerts, onJump }: { alerts: GameClient['state']['alerts']; onJump: (x: number, y: number) => void }) {
  if (alerts.length === 0) return null;
  return (
    <div className="alerts">
      {alerts.slice(0, 7).map((a, i) => {
        const st = ALERT_STYLE[a.type] ?? { icon: Radio, tone: 'info' };
        const Icon = st.icon;
        return (
          <div key={a.id} className={`alert panel t-${st.tone} a-${a.type} ${a.x !== undefined ? 'jump' : ''}`} style={{ opacity: 1 - i * 0.09 }} onClick={() => a.x !== undefined && onJump(a.x, a.y!)}>
            <Icon size={14} />
            <span className="alert-text">{alertText(a)}</span>
            <span className="alert-time">{fmt(a.tick)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ----- Bottom: command cards -----

function SelectionPanel({ squads, frame, input }: { squads: SquadView[]; frame: Frame; input: InputController }) {
  if (squads.length === 0)
    return (
      <div className="selection panel empty">
        <MousePointerHint />
        <span className="muted">{t('sel.none')}</span>
      </div>
    );
  const q = squads[0];
  const s = squadStats(frame, q);
  return (
    <div className={`selection panel c${(q.id - 1) % 4}`}>
      <div className="sel-head">
        <b>{squads.map((x) => x.name).join(', ')}</b>
        <span className="sel-stats">
          <Stat icon={Users}>
            {q.alive}/{q.members.length}
          </Stat>
          <Stat icon={Heart}>{s.hp}</Stat>
          <Stat icon={Target}>{s.ammo}</Stat>
          <span className="muted">{t(`order.${q.order.kind}`)}</span>
        </span>
      </div>
      <div className="cmds">
        {STANCES.map((st, i) => {
          const Icon = STANCE_ICON[st];
          return (
            <button key={st} className={`cmd ${q.stance === st ? 'on' : ''}`} title={t(`tip.stance.${st}`)} onClick={() => input.setStance(st)}>
              <Key k={'ZXCV'[i]} />
              <Icon size={18} />
              <span>{t(`stance.${st}`)}</span>
            </button>
          );
        })}
        <span className="cmd-sep" />
        <button className="cmd" title={t('tip.formation')} onClick={() => input.cycleFormation()}>
          <Key k="F" />
          <FormationGlyph formation={q.formation} />
          <span>{t(`formation.${q.formation}`)}</span>
        </button>
        <button className="cmd primary" title={t('tip.direct')} onClick={() => input.toggleDirect()}>
          <Key k="TAB" />
          <Gamepad2 size={18} />
          <span>{t('sel.direct')}</span>
        </button>
      </div>
    </div>
  );
}

function MousePointerHint() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" strokeDasharray="3 3" />
      <path d="M12 12l7 3-3 1-1 3z" fill="currentColor" />
    </svg>
  );
}

function FormationGlyph({ formation }: { formation: SquadView['formation'] }) {
  const dots: [number, number][] =
    formation === 'line'
      ? [[3, 12], [8, 12], [13, 12], [18, 12]]
      : formation === 'column'
        ? [[12, 4], [12, 9], [12, 14], [12, 19]]
        : formation === 'wedge'
          ? [[12, 6], [7, 12], [17, 12], [3, 18], [21, 18]]
          : [[12, 4], [19, 12], [12, 20], [5, 12]];
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      {dots.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.4" fill="currentColor" />
      ))}
    </svg>
  );
}

function BuildPanel({ frame, input }: { frame: Frame; input: InputController }) {
  const base = frame.bases[0];
  const tool = input.build;
  return (
    <div className="build panel">
      <PanelHead
        icon={Hammer}
        extra={
          base && (
            <>
              <span className="muted">{base.name}</span>
              <Stat icon={Boxes} title={t('build.stock')}>
                {base.materials}
              </Stat>
              <Stat icon={Package} title={t('build.ammo')} className={base.ammo < 200 ? 'warn' : ''}>
                {base.ammo}
              </Stat>
            </>
          )
        }
      >
        {t('build.title')}
      </PanelHead>
      <div className="cmds">
        {STRUCTURE_KINDS.map((k, i) => {
          const Icon = STRUCTURE_ICON[k];
          const cost = STRUCTURES[k].materials;
          return (
            <button
              key={k}
              className={`cmd ${tool.kind === k ? 'on' : ''}`}
              title={`${t(`tip.${k}`)}\n${t('tip.stats').replace('{hp}', String(STRUCTURES[k].hp)).replace('{h}', String(STRUCTURES[k].height)).replace('{m}', String(cost))}`}
              onClick={() => input.setBuild(tool.kind === k ? null : k)}
              disabled={!base || base.materials < cost}
            >
              <Key k={String(i + 1)} />
              <Icon size={18} />
              <span>{t(`structure.${k}`)}</span>
              <span className="cost">
                <Boxes size={10} />
                {cost}
              </span>
            </button>
          );
        })}
      </div>
      <div className={`hint ${tool.reason ? 'warn' : 'muted'}`}>{tool.active ? (tool.reason ? t(`reason.${tool.reason}`) : t('build.hint')) : t('build.edit')}</div>
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
    <div className="selection panel vehicle-panel">
      <div className="sel-head">
        <b>
          <Truck size={15} /> {t('vehicle.truck')}
        </b>
        <span className="sel-stats">
          <Stat icon={Heart}>
            {Math.max(0, Math.round(v.hp))}/{v.maxHp}
          </Stat>
          <Stat icon={Target}>{v.cargoAmmo}</Stat>
          <Stat icon={Boxes}>{v.cargoMaterials}</Stat>
          <span className={`badge vs-${v.state}`}>{t(`vstate.${v.state}`)}</span>
          {here && <span className="muted">{here.name}</span>}
        </span>
      </div>
      {!dead && (
        <>
          <div className="cmd-row">
            <span className="cmd-label">{t('convoy.policy')}</span>
            {RISK_POLICIES.map((p) => {
              const Icon = POLICY_ICON[p];
              return (
                <button key={p} className={`pill ${v.policy === p ? 'on' : ''}`} title={t(`policy.${p}.hint`)} onClick={() => input.setVehiclePolicy(p)}>
                  <Icon size={12} />
                  {t(`policy.${p}`)}
                </button>
              );
            })}
          </div>
          <div className="cmd-row">
            {frame.bases.map((b) => (
              <button key={b.id} className="pill go" disabled={here?.id === b.id} onClick={() => input.sendConvoy(b.id, v.policy)}>
                → {b.name}
              </button>
            ))}
            {v.state !== 'idle' && (
              <button className="pill" onClick={() => input.stopVehicle()}>
                {t('convoy.stop')}
              </button>
            )}
            {here && v.state === 'idle' && (
              <>
                <button className="pill" disabled={here.ammo === 0} onClick={() => input.loadVehicle(1000, 0)}>
                  {t('convoy.loadAmmo')}
                </button>
                <button className="pill" disabled={here.materials === 0} onClick={() => input.loadVehicle(0, 100)}>
                  {t('convoy.loadMat')}
                </button>
                <button className="pill" disabled={v.cargoAmmo + v.cargoMaterials === 0} onClick={() => input.loadVehicle(-v.cargoAmmo, -v.cargoMaterials)}>
                  {t('convoy.unload')}
                </button>
              </>
            )}
          </div>
          <div className="hint muted">{t('convoy.hint')}</div>
        </>
      )}
    </div>
  );
}

// ----- Direct control -----

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
  const hpShown = Math.max(0, Math.round(hp));
  return (
    <>
      <div className="crosshair" aria-hidden="true">
        <svg width="44" height="44" viewBox="0 0 44 44">
          <g stroke="#fff" strokeWidth="2" strokeLinecap="round">
            <line x1="22" y1="4" x2="22" y2="15" />
            <line x1="22" y1="29" x2="22" y2="40" />
            <line x1="4" y1="22" x2="15" y2="22" />
            <line x1="29" y1="22" x2="40" y2="22" />
          </g>
          <circle cx="22" cy="22" r="1.6" fill="#ffb347" />
        </svg>
      </div>
      <div className="direct">
        <div className="direct-hp panel">
          <Heart size={18} />
          <span className="big">{hpShown}</span>
          <Meter value={hp / 100} kind="hp" />
        </div>
        <div className="direct-hint muted">{document.pointerLockElement ? t('direct.exit') : t('direct.lock')}</div>
        <div className="direct-ammo panel">
          <span className={`big ${mag === 0 ? 'danger' : mag < 8 ? 'warn' : ''}`}>{mag}</span>
          <span className="reserve">/ {total - mag}</span>
          <Target size={18} />
        </div>
      </div>
    </>
  );
}

// ----- Summary -----

function Summary({ frame, shell, seed }: { frame: Frame; shell: Shell; seed: number }) {
  const m = frame.mission!;
  const won = m.phase === 'won';
  const lost = frame.soldiers.length / SOLDIER_STRIDE - frame.stats.soldiersAlive;
  const restart = (next: boolean) => shell.restart(seed + (next ? 1 : 0), true);
  const rows: [LucideIcon, string, ReactNode][] = [
    [Users, t('summary.civilians'), `${m.civilians}/${m.civiliansMax}`],
    [Package, t('summary.cargo'), m.cargoDelivered ? t('summary.yes') : t('summary.no')],
    [Siren, t('summary.waves'), `${m.wave}/${m.waves}`],
    [Skull, t('summary.casualties'), lost],
    [Crosshair, t('summary.killed'), frame.stats.zombiesKilled],
    [Clock, t('summary.time'), fmt(frame.tick)],
    [Shield, t('diff.title'), t(`diff.${frame.difficulty}`)],
  ];
  return (
    <div className="summary">
      <div className={`panel card ${won ? 'won' : 'lost'}`}>
        <div className="summary-kicker">{t('mission.title')}</div>
        <h1 className={won ? 'won' : 'lost'}>{won ? t('summary.won') : t('summary.lost')}</h1>
        {!won && <p className="muted">{t(`loss.${m.reason}`)}</p>}
        <div className="summary-grid">
          {rows.map(([Icon, label, value]) => (
            <div key={label} className="summary-stat">
              <Icon size={16} />
              <span className="label">{label}</span>
              <span className="value">{value}</span>
            </div>
          ))}
        </div>
        <div className="row end">
          <button onClick={() => shell.restart(seed, false)}>{t('pause.mainMenu')}</button>
          <button onClick={() => restart(false)}>{t('summary.retry')}</button>
          <button className="primary" onClick={() => restart(true)}>
            {t('summary.next')} <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
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
      return `${base}: ${a.value} ${t('top.ammo').toLowerCase()} · ${a.reason} ${t('build.stock').toLowerCase()}`;
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
