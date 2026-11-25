import { expect, test, type Page } from '@playwright/test';
import { frame, startGame, stateHash, watchErrors } from './helpers.ts';

const sensitivity = (page: Page) => page.getByRole('slider', { name: /Sensibilidade do mouse/ });
const inverted = (page: Page) => page.getByRole('checkbox', { name: /Inverter eixo vertical/ });

async function openSettings(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
}

test('mouse preferences persist, reset independently, and remain reachable on small screens', async ({ page }, info) => {
  const errors = watchErrors(page);
  await startGame(page);
  await openSettings(page);
  await expect.poll(async () => (await frame(page)).speed).toBe(0);
  const hash = await stateHash(page);
  const before = await frame(page);
  await sensitivity(page).press('End');
  await inverted(page).check();
  await page.getByRole('slider', { name: /^Volume/ }).press('Home');
  await expect(sensitivity(page)).toHaveValue('3');
  expect(await stateHash(page)).toBe(hash);
  expect((await frame(page)).stats.soldiersAlive).toBe(before.stats.soldiersAlive);

  await page.reload();
  await page.getByRole('button', { name: 'Configurações', exact: true }).click({ timeout: 30_000 });
  await expect(sensitivity(page)).toHaveValue('3');
  await expect(inverted(page)).toBeChecked();
  await page.screenshot({ path: info.outputPath('mouse-settings.png') });
  for (const size of [{ width: 800, height: 450 }, { width: 360, height: 740 }]) {
    await page.setViewportSize(size);
    await sensitivity(page).scrollIntoViewIfNeeded();
    const box = await sensitivity(page).boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(size.width);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(size.height);
    expect(await page.locator('.settings').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await sensitivity(page).press('Home');
    await expect(sensitivity(page)).toHaveValue('0.25');
    await page.getByRole('button', { name: 'Restaurar padrão do mouse' }).click();
    await expect(sensitivity(page)).toHaveValue('1');
    await expect(inverted(page)).not.toBeChecked();
  }
  // Reset affects only the two mouse preferences, not volume, tutorial progress or language.
  await expect(page.getByRole('slider', { name: /^Volume/ })).toHaveValue('0');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vazante.settings')!))).toMatchObject({
    volume: 0, mouseSensitivity: 1, invertMouseY: false, locale: 'pt-BR',
  });
  await page.screenshot({ path: info.outputPath('mouse-settings-small.png') });
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await expect(page.locator('.settings')).toHaveCount(0);
  expect(errors).toEqual([]);
});

async function enterDirect(page: Page): Promise<void> {
  await page.getByText('Alfa').first().click();
  await page.keyboard.press('Tab');
  await expect.poll(async () => (await frame(page)).directSoldier).not.toBeNull();
  await expect(async () => {
    if (!await page.evaluate(() => !!document.pointerLockElement)) await page.mouse.click(640, 360);
    expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(true);
  }).toPass({ timeout: 10_000 });
}

async function look(page: Page, x: number, y: number) {
  return page.evaluate(({ x, y }) => {
    const input = (window as unknown as { vazante: { input: { directYaw: number; directPitch: number; fire: boolean } } }).vazante.input;
    const yaw = input.directYaw, pitch = input.directPitch;
    window.dispatchEvent(new MouseEvent('mousemove', { movementX: x, movementY: y }));
    return { yaw: input.directYaw - yaw, pitch: input.directPitch - pitch, absolutePitch: input.directPitch, fire: input.fire };
  }, { x, y });
}

test('TAB applies mouse sensitivity and vertical inversion while retaining pitch and capture limits', async ({ page }) => {
  const errors = watchErrors(page);
  await startGame(page);
  await page.bringToFront();
  await enterDirect(page);
  const normal = await look(page, 40, 10);
  expect(normal.yaw).toBeCloseTo(0.1);
  expect(normal.pitch).toBeCloseTo(0.025);
  expect(normal.fire).toBe(false);
  await page.keyboard.press('Tab');
  await expect.poll(async () => (await frame(page)).directSoldier).toBeNull();
  // First Escape clears the retained squad selection; the next opens the pause menu.
  await page.keyboard.press('Escape');
  await openSettings(page);
  await sensitivity(page).press('End');
  await inverted(page).check();
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await page.keyboard.press('Escape');
  await enterDirect(page);
  const adjusted = await look(page, 40, 10);
  expect(adjusted.yaw).toBeCloseTo(normal.yaw * 3);
  expect(adjusted.pitch).toBeCloseTo(-normal.pitch * 3);
  expect(adjusted.fire).toBe(false);
  expect((await look(page, 0, 10000)).absolutePitch).toBeCloseTo(-0.15);
  expect((await look(page, 0, -10000)).absolutePitch).toBeCloseTo(0.45);
  await page.evaluate(() => document.exitPointerLock());
  await expect.poll(() => page.evaluate(() => !!document.pointerLockElement)).toBe(false);
  expect(await look(page, 40, 10)).toMatchObject({ yaw: 0, pitch: 0, fire: false });
  await page.keyboard.press('Tab');
  await expect.poll(async () => (await frame(page)).directSoldier).toBeNull();
  expect(errors).toEqual([]);
});
