import { expect, test, type Page } from '@playwright/test';
import { watchErrors } from './helpers.ts';

const VIEWPORTS = [
  { width: 360, height: 740 },
  { width: 412, height: 915 },
  { width: 915, height: 412 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
] as const;

/** Layout size of a control. The HUD scale is already applied, so 44 here is 44 device pixels. */
async function expectTap(page: Page, selector: string): Promise<void> {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, selector).toBeTruthy();
  expect(box!.width, selector).toBeGreaterThanOrEqual(44);
  expect(box!.height, selector).toBeGreaterThanOrEqual(44);
}

test('coarse pointer can look, order, and reach the controls', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  await cdp.send('Emulation.setEmulatedMedia', {
    media: 'screen',
    features: [
      { name: 'pointer', value: 'coarse' },
      { name: 'hover', value: 'none' },
    ],
  });

  await page.setViewportSize(VIEWPORTS[0]);
  await page.goto('/?seed=1');
  await page.evaluate(() => {
    localStorage.clear();
    indexedDB.deleteDatabase('vazante');
  });
  await page.goto('/?seed=1');
  await expect(page.getByRole('button', { name: 'Nova partida' })).toBeVisible({ timeout: 30_000 });

  for (const size of VIEWPORTS) {
    await page.setViewportSize(size);
    await expectTap(page, '.menu .city button');
    await expectTap(page, '.menu-screen .city input');
  }

  await page.setViewportSize(VIEWPORTS[0]);
  await page.getByRole('button', { name: 'Nova partida' }).click();
  await expect(page.getByRole('button', { name: 'Começar' })).toBeVisible();
  for (const size of VIEWPORTS) {
    await page.setViewportSize(size);
    await expectTap(page, 'button.big');
  }

  await page.setViewportSize(VIEWPORTS[0]);
  await page.getByRole('button', { name: 'Começar' }).click();
  await expect(page.locator('.tutorial')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.tutorial p')).toContainText('Arraste com um dedo');
  await expect(page.locator('.tutorial p')).not.toContainText('botão do meio');
  await expect(page.locator('.selection.empty')).toContainText('Toque no chão');
  await expect(page.getByRole('button', { name: 'Girar à direita' })).toBeVisible();

  for (const size of VIEWPORTS) {
    await page.setViewportSize(size);
    await expectTap(page, '.speed button');
    await expectTap(page, '.tutorial button.icon');
    await expectTap(page, '.tutorial .row.end button');
    await expectTap(page, '.cam-dock button');
    if (size.height > size.width) {
      await expect(page.locator('.mission.panel')).toHaveClass(/fold-shut/);
      await expect(page.locator('.mission.panel .obj').first()).toBeHidden();
      await expect(page.locator('.squads.panel').first()).toHaveClass(/fold-shut/);
    } else {
      await expect(page.locator('.fold-toggle')).toHaveCount(0);
      await expect(page.locator('.mission.panel .obj').first()).toBeVisible();
    }
  }

  await page.setViewportSize(VIEWPORTS[0]);
  const focus = () => page.evaluate(() => (window as unknown as { vazante: { view: { rig: { focusY: number; targetYaw: number } } } }).vazante.view.rig.focusY);
  const before = await focus();
  const spot = await page.evaluate(() => {
    for (const [x, y] of [[100, 460], [140, 380], [80, 520], [200, 300]] as const) {
      const el = document.elementFromPoint(x, y);
      if (el instanceof HTMLCanvasElement) return { x, y };
    }
    return null;
  });
  expect(spot).toBeTruthy();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: spot!.x, y: spot!.y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: spot!.x, y: spot!.y - 90, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(focus).not.toBeCloseTo(before, 0);

  const yaw = () => page.evaluate(() => (window as unknown as { vazante: { view: { rig: { targetYaw: number } } } }).vazante.view.rig.targetYaw);
  const yawBefore = await yaw();
  await page.getByRole('button', { name: 'Girar à direita' }).click();
  await expect.poll(yaw).not.toBeCloseTo(yawBefore, 2);

  await page.getByRole('button', { name: 'Sair do tutorial' }).click();
  await expect(page.locator('.tutorial')).toBeHidden();
  await page.getByRole('button', { name: 'Esquadrões' }).click();
  await page.getByText('Alfa').first().click();
  await expect(page.locator('.selection b')).toHaveText('Alfa');
  await page.getByRole('button', { name: 'Esquadrões' }).click();
  const orderSpot = await page.evaluate(() => {
    for (const [x, y] of [[180, 280], [200, 360], [240, 240], [160, 420]] as const) {
      const el = document.elementFromPoint(x, y);
      if (el instanceof HTMLCanvasElement) return { x, y };
    }
    return null;
  });
  expect(orderSpot).toBeTruthy();
  const anchor = () =>
    page.evaluate(() => {
      const s = (window as unknown as { vazante: { view: { latest: { squads: { anchorX: number; anchorY: number; via: number[] }[] } } } }).vazante.view.latest.squads[0];
      return { x: s.anchorX, y: s.anchorY, via: s.via.length };
    });
  const start = await anchor();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: orderSpot!.x, y: orderSpot!.y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect
    .poll(async () => {
      const q = await anchor();
      return Math.hypot(q.x - start.x, q.y - start.y);
    })
    .toBeGreaterThan(5);
  await page.locator('.selection').getByRole('button', { name: 'Rota' }).click();
  const routeSpot = await page.evaluate((first) => {
    for (let y = 160; y < 560; y += 40) {
      for (let x = 120; x < 300; x += 40) {
        if (Math.hypot(x - first.x, y - first.y) < 36) continue;
        const el = document.elementFromPoint(x, y);
        if (el instanceof HTMLCanvasElement) return { x, y };
      }
    }
    return null;
  }, orderSpot!);
  expect(routeSpot).toBeTruthy();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: routeSpot!.x, y: routeSpot!.y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => (await anchor()).via).toBeGreaterThanOrEqual(2);

  const mapVisible = await page.evaluate(() => {
    const el = document.elementFromPoint(160, 420);
    return el instanceof HTMLCanvasElement;
  });
  expect(mapVisible).toBe(true);
  await page.getByRole('button', { name: 'Objetivos' }).click();
  await expect(page.locator('.mission.panel .obj').first()).toBeVisible();

  // gc.zgo.at/count.js sends no Cross-Origin-Resource-Policy, so the dev server's COEP blocks it.
  expect(errors.filter((e) => !e.includes('NotSameOriginAfterDefaultedToSameOriginByCoep'))).toEqual([]);
});
