import { expect, test } from '@playwright/test';
import { tick, watchErrors } from './helpers.ts';

type Box = { left: number; top: number; right: number; bottom: number };

const overlap = (a: Box, b: Box) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;

for (const [w, h] of [
  [800, 450],
  [1024, 576],
  [1280, 720],
] as const) {
  test(`HUD panels do not overlap at ${w}x${h}, with a squad selected`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/?seed=3');
    await page.evaluate(() => localStorage.setItem('vazante.settings', JSON.stringify({ tutorialSeen: true, locale: 'pt-BR' })));
    await page.goto('/?seed=3&scenario=hospital&play=1&unlock=1');
    // The briefing's start button is reachable on a small window.
    await page.getByRole('button', { name: 'Começar' }).click({ timeout: 60_000 });
    await expect.poll(() => tick(page), { timeout: 10_000 }).toBeGreaterThan(0);
    await page.keyboard.press('Shift');
    await page.locator('.squad').first().click();
    await expect(page.locator('.selection')).toBeVisible();
    await page.waitForTimeout(600);

    const boxes = await page.evaluate(() => {
      const box = (e: Element) => {
        const r = e.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      };
      const one = (s: string) => box(document.querySelector(s)!);
      return {
        view: { w: innerWidth, h: innerHeight },
        topbar: one('.topbar'),
        leftcol: one('.leftcol'),
        minimap: one('.minimap'),
        bottom: Array.from(document.querySelector('.bottomcol')!.children, box),
      };
    });
    for (const b of boxes.bottom) {
      expect(overlap(boxes.leftcol, b), 'left column over the bottom row').toBe(false);
      expect(overlap(boxes.minimap, b), 'minimap over the bottom row').toBe(false);
      expect(b.right).toBeLessThanOrEqual(boxes.view.w);
      expect(b.bottom).toBeLessThanOrEqual(boxes.view.h);
    }
    expect(overlap(boxes.topbar, boxes.leftcol)).toBe(false);
    expect(boxes.topbar.left).toBeGreaterThanOrEqual(0);
    expect(boxes.topbar.right).toBeLessThanOrEqual(boxes.view.w);
    expect(errors).toEqual([]);
  });
}

test('the tutorial highlight sits on its target when the HUD is reduced', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 576 });
  await page.goto('/?seed=1');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/?seed=1');
  await page.getByRole('button', { name: 'Tutorial', exact: true }).click({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Começar' }).click();
  await expect(page.locator('.tut-box').first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
  const gaps = await page.evaluate(() => {
    const shell = (window as unknown as { vazante: { shell: { tutorial: { focus(w: number, h: number): { ui: string[] } } } } }).vazante.shell;
    const targets = shell.tutorial
      .focus(innerWidth, innerHeight)
      .ui.map((s) => document.querySelector(s))
      .filter((e): e is Element => e !== null)
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0);
    const boxes = Array.from(document.querySelectorAll('.tut-box'), (e) => e.getBoundingClientRect());
    // Each highlight wraps one target with a small margin: compare centres.
    return boxes.map((b) => Math.min(...targets.map((t) => Math.hypot(b.left + b.width / 2 - (t.left + t.width / 2), b.top + b.height / 2 - (t.top + t.height / 2)))));
  });
  expect(gaps.length).toBeGreaterThan(0);
  for (const g of gaps) expect(g).toBeLessThan(3);
});
