import { expect, test } from 'vitest';
import { SimulationEngine } from '../src/index.ts';
import { buildCity } from '../../view3d/src/city.ts';
import { planBuilding, referenceBuildings } from '../../view3d/src/architecture.ts';

test('city architecture preserves the world and styles through chunking', () => {
  const engine = SimulationEngine.create(1, 'last_convoy');
  const before = engine.hashState();
  const map = engine.mapInfo();
  const original = structuredClone(map);
  const reference = referenceBuildings(map);
  expect(reference.size).toBeGreaterThan(0);
  expect(reference.size).toBeLessThan(map.buildings.length);
  expect(referenceBuildings(map)).toEqual(reference);
  const city = buildCity(map);
  let count = 0;
  city.traverse(o => {
    if (o.name !== 'buildings') return;
    const mesh = o as import('../../view3d/src/architecture.ts').ArchitectureMesh;
    const style = mesh.geometry.getAttribute('aFacade');
    for (let i = 0; i < mesh.count; i++) {
      const x = mesh.instanceMatrix.array[i * 16 + 12];
      const z = mesh.instanceMatrix.array[i * 16 + 14];
      const b = map.buildings.find(b => (b.x0 + b.x1 + 1) * 2 === x && (b.y0 + b.y1 + 1) * 2 === z)!;
      expect(b).toBeDefined();
      const look = planBuilding(b, map.cellSize, map.seed, reference.has(b.id));
      expect(style.getX(i)).toBe(look.familyIndex);
      expect(style.getY(i)).toBe(look.variation);
      expect(mesh.instanceMatrix.array[i * 16 + 5]).toBeCloseTo(look.body.height, 5);
      count++;
    }
  });
  expect(count).toBe(map.buildings.length);
  expect(map).toEqual(original);
  expect(engine.hashState()).toBe(before);
});
