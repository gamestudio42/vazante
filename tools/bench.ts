import { cpus } from 'node:os';
import { hex32 } from '@vazante/kernel';
import { SimulationEngine } from '@vazante/simulation';

/**
 * Simulation benchmark. Each case runs a fixed seed and command script, then reports mean, p95 and
 * worst tick plus a per-system breakdown. `pnpm bench [ticks] [--json]`.
 */
const ticks = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 1200);
const json = process.argv.includes('--json');

interface Result {
  name: string;
  zombies: number;
  ticks: number;
  mean: number;
  p95: number;
  worst: number;
  systems: Record<string, number>;
  hash: string;
}

function run(name: string, zombies: number, attackers: number): Result {
  const e = SimulationEngine.create(7, 'last_convoy', { zombies });
  const w = e.world;
  const base = w.bases.find((b) => b.kind === 'base')!;
  const bx = ((base.x0 + base.x1 + 1) / 2) * 4;
  const by = ((base.y0 + base.y1 + 1) / 2) * 4;
  // Send the truck (noise across the city) and drop a horde on the base, so every system works.
  e.enqueue({ type: 'convoy', vehicle: w.vehicles[0].id, to: base.id, policy: 'push_through' });
  if (attackers > 0) e.enqueue({ type: 'debug_spawn', at: { x: bx, y: by - 90 }, count: attackers });
  e.runTicks(20);
  const systems: Record<string, number> = {};
  e.profiler = (n, f) => {
    const a = performance.now();
    f();
    systems[n] = (systems[n] ?? 0) + performance.now() - a;
  };
  const times: number[] = [];
  for (let i = 0; i < ticks; i++) {
    const a = performance.now();
    e.tick();
    times.push(performance.now() - a);
    if (i % 50 === 0) w.events = [];
  }
  times.sort((x, y) => x - y);
  const mean = times.reduce((s, x) => s + x, 0) / times.length;
  for (const k of Object.keys(systems)) systems[k] /= ticks;
  return { name, zombies: w.zombies.alive, ticks, mean, p95: times[Math.floor(times.length * 0.95)], worst: times[times.length - 1], systems, hash: hex32(e.hashState()) };
}

const cases: [string, number, number][] = [
  ['slice (200)', 200, 0],
  ['slice + attack (200 + 300)', 200, 300],
  ['1,000', 1000, 300],
  ['4,000', 4000, 300],
  ['8,000', 8000, 300],
];
const results = cases.map(([n, z, a]) => run(n, z, a));
if (json) console.log(JSON.stringify({ cpu: cpus()[0]?.model, node: process.version, ticks, results }, null, 2));
else {
  console.log(`cpu: ${cpus()[0]?.model} · node ${process.version} · ${ticks} ticks per case`);
  for (const r of results) {
    const top = Object.entries(r.systems)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k, v]) => `${k} ${v.toFixed(2)}`)
      .join(', ');
    console.log(`${r.name.padEnd(28)} alive ${String(r.zombies).padStart(5)}  mean ${r.mean.toFixed(2)} ms  p95 ${r.p95.toFixed(2)}  worst ${r.worst.toFixed(1)}  | ${top}`);
  }
}
