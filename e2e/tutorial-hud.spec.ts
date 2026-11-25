import { expect, test, type Page } from '@playwright/test';
import { frame, isolateAnalytics, startGame, stateHash, watchErrors } from './helpers.ts';

test.beforeEach(async ({ page }) => isolateAnalytics(page));

/** Assert visibility before clicking: Playwright's automatic scrolling must not hide a UX regression. */
async function exposed(page: Page, selector: string): Promise<void> {
  await expect.poll(() => page.evaluate(sel => {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.top < 0 || r.left < 0 || r.right > innerWidth || r.bottom > innerHeight) return false;
    const scroller = el.closest('.unit-list');
    if (scroller) {
      const b = scroller.getBoundingClientRect();
      if (r.top < b.top - 1 || r.bottom > b.bottom + 1) return false;
    }
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !!top && el.contains(top);
  }, selector)).toBe(true);
}

for (const [width, height] of [[1280, 720], [800, 450]]) {
  test(`all nine tutorial steps are reachable without skipping at ${width}x${height}`, async ({ page }, info) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await page.setViewportSize({ width, height });
    await page.goto('/?seed=1');
    await page.getByRole('button', { name: 'Tutorial', exact: true }).click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Começar' }).click();
    const card = page.locator('.tutorial');
    const step = (n: number) => expect(card).toContainText(`${n}/9`, { timeout: 15_000 });
    await step(1);
    await page.keyboard.down('d');
    await step(2);
    await page.keyboard.up('d');
    await exposed(page, '.squad:not(.vehicle)');
    await page.locator('.squad:not(.vehicle)').first().dblclick();
    await step(3);
    await page.mouse.click(width * 0.65, height * 0.46, { button: 'right' });
    await step(4);
    // Aggressive is already the initial posture: an explicit choice must still count.
    expect((await frame(page)).squads[0].stance).toBe('aggressive');
    await page.keyboard.press('x');
    await step(5);
    await expect(page.locator('#build-options')).toBeVisible();
    await expect(page.locator('.selection')).toHaveCount(0);
    await page.keyboard.press('Digit1');
    // Find a valid, unobscured placement using only the normal mouse preview.
    let placed = false;
    for (const [dx, dy] of [[0, 0], [40, 0], [-40, 0], [0, -40], [60, -40], [-60, -40]]) {
      const x = width / 2 + dx, y = height / 2 + dy;
      await page.mouse.move(x, y);
      const valid = await page.evaluate(({ x, y }) => {
        const g = (window as unknown as { vazante: { input: { build: { reason: string | null } } } }).vazante;
        return !g.input.build.reason && document.elementFromPoint(x, y)?.matches('canvas.game');
      }, { x, y });
      if (!valid) continue;
      await page.mouse.click(x, y);
      placed = true;
      break;
    }
    expect(placed).toBe(true);
    await step(6);
    await expect(page.locator('#build-options')).toHaveCount(0);
    await exposed(page, '.squad.vehicle');
    await exposed(page, '.mission.panel');
    await page.screenshot({ path: info.outputPath('tutorial-truck.png') });
    await page.locator('.squad.vehicle').first().click();
    await page.getByRole('button', { name: '→ Posto Âncora', exact: true }).click();
    await step(7);
    await exposed(page, '.squad:not(.vehicle)');
    await page.locator('.squad:not(.vehicle)').first().click();
    await page.keyboard.press('Tab');
    await expect(card).toContainText('Volte ao comando');
    await page.waitForTimeout(1500);
    await step(7);
    await expect(card.getByRole('button', { name: 'Pular etapa' })).toHaveCount(0);
    await page.keyboard.press('Tab');
    await step(8);
    await expect.poll(async () => (await frame(page)).directSoldier).toBeNull();
    await exposed(page, '.squads.panel .bars.morale');
    await page.screenshot({ path: info.outputPath('tutorial-morale.png') });
    await card.getByRole('button', { name: 'Entendi', exact: true }).click();
    await step(9);
    await exposed(page, '.mission.panel');
    await card.getByRole('button', { name: 'Concluir', exact: true }).click();
    await expect(card).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vazante.settings')!).tutorialSeen)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('contextual panels preserve selection, objectives and the paused world', async ({ page }, info) => {
  const errors = watchErrors(page);
  await startGame(page);
  await page.locator('.squad:not(.vehicle)').first().click();
  await page.keyboard.press('Space');
  await expect.poll(async () => (await frame(page)).speed).toBe(0);
  const before = await stateHash(page);
  const soldiers = (await frame(page)).stats.soldiersAlive;
  await expect(page.locator('#build-options')).toHaveCount(0);
  await expect(page.locator('.selection b')).toHaveText('Alfa');
  await page.locator('.build-toggle').click();
  await expect(page.locator('#build-options')).toBeVisible();
  await expect(page.locator('.selection')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#build-options')).toHaveCount(0);
  await expect(page.locator('.selection b')).toHaveText('Alfa');
  await page.keyboard.press('Digit1');
  await expect(page.locator('.build .cmd.on')).toContainText('HESCO');
  await page.locator('.squad.vehicle').click();
  await expect(page.locator('#build-options')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as { vazante: { input: { build: { active: boolean } } } }).vazante.input.build.active)).toBe(false);
  await page.evaluate(() => { document.querySelector('.unit-list')!.scrollTop = 10000; });
  await exposed(page, '.mission.panel');
  await page.getByRole('button', { name: 'Ver todos os objetivos' }).click();
  await expect(page.locator('.mission .obj')).toHaveCount(2);
  await page.getByRole('button', { name: 'Ver todos os objetivos' }).click();
  await expect(page.locator('.mission .obj')).toHaveCount(1);
  await page.keyboard.press('m');
  await page.screenshot({ path: info.outputPath('contextual-map.png') });
  expect(await stateHash(page)).toBe(before);
  expect((await frame(page)).stats.soldiersAlive).toBe(soldiers);
  expect(errors).toEqual([]);
});
