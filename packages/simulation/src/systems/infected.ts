import { BLOATER, SCREAMER, TICK_HZ, ZombieKind, ZombieState } from '@vazante/shared';
import { isActiveSoldier, type World } from '../world.ts';
import { damageStructure } from './construction.ts';
import { killSoldier } from './lifecycle.ts';

/**
 * Every zombie death goes through here: the kill count, the event (value = kind, so the view can
 * leave the right corpse) and the Inchado burst, which can chain into other Inchados.
 */
export function killZombie(w: World, slot: number, source: number): void {
  const z = w.zombies;
  const x = z.x[slot];
  const y = z.y[slot];
  const kind = z.kind[slot];
  z.kill(slot);
  w.stats.zombiesKilled++;
  w.emit({ type: 'zombie_killed', source, target: slot, x, y, value: kind });
  if (kind === ZombieKind.Bloater) burst(w, x, y);
}

/** Damage falls off linearly from the centre to the edge of the burst. */
function falloff(d2: number): number {
  return Math.max(0, 1 - Math.sqrt(d2) / BLOATER.radiusM);
}

function burst(w: World, x: number, y: number): void {
  const r2 = BLOATER.radiusM * BLOATER.radiusM;
  w.emit({ type: 'zombie_burst', x, y });
  w.grid.stampNoise(x, y, BLOATER.noise, BLOATER.noiseRadiusM);
  for (const s of w.soldiers) {
    if (!isActiveSoldier(s)) continue;
    const d2 = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y);
    if (d2 > r2) continue;
    const k = falloff(d2);
    const dmg = Math.round(BLOATER.soldierDamage * k);
    if (dmg <= 0) continue;
    s.hp -= dmg;
    s.stress = Math.min(100, s.stress + BLOATER.stress * k);
    w.emit({ type: 'soldier_hit', source: 0, target: s.id, x: s.x, y: s.y, value: dmg });
    if (s.hp <= 0) killSoldier(w, s, false);
  }
  for (const st of [...w.structures]) {
    const sx = w.grid.cellCenterX(st.cell);
    const sy = w.grid.cellCenterY(st.cell);
    const d2 = (sx - x) * (sx - x) + (sy - y) * (sy - y);
    if (d2 <= r2 && st.built) damageStructure(w, st, Math.round(BLOATER.structureDamage * falloff(d2)));
  }
  // Collect first: killing changes the pool the hash walk reads.
  const hit: number[] = [];
  const z = w.zombies;
  w.forZombiesNear(x, y, BLOATER.radiusM, (s) => {
    if (z.isAlive(s)) hit.push(s);
  });
  for (const s of hit) {
    if (!z.isAlive(s)) continue;
    const d2 = (z.x[s] - x) * (z.x[s] - x) + (z.y[s] - y) * (z.y[s] - y);
    z.hp[s] -= Math.round(BLOATER.zombieDamage * falloff(d2));
    if (z.hp[s] <= 0) killZombie(w, s, 0);
  }
}

/**
 * Gritadores that have a soldier in sight scream every SCREAMER.everyS seconds (staggered by slot,
 * so no per-zombie timer is stored): the noise turns every wanderer within earshot into a chaser.
 */
export function stepInfected(w: World): void {
  const z = w.zombies;
  const period = SCREAMER.everyS * TICK_HZ;
  const r2 = SCREAMER.sightM * SCREAMER.sightM;
  for (let s = 0; s < z.highWater; s++) {
    if (!z.isAlive(s) || z.kind[s] !== ZombieKind.Screamer || (w.tick + s) % period !== 0) continue;
    if (z.state[s] === ZombieState.Wandering) continue;
    const x = z.x[s];
    const y = z.y[s];
    if (!w.soldiers.some((q) => isActiveSoldier(q) && (q.x - x) * (q.x - x) + (q.y - y) * (q.y - y) <= r2)) continue;
    w.grid.stampNoise(x, y, SCREAMER.noise, SCREAMER.radiusM);
    w.emit({ type: 'zombie_scream', source: s, x, y });
  }
}
