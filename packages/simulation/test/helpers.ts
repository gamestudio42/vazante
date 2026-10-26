import { SimulationEngine, openField, spawnSquad, type Soldier } from '../src/index.ts';
import type { SquadKind } from '@vazante/shared';

export function fieldEngine(seed = 1, cells = 64): SimulationEngine {
  return new SimulationEngine(openField(seed, cells));
}

export function addSquad(e: SimulationEngine, kind: SquadKind, x: number, y: number, name = 'T') {
  return spawnSquad(e.world, kind, name, x, y);
}

export function soldiersOf(e: SimulationEngine, squadId: number): Soldier[] {
  return e.world.squad(squadId)!.members.map((id) => e.world.soldier(id)!);
}

export function disarm(s: Soldier): void {
  s.mag = 0;
  s.ammo = 0;
}
