import type { SquadKind } from './units.ts';

/**
 * Economy of the long modes (survival, the city sandbox). Every site (base and depots) is a
 * strategic point with a control value: it rises by `controlStep` a second while soldiers in its
 * area (a circle `zoneMarginM` beyond the site's longer half-side, see siteZone) outnumber the infected there, and falls while at least
 * `overrunMin` infected outnumber them two to one. Above `heldAbove` the site is secured: every
 * `everyS` it adds `siteMaterials` to its own stock, so depot income waits there until a truck
 * brings it in. A secured supply depot also makes `supplyAmmo`; inside a secured hospital soldiers
 * heal `hospitalHealPerS` and bites are cured; a secured railway station lets the base pay
 * materials for a new squad, which arrives at the station.
 */
export const ECONOMY = {
  everyS: 60,
  zoneMarginM: 40,
  controlStep: 2,
  overrunMin: 6,
  heldAbove: 66,
  siteMaterials: 60,
  supplyAmmo: 300,
  hospitalHealPerS: 5,
  maxSquads: 8,
  /** A secured station also sells trucks, paid from the base materials, up to `maxTrucks` on the road. */
  truckCost: 200,
  maxTrucks: 3,
  recruitCost: { guard: 150, police: 200, slice: 250, engineers: 300, marines: 450 } as Readonly<Record<SquadKind, number>>,
  /** Squads the station offers, in panel order. */
  recruitKinds: ['police', 'slice', 'engineers', 'marines'] as readonly SquadKind[],
  recruitNames: ['Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliett', 'Kilo', 'Lima'] as readonly string[],
} as const;

/** A site's capture area, in metres: a circle round the site's centre reaching `zoneMarginM` past its longer side. */
export function siteZone(b: { x0: number; y0: number; x1: number; y1: number }, cellSize: number): { x: number; y: number; r: number } {
  const w = (b.x1 - b.x0 + 1) * cellSize;
  const h = (b.y1 - b.y0 + 1) * cellSize;
  return { x: b.x0 * cellSize + w / 2, y: b.y0 * cellSize + h / 2, r: Math.max(w, h) / 2 + ECONOMY.zoneMarginM };
}
