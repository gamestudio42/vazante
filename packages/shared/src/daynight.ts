import { TICK_HZ } from './balance/world.ts';

/** Day/night cycle (GDD: 20 game minutes per day; vision −50% at night without light). */
export const DAY = {
  /** Real seconds of game time per 24 hours. */
  lengthS: 1200,
  /** Clock at tick 0: late afternoon, so the convoy runs at dusk and the waves come at night. */
  startHour: 16,
  /** Sight range multiplier at full night, away from lit sites. */
  nightVision: 0.5,
  /** Floodlights reach this far around bases and depots. */
  siteLightM: 20,
} as const;

/** Hour of day 0..24 at a tick (fractional). */
export function clockHours(tick: number): number {
  const h = DAY.startHour + (tick / (DAY.lengthS * TICK_HZ)) * 24;
  return h - Math.floor(h / 24) * 24;
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Daylight 0 (night) .. 1 (day). Dawn 5:00–7:00, dusk 17:30–19:30. Pure arithmetic, safe in the simulation. */
export function daylight(hours: number): number {
  return smooth(5, 7, hours) * (1 - smooth(17.5, 19.5, hours));
}
