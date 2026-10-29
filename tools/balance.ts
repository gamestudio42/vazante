/**
 * Plays the campaign missions headless with a simple scripted commander and reports how each run
 * ended: `pnpm balance [mission] [difficulty] [seeds]`. The commander is plain on purpose (no
 * building, no direct control), so a mission it wins at veteran is fair for a careful player.
 */
import {
  CELL_SIZE,
  MISSIONS,
  TICK_HZ,
  type DifficultyId,
  type MissionId,
} from "@vazante/shared";
import { SimulationEngine, drivenAlive } from "@vazante/simulation";

const LIMIT_TICKS = Number(process.env.LIMIT_MIN ?? 45) * 60 * TICK_HZ;
const THINK_TICKS = 20;

type Pt = [number, number];

function centreOf(r: { x0: number; y0: number; x1: number; y1: number }): Pt {
  return [
    ((r.x0 + r.x1 + 1) / 2) * CELL_SIZE,
    ((r.y0 + r.y1 + 1) / 2) * CELL_SIZE,
  ];
}

export interface RunResult {
  mission: MissionId;
  difficulty: DifficultyId;
  seed: number;
  phase: string;
  reason: string;
  stage: number;
  /** Survival: nights survived. */
  nights: number;
  minutes: number;
  lost: number;
  soldiers: number;
  killed: number;
}

export function playMission(
  id: MissionId,
  difficulty: DifficultyId,
  seed: number,
): RunResult {
  const e = SimulationEngine.create(seed, id, { difficulty });
  const w = e.world;
  const m = w.mission!;
  const def = MISSIONS[id];
  const home = w.baseById(m.base)!;
  const [bx, by] = centreOf(home);
  const soldiers = w.soldiers.length;
  const sent = new Map<number, string>();
  let truckOrder = "";

  const send = (
    squad: number,
    [x, y]: Pt,
    spread: number,
    i: number,
    n: number,
  ) => {
    const q = w.squad(squad)!;
    const ox = (i - (n - 1) / 2) * spread;
    const to = { x: x + ox, y };
    const key = `${Math.round(to.x)},${Math.round(to.y)}`;
    const far = Math.hypot(q.ax - to.x, q.ay - to.y) > 25;
    if (sent.get(squad) === key && !(far && q.order.kind !== "move")) return;
    sent.set(squad, key);
    e.enqueue({ type: "move", squads: [squad], to });
    e.enqueue({ type: "stance", squads: [squad], stance: "aggressive" });
  };
  const convoy = (to: number) => {
    const v = w.vehicle(m.trucks[0]);
    if (!v || v.state === "destroyed") return;
    const key = `${to}`;
    if (
      truckOrder === key &&
      (v.state === "moving" || w.siteAt(v.x, v.y)?.id === to)
    )
      return;
    truckOrder = key;
    e.enqueue({ type: "convoy", vehicle: v.id, to, policy: "push_through" });
  };

  const drivenSpot = () => {
    const z = w.zombies;
    let n = 0,
      sx = 0,
      sy = 0,
      st = 0;
    for (let s = 0; s < z.highWater; s++)
      if (z.isAlive(s) && z.driven[s]) {
        n++;
        sx += z.x[s];
        sy += z.y[s];
        st += z.state[s];
      }
    return n
      ? `${Math.round(sx / n)},${Math.round(sy / n)} st${(st / n).toFixed(1)}`
      : "";
  };
  e.enqueue({ type: "set_speed", speed: 1 });
  while (w.tick < LIMIT_TICKS && m.phase === "active") {
    if (w.tick % THINK_TICKS === 0) {
      const st = def.stages[m.stage];
      const squads = w.squads
        .filter((q) => q.members.some((s) => w.soldier(s)!.hp > 0))
        .map((q) => q.id);
      let target: Pt = [bx, by];
      if (st.kind === "reach" || st.kind === "hold" || st.kind === "evacuate")
        target = centreOf(m.zones[st.zone]);
      if (st.kind === "waves" && st.zone !== undefined)
        target = centreOf(m.zones[st.zone]);
      if (st.kind === "retake") {
        const d = w.districts.find((x) => x.name === st.district)!;
        target = centreOf(d);
      }
      if (st.kind === "deliver") {
        // Escort: walk with the truck once it moves, otherwise go to where it is.
        const v = w.vehicle(m.trucks[st.truck]);
        if (v) target = [v.x, v.y];
        convoy(m.base);
      }
      if (st.kind === "evacuate") {
        const z = m.zones[st.zone];
        const site = w.bases.find((b) => b.name === z.name);
        if (site) convoy(site.id);
      }
      squads.forEach((q, i) => send(q, target, 12, i, squads.length));
      if (process.env.DEBUG && w.tick % Number(process.env.EVERY ?? 3000) === 0)
        console.log(
          w.tick / 600,
          "min stage",
          m.stage,
          "target",
          target.map(Math.round),
          w.squads
            .map(
              (q) => `${q.order.kind}@${Math.round(q.ax)},${Math.round(q.ay)}`,
            )
            .join(" "),
          m.waveState,
          m.wave,
          drivenAlive(w),
          drivenSpot(),
        );
    }
    e.tick();
  }
  if (process.env.DEBUG) {
    const z = w.zombies;
    const g = w.grid;
    const hist = new Map<string, number>();
    for (let s = 0; s < z.highWater; s++) {
      if (!z.isAlive(s) || !z.driven[s]) continue;
      const c = g.cellAt(z.x[s], z.y[s]);
      const k = `${Math.round(z.x[s] / 20) * 20},${Math.round(z.y[s] / 20) * 20} st=${z.state[s]} flow=${g.flow[c]} stack=${z.stack[s]}`;
      hist.set(k, (hist.get(k) ?? 0) + 1);
    }
    console.log([...hist].sort((a, b) => b[1] - a[1]).slice(0, 12));
  }
  let alive = 0;
  for (const s of w.soldiers) if (s.hp > 0 && s.condition <= 1) alive++;
  return {
    mission: id,
    difficulty,
    seed,
    phase: m.phase,
    reason: m.reason,
    stage: m.stage,
    nights: def.stages.some((st) => st.kind === "endless") ? m.wave : 0,
    minutes: Math.round((w.tick / TICK_HZ / 60) * 10) / 10,
    lost: soldiers - alive,
    soldiers,
    killed: w.stats.zombiesKilled,
  };
}

const [only, diffArg, seedsArg] = process.argv.slice(2);
const missions = (
  only && only !== "all" ? [only] : ["hospital", "bridge", "retake"]
) as MissionId[];
const diffs = (
  diffArg && diffArg !== "all" ? [diffArg] : ["recruit", "veteran", "nightmare"]
) as DifficultyId[];
const seeds = Array.from({ length: Number(seedsArg ?? 3) }, (_, i) => i + 1);
for (const id of missions)
  for (const d of diffs)
    for (const seed of seeds) {
      const r = playMission(id, d, seed);
      console.log(
        `${r.mission.padEnd(9)} ${r.difficulty.padEnd(9)} seed=${r.seed} ${r.phase.padEnd(6)} ${(r.reason || "-").padEnd(24)} stage=${r.stage}${r.nights ? ` nights=${r.nights}` : ""} ${String(r.minutes).padStart(5)} min lost=${r.lost}/${r.soldiers} killed=${r.killed}`,
      );
    }
