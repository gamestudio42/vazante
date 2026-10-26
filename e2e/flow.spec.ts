import { expect, test } from '@playwright/test';
import { frame, startGame, stateHash, tick, watchErrors } from './helpers.ts';

test('main menu, briefing, pause and resume', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?seed=1');
  await expect(page.getByRole('button', { name: 'Nova partida' })).toBeVisible({ timeout: 30_000 });
  // Nothing runs behind the main menu.
  await page.waitForTimeout(1000);
  expect(await tick(page)).toBe(0);

  await page.getByRole('button', { name: 'Nova partida' }).click();
  await expect(page.getByRole('heading', { name: 'O Último Comboio' })).toBeVisible();
  await page.getByRole('button', { name: 'Começar' }).click();
  await expect.poll(() => tick(page)).toBeGreaterThan(5);

  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Pausado' })).toBeVisible();
  const paused = await tick(page);
  await page.waitForTimeout(800);
  expect(await tick(page)).toBe(paused);

  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Pausado' })).toBeHidden();
  await expect.poll(() => tick(page)).toBeGreaterThan(paused);
  expect(errors).toEqual([]);
});

test('settings persist across reloads and switch the language', async ({ page }) => {
  const errors = watchErrors(page);
  await startGame(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Configurações' }).click();
  await page.getByRole('combobox').first().selectOption('en');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.goto('/?seed=1');
  await expect(page.getByRole('button', { name: 'New game' })).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test('save mid-game and load it back to the same state', async ({ page }) => {
  const errors = watchErrors(page);
  await startGame(page);
  await page.keyboard.press('F3');
  await expect.poll(() => tick(page), { timeout: 20_000 }).toBeGreaterThan(150);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Salvar jogo' }).click();
  await expect(page.getByText('Jogo salvo')).toBeVisible();
  const savedTick = await tick(page);
  const savedHash = await stateHash(page);

  await page.getByRole('button', { name: 'Carregar jogo' }).click();
  await page.getByRole('button', { name: 'Carregar', exact: true }).first().click();
  await page.waitForURL(/load=/);
  await expect(page.getByRole('heading', { name: 'Pausado' })).toBeVisible({ timeout: 30_000 });
  expect(await tick(page)).toBe(savedTick);
  expect(await stateHash(page)).toBe(savedHash);
  expect(errors).toEqual([]);
});

test('quick save and quick load with F5 and F9', async ({ page }) => {
  const errors = watchErrors(page);
  await startGame(page);
  await expect.poll(() => tick(page)).toBeGreaterThan(20);
  // Pause so the state at the save is the state we compare against.
  await page.keyboard.press('Space');
  await expect.poll(async () => (await frame(page)).speed).toBe(0);
  await page.keyboard.press('F5');
  await expect(page.getByText('Jogo salvo')).toBeVisible();
  const savedTick = await tick(page);
  const savedHash = await stateHash(page);
  await page.keyboard.press('F9');
  await page.waitForURL(/load=quick/);
  await expect(page.getByRole('heading', { name: 'Pausado' })).toBeVisible({ timeout: 30_000 });
  expect(await tick(page)).toBe(savedTick);
  expect(await stateHash(page)).toBe(savedHash);
  expect(errors).toEqual([]);
});
