export type SimEventType =
  | 'command_rejected'
  | 'shot'
  | 'zombie_killed'
  | 'soldier_hit'
  | 'soldier_bitten'
  | 'soldier_died'
  | 'soldier_turned'
  | 'zombie_risen'
  | 'out_of_ammo'
  | 'reloading'
  | 'squad_arrived'
  | 'direct_control'
  | 'structure_placed'
  | 'structure_built'
  | 'structure_destroyed'
  | 'gate_toggled';

export interface SimEvent {
  tick: number;
  type: SimEventType;
  source?: number;
  target?: number;
  x?: number;
  y?: number;
  /** Shot end point, for tracers. */
  x2?: number;
  y2?: number;
  value?: number;
  reason?: string;
}
