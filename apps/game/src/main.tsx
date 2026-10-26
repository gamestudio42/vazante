import { createRoot } from 'react-dom/client';
import { AudioDirector } from '@vazante/audio';
import { GameRenderer } from '@vazante/view3d';
import { GameClient } from './client.ts';
import { InputController } from './input.ts';
import { App } from './ui/App.tsx';
import './styles.css';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') ?? 1) >>> 0;

const root = document.getElementById('root')!;
const canvas = document.createElement('canvas');
canvas.className = 'game';
document.body.prepend(canvas);
const client = new GameClient(seed);

const unsubscribe = client.subscribe(() => {
  const map = client.state.map;
  if (!map) return;
  unsubscribe();
  start(map);
});

function start(map: NonNullable<GameClient['state']['map']>): void {
  const view = new GameRenderer(canvas, map);
  const base = map.sites.find((s) => s.kind === 'base');
  if (base) view.rig.centerOn(((base.x0 + base.x1 + 1) / 2) * map.cellSize, ((base.y0 + base.y1 + 1) / 2) * map.cellSize);
  const input = new InputController(canvas, client, view);
  const audio = new AudioDirector();
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  input.feedback = (k) => audio.playUi(k);
  input.onToggleMute = () => audio.setMuted(!audio.muted);
  client.onFrame((f) => {
    view.pushFrame(f, performance.now());
    audio.onFrame(f);
  });

  const resize = () => view.resize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', resize);
  resize();

  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    input.update(dt, now);
    view.render(now, dt);
    const rig = view.rig;
    const d = rig.direct;
    audio.setListener(d ? { x: d.x, y: d.y, yaw: d.yaw, span: 40, direct: true } : { x: rig.focusX, y: rig.focusY, yaw: rig.yaw, span: rig.span, direct: false });
    audio.update(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  createRoot(root).render(<App client={client} input={input} view={view} />);
  // Exposed for e2e tests and debugging; read-only access to the mirror.
  (window as unknown as { vazante: unknown }).vazante = { client, view, input, audio };
}
