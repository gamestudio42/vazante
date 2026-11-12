import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { GameRenderer } from '../packages/view3d/src/renderer.ts';
import { frame, startGame, stateHash, watchErrors } from './helpers.ts';

test('reference block renders in all views by day and night without changing the world', async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  await startGame(page);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await frame(page)).speed).toBe(0);
  const before = await stateHash(page);
  const architectureUrl = `/@fs${process.cwd()}/packages/view3d/src/architecture.ts`;
  for (const hour of [12, 21]) for (const mode of ['near', 'map', 'direct'] as const) {
    const capture = await page.evaluate(async ({ architectureUrl, hour, mode }) => {
      const { referenceBuildings } = await import(architectureUrl);
      const { view } = (window as unknown as { vazante: { view: GameRenderer } }).vazante;
      const ids: Set<number> = referenceBuildings(view.map);
      const buildings = view.map.buildings.filter(b => ids.has(b.id));
      const x = buildings.reduce((sum, b) => sum + (b.x0 + b.x1 + 1) * view.map.cellSize / 2, 0) / buildings.length;
      const y = buildings.reduce((sum, b) => sum + (b.y0 + b.y1 + 1) * view.map.cellSize / 2, 0) / buildings.length;
      view.rig.centerOn(x, y);
      view.rig.span = view.rig.targetSpan = mode === 'map' ? view.rig.maxSpan : 100;
      view.rig.direct = mode === 'direct' ? { x, y: y + 45, yaw: -Math.PI / 2 } : null;
      const snapshot = view.latest!;
      view.pushFrame({ ...snapshot, day: { lengthS: 1200, startHour: hour - snapshot.tick / 12000 * 24 } }, performance.now());
      view.render(performance.now(), 0);
      const roofs: string[] = [];
      view.scene.traverse(o => { if (o.name.startsWith('reference-roof-')) roofs.push(o.name); });
      return { roofs, buildings: buildings.length, hour: view.hours, png: view.renderer.domElement.toDataURL('image/png').split(',')[1] };
    }, { architectureUrl, hour, mode });
    expect(capture.roofs).toContain('reference-roof-gable');
    expect(capture.roofs).toContain('reference-roof-setback');
    expect(capture.buildings).toBeGreaterThan(0);
    expect(capture.hour).toBeCloseTo(hour, 1);
    const path = testInfo.outputPath(`reference-${mode}-${hour}h.png`);
    await writeFile(path, Buffer.from(capture.png, 'base64'));
    await testInfo.attach(`reference-${mode}-${hour}h`, { path, contentType: 'image/png' });
    expect(await stateHash(page)).toBe(before);
  }
  expect(errors).toEqual([]);
});
