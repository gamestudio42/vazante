import { NOISE_DECAY_NUM } from '@vazante/shared';
import type { World } from '../world.ts';

export function decayNoise(w: World): void {
  const n = w.grid.noise;
  for (let i = 0; i < n.length; i++) if (n[i] !== 0) n[i] = ((n[i] * NOISE_DECAY_NUM) / 10) | 0;
}
