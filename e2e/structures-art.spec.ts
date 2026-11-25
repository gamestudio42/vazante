import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { GameRenderer } from '../packages/view3d/src/renderer.ts';
import { frame, startGame, stateHash, watchErrors } from './helpers.ts';

test('defense art renders with an unchanged authoritative world', async ({ page }, testInfo) => {
  // The visual fixture is offline; analytics is unrelated to the renderer.
  await page.route('**/gc.zgo.at/count.js', route => route.fulfill({
    contentType: 'application/javascript', body: '', headers: { 'Cross-Origin-Resource-Policy': 'cross-origin' },
  }));
  const errors = watchErrors(page);
  await startGame(page);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await frame(page)).speed).toBe(0);
  const before = await stateHash(page);
  for (const open of [false, true]) {
    const png = await page.evaluate(({ open }) => {
      const { view } = (window as unknown as { vazante: { view: GameRenderer } }).vazante;
      const original = view.latest!;
      const base = original.structures.find(s => s.kind === 'command_post')!;
      const kinds = ['hesco', 'wall', 'gate', 'mg_nest'] as const;
      const structures = kinds.map((kind, i) => ({ ...base, id: 9000 + i, kind,
        cx: base.cx + (i - 2) * 2, cy: base.cy + 4, built: true, progress: 1, hp: 100, maxHp: 100, open }));
      view.rig.centerOn((base.cx - 0.5) * 4, (base.cy + 4.5) * 4);
      view.rig.span = view.rig.targetSpan = 34;
      view.pushFrame({ ...original, structures, day: { lengthS: 1200, startHour: 12 - original.tick / 12000 * 24 } }, performance.now());
      view.render(performance.now(), 0);
      return view.renderer.domElement.toDataURL('image/png').split(',')[1];
    }, { open });
    const path = testInfo.outputPath(`defenses-${open ? 'open' : 'closed'}.png`);
    await writeFile(path, Buffer.from(png, 'base64'));
    await testInfo.attach('defenses', { path, contentType: 'image/png' });
    expect(await stateHash(page)).toBe(before);
  }
  expect(errors).toEqual([]);
});
