import { expect, test } from '@playwright/test';
import { frame, startGame, tick, watchErrors } from './helpers.ts';

test('select a squad from the list and order a move with a right click', async ({ page }) => {
  const errors = watchErrors(page);
  await startGame(page);
  await page.getByText('Alfa').first().click();
  await expect(page.locator('.selection b')).toHaveText('Alfa');
  const before = (await frame(page)).squads[0];
  await page.mouse.click(900, 300, { button: 'right' });
  await expect
    .poll(async () => {
      const q = (await frame(page)).squads[0];
      return Math.hypot(q.anchorX - before.anchorX, q.anchorY - before.anchorY);
    })
    .toBeGreaterThan(5);
  expect(errors).toEqual([]);
});

test('build mode places a blueprint inside the base', async ({ page }) => {
  const errors = watchErrors(page);
  await startGame(page);
  const count = async () => (await frame(page)).structures.filter((s) => s.kind !== 'command_post').length;
  expect(await count()).toBe(0);
  await page.keyboard.press('Digit1');
  await expect(page.locator('.build button.on')).toContainText('HESCO');
  // Try a few spots around the screen centre (the camera starts on the base).
  for (const [dx, dy] of [
    [40, 0],
    [-40, 0],
    [0, 40],
    [0, -40],
    [60, 60],
  ]) {
    await page.mouse.click(640 + dx, 360 + dy);
    if ((await count()) > 0) break;
    await page.waitForTimeout(300);
  }
  await expect.poll(count).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('plan and send a convoy (M6.3)', async ({ page }) => {
  const errors = watchErrors(page);
  await startGame(page);
  await page.getByText('Caminhão de carga').first().click();
  await page.getByRole('button', { name: 'Forçar passagem' }).click();
  await page.getByRole('button', { name: '→ Posto Âncora' }).click();
  await expect.poll(async () => (await frame(page)).vehicles[0].state).toBe('moving');
  await expect.poll(async () => (await frame(page)).vehicles[0].policy).toBe('push_through');
  const v0 = (await frame(page)).vehicles[0];
  await page.keyboard.press('F3');
  await expect
    .poll(async () => {
      const v = (await frame(page)).vehicles[0];
      return Math.hypot(v.x - v0.x, v.y - v0.y);
    })
    .toBeGreaterThan(20);
  expect(errors).toEqual([]);
});

test('soak: the game runs at 4x without errors', async ({ page }) => {
  const minutes = Number(process.env.SOAK_MINUTES ?? 0.5);
  test.setTimeout(minutes * 60_000 + 120_000);
  const errors = watchErrors(page);
  await startGame(page);
  await page.keyboard.press('F3');
  const start = await tick(page);
  await page.waitForTimeout(minutes * 60_000);
  expect(await tick(page)).toBeGreaterThan(start + 50);
  expect(errors).toEqual([]);
});
