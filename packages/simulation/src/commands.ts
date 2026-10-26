import { CELL_SIZE, SoldierActivity, ZombieKind, ZombieState, type Command } from '@vazante/shared';
import { findPath } from './navigation.ts';
import { releaseDirect } from './systems/lifecycle.ts';
import { isActiveSoldier, type World } from './world.ts';

/** Apply one command at the start of a tick. Returns a rejection reason, or null on success. */
export function applyCommand(w: World, cmd: Command): string | null {
  switch (cmd.type) {
    case 'set_speed':
      if (w.directSoldier !== null && cmd.speed !== 1) return 'direct_control_active';
      w.speed = cmd.speed;
      return null;

    case 'move': {
      let ok = 0;
      for (const id of cmd.squads) {
        const q = w.squad(id);
        if (!q) continue;
        const start = w.grid.cellAt(q.ax, q.ay);
        const goal = w.grid.cellAt(cmd.to.x, cmd.to.y);
        const cells = findPath(w.grid, start, goal);
        if (!cells) continue;
        const path: number[] = [];
        for (const c of cells) path.push(w.grid.cellCenterX(c), w.grid.cellCenterY(c));
        if (cells.length > 0 && cells[cells.length - 1] === goal) {
          path[path.length - 2] = cmd.to.x;
          path[path.length - 1] = cmd.to.y;
        }
        q.order = { kind: 'move', to: { x: cmd.to.x, y: cmd.to.y } };
        q.path = path;
        q.pathIdx = 0;
        ok++;
      }
      return ok > 0 ? null : 'no_path';
    }

    case 'hold':
      for (const id of cmd.squads) {
        const q = w.squad(id);
        if (!q) continue;
        q.order = { kind: 'hold', at: { x: q.ax, y: q.ay } };
        q.path = [];
        q.pathIdx = 0;
      }
      return null;

    case 'stance':
      for (const id of cmd.squads) {
        const q = w.squad(id);
        if (q) q.stance = cmd.stance;
      }
      return null;

    case 'formation':
      for (const id of cmd.squads) {
        const q = w.squad(id);
        if (q) q.formation = cmd.formation;
      }
      return null;

    case 'set_direct_control': {
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
      if (!s || !isActiveSoldier(s)) return 'soldier_unavailable';
      s.direct = { mx: 0, my: 0, ax: s.fx, ay: s.fy, fire: false, reload: false };
      s.target = -1;
      s.fireAcc = 0;
      w.directSoldier = s.id;
      w.speed = 1;
      w.emit({ type: 'direct_control', source: s.id, value: 1 });
      return null;
    }

    case 'direct_input': {
      if (w.directSoldier !== cmd.soldier) return 'not_direct_controlled';
      const s = w.soldier(cmd.soldier);
      if (!s || !s.direct) return 'not_direct_controlled';
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

    case 'debug_spawn': {
      const n = Math.max(1, Math.min(500, Math.floor(cmd.count)));
      let placed = 0;
      for (let i = 0; i < n * 20 && placed < n; i++) {
        const x = cmd.at.x + w.rng.range(-5, 5) * CELL_SIZE;
        const y = cmd.at.y + w.rng.range(-5, 5) * CELL_SIZE;
        if (!w.grid.isWalkableAt(x, y)) continue;
        if (w.zombies.spawn(x, y, ZombieKind.Common, ZombieState.Chasing) < 0) break;
        placed++;
      }
      return placed > 0 ? null : 'no_space';
    }
  }
}
