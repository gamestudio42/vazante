import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { GameRenderer } from '../packages/view3d/src/renderer.ts';
import { frame, startGame, stateHash, watchErrors } from './helpers.ts';

test('Ancora closeup previews', async ({ page }, testInfo) => {
  // The visual fixture is offline; analytics is unrelated to the renderer.
  await page.route('**/gc.zgo.at/count.js', route => route.fulfill({
    contentType: 'application/javascript', body: '', headers: { 'Cross-Origin-Resource-Policy': 'cross-origin' },
  }));
  const errors = watchErrors(page);
  await startGame(page);
  await expect.poll(() => page.evaluate(() => {
    const view = (window as unknown as { vazante: { view: GameRenderer } }).vazante.view;
    return !!view.scene.getObjectByName('Tank');
  }), { timeout: 30000 }).toBe(true);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await frame(page)).speed).toBe(0);
  const before = await stateHash(page);
  await page.addStyleTag({ content: 'body * { visibility: hidden !important; } canvas.game { visibility: visible !important; }' });
  for (const subject of ['soldiers', 'soldiers-front', 'truck'] as const) {
    const png = await page.evaluate(({ subject }) => {
      const { view } = (window as unknown as { vazante: { view: GameRenderer } }).vazante;
      const original = view.latest!;
      const truck = original.vehicles[0];
      const x = subject === 'truck' ? truck.x : original.soldiers[2] + 2;
      const y = subject === 'truck' ? truck.y : original.soldiers[3];
      view.rig.centerOn(x, y);
      view.rig.span = view.rig.targetSpan = subject === 'truck' ? 13 : 8;
      view.rig.direct = null;
      view.rig.yaw = view.rig.targetYaw = subject === 'soldiers-front' ? -3 * Math.PI / 4 : Math.PI / 4;
      view.pushFrame({ ...original, day: { lengthS: 1200, startHour: 12 - original.tick / 12000 * 24 } }, performance.now());
      view.render(performance.now(), 0);
      return view.renderer.domElement.toDataURL('image/png').split(',')[1];
    }, { subject });
    const path = testInfo.outputPath(`ancora-${subject}.png`);
    await writeFile(path, Buffer.from(png, 'base64'));
    await page.locator('canvas').first().screenshot({ path });
    await testInfo.attach('ancora', { path, contentType: 'image/png' });
    expect(await stateHash(page)).toBe(before);
  }
  expect(errors).toEqual([]);
});
