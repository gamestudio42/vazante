import { expect, test } from '@playwright/test';
import { startGame, watchErrors } from './helpers.ts';

test('without WebGL 2 the player sees why the game cannot start', async ({ page }) => {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, id: string, ...rest: unknown[]) {
      if (id === 'webgl2' || id === 'webgl') return null;
      return (get as (...a: unknown[]) => unknown).call(this, id, ...rest);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto('/?seed=1');
  await expect(page.getByRole('alert')).toContainText('WebGL 2 indisponível', { timeout: 15_000 });
  await expect(page.getByText('Gerando a cidade…')).toBeHidden();
});

test('a played game is kept in the local playtest log and can be exported', async ({ page }) => {
  const errors = watchErrors(page);
  await startGame(page);
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  const log = await page.evaluate(() => JSON.parse(localStorage.getItem('vazante.playtest') ?? 'null') as { sessions: { scenario: string; events: { kind: string; v?: string }[] }[] });
  expect(log.sessions).toHaveLength(1);
  expect(log.sessions[0].scenario).toBe('last_convoy');
  expect(log.sessions[0].events.map((e) => `${e.kind}:${e.v ?? ''}`)).toEqual(expect.arrayContaining(['start:', 'screen:briefing', 'screen:playing', 'screen:paused']));

  await page.getByRole('button', { name: 'Configurações' }).click();
  await expect(page.getByText('1 partidas registradas')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar' }).click();
  expect((await download).suggestedFilename()).toMatch(/^vazante-playtest-\d{4}-\d{2}-\d{2}\.json$/);
  expect(errors).toEqual([]);
});
