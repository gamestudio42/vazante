import { expect, test } from '@playwright/test';
import type { Frame } from '@vazante/shared';
import { frame, startGame, watchErrors } from './helpers.ts';

test('campaign soldiers get names, go into the mission and show in the task force', async ({ page }) => {
  const errors = watchErrors(page);
  await startGame(page);
  const f: Frame = await frame(page);
  const roster = await page.evaluate(() => JSON.parse(localStorage.getItem('vazante.roster') ?? 'null') as { units: Record<string, ({ rid: number; name: string } | null)[]> });
  const troopers = Object.values(roster.units).flat();
  expect(troopers.length).toBeGreaterThan(0);
  expect(f.crew.map((c) => c.rid).sort()).toEqual(troopers.map((x) => x!.rid).sort());

  await page.goto('/?seed=1');
  await page.getByRole('button', { name: 'Campanha' }).click({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Força-tarefa' })).toBeVisible();
  await expect(page.getByText(`Rct. ${troopers[0]!.name}`)).toBeVisible();
  expect(errors).toEqual([]);
});
