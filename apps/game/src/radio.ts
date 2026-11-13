import { TICK_HZ, type SimEvent } from '@vazante/shared';

/**
 * Radio chatter: short lines from the squads and from command, made from simulation events. It
 * gives the squads a voice and says which squad and which soldier something happened to, where
 * a plain alert only says that it happened. Text only: the squelch is played by the audio director.
 *
 * Which variant is said depends on the tick and the source, never on Math.random, so a replay or
 * a test hears the same lines. Pure apart from its own cooldown state.
 */

export type RadioTone = 'info' | 'good' | 'warn' | 'bad';

export type RadioTopic =
  | 'contact'
  | 'arrived'
  | 'reload'
  | 'dry'
  | 'bitten'
  | 'died'
  | 'panic'
  | 'scream'
  | 'wave'
  | 'ammoLow'
  | 'objective'
  | 'built'
  | 'cured'
  | 'dawn';

/** How many wordings each topic has: `radio.<topic>.<i>`. */
export const RADIO_VARIANTS: Readonly<Record<RadioTopic, number>> = {
  contact: 4,
  arrived: 3,
  reload: 3,
  dry: 2,
  bitten: 3,
  died: 3,
  panic: 3,
  scream: 2,
  wave: 2,
  ammoLow: 1,
  objective: 2,
  built: 2,
  cured: 1,
  dawn: 1,
};

export interface RadioLine {
  id: number;
  tick: number;
  /** Squad id speaking, or null for command. */
  squad: number | null;
  /** Soldier speaking or spoken about, when the line is about one. */
  soldier: number | null;
  topic: RadioTopic;
  variant: number;
  tone: RadioTone;
  x?: number;
  y?: number;
}

/** What the radio needs to know about the game to attribute a line. */
export interface RadioContext {
  /** Squad of a soldier id. */
  squadOf(soldier: number): number | undefined;
  /** Nearest squad to a point within `maxM`, for things no squad caused (a scream, a structure). */
  nearestSquad(x: number, y: number, maxM: number): number | undefined;
}

/** Seconds before the same topic is heard again from the same speaker. */
const COOLDOWN_S: Partial<Record<RadioTopic, number>> = {
  contact: 20,
  arrived: 5,
  reload: 12,
  dry: 8,
  panic: 8,
  scream: 10,
  built: 6,
  ammoLow: 30,
};

/** Chatter (info and good lines) keeps this gap; warnings and losses always get through. */
const CHATTER_GAP_S = 1.5;
/** Lines kept on screen. */
export const RADIO_LINES = 4;

function variantOf(topic: RadioTopic, tick: number, source: number): number {
  let h = (tick * 73856093) ^ (source * 19349663);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) % RADIO_VARIANTS[topic];
}

export class Radio {
  lines: RadioLine[] = [];
  private seq = 0;
  private cool = new Map<string, number>();
  private lastChatter = -Infinity;

  /** Turn a frame's events into lines; returns the new ones (newest last). */
  hear(events: readonly SimEvent[], ctx: RadioContext): RadioLine[] {
    const heard: RadioLine[] = [];
    for (const e of events) {
      const line = this.lineFor(e, ctx);
      if (!line) continue;
      const chatter = line.tone === 'info' || line.tone === 'good';
      if (chatter && e.tick - this.lastChatter < CHATTER_GAP_S * TICK_HZ) continue;
      const key = `${line.topic}:${line.squad ?? 'cmd'}`;
      const cd = COOLDOWN_S[line.topic];
      if (cd !== undefined) {
        const until = this.cool.get(key);
        if (until !== undefined && e.tick < until) continue;
        this.cool.set(key, e.tick + cd * TICK_HZ);
      }
      if (chatter) this.lastChatter = e.tick;
      heard.push(line);
    }
    if (heard.length > 0) this.lines = [...this.lines, ...heard].slice(-RADIO_LINES);
    return heard;
  }

  private lineFor(e: SimEvent, ctx: RadioContext): RadioLine | null {
    const make = (topic: RadioTopic, tone: RadioTone, squad: number | null | undefined, soldier: number | null = null): RadioLine => ({
      id: ++this.seq,
      tick: e.tick,
      squad: squad ?? null,
      soldier,
      topic,
      variant: variantOf(topic, e.tick, e.source ?? e.target ?? 0),
      tone,
      x: e.x,
      y: e.y,
    });
    const near = (m: number) => (e.x !== undefined && e.y !== undefined ? ctx.nearestSquad(e.x, e.y, m) : undefined);
    switch (e.type) {
      case 'squad_contact':
        return make('contact', 'info', e.source);
      case 'squad_arrived':
        return make('arrived', 'good', e.source);
      case 'reloading':
        return e.source === undefined ? null : make('reload', 'info', ctx.squadOf(e.source), e.source);
      case 'out_of_ammo':
        return e.source === undefined ? null : make('dry', 'warn', ctx.squadOf(e.source), e.source);
      case 'soldier_bitten':
        return e.target === undefined ? null : make('bitten', 'bad', ctx.squadOf(e.target), e.target);
      case 'soldier_died':
        return e.source === undefined ? null : make('died', 'bad', ctx.squadOf(e.source), e.source);
      case 'soldier_panicked':
        return e.source === undefined ? null : make('panic', 'warn', ctx.squadOf(e.source), e.source);
      case 'soldier_cured':
        return e.source === undefined ? null : make('cured', 'good', ctx.squadOf(e.source), e.source);
      case 'zombie_scream': {
        // Only a squad close enough to hear it calls it out.
        const q = near(60);
        return q === undefined ? null : make('scream', 'warn', q);
      }
      case 'structure_built':
        return make('built', 'good', near(40));
      case 'wave_warning':
        return e.value ? make('wave', 'warn', null) : null;
      case 'ammo_low':
        return make('ammoLow', 'warn', null);
      case 'objective_done':
        return make('objective', 'good', null);
      case 'night_survived':
        return make('dawn', 'good', null);
      default:
        return null;
    }
  }
}
