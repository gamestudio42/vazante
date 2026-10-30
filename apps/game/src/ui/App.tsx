import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
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
  Flame,
  Gamepad2,
  Hammer,
  Heart,
  HeartPulse,
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
  UserPlus,
  Users,
  Boxes,
  Footprints,
  Siren,
  Trophy,
  Hand,
  LocateFixed,
  Route,
  Brain,
  ShieldHalf,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  clockHours,
  daylight,
  RISK_POLICIES,
  SOLDIER_STRIDE,
  SoldierCondition,
  SoldierField,
  STANCES,
  STRUCTURES,
  ECONOMY,
  STRUCTURE_KINDS,
  MG_NEST,
  MISSION_IDS,
  TICK_HZ,
  type Frame,
  type MissionView,
  type ObjectiveView,
  type RiskPolicy,
  type SimSpeed,
  type Stance,
  type StructureKind,
  type SquadView,
} from "@vazante/shared";
import type { GameRenderer } from "@vazante/view3d";
import type { GameClient } from "../client.ts";
import type { InputController } from "../input.ts";
import { t } from "../i18n.ts";
import type { Shell } from "../shell.ts";
import { ShellOverlay, TutorialCard } from "./Shell.tsx";
import { Minimap } from "./Minimap.tsx";
import { MapLabels } from "./MapLabels.tsx";
import { objectiveTarget } from "./objective.ts";

interface Props {
  client: GameClient;
  input: InputController;
  view: GameRenderer;
  shell: Shell;
}

const STANCE_ICON: Record<Stance, LucideIcon> = {
  hold: Hand,
  aggressive: Swords,
  defensive: Shield,
  withdraw: Undo2,
  suppress: Flame,
};
const STANCE_KEY: Record<Stance, string> = {
  hold: "Z",
  aggressive: "X",
  defensive: "C",
  withdraw: "V",
  suppress: "T",
};
const STRUCTURE_ICON: Record<StructureKind, LucideIcon> = {
  hesco: Boxes,
  wall: BrickWall,
  gate: DoorOpen,
  mg_nest: Crosshair,
  command_post: Flag,
};
const POLICY_ICON: Record<RiskPolicy, LucideIcon> = {
  push_through: FastForward,
  reroute: RotateCcw,
  halt: Square,
  return: Undo2,
};
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
  if (!f) return <div className="boot">{t("boot.loading")}</div>;

  const selected = f.squads.filter((q) => state.selected.includes(q.id));
  const seed = state.map?.seed ?? 1;
  if (shell.screen === "menu")
    return <ShellOverlay shell={shell} seed={seed} />;
  const ended =
    f.mission && (f.mission.phase === "won" || f.mission.phase === "lost");
  return (
    <>
      <MapLabels client={client} view={view} />
      <div className="hud">
        <TopBar
          frame={f}
          limited={state.limited}
          band={input.inDirect ? "direct" : band}
          onSpeed={(speed) => client.send({ type: "set_speed", speed })}
        />
        {!input.inDirect && (
          <div className="leftcol">
            {f.mission && (
              <MissionPanel
                frame={f}
                onLocate={() => {
                  const tg = state.map && objectiveTarget(f, state.map);
                  if (tg) view.rig.centerOn(tg.x, tg.y);
                }}
              />
            )}
            <SquadList
              frame={f}
              selected={state.selected}
              onSelect={(id) => input.select([id])}
              onCenter={(q) => view.rig.centerOn(q.anchorX, q.anchorY)}
            />
            <VehicleList
              frame={f}
              selected={state.vehicle}
              onSelect={(id) => input.selectVehicle(id)}
              onCenter={(x, y) => view.rig.centerOn(x, y)}
            />
            {!f.economy && <DistrictList frame={f} />}
          </div>
        )}
        {!input.inDirect && (
          <Alerts
            alerts={state.alerts}
            onJump={(x, y) => view.rig.centerOn(x, y)}
          />
        )}
        {!input.inDirect && (
          <div className="bottomcol">
            <BuildPanel frame={f} input={input} />
            {state.structure !== null ? (
              <StructurePanel frame={f} id={state.structure} input={input} />
            ) : state.vehicle !== null ? (
              <VehiclePanel frame={f} id={state.vehicle} input={input} />
            ) : (
              <SelectionPanel squads={selected} frame={f} input={input} />
            )}
          </div>
        )}
        {input.inDirect && <DirectHud frame={f} />}
        <Minimap client={client} view={view} direct={input.inDirect} />
        {input.helpVisible && !input.inDirect && (
          <div className="help panel">
            <PanelHead icon={Radio}>{t("help.title")}</PanelHead>
            <pre>{t("help.body")}</pre>
          </div>
        )}
        {!ended && <TutorialCard shell={shell} />}
        {ended && shell.screen === "playing" && (
          <Summary frame={f} shell={shell} seed={seed} />
        )}
        <ShellOverlay shell={shell} seed={seed} />
      </div>
      {input.box && <div className="box" style={boxStyle(input.box)} />}
      {input.faceArrow && <FaceArrow a={input.faceArrow} />}
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
        s.structure !== shown.structure ||
        s.alerts !== shown.alerts ||
        s.map !== shown.map ||
        s.limited !== shown.limited ||
        s.frame?.speed !== shown.frame.speed ||
        s.frame?.directSoldier !== shown.frame.directSoldier;
      if (urgent || performance.now() - last >= HUD_MS) {
        clearTimeout(timer);
        push();
      } else if (!timer)
        timer = window.setTimeout(push, HUD_MS - (performance.now() - last));
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [client]);
  return snap;
}

// ----- Building blocks -----

function PanelHead({
  icon: Icon,
  children,
  extra,
}: {
  icon: LucideIcon;
  children: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="phead">
      <Icon size={13} strokeWidth={2.2} />
      <b>{children}</b>
      {extra && <span className="phead-extra">{extra}</span>}
    </div>
  );
}

function Meter({
  value,
  kind = "hp",
  thin,
}: {
  value: number;
  kind?: "hp" | "ammo" | "post" | "wave" | "morale";
  thin?: boolean;
}) {
  const v = Math.max(0, Math.min(1, value));
  const level =
    kind === "hp" || kind === "post" || kind === "morale"
      ? v < 0.3
        ? "low"
        : v < 0.6
          ? "mid"
          : ""
      : kind === "ammo" && v < 0.2
        ? "low"
        : "";
  return (
    <div className={`meter m-${kind} ${level} ${thin ? "thin" : ""}`}>
      <div style={{ width: `${v * 100}%` }} />
    </div>
  );
}

function Stat({
  icon: Icon,
  children,
  title,
  className,
}: {
  icon: LucideIcon;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span className={`stat ${className ?? ""}`} title={title}>
      <Icon size={12} strokeWidth={2.2} />
      {children}
    </span>
  );
}

function Key({ k }: { k: string }) {
  return <kbd>{k}</kbd>;
}

// ----- Top bar -----

function TopBar({
  frame,
  limited,
  band,
  onSpeed,
}: {
  frame: Frame;
  limited: boolean;
  band: string;
  onSpeed: (s: SimSpeed) => void;
}) {
  const lowAmmo = frame.bases[0] && frame.bases[0].ammo < 200;
  // Depot output waits in the depot's own stock until a truck brings it to the base.
  const away = frame.economy ? frame.bases.slice(1).reduce((n, b) => n + b.materials, 0) : 0;
  return (
    <div className="topbar panel">
      <span className="brand">{t("app.title")}</span>
      <span className="sep" />
      <span className="chip" title={t("top.time")}>
        <Clock size={13} />
        {fmt(frame.tick)}
      </span>
      <DayClock tick={frame.tick} day={frame.day} />
      <span className="speed" role="group" aria-label={t("top.time")}>
        {SPEEDS.map((s) => (
          <button
            key={s}
            className={frame.speed === s ? "on" : ""}
            title={
              s === 0
                ? `${t("top.paused")} (Space)`
                : `${s}x (F${s === 4 ? 3 : s})`
            }
            onClick={() => onSpeed(s === 0 && frame.speed === 0 ? 1 : s)}
          >
            {s === 0 ? (
              <Pause size={12} />
            ) : s === 1 ? (
              <Play size={12} />
            ) : (
              `${s}x`
            )}
          </button>
        ))}
      </span>
      {frame.speed === 0 && <span className="paused">{t("top.paused")}</span>}
      {limited && <span className="warn">{t("top.limited")}</span>}
      <span className="sep" />
      <span className="chip" title={t("top.soldiers")}>
        <Users size={13} />
        {frame.stats.soldiersAlive}
      </span>
      <span className="chip danger" title={t("top.zombies")}>
        <Biohazard size={13} />
        {frame.stats.zombiesAlive}
      </span>
      <span className="chip" title={t("top.killed")}>
        <Skull size={13} />
        {frame.stats.zombiesKilled}
      </span>
      <span className="chip" title={t("top.ammo")}>
        <Target size={13} />
        {frame.stats.ammoTotal}
        <small>{t("top.ammoShort")}</small>
      </span>
      {frame.bases[0] && (
        <span
          className={`chip ${lowAmmo ? "warn" : ""}`}
          title={t("top.baseAmmo")}
        >
          <Package size={13} />
          {frame.bases[0].ammo}
          <small>{t("top.baseAmmoShort")}</small>
        </span>
      )}
      {frame.bases[0] && (
        <span className="chip" title={`${t("top.materials")}${away > 0 ? `\n${t("top.materialsAway").replace("{n}", String(away))}` : ""}`}>
          <Boxes size={13} />
          {frame.bases[0].materials}
          <small>{t("top.materialsShort")}</small>
          {away > 0 && <small className="away">+{away}</small>}
        </span>
      )}
      <span className="sep" />
      <span className="band">
        {band === "direct" ? <Gamepad2 size={13} /> : <MapIcon size={13} />}
        {t(`band.${band}`)}
      </span>
      <span className="muted helpkey">{t("help.toggle")}</span>
    </div>
  );
}

function DayClock({ tick, day }: { tick: number; day?: Frame["day"] }) {
  const h = clockHours(tick, day);
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const night = daylight(h) < 0.5;
  return (
    <span
      className={`chip ${night ? "night" : "day"}`}
      title={t(night ? "top.night" : "top.day")}
    >
      {night ? <Moon size={13} /> : <Sun size={13} />}
      {String(hh).padStart(2, "0")}:{String(mm).padStart(2, "0")}
    </span>
  );
}

// ----- Left column -----

function MissionPanel({
  frame,
  onLocate,
}: {
  frame: Frame;
  onLocate: () => void;
}) {
  const m = frame.mission!;
  const hp = m.commandPostMaxHp > 0 ? m.commandPostHp / m.commandPostMaxHp : 0;
  return (
    <div className="mission panel">
      <PanelHead icon={Flag}>{t("mission.title")}</PanelHead>
      {m.objectives.map((o, i) => (
        <Objective
          key={i}
          done={o.state === "done"}
          active={o.state === "active"}
          onLocate={o.state === "active" && o.place ? onLocate : undefined}
        >
          {objectiveText(m, o, i)}
          {o.kind === "waves" && <WaveLine m={m} o={o} />}
          {o.kind === "endless" && <NightLine m={m} />}
          {o.state === "active" && o.progress >= 0 && (
            <div className="obj-meter">
              <Meter value={o.progress} kind="wave" thin />
              <span className="muted">{progressText(o)}</span>
            </div>
          )}
          {o.state === "active" &&
            (o.kind === "hold" || o.kind === "evacuate" || o.kind === "secure") && (
              <div className="hint muted">{t(`obj.${o.kind}.hint`)}</div>
            )}
        </Objective>
      ))}
      {m.evacuated > 0 && (
        <div className="mrow">
          <Stat icon={Users} title={t("mission.evacuated")}>
            {t("mission.evacuated")} <b>{m.evacuated}</b>
          </Stat>
        </div>
      )}
      {m.civiliansMax > 0 && (
        <>
          <div className="mrow">
            <Stat icon={Users} title={t("mission.civilians")}>
              {t("mission.civilians")} <b>{m.civilians}</b>/{m.civiliansMax}
            </Stat>
          </div>
          <div className="mrow">
            <Stat icon={ShieldAlert} title={t("mission.post")}>
              {t("mission.post")} <b>{Math.round(hp * 100)}%</b>
            </Stat>
          </div>
          <Meter value={hp} kind="post" />
        </>
      )}
    </div>
  );
}

function objectiveText(m: MissionView, o: ObjectiveView, i: number): string {
  let key: string = `obj.${o.kind}`;
  // A delivery after an evacuation carries people, not cargo.
  if (
    o.kind === "deliver" &&
    m.objectives.slice(0, i).some((x) => x.kind === "evacuate")
  )
    key = "obj.deliver.evac";
  if (o.kind === "waves" && o.place) key = "obj.waves.at";
  if (o.kind === "deliver" && o.away) key = key === "obj.deliver.evac" ? "obj.deliver.evacTo" : "obj.deliver.to";
  return t(key)
    .replace("{place}", o.place)
    .replace("{from}", o.from)
    .replace("{n}", String(o.total))
    .replace("{w}", String(o.total));
}

function progressText(o: ObjectiveView): string {
  if (o.kind === "hold")
    return `${Math.max(0, Math.ceil(o.total * (1 - o.progress)))} s`;
  if (o.kind === "evacuate")
    return `${Math.floor(o.total * o.progress)}/${o.total}`;
  return `${Math.round(o.progress * 100)}%`;
}

function WaveLine({ m, o }: { m: MissionView; o: ObjectiveView }) {
  const active = o.state === "active";
  const done = o.state === "done";
  let line = t("mission.waves.locked");
  if (done) line = t("mission.waves.calm").replace("{n}", String(o.total));
  else if (active && m.waveState === "warning")
    line = t("mission.waves.warning")
      .replace("{n}", String(m.wave + 1))
      .replace("{s}", String(m.secondsToWave));
  else if (active && m.waveState === "active")
    line = t("mission.waves.active")
      .replace("{n}", String(m.wave))
      .replace("{z}", String(m.waveZombies));
  else if (active)
    line = t("mission.waves.calm").replace("{n}", String(m.wave));
  const wave = active ? m.wave : done ? o.total : 0;
  return (
    <>
      <div
        className={`wave ${active && m.waveState === "warning" ? "warn" : active && m.waveState === "active" ? "danger" : "muted"}`}
      >
        {active && m.waveState === "warning" && <Siren size={12} />}
        {line}
      </div>
      <div className="pips waves">
        {Array.from({ length: o.total }, (_, i) => (
          <span
            key={i}
            className={
              done || i < wave - (active && m.waveState === "active" ? 1 : 0)
                ? "done"
                : active && i === wave - 1 && m.waveState === "active"
                  ? "now"
                  : ""
            }
          />
        ))}
      </div>
    </>
  );
}

/** Survival: the time to nightfall by day, the warning, then what is left of the night's horde. */
function NightLine({ m }: { m: MissionView }) {
  let line = t("mission.night.day")
    .replace("{t}", fmt(m.secondsToWave * TICK_HZ))
    .replace("{n}", String(m.wave + 1));
  if (m.waveState === "warning")
    line = t("mission.waves.warning")
      .replace("{n}", String(m.wave + 1))
      .replace("{s}", String(m.secondsToWave));
  else if (m.waveState === "active")
    line = t("mission.night.active")
      .replace("{n}", String(m.wave + 1))
      .replace("{z}", String(m.waveZombies));
  return (
    <>
      <div
        className={`wave ${m.waveState === "warning" ? "warn" : m.waveState === "active" ? "danger" : "muted"}`}
      >
        {m.waveState === "warning" && <Siren size={12} />}
        {line}
      </div>
      <div className="wave muted">
        {t("mission.night.survived").replace("{n}", String(m.wave))}
      </div>
    </>
  );
}

function Objective({
  done,
  active,
  onLocate,
  children,
}: {
  done: boolean;
  active: boolean;
  /** Set when the objective has a place: clicking it moves the camera there. */
  onLocate?: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={`obj ${done ? "done" : active ? "active" : "muted"} ${onLocate ? "locate" : ""}`}
      onClick={onLocate}
      title={onLocate ? t("obj.locate") : undefined}
    >
      <span className="check">
        {done ? <CircleCheck size={14} /> : <span className="box-icon" />}
      </span>
      <div>{children}</div>
      {onLocate && <LocateFixed size={14} className="locate-icon" />}
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
  const roles = { medic: 0, engineer: 0, marksman: 0 };
  const members: Member[] = [];
  for (let i = 0; i < frame.soldiers.length / SOLDIER_STRIDE; i++) {
    const o = i * SOLDIER_STRIDE;
    if (frame.soldiers[o + SoldierField.Squad] !== q.id) continue;
    const c = frame.soldiers[o + SoldierField.Condition];
    const h = frame.soldiers[o + SoldierField.Hp];
    const flags = frame.soldiers[o + SoldierField.Flags];
    members.push({ hp: h, condition: c, panic: (flags & 1) !== 0 });
    if (c > SoldierCondition.Bitten) continue;
    if (flags & 4) roles.medic++;
    if (flags & 8) roles.engineer++;
    if (flags & 16) roles.marksman++;
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
  return {
    hp: Math.round(avg),
    hpFrac: avg / p.hp,
    ammo,
    ammoFrac: ammo / p.ammo,
    members,
    maxHp: p.hp,
    morale,
    panic,
    cover,
    roles,
  };
}

function SquadList({
  frame,
  selected,
  onSelect,
  onCenter,
}: {
  frame: Frame;
  selected: number[];
  onSelect: (id: number) => void;
  onCenter: (q: SquadView) => void;
}) {
  return (
    <div className="squads panel">
      <PanelHead icon={Users}>{t("squads.title")}</PanelHead>
      {frame.squads.map((q) => {
        const s = squadStats(frame, q);
        const StanceIcon = STANCE_ICON[q.stance];
        return (
          <div
            key={q.id}
            className={`squad c${(q.id - 1) % 4} ${selected.includes(q.id) ? "sel" : ""} ${q.alive === 0 ? "dead" : ""}`}
            onClick={() => onSelect(q.id)}
            onDoubleClick={() => onCenter(q)}
          >
            <span className="hotkey">{q.name[0]}</span>
            <div className="squad-body">
              <div className="row between">
                <span className="name">
                  {q.name}
                  <span className="kind" title={t(`squadKind.${q.kind}.hint`)}>
                    {t(`squadKind.${q.kind}`)}
                    {s.roles.medic > 0 && (
                      <HeartPulse size={10} aria-label={t("role.medic")} />
                    )}
                    {s.roles.marksman > 0 && (
                      <Crosshair size={10} aria-label={t("role.marksman")} />
                    )}
                    {s.roles.engineer > 0 && (
                      <Wrench size={10} aria-label={t("role.engineer")} />
                    )}
                  </span>
                </span>
                <span className="badges">
                  <span className="badge" title={t(`stance.${q.stance}`)}>
                    <StanceIcon size={11} />
                    {t(`stance.${q.stance}`)}
                  </span>
                  <span className={`badge order-${q.order.kind}`}>
                    {q.order.kind === "move" ? (
                      <Footprints size={11} />
                    ) : q.order.kind === "hold" ? (
                      <Shield size={11} />
                    ) : null}
                    {t(`order.${q.order.kind}`)}
                  </span>
                </span>
              </div>
              <div
                className="pips"
                title={`${q.alive}/${q.members.length} ${t("squad.alive")}`}
              >
                {s.members.map((m, i) => (
                  <span
                    key={i}
                    className={
                      m.condition === SoldierCondition.Dead ||
                      m.condition === SoldierCondition.Turned
                        ? "gone"
                        : m.panic
                          ? "panic"
                          : m.condition === SoldierCondition.Bitten
                            ? "bitten"
                            : m.hp / s.maxHp < 0.5
                              ? "hurt"
                              : "ok"
                    }
                  />
                ))}
                <span className="pips-label">
                  {q.alive}/{q.members.length} {t("squad.alive")}
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
                <div className="bars morale" title={t("squad.morale")}>
                  <Brain size={11} />
                  <Meter value={s.morale} kind="morale" thin />
                  <span
                    className={`morale-tag ${s.panic ? "panic" : s.morale < 0.4 ? "shaken" : ""}`}
                  >
                    {s.panic ? (
                      <>
                        <Zap size={10} />
                        {t("morale.panic")}
                      </>
                    ) : (
                      t(s.morale < 0.4 ? "morale.shaken" : "morale.steady")
                    )}
                  </span>
                  {s.cover > 0 && (
                    <span
                      className="morale-tag cover"
                      title={t("morale.cover")}
                    >
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

function VehicleList({
  frame,
  selected,
  onSelect,
  onCenter,
}: {
  frame: Frame;
  selected: number | null;
  onSelect: (id: number) => void;
  onCenter: (x: number, y: number) => void;
}) {
  if (frame.vehicles.length === 0) return null;
  return (
    <div className="squads panel">
      <PanelHead icon={Truck}>{t("vehicles.title")}</PanelHead>
      {frame.vehicles.map((v) => (
        <div
          key={v.id}
          className={`squad vehicle ${selected === v.id ? "sel" : ""} ${v.state === "destroyed" ? "dead" : ""}`}
          onClick={() => onSelect(v.id)}
          onDoubleClick={() => onCenter(v.x, v.y)}
        >
          <span className="hotkey">
            <Truck size={12} />
          </span>
          <div className="squad-body">
            <div className="row between">
              <span className="name">{t("vehicle.truck")}</span>
              <span className={`badge vs-${v.state}`}>
                {t(`vstate.${v.state}`)}
              </span>
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
      <PanelHead icon={MapIcon}>{t("districts.title")}</PanelHead>
      {frame.districts.map((d) => (
        <div key={d.id} className="district">
          <div className="row between">
            <span>
              <span className={`dot ${d.state}`} /> {d.name}
            </span>
            <span className={`dstate ${d.state}`}>
              {t(`dstate.${d.state}`)}
            </span>
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

const ALERT_STYLE: Partial<
  Record<
    GameClient["state"]["alerts"][number]["type"],
    { icon: LucideIcon; tone: string }
  >
> = {
  soldier_bitten: { icon: TriangleAlert, tone: "warn" },
  soldier_died: { icon: Skull, tone: "danger" },
  soldier_turned: { icon: Biohazard, tone: "danger" },
  zombie_risen: { icon: Biohazard, tone: "danger" },
  out_of_ammo: { icon: Target, tone: "warn" },
  soldier_panicked: { icon: Zap, tone: "warn" },
  squad_contact: { icon: Crosshair, tone: "info" },
  squad_arrived: { icon: Flag, tone: "info" },
  command_rejected: { icon: Ban, tone: "warn" },
  structure_built: { icon: Hammer, tone: "ok" },
  structure_destroyed: { icon: BrickWall, tone: "danger" },
  convoy_blocked: { icon: Truck, tone: "warn" },
  cargo_delivered: { icon: Package, tone: "ok" },
  vehicle_destroyed: { icon: Truck, tone: "danger" },
  vehicle_repaired: { icon: Wrench, tone: "ok" },
  truck_bought: { icon: Truck, tone: "ok" },
  nest_empty: { icon: Target, tone: "warn" },
  ammo_low: { icon: Target, tone: "warn" },
  ammo_out: { icon: Target, tone: "danger" },
  wave_warning: { icon: Siren, tone: "warn" },
  wave_started: { icon: Siren, tone: "danger" },
  district_lost: { icon: MapIcon, tone: "danger" },
  district_held: { icon: MapIcon, tone: "ok" },
  mission_won: { icon: CircleCheck, tone: "ok" },
  mission_lost: { icon: Skull, tone: "danger" },
};

function Alerts({
  alerts,
  onJump,
}: {
  alerts: GameClient["state"]["alerts"];
  onJump: (x: number, y: number) => void;
}) {
  if (alerts.length === 0) return null;
  return (
    <div className="alerts">
      {alerts.slice(0, 7).map((a, i) => {
        const st = ALERT_STYLE[a.type] ?? { icon: Radio, tone: "info" };
        const Icon = st.icon;
        return (
          <div
            key={a.id}
            className={`alert panel t-${st.tone} a-${a.type} ${a.x !== undefined ? "jump" : ""}`}
            style={{ opacity: 1 - i * 0.09 }}
            onClick={() => a.x !== undefined && onJump(a.x, a.y!)}
          >
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

function SelectionPanel({
  squads,
  frame,
  input,
}: {
  squads: SquadView[];
  frame: Frame;
  input: InputController;
}) {
  if (squads.length === 0)
    return (
      <div className="selection panel empty">
        <MousePointerHint />
        <span className="muted">{t("sel.none")}</span>
      </div>
    );
  const q = squads[0];
  const s = squadStats(frame, q);
  return (
    <div className={`selection panel c${(q.id - 1) % 4}`}>
      <div className="sel-head">
        <b>{squads.map((x) => x.name).join(", ")}</b>
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
        {STANCES.map((st) => {
          const Icon = STANCE_ICON[st];
          return (
            <button
              key={st}
              className={`cmd ${q.stance === st ? "on" : ""}`}
              title={t(`tip.stance.${st}`)}
              onClick={() => input.setStance(st)}
            >
              <Key k={STANCE_KEY[st]} />
              <Icon size={18} />
              <span>{t(`stance.${st}`)}</span>
            </button>
          );
        })}
        <span className="cmd-sep" />
        <button
          className="cmd"
          title={t("tip.formation")}
          onClick={() => input.cycleFormation()}
        >
          <Key k="F" />
          <FormationGlyph formation={q.formation} />
          <span>{t(`formation.${q.formation}`)}</span>
        </button>
        <button
          className={`cmd ${input.routeMode ? "on" : ""}`}
          title={t("tip.route")}
          onClick={() => input.toggleRouteMode()}
        >
          <Key k="R" />
          <Route size={18} />
          <span>{t("sel.route")}</span>
        </button>
        {squads.some((x) => x.kind === "engineers") && (
          <button
            className="cmd"
            title={t("tip.repair")}
            onClick={() => input.repair()}
          >
            <Wrench size={18} />
            <span>{t("sel.repair")}</span>
          </button>
        )}
        <button
          className="cmd primary"
          title={t("tip.direct")}
          onClick={() => input.toggleDirect()}
        >
          <Key k="TAB" />
          <Gamepad2 size={18} />
          <span>{t("sel.direct")}</span>
        </button>
      </div>
    </div>
  );
}

function MousePointerHint() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" strokeDasharray="3 3" />
      <path d="M12 12l7 3-3 1-1 3z" fill="currentColor" />
    </svg>
  );
}

function FormationGlyph({ formation }: { formation: SquadView["formation"] }) {
  const dots: [number, number][] =
    formation === "line"
      ? [
          [3, 12],
          [8, 12],
          [13, 12],
          [18, 12],
        ]
      : formation === "column"
        ? [
            [12, 4],
            [12, 9],
            [12, 14],
            [12, 19],
          ]
        : formation === "wedge"
          ? [
              [12, 6],
              [7, 12],
              [17, 12],
              [3, 18],
              [21, 18],
            ]
          : [
              [12, 4],
              [19, 12],
              [12, 20],
              [5, 12],
            ];
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      {dots.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.4" fill="currentColor" />
      ))}
    </svg>
  );
}

function BuildPanel({
  frame,
  input,
}: {
  frame: Frame;
  input: InputController;
}) {
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
              <Stat icon={Boxes} title={t("top.materials")}>
                {base.materials} <small className="muted">{t("top.materialsShort")}</small>
              </Stat>
              <Stat
                icon={Package}
                title={t("build.ammo")}
                className={base.ammo < 200 ? "warn" : ""}
              >
                {base.ammo} <small className="muted">{t("unit.ammo")}</small>
              </Stat>
            </>
          )
        }
      >
        {t("build.title")}
      </PanelHead>
      <div className="cmds">
        {STRUCTURE_KINDS.map((k, i) => {
          const Icon = STRUCTURE_ICON[k];
          const cost = STRUCTURES[k].materials;
          return (
            <button
              key={k}
              className={`cmd ${tool.kind === k ? "on" : ""}`}
              title={`${t(`tip.${k}`)}\n${t("tip.stats").replace("{hp}", String(STRUCTURES[k].hp)).replace("{h}", String(STRUCTURES[k].height)).replace("{m}", String(cost))}`}
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
      <div className={`hint ${tool.reason ? "warn" : "muted"}`}>
        {tool.active
          ? tool.reason
            ? t(`reason.${tool.reason}`)
            : t("build.hint")
          : t("build.edit")}
      </div>
      {frame.economy && <Recruit frame={frame} input={input} />}
    </div>
  );
}

/** Reinforcements: a new squad at the railway station while it is secured, paid from the base. */
function Recruit({ frame, input }: { frame: Frame; input: InputController }) {
  const station = frame.bases.find((b) => b.role === "station");
  const base = frame.bases.find((b) => b.kind === "base");
  if (!station || !base) return null;
  const full = frame.squads.filter((q) => q.alive > 0).length >= ECONOMY.maxSquads;
  const trucks = frame.vehicles.filter((v) => v.state !== "destroyed").length;
  return (
    <div className="recruit">
      <div className="cmd-row">
        <span className="cmd-label" title={t("recruit.hint")}>
          <UserPlus size={12} /> {t("recruit.title")}
        </span>
        {ECONOMY.recruitKinds.map((k) => {
          const cost = ECONOMY.recruitCost[k];
          return (
            <button
              key={k}
              className="pill"
              title={t(`squadKind.${k}.hint`)}
              disabled={!station.held || full || base.materials < cost}
              onClick={() => input.recruit(k)}
            >
              {t(`squadKind.${k}`)}
              <span className="cost">
                <Boxes size={10} />
                {cost}
              </span>
            </button>
          );
        })}
        <button
          className="pill"
          title={t("truck.buy.hint")}
          disabled={!station.held || trucks >= ECONOMY.maxTrucks || base.materials < ECONOMY.truckCost}
          onClick={() => input.buyTruck()}
        >
          <Truck size={12} />
          {t("truck.buy")}
          <span className="cost">
            <Boxes size={10} />
            {ECONOMY.truckCost}
          </span>
        </button>
      </div>
      <div className={`hint ${station.held && !full ? "muted" : "warn"}`}>
        {full
          ? t("recruit.full")
          : station.held
            ? t("recruit.ready").replace("{site}", station.name)
            : t("recruit.locked").replace("{site}", station.name)}
      </div>
    </div>
  );
}

function VehiclePanel({
  frame,
  id,
  input,
}: {
  frame: Frame;
  id: number;
  input: InputController;
}) {
  const v = frame.vehicles.find((x) => x.id === id);
  if (!v) return <div className="selection panel muted">{t("sel.none")}</div>;
  const cs = 4;
  const here = frame.bases.find(
    (b) =>
      v.x >= b.x0 * cs &&
      v.x < (b.x1 + 1) * cs &&
      v.y >= b.y0 * cs &&
      v.y < (b.y1 + 1) * cs,
  );
  const dead = v.state === "destroyed";
  const escorted = frame.squads.find((q) => q.id === v.escort);
  return (
    <div className="selection panel vehicle-panel">
      <div className="sel-head">
        <b>
          <Truck size={15} /> {t(dead ? "wreck.title" : "vehicle.truck")}
        </b>
        <span className="sel-stats">
          <Stat icon={Heart}>
            {Math.max(0, Math.round(v.hp))}/{v.maxHp}
          </Stat>
          <Stat icon={Target}>{v.cargoAmmo}</Stat>
          <Stat icon={Boxes}>{v.cargoMaterials}</Stat>
          <span className={`badge vs-${v.state}`}>
            {t(`vstate.${v.state}`)}
          </span>
          {here && <span className="muted">{here.name}</span>}
          {escorted && (
            <span className="muted">
              {t("convoy.following").replace("{name}", escorted.name)}
            </span>
          )}
        </span>
      </div>
      {dead && (
        <>
          <Meter value={v.repair} kind="wave" />
          <div className="cmd-row">
            <span className="cmd-label">
              {t("wreck.progress").replace("{n}", String(Math.floor(v.repair * 100)))}
            </span>
            <button
              className="pill go"
              disabled={!frame.squads.some((q) => q.kind === "engineers" && q.alive > 0)}
              onClick={() => input.repair(v.id)}
            >
              <Wrench size={12} />
              {t("wreck.send")}
            </button>
          </div>
          <div className="hint muted">{t("wreck.hint")}</div>
        </>
      )}
      {!dead && (
        <>
          <div className="cmd-row">
            <span className="cmd-label">{t("convoy.policy")}</span>
            {RISK_POLICIES.map((p) => {
              const Icon = POLICY_ICON[p];
              return (
                <button
                  key={p}
                  className={`pill ${v.policy === p ? "on" : ""}`}
                  title={t(`policy.${p}.hint`)}
                  onClick={() => input.setVehiclePolicy(p)}
                >
                  <Icon size={12} />
                  {t(`policy.${p}`)}
                </button>
              );
            })}
          </div>
          <div className="cmd-row">
            {frame.bases.map((b) => (
              <button
                key={b.id}
                className="pill go"
                disabled={here?.id === b.id}
                onClick={() => input.sendConvoy(b.id, v.policy)}
              >
                → {b.name}
              </button>
            ))}
            {v.state !== "idle" && (
              <button className="pill" onClick={() => input.stopVehicle()}>
                {t("convoy.stop")}
              </button>
            )}
            {here && v.state === "idle" && (
              <>
                <button
                  className="pill"
                  disabled={here.ammo === 0}
                  onClick={() => input.loadVehicle(1000, 0)}
                >
                  {t("convoy.loadAmmo")}
                </button>
                <button
                  className="pill"
                  disabled={here.materials === 0}
                  onClick={() => input.loadVehicle(0, 100)}
                >
                  {t("convoy.loadMat")}
                </button>
                <button
                  className="pill"
                  disabled={v.cargoAmmo + v.cargoMaterials === 0}
                  onClick={() =>
                    input.loadVehicle(-v.cargoAmmo, -v.cargoMaterials)
                  }
                >
                  {t("convoy.unload")}
                </button>
              </>
            )}
          </div>
          <div className="cmd-row">
            <button
              className={`pill ${input.routeMode ? "on" : ""}`}
              title={t("tip.route")}
              onClick={() => input.toggleRouteMode()}
            >
              <Route size={12} />
              {t("sel.route")}
            </button>
            <span className="cmd-label">{t("convoy.escort")}</span>
            {frame.squads.map((q) => (
              <button
                key={q.id}
                className={`pill ${v.escort === q.id ? "on" : ""}`}
                title={t("convoy.escortHint")}
                onClick={() =>
                  input.escortSquad(v.escort === q.id ? null : q.id)
                }
              >
                <Footprints size={12} />
                {q.name}
              </button>
            ))}
          </div>
          <div className="hint muted">{t("convoy.hint")}</div>
        </>
      )}
    </div>
  );
}

/** A clicked structure: its state, a nest's ammunition, and repair or take it down. */
function StructurePanel({
  frame,
  id,
  input,
}: {
  frame: Frame;
  id: number;
  input: InputController;
}) {
  const st = frame.structures.find((x) => x.id === id);
  if (!st) return <div className="selection panel muted">{t("sel.none")}</div>;
  const Icon = st.kind === "command_post" ? Flag : STRUCTURE_ICON[st.kind];
  const damaged = st.built && st.hp < st.maxHp;
  const engineers = frame.squads.some((q) => q.kind === "engineers" && q.alive > 0);
  const nest = st.kind === "mg_nest";
  const base = frame.bases.find((b) => b.kind === "base");
  return (
    <div className="selection panel structure-panel">
      <div className="sel-head">
        <b>
          <Icon size={15} /> {t(`structure.${st.kind}`)}
        </b>
        <span className="sel-stats">
          <Stat icon={Heart}>
            {Math.max(0, Math.round(st.hp))}/{st.maxHp}
          </Stat>
          {!st.built && (
            <span className="muted">
              {t("struct.building").replace("{n}", String(Math.floor(st.progress * 100)))}
            </span>
          )}
          {st.pile > 0 && (
            <Stat icon={Biohazard} className="warn">
              {st.pile}
            </Stat>
          )}
        </span>
      </div>
      <Meter value={st.hp / st.maxHp} />
      {nest && st.built && (
        <div className="struct-ammo">
          <span className={st.ammo === 0 ? "warn" : ""}>
            <Target size={12} />{" "}
            {st.ammo >= 0
              ? t("struct.ammoOwn").replace("{n}", String(st.ammo)).replace("{max}", String(MG_NEST.fieldAmmo))
              : t("struct.ammoBase").replace("{s}", base?.name ?? "").replace("{n}", String(base?.ammo ?? 0))}
          </span>
          <span className="muted">
            {t("struct.fired").replace("{n}", String(st.fired)).replace("{s}", String(Math.round(st.fired / MG_NEST.shotsPerS)))}
          </span>
        </div>
      )}
      <div className="cmd-row">
        {damaged && (
          <button className="pill go" title={t("struct.repairHint")} disabled={!engineers} onClick={() => input.repair(st.id)}>
            <Wrench size={12} />
            {t("sel.repair")}
          </button>
        )}
        {st.kind === "gate" && st.built && (
          <button className="pill" onClick={() => input.toggleGate(st.id)}>
            <DoorOpen size={12} />
            <Key k="G" />
          </button>
        )}
        <button className="pill" title={t("struct.dismantleHint")} onClick={() => input.dismantle(st.id)}>
          <Hammer size={12} />
          {t("struct.dismantle")}
        </button>
      </div>
      <div className="hint muted">
        {nest && st.ammo >= 0 ? t("struct.refillHint") : damaged ? t(engineers ? "struct.repairHint" : "reason.no_engineers") : ""}
      </div>
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
        <div className="direct-hint muted">
          {document.pointerLockElement ? t("direct.exit") : t("direct.lock")}
        </div>
        <div className="direct-ammo panel">
          <span
            className={`big ${mag === 0 ? "danger" : mag < 8 ? "warn" : ""}`}
          >
            {mag}
          </span>
          <span className="reserve">/ {total - mag}</span>
          <Target size={18} />
        </div>
      </div>
    </>
  );
}

// ----- Summary -----

function Summary({
  frame,
  shell,
  seed,
}: {
  frame: Frame;
  shell: Shell;
  seed: number;
}) {
  const m = frame.mission!;
  const won = m.phase === "won";
  useEffect(() => {
    if (won) shell.completeMission(m.id);
  }, [won, m.id, shell]);
  const lost =
    frame.soldiers.length / SOLDIER_STRIDE - frame.stats.soldiersAlive;
  const done = m.objectives.filter((o) => o.state === "done").length;
  const waves = m.objectives.find((o) => o.kind === "waves");
  const index = MISSION_IDS.indexOf(m.id);
  const next = index >= 0 ? MISSION_IDS[index + 1] : undefined;
  const endless = m.objectives.some((o) => o.kind === "endless");
  const [newBest, setNewBest] = useState(false);
  useEffect(() => {
    if (!endless || m.phase !== "lost") return;
    const run = { nights: m.wave, killed: frame.stats.zombiesKilled };
    if (shell.recordSurvival(frame.difficulty, run)) setNewBest(true);
    // Once, when the run ends.
  }, [endless, m.phase]);
  const best = endless ? shell.settings.survivalBest[frame.difficulty] : undefined;
  const rows: [LucideIcon, string, ReactNode][] = [
    [Flag, t("summary.objectives"), `${done}/${m.objectives.length}`],
  ];
  if (m.civiliansMax > 0)
    rows.push([
      Users,
      t("summary.civilians"),
      `${m.civilians}/${m.civiliansMax}`,
    ]);
  if (m.evacuated > 0 || m.objectives.some((o) => o.kind === "evacuate"))
    rows.push([Package, t("summary.evacuated"), m.evacuated]);
  if (endless) rows.push([Siren, t("summary.nights"), m.wave]);
  if (best)
    rows.push([
      Trophy,
      t("summary.best"),
      newBest
        ? t("summary.newBest")
        : `${best.nights} · ${best.killed} ${t("top.killed").toLowerCase()}`,
    ]);
  if (waves)
    rows.push([
      Siren,
      t("summary.waves"),
      `${waves.state === "done" ? waves.total : waves.state === "active" ? m.wave : 0}/${waves.total}`,
    ]);
  rows.push(
    [Skull, t("summary.casualties"), lost],
    [Crosshair, t("summary.killed"), frame.stats.zombiesKilled],
    [Clock, t("summary.time"), fmt(frame.tick)],
    [Shield, t("diff.title"), t(`diff.${frame.difficulty}`)],
  );
  return (
    <div className="summary">
      <div className={`panel card ${won ? "won" : "lost"}`}>
        <div className="summary-kicker">{t(`brief.${m.id}.title`)}</div>
        <h1 className={won ? "won" : "lost"}>
          {won ? t("summary.won") : t("summary.lost")}
        </h1>
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
          <button onClick={() => shell.restart(seed, false)}>
            {t("pause.mainMenu")}
          </button>
          <button onClick={() => shell.restart(seed, true)}>
            {t("summary.retry")}
          </button>
          {won && next ? (
            <button className="primary" onClick={() => shell.openMission(next)}>
              {t("summary.nextMission")} <ArrowRight size={14} />
            </button>
          ) : (
            <button
              className="primary"
              onClick={() => shell.restart(1 + Math.floor(Math.random() * 999_999), true)}
            >
              {t("summary.next")} <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function alertText(a: GameClient["state"]["alerts"][number]): string {
  // Pressure groups arrive as wave 0.
  if (a.type === "wave_started" && !a.value) return t("alert.pressure");
  const base = t(`alert.${a.type}`)
    .replace("{n}", String(a.value ?? ""))
    .replace("{s}", a.reason ?? "");
  switch (a.type) {
    case "structure_built":
    case "structure_destroyed":
      return `${base} (${t(`structure.${a.reason}`)})`;
    case "convoy_blocked":
      return `${base} (${t(`policy.${a.reason}`)})`;
    case "district_lost":
    case "district_held":
    case "site_secured":
    case "site_lost":
    case "squad_recruited":
      return `${base}: ${a.reason}`;
    case "cargo_delivered":
      return `${base}: ${a.value} ${t("unit.ammo")} · ${a.reason} ${t("build.stock").toLowerCase()}`;
    case "mission_lost":
      return `${base}: ${t(`loss.${a.reason}`)}`;
    case "wave_warning":
    case "wave_started":
    case "mission_won":
    case "objective_done":
    case "night_survived":
    case "soldier_cured":
    case "civilians_boarded":
    case "civilians_delivered":
    case "vehicle_repaired":
    case "truck_bought":
    case "nest_empty":
    case "ammo_low":
    case "ammo_out":
      return base;
    default:
      return a.reason ? `${base} (${t(`reason.${a.reason}`)})` : base;
  }
}

function fmt(tick: number): string {
  const s = Math.floor(tick / TICK_HZ);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function boxStyle(b: { x0: number; y0: number; x1: number; y1: number }) {
  return {
    left: Math.min(b.x0, b.x1),
    top: Math.min(b.y0, b.y1),
    width: Math.abs(b.x1 - b.x0),
    height: Math.abs(b.y1 - b.y0),
  };
}

/** Right-drag arrow: the move target and the direction the squads will face. */
function FaceArrow({
  a,
}: {
  a: { x0: number; y0: number; x1: number; y1: number };
}) {
  const ang = Math.atan2(a.y1 - a.y0, a.x1 - a.x0);
  const head = (d: number) =>
    `${a.x1 - 14 * Math.cos(ang + d)},${a.y1 - 14 * Math.sin(ang + d)}`;
  return (
    <svg className="face-arrow">
      <circle cx={a.x0} cy={a.y0} r={5} />
      <line x1={a.x0} y1={a.y0} x2={a.x1} y2={a.y1} />
      <polygon points={`${a.x1},${a.y1} ${head(0.45)} ${head(-0.45)}`} />
    </svg>
  );
}
