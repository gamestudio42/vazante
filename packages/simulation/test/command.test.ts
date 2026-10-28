import { describe, expect, it } from "vitest";
import { Ground } from "@vazante/shared";
import { addSquad, fieldEngine, soldiersOf } from "./helpers.ts";

describe("squad command", () => {
  it("the squad of the soldier under direct control follows him and stays when control ends", () => {
    const e = fieldEngine();
    const q = addSquad(e, "guard", 128, 128);
    const [lead, ...rest] = soldiersOf(e, q.id);
    e.enqueue({ type: "set_direct_control", soldier: lead.id });
    e.enqueue({
      type: "direct_input",
      soldier: lead.id,
      move: { x: 1, y: 0 },
      aim: { x: 1, y: 0 },
      fire: false,
      reload: false,
    });
    e.runTicks(100);
    expect(lead.x).toBeGreaterThan(150);
    const mean = rest.reduce((a, s) => a + s.x, 0) / rest.length;
    // Formed up behind him, not left at the start.
    expect(mean).toBeGreaterThan(lead.x - 12);
    expect(mean).toBeLessThan(lead.x);
    e.enqueue({
      type: "direct_input",
      soldier: lead.id,
      move: { x: 0, y: 0 },
      aim: { x: 1, y: 0 },
      fire: false,
      reload: false,
    });
    e.enqueue({ type: "set_direct_control", soldier: null });
    e.runTicks(60);
    const after = rest.reduce((a, s) => a + s.x, 0) / rest.length;
    expect(Math.abs(after - mean)).toBeLessThan(6);
    expect(q.order.kind).toBe("hold");
  });

  it("a right-drag sets the heading the squad takes on arrival", () => {
    const e = fieldEngine();
    const q = addSquad(e, "guard", 128, 128);
    e.enqueue({
      type: "move",
      squads: [q.id],
      to: { x: 128, y: 100 },
      face: { x: 1, y: 0 },
    });
    e.runTicks(300);
    expect(q.order.kind).toBe("hold");
    expect(q.hx).toBeCloseTo(1);
    expect(q.hy).toBeCloseTo(0);
    // The line runs across the facing: members spread along y.
    const ys = soldiersOf(e, q.id).map((s) => s.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(10);
  });

  it("several squads ordered together make one line instead of piling up", () => {
    const e = fieldEngine();
    const a = addSquad(e, "guard", 100, 150);
    const b = addSquad(e, "guard", 156, 150);
    e.enqueue({ type: "move", squads: [a.id, b.id], to: { x: 128, y: 110 } });
    e.runTicks(400);
    const all = [...soldiersOf(e, a.id), ...soldiersOf(e, b.id)];
    // No two soldiers on the same spot, and one long line.
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++)
        expect(
          Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y),
        ).toBeGreaterThan(1);
    const xs = all.map((s) => s.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(
      (all.length - 2) * 2 - 1,
    );
    // Squad a started on the left and keeps the left half.
    const ax = soldiersOf(e, a.id).reduce((s, x) => s + x.x, 0);
    const bx = soldiersOf(e, b.id).reduce((s, x) => s + x.x, 0);
    expect(ax / soldiersOf(e, a.id).length).toBeLessThan(
      bx / soldiersOf(e, b.id).length,
    );
  });

  it("choosing a formation for several squads closes them into one", () => {
    const e = fieldEngine();
    const a = addSquad(e, "guard", 110, 128);
    const b = addSquad(e, "guard", 146, 128);
    e.enqueue({ type: "formation", squads: [a.id, b.id], formation: "column" });
    e.runTicks(400);
    const all = [...soldiersOf(e, a.id), ...soldiersOf(e, b.id)];
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++)
        expect(
          Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y),
        ).toBeGreaterThan(1);
    expect(a.formation).toBe("column");
    expect(b.slotTotal).toBe(all.length);
  });
});

describe("members caught behind a wall", () => {
  it("find their own way back to the squad", () => {
    const e = fieldEngine();
    const g = e.world.grid;
    const q = addSquad(e, "guard", 128, 110);
    const [lost] = soldiersOf(e, q.id);
    // A cup open to the south between the soldier and his slot: walking straight north only
    // presses him against the wall.
    const wall = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) g.ground[g.idx(x, y)] = Ground.Building;
    };
    const cx = g.cellAt(128, 0) % g.width;
    const cy = Math.floor(g.cellAt(0, 140) / g.width);
    wall(cx - 6, cy, cx + 6, cy);
    wall(cx - 6, cy, cx - 6, cy + 6);
    wall(cx + 6, cy, cx + 6, cy + 6);
    lost.x = 128;
    lost.y = g.cellCenterY(g.cellAt(0, 140) + 3 * g.width);
    e.runTicks(400);
    const others = soldiersOf(e, q.id).slice(1);
    const my = others.reduce((a, s) => a + s.y, 0) / others.length;
    expect(Math.abs(lost.y - my)).toBeLessThan(8);
  });
});
