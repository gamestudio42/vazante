import { FLOW_BUDGET_PER_TICK, FLOW_INTERVAL_TICKS, STRUCTURE_FLOW_PENALTY } from '@vazante/shared';
import { isActiveSoldier, type World } from '../world.ts';

/**
 * Rebuild the horde flow field from every living human's cell. A rebuild that does not fit the
 * per-tick budget (the 2 km city) carries on over the next ticks while the horde follows the
 * previous field; on the slice map it always finishes in the tick it starts.
 */
export function stepFlow(w: World, force = false): void {
  const job = w.flowJob;
  if (!job.active) {
    if (!force && !w.flowDirty && w.tick % FLOW_INTERVAL_TICKS !== 0) return;
    w.flowDirty = false;
    const sources: number[] = [];
    for (const s of w.soldiers) if (isActiveSoldier(s)) sources.push(w.grid.cellAt(s.x, s.y));
    const cp = w.mission ? w.structure(w.mission.commandPost) : undefined;
    if (cp) sources.push(cp.cell);
    for (const v of w.vehicles) if (v.state !== 'destroyed') sources.push(w.grid.cellAt(v.x, v.y));
    job.begin(w.grid, sources, STRUCTURE_FLOW_PENALTY);
  }
  job.run(w.grid, force ? Infinity : FLOW_BUDGET_PER_TICK);
}
