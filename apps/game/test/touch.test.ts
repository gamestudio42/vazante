import { expect, test } from "vitest";
import { idleGesture, stepGesture, type Gesture, type TouchPoint } from "../src/touch-gestures.ts";

function play(samples: TouchPoint[][], direct = false): { state: Gesture; types: string[] } {
  let state = idleGesture();
  const types: string[] = [];
  for (const points of samples) {
    const next = stepGesture(state, points, direct);
    state = next.state;
    types.push(...next.actions.map((a) => a.type));
  }
  return { state, types };
}

test("a short one-finger press is a tap and does not pan", () => {
  const moved = stepGesture(idleGesture(), [{ id: 1, x: 10, y: 20 }], false);
  const held = stepGesture(moved.state, [{ id: 1, x: 14, y: 22 }], false);
  const up = stepGesture(held.state, [], false);
  expect(moved.actions).toEqual([]);
  expect(held.actions).toEqual([]);
  expect(up.actions).toEqual([{ type: "tap", x: 10, y: 20 }]);
});

test("a one-finger drag pans and the lift is not a tap", () => {
  const down = stepGesture(idleGesture(), [{ id: 1, x: 0, y: 0 }], false);
  const drag = stepGesture(down.state, [{ id: 1, x: 40, y: -10 }], false);
  const up = stepGesture(drag.state, [], false);
  expect(drag.actions).toEqual([{ type: "pan", dx: 40, dy: -10 }]);
  expect(up.actions).toEqual([]);
  expect(up.state.phase).toBe("idle");
});

test("one finger looks instead of panning while in direct control", () => {
  const down = stepGesture(idleGesture(), [{ id: 1, x: 0, y: 0 }], true);
  const drag = stepGesture(down.state, [{ id: 1, x: 30, y: 4 }], true);
  expect(drag.actions).toEqual([{ type: "look", dx: 30, dy: 4 }]);
});

test("spreading two fingers zooms in and a twist rotates", () => {
  let state = stepGesture(idleGesture(), [
    { id: 1, x: 0, y: 0 },
    { id: 2, x: 100, y: 0 },
  ], false).state;
  const spread = stepGesture(state, [
    { id: 1, x: 0, y: 0 },
    { id: 2, x: 200, y: 0 },
  ], false);
  expect(spread.actions).toEqual([{ type: "pinch", scale: 0.5, rotate: 0 }]);
  state = spread.state;
  const twist = stepGesture(state, [
    { id: 1, x: 0, y: 0 },
    { id: 2, x: 0, y: 200 },
  ], false);
  expect(twist.actions[0]?.type).toBe("pinch");
  if (twist.actions[0]?.type === "pinch") expect(twist.actions[0].rotate).toBeCloseTo(Math.PI / 2, 5);
});

test("lifting the second finger does not fire a tap", () => {
  const pinch = play([
    [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 80, y: 0 },
    ],
    [{ id: 1, x: 0, y: 0 }],
    [],
  ]);
  expect(pinch.types).not.toContain("tap");
});
