import type { RiskPolicy } from './balance/logistics.ts';
import type { StructureKind } from './balance/structures.ts';
import type { Formation, SimSpeed, Stance, Vec2 } from './types.ts';

export type Command =
  | { type: 'set_speed'; speed: SimSpeed }
  | { type: 'move'; squads: number[]; to: Vec2 }
  | { type: 'hold'; squads: number[] }
  | { type: 'stance'; squads: number[]; stance: Stance }
  | { type: 'formation'; squads: number[]; formation: Formation }
  | { type: 'set_direct_control'; soldier: number | null }
  | { type: 'direct_input'; soldier: number; move: Vec2; aim: Vec2; fire: boolean; reload: boolean }
  | { type: 'build'; kind: StructureKind; at: Vec2 }
  | { type: 'demolish'; structure: number }
  | { type: 'toggle_gate'; structure: number }
  /** Send a vehicle to a base or depot (by base id) with a risk policy for blocked roads. */
  | { type: 'convoy'; vehicle: number; to: number; policy: RiskPolicy }
  /** Load cargo from the stock of the site the vehicle is in (negative values unload). */
  | { type: 'load'; vehicle: number; ammo: number; materials: number }
  | { type: 'stop_vehicle'; vehicle: number }
  | { type: 'set_policy'; vehicle: number; policy: RiskPolicy }
  /** Development helper: spawn a group of zombies around a point. */
  | { type: 'debug_spawn'; at: Vec2; count: number; kind?: number };

export type CommandType = Command['type'];

export interface CommandEnvelope {
  seq: number;
  cmd: Command;
}
