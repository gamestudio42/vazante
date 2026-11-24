/** A finger still on the screen, in client pixels. */
export interface TouchPoint {
  id: number;
  x: number;
  y: number;
}

/**
 * Movement below this (CSS pixels) stays a tap. Past it, one finger pans the
 * map (or looks, in direct control) and the lift is not an order.
 */
export const TAP_SLOP_PX = 12;

export interface Gesture {
  phase: "idle" | "pending" | "pan" | "pinch";
  originX: number;
  originY: number;
  lastX: number;
  lastY: number;
  dist: number;
  angle: number;
}

export type GestureAction =
  | { type: "pan"; dx: number; dy: number }
  | { type: "pinch"; scale: number; rotate: number }
  | { type: "look"; dx: number; dy: number }
  | { type: "tap"; x: number; y: number };

export function idleGesture(): Gesture {
  return { phase: "idle", originX: 0, originY: 0, lastX: 0, lastY: 0, dist: 0, angle: 0 };
}

/**
 * One sample of the touches currently down. `direct` turns a one-finger drag
 * into look instead of pan. Mouse and keyboard never come through here.
 */
export function stepGesture(
  state: Gesture,
  points: readonly TouchPoint[],
  direct: boolean,
): { state: Gesture; actions: GestureAction[] } {
  const actions: GestureAction[] = [];
  if (points.length === 0) {
    if (state.phase === "pending") actions.push({ type: "tap", x: state.originX, y: state.originY });
    return { state: idleGesture(), actions };
  }
  if (points.length === 1) {
    const p = points[0];
    if (state.phase === "idle" || state.phase === "pinch") {
      // After a pinch, the remaining finger must not become a tap.
      const phase = state.phase === "pinch" ? "pan" : "pending";
      return {
        state: { phase, originX: p.x, originY: p.y, lastX: p.x, lastY: p.y, dist: 0, angle: 0 },
        actions,
      };
    }
    const dx = p.x - state.lastX;
    const dy = p.y - state.lastY;
    const fromOrigin = Math.hypot(p.x - state.originX, p.y - state.originY);
    if (state.phase === "pending" && fromOrigin < TAP_SLOP_PX) {
      return { state: { ...state, lastX: p.x, lastY: p.y }, actions };
    }
    if (direct) {
      if (dx !== 0 || dy !== 0) actions.push({ type: "look", dx, dy });
    } else if (dx !== 0 || dy !== 0) {
      actions.push({ type: "pan", dx, dy });
    }
    return { state: { ...state, phase: "pan", lastX: p.x, lastY: p.y }, actions };
  }
  const [a, b] = [...points].sort((p, q) => p.id - q.id);
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  if (state.phase === "pinch" && state.dist > 0 && dist > 0) {
    let rotate = angle - state.angle;
    if (rotate > Math.PI) rotate -= Math.PI * 2;
    if (rotate < -Math.PI) rotate += Math.PI * 2;
    const scale = state.dist / dist;
    if (scale !== 1 || rotate !== 0) actions.push({ type: "pinch", scale, rotate });
  }
  return {
    state: {
      ...state,
      phase: "pinch",
      dist,
      angle,
      lastX: (a.x + b.x) / 2,
      lastY: (a.y + b.y) / 2,
    },
    actions,
  };
}
