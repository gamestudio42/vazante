import { createRoot } from 'react-dom/client';
import { AudioDirector } from '@vazante/audio';
import type { SaveGame } from '@vazante/shared';
import { GameRenderer } from '@vazante/view3d';
import { GameClient } from './client.ts';
import { setLocale, t } from './i18n.ts';
import { InputController } from './input.ts';
import { loadSettings } from './settings.ts';
import { Shell, type Screen } from './shell.ts';
import { getSave } from './storage.ts';
import { App } from './ui/App.tsx';
import './styles.css';

const params = new URLSearchParams(location.search);
const settings = loadSettings();
setLocale(settings.locale);

const root = document.getElementById('root')!;
const canvas = document.createElement('canvas');
canvas.className = 'game';
document.body.prepend(canvas);
const reactRoot = createRoot(root);
reactRoot.render(<div className="boot">{t('boot.loading')}</div>);

void boot();

async function boot(): Promise<void> {
  const slot = params.get('load');
  let save: SaveGame | null = null;
  if (slot) {
    try {
      save = await getSave(slot);
    } catch {
      save = null;
    }
  }
  const seed = (save?.seed ?? Number(params.get('seed') ?? 1)) >>> 0;
  const initial: Screen = save ? 'paused' : params.has('play') ? 'briefing' : 'menu';
  const client = new GameClient(seed, save ?? undefined);
  const unsubscribe = client.subscribe(() => {
    const map = client.state.map;
    if (!map) return;
    unsubscribe();
    start(client, map, initial);
  });
}

function start(client: GameClient, map: NonNullable<GameClient['state']['map']>, initial: Screen): void {
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
  const shell = new Shell(client, input, view, audio, settings, initial);
  // A save that no longer matches the rules starts a fresh game on the same city.
  let reported = false;
  client.subscribe(() => {
    if (!client.state.loadError || reported) return;
    reported = true;
    shell.notify(t('toast.loadFailed'));
    shell.newGame();
  });

  const resize = () => view.resize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', resize);
  resize();

  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    shell.update(dt);
    input.update(dt, now);
    view.render(now, dt);
    const rig = view.rig;
    const d = rig.direct;
    audio.setListener(d ? { x: d.x, y: d.y, yaw: d.yaw, span: 40, direct: true } : { x: rig.focusX, y: rig.focusY, yaw: rig.yaw, span: rig.span, direct: false });
    audio.update(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  reactRoot.render(<App client={client} input={input} view={view} shell={shell} />);
  // Exposed for e2e tests and debugging; read-only access to the mirror.
  (window as unknown as { vazante: unknown }).vazante = { client, view, input, audio, shell };
}
