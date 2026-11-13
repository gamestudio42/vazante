import { expect, test, type Page } from '@playwright/test';
import { SOLDIER_STRIDE, SoldierField } from '@vazante/shared';
import { frame, tick, watchErrors } from './helpers.ts';

/** Bury every soldier under brutes at top speed until the mission is lost. */
async function overrun(page: Page): Promise<void> {
  const f = await frame(page);
  const at: { x: number; y: number }[] = [];
  for (let o = 0; o < f.soldiers.length; o += SOLDIER_STRIDE) at.push({ x: f.soldiers[o + SoldierField.X], y: f.soldiers[o + SoldierField.Y] });
  await page.evaluate((points) => {
    const c = (window as unknown as { vazante: { client: { send(cmd: unknown): void } } }).vazante.client;
    for (const p of points) c.send({ type: 'debug_spawn', at: p, count: 60, kind: 2 });
    c.send({ type: 'set_speed', speed: 4 });
  }, at);
}

test('the daily operation deploys its own task force and ends on a lost mission', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?seed=1');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/?seed=1');
  await page.getByRole('button', { name: /Operação/ }).first().click({ timeout: 30_000 });
  const campaign = await page.evaluate(() => localStorage.getItem('vazante.roster'));
  await page.getByRole('button', { name: /Operação do dia/ }).click();

  await expect(page.getByText(/Operação · missão 1 de 5 · Operação do dia/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('radiogroup', { name: 'Dificuldade' })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Tutorial guiado' })).toHaveCount(0);
  const store = await page.evaluate(() => JSON.parse(localStorage.getItem('vazante.operation') ?? 'null') as { run: { seed: number; missions: string[]; roster: { units: Record<string, unknown[]> } } });
  expect(new URL(page.url()).searchParams.get('seed')).toBe(String(store.run.seed));
  expect(new URL(page.url()).searchParams.get('scenario')).toBe(store.run.missions[0]);

  await page.getByRole('button', { name: 'Começar' }).click();
  await expect.poll(() => tick(page), { timeout: 10_000 }).toBeGreaterThan(0);
  const f = await frame(page);
  expect(f.crew.length).toBeGreaterThan(0);
  expect(f.crew.length).toBe(Object.values(store.run.roster.units).flat().length);

  await overrun(page);
  await expect(page.getByText('Operação encerrada')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText('A tropa')).toBeVisible();
  await expect(page.getByText(/Morto em combate|Transformado|Mordido/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tentar de novo' })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/operation-lost.png' });

  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('vazante.operation') ?? 'null') as { run: { status: string }; daily: Record<string, { score: number }> });
  expect(after.run.status).toBe('lost');
  expect(Object.keys(after.daily)).toHaveLength(1);
  // The campaign roster is not touched by an operation.
  expect(await page.evaluate(() => localStorage.getItem('vazante.roster'))).toBe(campaign);
  expect(errors).toEqual([]);
});

test('after a won mission a requisition must be chosen before the next one', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?seed=1');
  // A run that just won its first mission, waiting for a requisition.
  await page.evaluate(() => {
    localStorage.clear();
    const roster = { version: 1, nextRid: 3, units: { 'slice:0': [{ rid: 1, name: 'Moura', xp: 30, kills: 12, missions: 1 }, { rid: 2, name: 'Assis', xp: 20, kills: 4, missions: 1 }] }, fallen: [] };
    const run = {
      id: 'op-test', seed: 77, daily: null, difficulty: 'veteran', missions: ['bridge', 'hospital', 'retake', 'night_shift', 'last_train'], index: 1, status: 'active', roster,
      offers: ['ammo', 'recon', 'drill'], picks: [], next: { ammo: 0, materials: 0, recon: false, recruitXp: 0 }, log: [{ mission: 'bridge', won: true, kills: 16, fallen: 0 }], startedAt: 0,
    };
    localStorage.setItem('vazante.operation', JSON.stringify({ version: 1, run, best: null, daily: {} }));
  });
  await page.goto('/?seed=1');
  await page.getByRole('button', { name: /Operação/ }).first().click({ timeout: 30_000 });
  await expect(page.getByText('Pontuação: 1016')).toBeVisible();
  // Waiting on a requisition: the run cannot deploy until one is taken.
  await expect(page.getByRole('button', { name: /^Continuar:/ })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/operation-panel.png' });

  await expect(page.getByRole('group', { name: 'Escolha uma requisição' }).getByRole('button')).toHaveCount(3);
  await page.getByRole('button', { name: /Lançamento de munição/ }).click();
  await expect(page.getByRole('group', { name: 'Escolha uma requisição' })).toHaveCount(0);
  await page.getByRole('button', { name: /^Continuar:/ }).click();
  await expect(page.getByText(/Operação · missão 2 de 5/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/\+800 de munição na base/)).toBeVisible();
  await expect(page.getByText(/Ameaça ×1\.12/)).toBeVisible();
  await page.screenshot({ path: 'test-results/operation-briefing.png' });
  expect(errors).toEqual([]);
});
