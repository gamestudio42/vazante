import { expect, test } from 'vitest';
import { planBuilding } from '../src/architecture.ts';
import { PRESENTATION } from '@vazante/shared';

test('architecture is repeatable and stays inside occupied building bounds', () => {
  const families = new Set<string>();
  for (const reference of [false, true]) for (const cells of [1, 2, 5]) for (let id = 1; id <= 200; id++) {
    const b = { id, x0: 10, y0: 20, x1: 9 + cells, y1: 19 + cells, height: 3 * (1 + id % 10) };
    const a = planBuilding(b, 4, 1, reference);
    expect(planBuilding(b, 4, 1, reference)).toEqual(a);
    families.add(a.family);
    expect(a.details.length).toBeLessThanOrEqual(PRESENTATION.architecture.maxDetails);
    for (const p of [a.body, ...a.details, ...(a.roof ? [a.roof] : [])]) {
      expect(p.x - p.width / 2).toBeGreaterThanOrEqual(40);
      expect(p.x + p.width / 2).toBeLessThanOrEqual((10 + cells) * 4);
      expect(p.z - p.depth / 2).toBeGreaterThanOrEqual(80);
      expect(p.z + p.depth / 2).toBeLessThanOrEqual((20 + cells) * 4);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y + p.height).toBeLessThanOrEqual(b.height + 1e-6);
    }
  }
  expect(families.size).toBe(4);
});

test('reference silhouettes have supported roofs and retain the authoritative maximum height', () => {
  const shapes = new Set<string>();
  for (let id = 1; id <= 100; id++) {
    const b = { id, x0: 0, y0: 0, x1: 4, y1: 4, height: 12 };
    const a = planBuilding(b, 4, 1, true);
    shapes.add(a.roofShape);
    expect(a.roof).not.toBeNull();
    expect(a.roof!.y).toBe(a.body.height);
    expect(a.roof!.y + a.roof!.height).toBe(b.height);
    expect(a.roof!.width).toBeLessThanOrEqual(a.body.width);
    expect(a.roof!.depth).toBeLessThanOrEqual(a.body.depth);
    expect(planBuilding(b, 4, 1).roof).toBeNull();
  }
  expect([...shapes].sort()).toEqual(['gable', 'setback']);
});

test('landmarks have distinct silhouettes and keep their details inside the occupied envelope', () => {
  const b = { id: 1, x0: 0, y0: 0, x1: 4, y1: 4, height: 18 };
  const hospital = planBuilding(b, 4, 1, true, 'hospital');
  const station = planBuilding(b, 4, 1, true, 'station');
  const port = planBuilding(b, 4, 1, true, 'port');
  expect(hospital.family).toBe('civic');
  expect(hospital.roofShape).toBe('setback');
  expect(station.roofShape).toBe('gable');
  expect(port.roofShape).toBe('gable');
  expect(station.details.at(-1)!.color).not.toBe(port.details.at(-1)!.color);
  for (const a of [hospital, station, port]) for (const p of a.details) {
    expect(p.x - p.width / 2).toBeGreaterThanOrEqual(0);
    expect(p.x + p.width / 2).toBeLessThanOrEqual(20);
    expect(p.z - p.depth / 2).toBeGreaterThanOrEqual(0);
    expect(p.z + p.depth / 2).toBeLessThanOrEqual(20);
    expect(p.y + p.height).toBeLessThanOrEqual(18);
  }
});
