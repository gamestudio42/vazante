import { expect, type Page } from '@playwright/test';
import type { Frame } from '@vazante/shared';

/** Page errors and console errors collected during a test; every test asserts this stays empty. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

/** Latest simulation frame mirrored on the main thread (read only). */
export function frame(page: Page): Promise<Frame> {
  return page.evaluate(() => (window as unknown as { vazante: { view: { latest: Frame } } }).vazante.view.latest);
}

export async function tick(page: Page): Promise<number> {
  return (await frame(page)).tick;
}

export function stateHash(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const w = (window as unknown as { vazante: { client: { worker: Worker } } }).vazante.client.worker;
        const on = (ev: MessageEvent<{ type: string; hash: number }>) => {
          if (ev.data.type !== 'hash') return;
          w.removeEventListener('message', on);
          resolve(ev.data.hash);
        };
        w.addEventListener('message', on);
        w.postMessage({ type: 'request_hash' });
      }),
  );
}

/** Fresh browser storage, Portuguese UI, main menu → briefing → playing. */
export async function startGame(page: Page, seed = 1): Promise<void> {
  await page.goto(`/?seed=${seed}`);
  await page.evaluate(() => {
    localStorage.clear();
    indexedDB.deleteDatabase('vazante');
  });
  await page.goto(`/?seed=${seed}`);
  await page.getByRole('button', { name: 'Nova partida' }).click({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Começar' }).click();
  await expect.poll(() => tick(page), { timeout: 10_000 }).toBeGreaterThan(0);
}
