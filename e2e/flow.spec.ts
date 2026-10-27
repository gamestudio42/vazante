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

test('tutorial from the main menu: recruit game, steps advance on the player actions', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?seed=1');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/?seed=1');
  await page.getByRole('button', { name: 'Tutorial' }).click({ timeout: 30_000 });
  await expect(page.getByRole('radio', { name: /Recruta/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('checkbox', { name: 'Tutorial guiado' })).toBeChecked();
  await page.getByRole('button', { name: 'Começar' }).click();
  await expect.poll(async () => (await frame(page)).difficulty).toBe('recruit');

  const card = page.getByRole('status').filter({ hasText: 'Tutorial' });
  await expect(card).toContainText('1/9');
  await page.keyboard.down('d');
  await expect(card).toContainText('2/9', { timeout: 15_000 });
  await page.keyboard.up('d');
  await page.locator('.squad').first().click();
  await expect(card).toContainText('3/9', { timeout: 10_000 });
  await card.getByRole('button', { name: 'Pular etapa' }).click();
  await expect(card).toContainText('4/9');
  await card.getByRole('button', { name: 'Sair do tutorial' }).click();
  await expect(card).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vazante.settings') ?? '{}').tutorialSeen)).toBe(true);
  expect(errors).toEqual([]);
});

test('difficulty chosen on the briefing rebuilds the waiting scenario', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?seed=1');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/?seed=1');
  await page.getByRole('button', { name: 'Nova partida' }).click({ timeout: 30_000 });
  const before = (await frame(page)).stats.zombiesAlive;
  await page.getByRole('radio', { name: /Pesadelo/ }).click();
  await expect.poll(async () => (await frame(page)).difficulty).toBe('nightmare');
  expect((await frame(page)).stats.zombiesAlive).toBeGreaterThan(before);
  expect(await tick(page)).toBe(0);
  expect(errors).toEqual([]);
});

test('campaign: the first mission is open, the others unlock in order', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?seed=1');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/?seed=1');
  await page.getByRole('button', { name: /Campanha/ }).click({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /Hospital São Lucas/ })).toBeDisabled();
  await page.evaluate(() => localStorage.setItem('vazante.settings', JSON.stringify({ completed: ['last_convoy'] })));
  await page.goto('/?seed=1');
  await page.getByRole('button', { name: /Campanha/ }).click({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /A Ponte/ })).toBeDisabled();
  await page.getByRole('button', { name: /Hospital São Lucas/ }).click();
  await page.waitForURL(/scenario=hospital/);
  await expect(page.getByRole('heading', { name: 'Hospital São Lucas' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('checkbox', { name: 'Tutorial guiado' }).uncheck();
  await page.getByRole('button', { name: 'Começar' }).click();
  await expect(page.getByText('Chegue ao local: Hospital São Lucas')).toBeVisible();
  expect((await frame(page)).mission?.id).toBe('hospital');
  expect(errors).toEqual([]);
});
