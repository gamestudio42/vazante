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
        bottom: [...document.querySelector('.bottomcol')!.children].map(box),
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
