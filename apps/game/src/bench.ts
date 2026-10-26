import type { GameRenderer } from '@vazante/view3d';
import type { GameClient } from './client.ts';

export interface FrameBenchResult {
  gpu: string;
  width: number;
  height: number;
  pixelRatio: number;
  frames: number;
  seconds: number;
  fps: number;
  p50Ms: number;
  p95Ms: number;
  worstMs: number;
  zombies: number;
  soldiers: number;
  meanTickMs: number;
}

/**
 * Frame-time benchmark (`?bench`): a horde attacks the base in the tactical view at 1x while frame
 * times are recorded. The result goes to the console, `window.vazanteBench` and a panel.
 */
export async function runFrameBench(client: GameClient, view: GameRenderer, attackers: number, seconds: number): Promise<FrameBenchResult> {
  const map = view.map;
  const base = map.sites.find((s) => s.kind === 'base')!;
  const bx = ((base.x0 + base.x1 + 1) / 2) * map.cellSize;
  const by = ((base.y0 + base.y1 + 1) / 2) * map.cellSize;
  view.rig.centerOn(bx, by);
  client.send({ type: 'set_speed', speed: 1 });
  client.send({ type: 'debug_spawn', at: { x: bx, y: by - 70 }, count: attackers });
  await wait(3000);
  const frames: number[] = [];
  let tickMs = 0;
  let tickN = 0;
  const off = client.onFrame((f) => {
    tickMs += f.stats.tickMs;
    tickN++;
  });
  await new Promise<void>((resolve) => {
    let last = performance.now();
    const end = last + seconds * 1000;
    const step = (now: number) => {
      frames.push(now - last);
      last = now;
      if (now < end) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
  off();
  const sorted = frames.slice(1).sort((a, b) => a - b);
  const total = sorted.reduce((s, x) => s + x, 0);
  const f = client.state.frame!;
  const gl = view.renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    gpu: dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown',
    width: innerWidth,
    height: innerHeight,
    pixelRatio: devicePixelRatio,
    frames: sorted.length,
    seconds,
    fps: (sorted.length * 1000) / total,
    p50Ms: sorted[Math.floor(sorted.length * 0.5)],
    p95Ms: sorted[Math.floor(sorted.length * 0.95)],
    worstMs: sorted[sorted.length - 1],
    zombies: f.stats.zombiesAlive,
    soldiers: f.stats.soldiersAlive,
    meanTickMs: tickN ? tickMs / tickN : 0,
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
