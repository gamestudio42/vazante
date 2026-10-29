import { CELL_SIZE, ECONOMY, siteZone, SoldierCondition, SQUADS, TICK_DT, TICK_HZ, type SquadKind } from '@vazante/shared';
import type { Base } from '../entities.ts';
import { spawnSquad } from '../spawn.ts';
import { isActiveSoldier, type World } from '../world.ts';

function centre(r: { x0: number; y0: number; x1: number; y1: number }): [number, number] {
  return [((r.x0 + r.x1 + 1) / 2) * CELL_SIZE, ((r.y0 + r.y1 + 1) / 2) * CELL_SIZE];
}

/** Inside a site's capture area (see siteZone). */
function inZone(zone: { x: number; y: number; r: number }, x: number, y: number): boolean {
  return (x - zone.x) ** 2 + (y - zone.y) ** 2 < zone.r * zone.r;
}

/** The site is secured: it produces and its role works. */
export function siteHeld(w: World, b: Base): boolean {
  return (b.control ?? 0) > ECONOMY.heldAbove;
}

/** What each site gains per ECONOMY.everyS right now, by base id. */
export function siteIncome(w: World): Map<number, { materials: number; ammo: number }> {
  const out = new Map<number, { materials: number; ammo: number }>();
  for (const b of w.bases) {
    const held = w.economy && siteHeld(w, b);
    out.set(b.id, {
      materials: held ? ECONOMY.siteMaterials : 0,
      ammo: held && b.role === 'supply' ? ECONOMY.supplyAmmo : 0,
    });
  }
  return out;
}

/**
 * Site control drifts like a district's, over the site's own area: up while soldiers there
 * outnumber the infected, down while the infected outnumber them.
 */
function stepControl(w: World): void {
  const z = w.zombies;
  for (const b of w.bases) {
    const zone = siteZone(b, CELL_SIZE);
    let soldiers = 0;
    for (const s of w.soldiers) if (isActiveSoldier(s) && inZone(zone, s.x, s.y)) soldiers++;
    let zombies = 0;
    for (let i = 0; i < z.highWater; i++) if (z.isAlive(i) && inZone(zone, z.x[i], z.y[i])) zombies++;
    b.presence = [soldiers, zombies];
    const before = b.control ?? 0;
    let v = before;
    if (soldiers > 0 && zombies <= soldiers) v = Math.min(100, v + ECONOMY.controlStep);
    else if (zombies >= ECONOMY.overrunMin && zombies > soldiers * 2) v = Math.max(0, v - ECONOMY.controlStep);
    b.control = v;
    if (before <= ECONOMY.heldAbove && v > ECONOMY.heldAbove) w.emit({ type: 'site_secured', target: b.id, reason: b.name });
    if (before > ECONOMY.heldAbove && v <= ECONOMY.heldAbove) w.emit({ type: 'site_lost', target: b.id, reason: b.name });
  }
}

function inside(b: Base, x: number, y: number): boolean {
  const cx = Math.floor(x / CELL_SIZE);
  const cy = Math.floor(y / CELL_SIZE);
  return cx >= b.x0 && cx <= b.x1 && cy >= b.y0 && cy <= b.y1;
}

/** Site control each second, income every ECONOMY.everyS; a held hospital heals and cures the soldiers inside it. */
export function stepEconomy(w: World): void {
  if (!w.economy) return;
  if (w.tick % TICK_HZ === 0) stepControl(w);
  if (w.tick > 0 && w.tick % (ECONOMY.everyS * TICK_HZ) === 0) {
    for (const [id, inc] of siteIncome(w)) {
      const b = w.baseById(id)!;
      b.materials += inc.materials;
      b.ammo += inc.ammo;
    }
  }
  const heal = ECONOMY.hospitalHealPerS * TICK_DT;
  for (const b of w.bases) {
    if (b.role !== 'hospital' || !siteHeld(w, b)) continue;
    for (const s of w.soldiers) {
      if (!isActiveSoldier(s) || !inside(b, s.x, s.y)) continue;
      s.hp = Math.min(s.maxHp, s.hp + heal);
      if (s.condition === SoldierCondition.Bitten) {
        s.condition = SoldierCondition.Ok;
        s.turnAt = -1;
        w.emit({ type: 'soldier_cured', source: s.id, x: s.x, y: s.y });
      }
    }
  }
}

/** A new squad at the held railway station, paid from the home base's materials. */
export function recruitSquad(w: World, kind: SquadKind): string | null {
  if (!w.economy || !SQUADS[kind]) return 'no_station';
  const station = w.bases.find((b) => b.role === 'station');
  if (!station) return 'no_station';
  if (!siteHeld(w, station)) return 'station_lost';
  const squads = w.squads.filter((q) => q.members.some((id) => isActiveSoldier(w.soldier(id)!)));
  if (squads.length >= ECONOMY.maxSquads) return 'squad_cap';
  const home = w.bases.find((b) => b.kind === 'base')!;
  const cost = ECONOMY.recruitCost[kind];
  if (home.materials < cost) return 'no_materials';
  const name = ECONOMY.recruitNames.find((n) => !w.squads.some((q) => q.name === n)) ?? `${ECONOMY.recruitNames[0]} ${w.squads.length + 1}`;
  home.materials -= cost;
  const [x, y] = centre(station);
  const q = spawnSquad(w, kind, name, x, y);
  w.emit({ type: 'squad_recruited', source: q.id, x, y, reason: name });
  return null;
}
