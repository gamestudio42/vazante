import { expect, test } from '@playwright/test';
import { SOLDIER_STRIDE, SoldierField } from '@vazante/shared';
import { frame, startGame, watchErrors } from './helpers.ts';

test('squads call contact and losses on the radio, by name, and special infected are marked', async ({ page }) => {
  const errors = watchErrors(page);
  await startGame(page);
  const f = await frame(page);
  const first = { x: f.soldiers[SoldierField.X], y: f.soldiers[SoldierField.Y] };
  const all: { x: number; y: number }[] = [];
  for (let o = 0; o < f.soldiers.length; o += SOLDIER_STRIDE) all.push({ x: f.soldiers[o + SoldierField.X], y: f.soldiers[o + SoldierField.Y] });
  await page.evaluate(
    ({ first, all }) => {
      const v = (window as unknown as { vazante: { client: { send(c: unknown): void }; view: { rig: { centerOn(x: number, y: number): void } } } }).vazante;
      v.view.rig.centerOn(first.x, first.y);
      // Runners and brutes on every soldier: contact first, then losses.
      for (const p of all) v.client.send({ type: 'debug_spawn', at: p, count: 5, kind: 2 });
      v.client.send({ type: 'debug_spawn', at: first, count: 10, kind: 1 });
      v.client.send({ type: 'set_speed', speed: 1 });
    },
    { first, all },
  );
  const radio = page.locator('.radio');
  await expect(radio.locator('.radio-line').first()).toBeVisible({ timeout: 20_000 });
  // A loss names the soldier from the campaign roster.
  await expect(radio.getByText(/(Perdemos|foi mordido|Pegaram|caiu|não levanta).*Rct\. [A-ZÁ-Ú]/).first()).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => (window as unknown as { vazante: { client: { send(c: unknown): void } } }).vazante.client.send({ type: 'set_speed', speed: 0 }));
  await page.screenshot({ path: 'test-results/radio.png' });
  // Alerts name the soldier too, the bitten one included (the bite's source is the zombie).
  await expect(page.locator('.alerts').getByText(/Soldado (morto|mordido|transformado).*: Rct\. /).first()).toBeVisible();
  // Contact calls moved from the alerts to the radio.
  await expect(page.locator('.alerts').getByText('Contato! Esquadrão em combate')).toHaveCount(0);
  // Every brute and runner on screen has its ground mark.
  const marks = await page.evaluate(() => (window as unknown as { vazante: { view: { threatMesh: { count: number } } } }).vazante.view.threatMesh.count);
  expect(marks).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
