import type { Frame, MapInfo } from '@vazante/shared';

export interface ObjectiveTarget {
  x: number;
  y: number;
  name: string;
}

/** Where the current objective is, in metres: its zone, or the base for deliveries and base waves. */
export function objectiveTarget(f: Frame, map: MapInfo): ObjectiveTarget | null {
  const m = f.mission;
  if (!m || m.phase !== 'active') return null;
  const cs = map.cellSize;
  const z = m.zones.find((x) => x.active);
  if (z) return { x: ((z.x0 + z.x1 + 1) / 2) * cs, y: ((z.y0 + z.y1 + 1) / 2) * cs, name: z.name };
  const o = m.objectives.find((x) => x.state === 'active');
  if (!o || (o.kind !== 'deliver' && o.kind !== 'waves')) return null;
  const site = map.sites.find((s) => s.name === o.place) ?? map.sites.find((s) => s.kind === 'base');
  if (!site) return null;
  return { x: ((site.x0 + site.x1 + 1) / 2) * cs, y: ((site.y0 + site.y1 + 1) / 2) * cs, name: site.name };
}
