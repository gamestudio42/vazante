import { createRoot } from 'react-dom/client';
import { AudioDirector } from '@vazante/audio';
import { MISSION_IDS, MISSIONS, type CrewSeat, type SaveGame } from '@vazante/shared';
import { GameRenderer } from '@vazante/view3d';
import { GameClient } from './client.ts';
import { setLocale, t } from './i18n.ts';
import { InputController } from './input.ts';
import { loadSettings, newGameSeed } from './settings.ts';
import { Shell, type Screen } from './shell.ts';
import { getSave } from './storage.ts';
import { probe } from './probe.ts';
import { PlaytestRecorder } from './playtest-recorder.ts';
import { runFrameBench } from './bench.ts';
import { App } from './ui/App.tsx';
import { crewFor, loadRoster, saveRoster } from './roster.ts';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
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

void boot().catch((err: unknown) => fatal('boot.failed', err));

/** A screen that replaces the game when it cannot run, so the player is never left on "loading". */
function fatal(key: 'boot.noWebgl' | 'boot.failed', err?: unknown): void {
  if (err) console.error(err);
  canvas.remove();
  reactRoot.render(
    <div className="boot fatal" role="alert">
      <h1>{t(`${key}.title`)}</h1>
      <p>{t(`${key}.body`)}</p>
    </div>,
  );
}

/** The renderer needs WebGL 2; checked before the city is generated. */
function webgl2Available(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
}

function gpuName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown';
}

async function boot(): Promise<void> {
  if (!webgl2Available()) {
    fatal('boot.noWebgl');
    return;
  }
  const slot = params.get('load');
  let save: SaveGame | null = null;
  if (slot) {
    try {
      save = await getSave(slot);
    } catch {
      save = null;
    }
  }
  const seed = (save?.seed ?? (params.has('seed') ? Number(params.get('seed')) : newGameSeed(settings))) >>> 0;
  const initial: Screen = params.has('bench') ? 'playing' : save ? 'paused' : params.has('play') ? 'briefing' : 'menu';
  const scenario = params.get('scenario') ?? 'last_convoy';
  // Campaign missions field the roster: the same soldiers, ranked, with recruits in empty slots.
  let crew: CrewSeat[][] | undefined;
  if (!save && !params.has('bench') && (MISSION_IDS as readonly string[]).includes(scenario)) {
    const filled = crewFor(loadRoster(), MISSIONS[scenario as keyof typeof MISSIONS].squads, Math.random);
    saveRoster(filled.roster);
    crew = filled.crew;
  }
  const client = new GameClient(seed, save ?? undefined, params.has('bench') ? 'veteran' : settings.difficulty, scenario, crew);
  const unsubscribe = client.subscribe(() => {
    const map = client.state.map;
    if (!map) return;
    unsubscribe();
    start(client, map, initial).catch((err: unknown) => fatal('boot.failed', err));
  });
}

async function start(client: GameClient, map: NonNullable<GameClient['state']['map']>, initial: Screen): Promise<void> {
  const view = new GameRenderer(canvas, map);
  try {
    await view.loadModels(`${import.meta.env.BASE_URL}models/`);
  } catch (err) {
    console.warn('character models unavailable, using block figures', err);
  }
  await view.loadEffects(`${import.meta.env.BASE_URL}vfx/`);
  view.warmUp();
  const base = map.sites.find((s) => s.kind === 'base');
  if (base) view.rig.centerOn(((base.x0 + base.x1 + 1) / 2) * map.cellSize, ((base.y0 + base.y1 + 1) / 2) * map.cellSize);
  const input = new InputController(canvas, client, view);
  const audio = new AudioDirector(`${import.meta.env.BASE_URL}audio/`);
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
  const playtest = new PlaytestRecorder(client, shell, gpuName(view.renderer.getContext()));
  shell.playtest = playtest;
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
    const t0 = performance.now();
    shell.update(dt);
    playtest.update(dt);
    const t1 = performance.now();
    input.update(dt, now);
    const t2 = performance.now();
    view.render(now, dt);
    const t3 = performance.now();
    const rig = view.rig;
    const d = rig.direct;
    audio.setListener(d ? { x: d.x, y: d.y, yaw: d.yaw, span: 40, direct: true } : { x: rig.focusX, y: rig.focusY, yaw: rig.yaw, span: rig.span, direct: false });
    audio.update(dt);
    probe.shellMs = t1 - t0;
    probe.inputMs = t2 - t1;
    probe.renderMs = t3 - t2;
    probe.audioMs = performance.now() - t3;
    probe.programs = view.renderer.info.programs?.length ?? 0;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  reactRoot.render(<App client={client} input={input} view={view} shell={shell} />);
  if (params.has('bench')) {
    void runFrameBench(client, view, Number(params.get('attackers') ?? 300), Number(params.get('seconds') ?? 20)).then((r) => {
      console.log(`BENCH ${JSON.stringify(r)}`);
      (window as unknown as { vazanteBench: unknown }).vazanteBench = r;
      shell.notify(`${r.fps.toFixed(1)} fps at ${Math.round(r.refreshHz)} Hz · p95 ${r.p95Ms.toFixed(1)} ms · ${r.gpu}`);
    });
  }
  // Exposed for e2e tests and debugging; read-only access to the mirror.
  (window as unknown as { vazante: unknown }).vazante = { client, view, input, audio, shell };
}
