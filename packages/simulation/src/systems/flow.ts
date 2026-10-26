import { FLOW_INTERVAL_TICKS, STRUCTURE_FLOW_PENALTY } from '@vazante/shared';
import { computeFlowField } from '../navigation.ts';
import { isActiveSoldier, type World } from '../world.ts';

/** Recompute the horde flow field from every living human's cell. */
export function stepFlow(w: World, force = false): void {
  if (!force && !w.flowDirty && w.tick % FLOW_INTERVAL_TICKS !== 0) return;
  w.flowDirty = false;
  const sources: number[] = [];
  for (const s of w.soldiers) if (isActiveSoldier(s)) sources.push(w.grid.cellAt(s.x, s.y));
  computeFlowField(w.grid, sources, STRUCTURE_FLOW_PENALTY);
}
