import { expect, test, type Page } from '@playwright/test';
import { MOODS, SCENES } from '@vazante/shared';
import { tick, watchErrors } from './helpers.ts';

const span = (page: Page) => page.evaluate(() => (window as unknown as { vazante: { view: { rig: { span: number } } } }).vazante.view.rig.span);
const look = (page: Page) => page.evaluate(() => (window as unknown as { vazante: { view: { post: { look: { saturation: number; grade: number[] } } } } }).vazante.view.post.look);

test('a mission opens wide with its title, closes in on the base, and wears its mood', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?seed=1');
  await page.evaluate(() => localStorage.setItem('vazante.settings', JSON.stringify({ tutorialSeen: true, locale: 'pt-BR' })));
  await page.goto('/?seed=1&scenario=hospital&play=1&unlock=1');
  await page.getByRole('button', { name: 'Começar' }).click({ timeout: 60_000 });
  await expect.poll(() => tick(page), { timeout: 10_000 }).toBeGreaterThan(0);

  await expect(page.locator('.title-card')).toContainText('Hospital São Lucas');
  expect(await span(page)).toBeGreaterThan(200);
  await page.screenshot({ path: 'test-results/opening.png' });
  await expect.poll(() => span(page), { timeout: (SCENES.openingSeconds + 4) * 1000 }).toBeLessThan(112);
  await expect(page.locator('.title-card')).toHaveCount(0, { timeout: 8_000 });

  const l = await look(page);
  expect(l.saturation).toBeCloseTo(MOODS.overcast.saturation);
  expect(l.grade).toEqual([...MOODS.overcast.grade]);
  expect(errors).toEqual([]);
});

test('a key ends the opening camera move at once', async ({ page }) => {
  await page.goto('/?seed=1');
  await page.evaluate(() => localStorage.setItem('vazante.settings', JSON.stringify({ tutorialSeen: true, locale: 'pt-BR' })));
  await page.goto('/?seed=1&play=1');
  await page.getByRole('button', { name: 'Começar' }).click({ timeout: 60_000 });
  await expect.poll(() => tick(page), { timeout: 10_000 }).toBeGreaterThan(0);
  await page.keyboard.press('Shift');
  await expect.poll(() => span(page), { timeout: 1_500 }).toBeLessThan(112);
});
