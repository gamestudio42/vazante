import { expect, test } from 'vitest';
import * as THREE from 'three';
import { COLLISION } from '@vazante/shared';
import { ancoraProp, equipAncoraSoldier } from '../src/ancora-art.ts';

for (const kind of ['Tank', 'Tent', 'Container_Long'] as const) test(`${kind} original art fits collision and repeats exactly`, () => {
  const geo = ancoraProp(kind), repeat = ancoraProp(kind);
  geo.computeBoundingBox();
  const b = geo.boundingBox!, footprint = COLLISION.props[kind];
  expect(b.min.y).toBeGreaterThanOrEqual(-0.00001);
  expect(b.max.x - b.min.x).toBeLessThanOrEqual(footprint.length);
  expect(b.max.z - b.min.z).toBeLessThanOrEqual(footprint.width);
  expect(geo.attributes.position.array).toEqual(repeat.attributes.position.array);
  expect(geo.attributes.color.count).toBe(geo.attributes.position.count);
  expect(geo.attributes.position.count).toBeLessThan(5000);
});

test('field gear follows the torso and leaves source geometry intact', () => {
  const root = new THREE.Group(), torso = new THREE.Bone(); torso.name = 'Torso';
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.8, 0.3)); body.position.y = 0.9;
  root.add(torso, body);
  const positions = body.geometry.attributes.position.array.slice();
  equipAncoraSoldier(root);
  expect(torso.children.length).toBe(7);
  const gear = torso.children[0];
  const before = gear.getWorldPosition(new THREE.Vector3());
  torso.position.x += 2; root.updateMatrixWorld(true);
  expect(gear.getWorldPosition(new THREE.Vector3()).x - before.x).toBeCloseTo(2);
  expect(body.geometry.attributes.position.array).toEqual(positions);
});
