import {
  CELL_SIZE,
  SoldierActivity,
  ZOMBIES,
  ZombieKind,
  ZombieState,
  type Command,
} from "@vazante/shared";
import {
  demolishStructure,
  placeStructure,
  toggleGate,
} from "./systems/construction.ts";
import { releaseDirect } from "./systems/lifecycle.ts";
import {
  loadCargo,
  orderConvoy,
  orderDrive,
  orderEscort,
  stopVehicle,
} from "./systems/logistics.ts";
import { groupSquads, planMove } from "./systems/units.ts";
import type { Squad } from "./entities.ts";
import { isActiveSoldier, type World } from "./world.ts";

/** Apply one command at the start of a tick. Returns a rejection reason, or null on success. */
export function applyCommand(w: World, cmd: Command): string | null {
  switch (cmd.type) {
    case "set_speed":
      if (w.directSoldier !== null && cmd.speed !== 1)
        return "direct_control_active";
      w.speed = cmd.speed;
      return null;

    case "move": {
      const qs = cmd.squads
        .map((id) => w.squad(id))
        .filter((q): q is Squad => q !== undefined);
      const face = cmd.face ? unit(cmd.face.x, cmd.face.y) : null;
      let ok = 0;
      const moved: Squad[] = [];
      // A queued point extends the route of squads already on the move.
      if (cmd.queue) {
        for (const q of qs.filter((q) => q.order.kind === "move")) {
          (q.via ??= []).push({ x: cmd.to.x, y: cmd.to.y });
          if (face) q.face = face;
          ok++;
        }
        const idle = qs.filter((q) => q.order.kind !== "move");
        if (idle.length === 0) return ok > 0 ? null : "no_path";
        qs.splice(0, qs.length, ...idle);
      }
      for (const q of qs) {
        if (!planMove(w, q, cmd.to.x, cmd.to.y)) continue;
        q.via = undefined;
        q.buildTask = 0;
        q.autoBuild = true;
        moved.push(q);
        ok++;
      }
      // Several squads face the way they are heading as a group, unless a drag said otherwise.
      let dir = face;
      if (!dir && moved.length > 1) {
        let cx = 0;
        let cy = 0;
        for (const q of moved) {
          cx += q.ax / moved.length;
          cy += q.ay / moved.length;
        }
        dir = unit(cmd.to.x - cx, cmd.to.y - cy);
      }
      for (const q of moved) q.face = dir ?? undefined;
      groupSquads(w, moved, dir?.x ?? 0, dir?.y ?? -1);
      return ok > 0 ? null : "no_path";
    }

    case "hold":
      for (const id of cmd.squads) {
        const q = w.squad(id);
        if (!q) continue;
        q.order = { kind: "hold", at: { x: q.ax, y: q.ay } };
        q.via = undefined;
        q.buildTask = 0;
        q.autoBuild = false;
        q.path = [];
        q.pathIdx = 0;
      }
      return null;

    case "stance":
      for (const id of cmd.squads) {
        const q = w.squad(id);
        if (q) q.stance = cmd.stance;
      }
      return null;

    case "formation": {
      const qs = cmd.squads
        .map((id) => w.squad(id))
        .filter((q): q is Squad => q !== undefined);
      for (const q of qs) q.formation = cmd.formation;
      if (qs.length < 2) {
        groupSquads(w, qs, 0, 0);
        return null;
      }
      // Several squads close up on their middle into one formation, facing the first one's way.
      let cx = 0;
      let cy = 0;
      for (const q of qs) {
        cx += q.ax / qs.length;
        cy += q.ay / qs.length;
      }
      if (!w.grid.isWalkableAt(cx, cy)) [cx, cy] = [qs[0].ax, qs[0].ay];
      const face = { x: qs[0].hx, y: qs[0].hy };
      const moved = qs.filter((q) => planMove(w, q, cx, cy));
      for (const q of moved) {
        q.face = face;
        q.via = undefined;
        q.buildTask = 0;
      }
      groupSquads(w, moved, face.x, face.y);
      return null;
    }

    case "set_direct_control": {
      if (w.directSoldier !== null) {
        const prev = w.soldier(w.directSoldier);
        if (prev) {
          releaseDirect(w, prev);
          prev.activity = SoldierActivity.Idle;
          prev.fireAcc = 0;
        }
        w.directSoldier = null;
      }
      if (cmd.soldier === null) return null;
      const s = w.soldier(cmd.soldier);
      if (!s || !isActiveSoldier(s)) return "soldier_unavailable";
      s.direct = {
        mx: 0,
        my: 0,
        ax: s.fx,
        ay: s.fy,
        fire: false,
        reload: false,
      };
      s.target = -1;
      s.fireAcc = 0;
      w.directSoldier = s.id;
      w.speed = 1;
      w.emit({ type: "direct_control", source: s.id, value: 1 });
      return null;
    }

    case "direct_input": {
      if (w.directSoldier !== cmd.soldier) return "not_direct_controlled";
      const s = w.soldier(cmd.soldier);
      if (!s || !s.direct) return "not_direct_controlled";
      let { x: mx, y: my } = cmd.move;
      const ml = Math.sqrt(mx * mx + my * my);
      if (ml > 1) {
        mx /= ml;
        my /= ml;
      }
      let { x: ax, y: ay } = cmd.aim;
      const al = Math.sqrt(ax * ax + ay * ay);
      if (al > 1e-6) {
        ax /= al;
        ay /= al;
      } else {
        ax = s.fx;
        ay = s.fy;
      }
      s.direct = { mx, my, ax, ay, fire: cmd.fire, reload: cmd.reload };
      return null;
    }

    case "build":
      return placeStructure(w, cmd.kind, cmd.at.x, cmd.at.y);

    case "demolish":
      return demolishStructure(w, cmd.structure);

    case "toggle_gate":
      return toggleGate(w, cmd.structure);

    case "convoy":
      return orderConvoy(w, cmd.vehicle, cmd.to, cmd.policy);

    case "load":
      return loadCargo(w, cmd.vehicle, cmd.ammo, cmd.materials);

    case "stop_vehicle":
      return stopVehicle(w, cmd.vehicle);

    case "drive":
      return orderDrive(w, cmd.vehicle, cmd.to.x, cmd.to.y, cmd.queue === true);

    case "escort":
      return orderEscort(w, cmd.vehicle, cmd.squad);

    case "set_policy": {
      const v = w.vehicle(cmd.vehicle);
      if (!v || v.state === "destroyed") return "no_vehicle";
      v.policy = cmd.policy;
      return null;
    }

    case "debug_spawn": {
      const n = Math.max(1, Math.min(500, Math.floor(cmd.count)));
      const kind =
        cmd.kind !== undefined && cmd.kind >= 0 && cmd.kind < ZOMBIES.length
          ? (Math.floor(cmd.kind) as ZombieKind)
          : ZombieKind.Common;
      let placed = 0;
      for (let i = 0; i < n * 20 && placed < n; i++) {
        const x = cmd.at.x + w.rng.range(-5, 5) * CELL_SIZE;
        const y = cmd.at.y + w.rng.range(-5, 5) * CELL_SIZE;
        if (!w.grid.isWalkableAt(x, y)) continue;
        if (w.zombies.spawn(x, y, kind, ZombieState.Chasing) < 0) break;
        placed++;
      }
      return placed > 0 ? null : "no_space";
    }
  }
}

function unit(x: number, y: number): { x: number; y: number } | null {
  const d = Math.sqrt(x * x + y * y);
  return d > 1e-6 ? { x: x / d, y: y / d } : null;
}
