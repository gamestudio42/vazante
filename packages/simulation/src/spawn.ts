import { SQUADS, SoldierActivity, SoldierCondition, WEAPONS, ZOMBIES, ZombieKind, type SquadKind } from '@vazante/shared';
import type { Soldier, Squad } from './entities.ts';
import type { World } from './world.ts';
import { formationOffset } from './systems/units.ts';

/** Create a squad of the given template with its anchor at (x, y), facing north. */
export function spawnSquad(w: World, kind: SquadKind, name: string, x: number, y: number): Squad {
  const t = SQUADS[kind];
  const q: Squad = {
    id: w.allocId(),
    name,
    kind,
    members: [],
    order: { kind: 'hold', at: { x, y } },
    stance: 'aggressive',
    formation: 'line',
    speed: t.speed,
    ax: x,
    ay: y,
    hx: 0,
    hy: -1,
    path: [],
    pathIdx: 0,
    buildTask: 0,
    autoBuild: true,
  };
  const n = t.weapons.length;
  for (let i = 0; i < n; i++) {
    const weapon = t.weapons[i];
    const wpn = WEAPONS[weapon];
    const [fwd, lat] = formationOffset(q.formation, i, n);
    const sx = x + q.hx * fwd - q.hy * lat;
    const sy = y + q.hy * fwd + q.hx * lat;
    const mag = Math.min(wpn.magazine, wpn.ammoPerSoldier);
    const s: Soldier = {
      id: w.allocId(),
      squad: q.id,
      x: w.grid.isWalkableAt(sx, sy) ? sx : x,
      y: w.grid.isWalkableAt(sx, sy) ? sy : y,
      fx: q.hx,
      fy: q.hy,
      hp: t.soldierHp,
      maxHp: t.soldierHp,
      weapon,
      mag,
      ammo: wpn.ammoPerSoldier - mag,
      condition: SoldierCondition.Ok,
      activity: SoldierActivity.Idle,
      reloadT: 0,
      fireAcc: 0,
      target: -1,
      moving: false,
      turnAt: -1,
      riseAt: -1,
      outOfAmmoReported: false,
      direct: null,
    };
    q.members.push(s.id);
    w.addSoldier(s);
  }
  w.addSquad(q);
  return q;
}

/** Pick a zombie kind by the balance shares. */
export function rollZombieKind(w: World): ZombieKind {
  const r = w.rng.next();
  let acc = 0;
  for (let k = 0; k < ZOMBIES.length; k++) {
    acc += ZOMBIES[k].share;
    if (r < acc) return k as ZombieKind;
  }
  return ZombieKind.Common;
}
