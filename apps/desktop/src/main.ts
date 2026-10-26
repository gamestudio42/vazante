import { app, BrowserWindow, ipcMain, Menu, net, protocol, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Desktop shell: serves the built web game from `app://game/` with cross-origin isolation, in a
 * sandboxed window with a minimal preload. Works offline; Steam is optional.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const GAME_DIR = path.join(here, '..', 'game');
const ORIGIN = 'app://game';
const smoke = process.argv.includes('--smoke');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
};

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

async function serve(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (url.host !== 'game') return new Response('Not found', { status: 404 });
  const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.normalize(path.join(GAME_DIR, rel));
  if (!file.startsWith(GAME_DIR + path.sep)) return new Response('Not found', { status: 404 });
  const res = await net.fetch(pathToFileURL(file).toString());
  if (!res.ok) return new Response('Not found', { status: 404 });
  return new Response(res.body, {
    status: 200,
    headers: {
      'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream',
      // Cross-origin isolation: SharedArrayBuffer for the horde buffers.
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'",
    },
  });
}

/** Steam is optional: without steamworks.js or a running Steam client the game still opens. */
async function initSteam(): Promise<void> {
  const appId = Number(process.env.VAZANTE_STEAM_APP_ID ?? 0);
  if (!appId) return;
  try {
    const mod = 'steamworks.js';
    const steamworks = (await import(mod)) as { init(appId: number): unknown };
    steamworks.init(appId);
  } catch (err) {
    console.warn('Steam unavailable, continuing without it:', err instanceof Error ? err.message : err);
  }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#12161a',
    title: 'Vazante',
    show: !smoke,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(here, '..', 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
    },
  });
  // Stay inside the game: external links open in the browser, nothing else navigates.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGIN)) e.preventDefault();
  });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    }
  });
  void win.loadURL(`${ORIGIN}/index.html`);
  return win;
}

/** `--smoke`: open the game hidden, check it boots isolated, print the result and exit. */
async function runSmoke(win: BrowserWindow): Promise<void> {
  const deadline = Date.now() + 60_000;
  let result: unknown = null;
  while (Date.now() < deadline) {
    result = await win.webContents
      .executeJavaScript(
        `({ ready: !!(window.vazante && window.vazante.view && window.vazante.view.latest), isolated: crossOriginIsolated, href: location.href, tick: window.vazante?.view?.latest?.tick ?? -1 })`,
      )
      .catch(() => null);
    if ((result as { ready?: boolean } | null)?.ready) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  const ok = (result as { ready?: boolean; isolated?: boolean } | null)?.ready === true && (result as { isolated?: boolean }).isolated === true;
  console.log(`SMOKE ${JSON.stringify(result)}`);
  app.exit(ok ? 0 : 1);
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  ipcMain.on('vazante:quit', () => app.quit());
  protocol.handle('app', serve);
  await initSteam();
  const win = createWindow();
  if (smoke) await runSmoke(win);
});

app.on('window-all-closed', () => app.quit());
