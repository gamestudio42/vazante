export type SimEventType =
  | 'command_rejected'
  | 'shot'
  | 'zombie_killed'
  | 'zombie_scream'
  | 'zombie_burst'
  | 'soldier_hit'
  | 'soldier_bitten'
  | 'soldier_died'
  | 'soldier_turned'
  | 'zombie_risen'
  | 'out_of_ammo'
  | 'reloading'
  | 'squad_arrived'
  | 'squad_contact'
  | 'soldier_panicked'
  | 'direct_control'
  | 'structure_placed'
  | 'structure_built'
  | 'structure_destroyed'
  | 'gate_toggled'
  | 'convoy_blocked'
  | 'cargo_delivered'
  | 'civilians_boarded'
  | 'civilians_delivered'
  | 'objective_done'
  | 'night_survived'
  | 'vehicle_destroyed'
  | 'vehicle_hit'
  | 'wave_warning'
  | 'wave_started'
  | 'district_lost'
  | 'district_held'
  | 'mission_won'
  | 'mission_lost';

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
