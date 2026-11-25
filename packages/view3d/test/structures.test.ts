import { expect, test } from 'vitest';
import * as THREE from 'three';
import { STRUCTURE_KINDS, type StructureView } from '@vazante/shared';
import { StructureLayer } from '../src/structures.ts';

const structures: StructureView[] = STRUCTURE_KINDS.map((kind, id) => ({
  id, kind, cx: id, cy: 0, hp: 100, maxHp: 100, built: true, progress: 1, open: false, pile: 0, ammo: 0, fired: 0,
}));

test('finished defenses have bounded, multicolored geometry in one batch per kind', () => {
  const layer = new StructureLayer(4, 8, 8);
  layer.update(structures);
  const meshes = layer.group.children.filter(o => (o as THREE.InstancedMesh).count === 1) as THREE.InstancedMesh[];
  expect(meshes).toHaveLength(4);
  for (const mesh of meshes) {
    mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox!;
    expect(bounds.min.y).toBeGreaterThanOrEqual(-0.00001);
    expect(bounds.min.x).toBeGreaterThan(-2);
    expect(bounds.max.x).toBeLessThan(2);
    expect(bounds.min.z).toBeGreaterThan(-2);
    expect(bounds.max.z).toBeLessThan(2);
    const colors = mesh.geometry.getAttribute('color');
    expect(colors.count).toBe(mesh.geometry.getAttribute('position').count);
    expect(new Set(colors.array).size).toBeGreaterThan(3);
  }
});

test('gate state, damage, ghosts and removal remain presentation only', () => {
  const layer = new StructureLayer(4, 8, 8);
  const input = structuredClone(structures);
  layer.update(input);
  expect(layer.heightAt[2]).toBe(3);
  const gate = input[2];
  layer.update([{ ...gate, open: true }]);
  expect(layer.heightAt[2]).toBe(0);
  const mesh = layer.group.children.find(o => (o as THREE.InstancedMesh).count === 1) as THREE.InstancedMesh;
  const positions = mesh.geometry.getAttribute('position');
  // Every raised vertex belongs to a side post; only the rail crosses the passage.
  for (let i = 0; i < positions.count; i++) if (positions.getY(i) > 0.1) expect(Math.abs(positions.getX(i))).toBeGreaterThan(1.2);
  layer.setGhosts('gate', [{ cx: 2, cy: 2, ok: false }]);
  layer.update([{ ...gate, hp: 20 }]);
  expect(input).toEqual(structures);
  layer.setGhosts(null, []);
  layer.update([]);
  expect(layer.group.children.every(o => (o as THREE.InstancedMesh).count === 0)).toBe(true);
});
