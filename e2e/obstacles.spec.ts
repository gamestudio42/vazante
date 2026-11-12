import { expect, test } from '@playwright/test';
import type { GameRenderer } from '../packages/view3d/src/renderer.ts';
import type { ArchitectureMesh } from '../packages/view3d/src/architecture.ts';
import { startGame, watchErrors } from './helpers.ts';

test('solid set dressing is rendered at the authoritative occupied footprints', async ({ page }) => {
  const errors = watchErrors(page);
  await startGame(page);
  const result = await page.evaluate(() => {
    const { view } = (window as unknown as { vazante: { view: GameRenderer } }).vazante;
    const props = view.map.props ?? [];
    const names = new Set(props.map(p => p.kind));
    let count = 0;
    const outside: string[] = [];
    view.scene.traverse(o => {
      if (!names.has(o.name as typeof props[number]['kind'])) return;
      const mesh = o as ArchitectureMesh;
      mesh.geometry.computeBoundingBox();
      const matrix = mesh.matrix.clone();
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        const p = props.find(p => p.kind === mesh.name && Math.abs(p.x - matrix.elements[12]) < 0.001 && Math.abs(p.y - matrix.elements[14]) < 0.001);
        if (!p) { outside.push(mesh.name); continue; }
        const b = mesh.geometry.boundingBox!.clone().applyMatrix4(matrix);
        if (b.min.x < p.x - p.length / 2 - 0.01 || b.max.x > p.x + p.length / 2 + 0.01 || b.min.z < p.y - p.width / 2 - 0.01 || b.max.z > p.y + p.width / 2 + 0.01) outside.push(mesh.name);
        count++;
      }
    });
    return { expected: props.length, count, outside, kinds: Array.from(names) };
  });
  expect(result.expected).toBeGreaterThan(0);
  expect(result.kinds).toContain('Tent');
  expect(result.kinds).toContain('Tank');
  expect(result.count).toBe(result.expected);
  expect(result.outside).toEqual([]);
  expect(errors).toEqual([]);
});
