import { expect, test } from 'vitest';
import { buildRooftops } from '../src/city.ts';
import { planBuilding, planCityBuildings, type ArchitectureMesh } from '../src/architecture.ts';
import type { MapInfo } from '@vazante/shared';

test('roof fixtures are supported by their building across cosmetic hashes and roof sizes', () => {
  for (let id = 1; id <= 500; id++) {
    for (const cells of [1, 2, 5]) for (const reference of [false, true]) {
      const building = { id, x0: 10, y0: 20, x1: 9 + cells, y1: 19 + cells, height: 18 };
      const map: MapInfo = { seed: 1, width: 32, height: 32, cellSize: 4, ground: new Uint8Array(1024), heights: new Uint8Array(1024), buildings: [building], sites: [], districts: [] };
      if (reference) map.sites.push({ name: 'reference', kind: 'base', x0: 0, y0: 0, x1: 1, y1: 1 });
      const appearance = planCityBuildings(map).get(building.id)!;
      const deck = appearance.roof ?? appearance.body;
      const group = buildRooftops(map);
      group.traverse(o => {
        if (!('isInstancedMesh' in o)) return;
        const mesh = o as ArchitectureMesh;
        mesh.geometry.computeBoundingBox();
        const matrix = mesh.matrix.clone();
        for (let i = 0; i < mesh.count; i++) {
          mesh.getMatrixAt(i, matrix);
          const box = mesh.geometry.boundingBox!.clone().applyMatrix4(matrix);
          expect(box.min.x).toBeGreaterThanOrEqual(deck.x - deck.width / 2 - 1e-5);
          expect(box.max.x).toBeLessThanOrEqual(deck.x + deck.width / 2 + 1e-5);
          expect(box.min.z).toBeGreaterThanOrEqual(deck.z - deck.depth / 2 - 1e-5);
          expect(box.max.z).toBeLessThanOrEqual(deck.z + deck.depth / 2 + 1e-5);
          // Tank bodies sit on their 1.2 m support; all other pieces stand on the roof.
          expect(box.min.y).toBeCloseTo(mesh.geometry.type === 'CylinderGeometry' ? 19.2 : 18, 5);
        }
        mesh.geometry.dispose();
      });
    }
  }
});

test('pitched roofs have no unsupported flat-deck equipment', () => {
  const b = { id: 1, x0: 10, y0: 20, x1: 14, y1: 24, height: 12 };
  while (planBuilding(b, 4, 1, true).roofShape !== 'gable') b.id++;
  const map: MapInfo = { seed: 1, width: 32, height: 32, cellSize: 4,
    ground: new Uint8Array(1024), heights: new Uint8Array(1024), buildings: [b],
    sites: [{ name: 'reference', kind: 'base', x0: 0, y0: 0, x1: 1, y1: 1 }], districts: [] };
  expect(buildRooftops(map).children).toHaveLength(0);
});
