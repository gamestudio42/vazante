import { expect, test } from 'vitest';
import { PRESENTATION } from '@vazante/shared';
import { squadMarkerColor, squadMarkerCss } from '@vazante/view3d';
import { visibleSquadLabels, type SquadLabelBox } from '../src/ui/squad-labels.ts';

const box = (id: number, x: number, y = 100, selected = false): SquadLabelBox => ({ id, x, y, width: 80, height: 24, front: true, selected });

test('an overlapping selected squad takes priority without moving either label', () => {
  const labels = [box(1, 100), box(8, 120, 100, true), box(15, 250)];
  const before = structuredClone(labels);
  expect(visibleSquadLabels(labels, 800, 450).map(b => b.id)).toEqual([8, 15]);
  expect(labels).toEqual(before);
  expect(visibleSquadLabels(labels.map(b => ({ ...b, selected: b.id === 1 })), 800, 450).map(b => b.id)).toEqual([1, 15]);
});

test('labels behind the camera or cut by viewport edges are omitted', () => {
  expect(visibleSquadLabels([
    box(1, -20), box(2, 770), box(3, 100, 430), box(4, 100, 20),
    { ...box(5, 200), front: false }, box(6, 300),
  ], 800, 450).map(b => b.id)).toEqual([6]);
});

test('the label budget is bounded and selected squads retain priority in large armies', () => {
  const labels = Array.from({ length: 30 }, (_, i) => box(i + 1, 10 + i * 100, 100, i === 29));
  const visible = visibleSquadLabels(labels, 4000, 450);
  expect(visible).toHaveLength(PRESENTATION.squadMarkers.maxLabels);
  expect(visible[0].id).toBe(30);
});

test('identity colours stay stable across CSS and renderer consumers for non-consecutive IDs', () => {
  expect(squadMarkerCss(1)).toBe('#5aa9ff');
  expect(squadMarkerCss(8)).toBe('#ff8ce6');
  for (const id of [1, 8, 15, 22, 104]) {
    expect(parseInt(squadMarkerCss(id).slice(1), 16)).toBe(squadMarkerColor(id));
    expect(squadMarkerColor(id + 4)).toBe(squadMarkerColor(id));
  }
});


test('site and objective labels remain unobscured, with bounded lift and no horizontal displacement', () => {
  const original = box(1, 100, 100, true);
  const [placed] = visibleSquadLabels([original], 800, 450, [{ x: 90, y: 110, width: 120, height: 24 }]);
  expect(placed.x).toBe(original.x);
  expect(placed.y + placed.height).toBeLessThan(110);
  expect(original.y - placed.y).toBeLessThanOrEqual(PRESENTATION.squadMarkers.maxLiftPx);
  expect(visibleSquadLabels([box(1, 100, 55)], 800, 450, [{ x: 90, y: 60, width: 120, height: 24 }])).toEqual([]);
});
