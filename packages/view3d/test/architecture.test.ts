import { expect, test } from 'vitest';
import { planBuilding } from '../src/architecture.ts';
import { PRESENTATION } from '@vazante/shared';

test('architecture is repeatable and stays inside occupied building bounds', () => {
  const families = new Set<string>();
  for (let id = 1; id <= 200; id++) {
    const b = { id, x0: 10, y0: 20, x1: 14, y1: 24, height: 3 * (1 + id % 10) };
    const a = planBuilding(b, 4, 1);
    expect(planBuilding(b, 4, 1)).toEqual(a);
    families.add(a.family);
    expect(a.details.length).toBeLessThanOrEqual(PRESENTATION.architecture.maxDetails);
    for (const p of [a.body, ...a.details]) {
      expect(p.x - p.width / 2).toBeGreaterThanOrEqual(40);
      expect(p.x + p.width / 2).toBeLessThanOrEqual(60);
      expect(p.z - p.depth / 2).toBeGreaterThanOrEqual(80);
      expect(p.z + p.depth / 2).toBeLessThanOrEqual(100);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y + p.height).toBeLessThanOrEqual(b.height + 1e-6);
    }
  }
  expect(families.size).toBe(4);
});
