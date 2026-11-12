import { expect, test } from 'vitest';
import { Ground, PRESENTATION, type MapInfo } from '@vazante/shared';
import { planCrossings, vegetationStyle } from '../src/streets.ts';

function blankMap(size: number): MapInfo {
  return { seed: 1, width: size, height: size, cellSize: 4, ground: new Uint8Array(size * size).fill(Ground.Building), heights: new Uint8Array(size * size), buildings: [], districts: [], sites: [] };
}

test('crossings connect sidewalks across streets and never paint water or incomplete spans', () => {
  const map = blankMap(12);
  const at = (x: number, y: number) => y * map.width + x;
  map.ground[at(2, 3)] = map.ground[at(6, 3)] = Ground.Sidewalk;
  map.ground[at(2, 2)] = Ground.Street;
  for (let x = 3; x < 6; x++) map.ground[at(x, 3)] = Ground.Street;
  const before = map.ground.slice();
  const marks = planCrossings(map);
  for (let x = 3; x < 6; x++) expect(marks[at(x, 3)]).toBe(1);
  for (let c = 0; c < marks.length; c++) if (marks[c]) expect(map.ground[c]).toBe(Ground.Street);
  expect(map.ground).toEqual(before);
  map.ground[at(4, 3)] = Ground.Water;
  expect([...planCrossings(map)].some(Boolean)).toBe(false);
});

test('crossings run north-south too, and a street cell crossed both ways carries both bits', () => {
  const map = blankMap(12);
  const at = (x: number, y: number) => y * map.width + x;
  // A sidewalk corner at (3, 3) with streets east and south of it, and sidewalks across both.
  map.ground[at(3, 3)] = Ground.Sidewalk;
  for (let x = 4; x < 7; x++) map.ground[at(x, 3)] = Ground.Street;
  map.ground[at(7, 3)] = Ground.Sidewalk;
  for (let y = 4; y < 7; y++) map.ground[at(3, y)] = Ground.Street;
  map.ground[at(3, 7)] = Ground.Sidewalk;
  const marks = planCrossings(map);
  for (let y = 4; y < 7; y++) expect(marks[at(3, y)] & 2).toBe(2);
  for (let x = 4; x < 7; x++) expect(marks[at(x, 3)] & 1).toBe(1);
  // Where the east-west and north-south crossings share a cell, both bits are set.
  map.ground[at(5, 3)] = Ground.Street;
  map.ground[at(5, 2)] = Ground.Sidewalk;
  map.ground[at(5, 4)] = Ground.Street;
  map.ground[at(5, 5)] = Ground.Sidewalk;
  map.ground[at(4, 2)] = Ground.Street;
  // The corner at (5, 2) sends a north-south crossing over (5, 3), already on the east-west one.
  const both = planCrossings(map);
  expect(both[at(5, 4)]).toBe(2);
  expect(both[at(5, 3)]).toBe(3);
});

test('trees share one style per district, and districts differ', () => {
  const map = blankMap(12);
  map.districts = [
    { id: 0, name: 'a', x0: 0, y0: 0, x1: 5, y1: 11 },
    { id: 1, name: 'b', x0: 6, y0: 0, x1: 11, y1: 11 },
  ];
  const a = vegetationStyle(map, 1, 1);
  for (const [x, y] of [[0, 0], [5, 11], [3, 7]]) expect(vegetationStyle(map, x, y)).toBe(a);
  const b = vegetationStyle(map, 8, 4);
  expect(b).not.toBe(a);
  for (const s of [a, b]) {
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(PRESENTATION.street.foliage.length);
  }
  // Every style indexes all three tuning tables.
  const t = PRESENTATION.street;
  expect(t.foliage.length).toBe(t.treeDensityModulo.length);
  expect(t.foliage.length).toBe(t.treeScale.length);
});
