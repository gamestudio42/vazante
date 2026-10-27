import { Rng } from '@vazante/kernel';
import { Grid } from './grid.ts';
import { FlowJob } from './navigation.ts';
import { World } from './world.ts';
import { ZombiePool } from './zombies.ts';

/**
 * A deep copy of the world without its pending events. Shared references (index maps pointing at
 * the same entities as the arrays) survive because the copy is one structured clone.
 */
export function snapshotWorld(w: World): unknown {
  const events = w.events;
  w.events = [];
  try {
    return structuredClone(w);
  } finally {
    w.events = events;
  }
}

/** Turn a snapshot back into a live world by restoring the class prototypes it lost. */
export function restoreWorld(snap: unknown): World {
  const w = structuredClone(snap) as World;
  Object.setPrototypeOf(w, World.prototype);
  Object.setPrototypeOf(w.grid, Grid.prototype);
  Object.setPrototypeOf(w.zombies, ZombiePool.prototype);
  Object.setPrototypeOf(w.rng, Rng.prototype);
  Object.setPrototypeOf(w.flowJob, FlowJob.prototype);
  w.events = [];
  w.relink();
  return w;
}
