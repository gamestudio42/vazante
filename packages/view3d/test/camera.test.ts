import { expect, test } from 'vitest';
import { CameraRig } from '../src/camera.ts';

test('pinch scale and twist change only the presentation rig', () => {
  const rig = new CameraRig(400, 400);
  const span = rig.targetSpan;
  const yaw = rig.targetYaw;
  rig.zoomScale(0.5);
  expect(rig.targetSpan).toBeCloseTo(span * 0.5);
  rig.rotateBy(Math.PI / 2);
  expect(rig.targetYaw).toBeCloseTo(yaw + Math.PI / 2);
  rig.zoom(-1);
  rig.rotate(-1);
  expect(rig.targetSpan).toBeLessThan(span * 0.5);
  expect(rig.targetYaw).toBeCloseTo(yaw + Math.PI / 4);
});

test('direct camera retracts before walls and returns smoothly after clearing them', () => {
  const rig = new CameraRig(100, 100);
  rig.setBuildings([{ id: 1, x0: 0, y0: 0, x1: 1, y1: 4, height: 30 }], 4);
  rig.direct = { x: 12, y: 10, yaw: 0 };
  rig.update(0.016);
  expect(rig.persp.position.x).toBeGreaterThanOrEqual(8.59);
  const shortened = 12 - rig.persp.position.x;
  rig.direct.y = 40;
  rig.update(0.016);
  expect(12 - rig.persp.position.x).toBeGreaterThan(shortened);
  expect(12 - rig.persp.position.x).toBeLessThan(12);
  for (let i = 0; i < 200; i++) rig.update(0.016);
  expect(rig.persp.position.x).toBeCloseTo(0, 2);
});


test('close obstruction hides the controlled model with hysteresis and restores it outside direct view', () => {
  const rig = new CameraRig(100, 100);
  rig.setBuildings([{ id: 1, x0: 0, y0: 0, x1: 1, y1: 4, height: 30 }], 4);
  rig.direct = { x: 9, y: 10, yaw: 0 };
  rig.update(0.016);
  expect(rig.hideControlledSoldier).toBe(true);
  expect(rig.persp.position.x).toBeGreaterThanOrEqual(8.59);
  rig.direct.y = 40;
  rig.update(0.001);
  expect(rig.hideControlledSoldier).toBe(true);
  for (let i = 0; i < 100; i++) rig.update(0.016);
  expect(rig.hideControlledSoldier).toBe(false);
  rig.direct = { x: 9, y: 10, yaw: 0 };
  rig.update(0.016);
  expect(rig.hideControlledSoldier).toBe(true);
  rig.direct = null;
  rig.update(0.016);
  expect(rig.hideControlledSoldier).toBe(false);
});
