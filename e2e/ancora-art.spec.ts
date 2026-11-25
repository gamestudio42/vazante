import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { GameRenderer } from '../packages/view3d/src/renderer.ts';
import { frame, startGame, stateHash, watchErrors } from './helpers.ts';

test('Ancora scenery and soldiers render in tactical and direct views without world changes', async ({ page }, testInfo) => {
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
  for (const open of [false, true]) {
    const png = await page.evaluate(({ open }) => {
      const { view } = (window as unknown as { vazante: { view: GameRenderer } }).vazante;
      const original = view.latest!;
      const base = original.structures.find(s => s.kind === 'command_post')!;
      const tank = view.map.props!.find(p => p.kind === 'Tank')!;
      const x = open ? (base.cx + 0.5) * 4 : tank.x, y = open ? (base.cy + 0.5) * 4 : tank.y;
      view.rig.centerOn(x, y);
      view.rig.span = view.rig.targetSpan = 28;
      view.rig.direct = open ? { x, y: y + 6, yaw: -Math.PI / 2 } : null;
      view.pushFrame({ ...original, day: { lengthS: 1200, startHour: 12 - original.tick / 12000 * 24 } }, performance.now());
      view.render(performance.now(), 0);
      return view.renderer.domElement.toDataURL('image/png').split(',')[1];
    }, { open });
    const path = testInfo.outputPath(`ancora-${open ? 'direct' : 'tactical'}.png`);
    await writeFile(path, Buffer.from(png, 'base64'));
    await testInfo.attach('ancora', { path, contentType: 'image/png' });
    expect(await stateHash(page)).toBe(before);
  }
  expect(errors).toEqual([]);
});
