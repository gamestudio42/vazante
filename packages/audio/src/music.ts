/**
 * Adaptive score, synthesized like everything else. One 8-bar loop in D minor whose layers fade in
 * with intensity: a pad and a sparse arpeggio while the city is quiet, a pulsing bass and a
 * heartbeat once a wave is coming, full drums and stabs while the horde is on the walls.
 * Notes are scheduled slightly ahead of time on the audio clock, so frame hitches never make
 * the music stumble.
 */

import type { Frame } from '@vazante/shared';
import { clockHours, daylight } from '@vazante/shared';

const BPM = 84;
const STEP = 60 / BPM / 4; // a sixteenth
const STEPS_PER_CHORD = 32; // two bars
const LOOKAHEAD = 0.25;

/** Dm, Bb, Gm, A: root and triad as MIDI notes. */
const CHORDS: { root: number; triad: [number, number, number] }[] = [
  { root: 38, triad: [62, 65, 69] },
  { root: 34, triad: [58, 62, 65] },
  { root: 31, triad: [55, 58, 62] },
  { root: 33, triad: [57, 61, 64] },
];

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

type Layer = 'pad' | 'arp' | 'bass' | 'pulse' | 'drums' | 'stab';

export class MusicDirector {
  readonly out: GainNode;
  private readonly layers: Record<Layer, GainNode>;
  private nextTime = 0;
  private step = 0;
  /** Smoothed 0..1; what the layers follow. */
  intensity = 0;
  /** Where intensity is heading, set from the game state each frame. */
  target = 0.1;
  private ended = false;

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
    private readonly noise: AudioBuffer,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0.55;
    this.out.connect(destination);
    const mk = (): GainNode => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.out);
      return g;
    };
    this.layers = { pad: mk(), arp: mk(), bass: mk(), pulse: mk(), drums: mk(), stab: mk() };
  }

  /**
   * How tense the moment is: the wave director sets the floor, then nearby attackers and the
   * rate of fire push it up; night adds a little dread.
   */
  static targetFor(f: Frame, threat: number, recentShots: number): number {
    const m = f.mission;
    let i = 0.08;
    if (m?.waveState === 'warning') i = 0.45;
    else if (m?.waveState === 'active') i = 0.68;
    i += Math.min(0.35, threat / 60) + Math.min(0.2, recentShots / 150);
    i += 0.08 * (1 - daylight(clockHours(f.tick)));
    if (m && (m.phase === 'won' || m.phase === 'lost')) i = 0;
    return Math.min(1, i);
  }

  setVolume(v: number): void {
    this.out.gain.setTargetAtTime(Math.max(0, Math.min(1, v)) * 0.7, this.ctx.currentTime, 0.1);
  }

  /** The mission is over: let the loop fade out under the stinger. */
  end(): void {
    this.ended = true;
  }

  restart(): void {
    this.ended = false;
  }

  /** Level of each layer for an intensity. */
  static mix(i: number): Record<Layer, number> {
    return {
      pad: 0.09 + 0.04 * i,
      arp: 0.05 * (1 - smooth(0.7, 0.95, i)),
      bass: 0.16 * smooth(0.25, 0.45, i),
      pulse: 0.22 * smooth(0.25, 0.45, i) * (1 - smooth(0.6, 0.75, i)),
      drums: 0.2 * smooth(0.55, 0.75, i),
      stab: 0.07 * smooth(0.72, 0.9, i),
    };
  }

  update(dt: number): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const goal = this.ended ? 0 : this.target;
    // Rise in a couple of seconds, settle slowly after the fight.
    const tau = goal > this.intensity ? 2 : 10;
    this.intensity += (goal - this.intensity) * Math.min(1, dt / tau);
    const mix = MusicDirector.mix(this.intensity);
    const fade = this.ended ? 0 : 1;
    for (const k of Object.keys(mix) as Layer[]) this.layers[k].gain.setTargetAtTime(mix[k] * fade, now, this.ended ? 1.5 : 0.6);

    // A long stall (hidden tab) would otherwise schedule a burst of stale notes.
    if (this.nextTime < now - 0.1) this.nextTime = now + 0.05;
    while (this.nextTime < now + LOOKAHEAD) {
      this.schedule(this.step, this.nextTime, mix);
      this.nextTime += STEP;
      this.step = (this.step + 1) % (STEPS_PER_CHORD * CHORDS.length);
    }
  }

  private schedule(step: number, t: number, mix: Record<Layer, number>): void {
    const chord = CHORDS[Math.floor(step / STEPS_PER_CHORD)];
    const s = step % STEPS_PER_CHORD;
    const inBar = s % 16;
    const on = (l: Layer) => mix[l] > 0.002;

    if (s === 0 && on('pad')) for (const n of chord.triad) this.pad(hz(n - 12), t, STEPS_PER_CHORD * STEP);
    if (on('arp') && inBar % 4 === 0 && (inBar !== 12 || s < 16)) {
      const n = chord.triad[(s / 4) % 3] + (s >= 16 ? 12 : 0);
      this.pluck(hz(n), t);
    }
    if (on('bass') && inBar % 2 === 0) this.bass(hz(chord.root + (inBar === 14 ? 7 : 0)), t, inBar % 8 === 0 ? 1 : 0.6);
    if (on('pulse') && (inBar === 0 || inBar === 3)) this.kick(t, this.layers.pulse, inBar === 0 ? 1 : 0.6);
    if (on('drums')) {
      if (inBar === 0 || inBar === 8 || inBar === 10) this.kick(t, this.layers.drums, 1);
      if (inBar === 4 || inBar === 12) this.snare(t);
      this.hat(t, inBar % 4 === 2 ? 1 : 0.45);
      if (s === STEPS_PER_CHORD - 2 || s === STEPS_PER_CHORD - 1) this.tom(t, s === STEPS_PER_CHORD - 2 ? 110 : 82);
    }
    if (on('stab') && (s === 0 || s === 6 || s === 16 || s === 22)) for (const n of chord.triad) this.stab(hz(n - 12), t);
  }

  // ----- Instruments -----

  private pad(f: number, t: number, len: number): void {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.35, t + 1.2);
    g.gain.setValueAtTime(0.35, t + len - 0.6);
    g.gain.linearRampToValueAtTime(0, t + len + 0.4);
    lp.connect(g).connect(this.layers.pad);
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(t + len + 0.5);
    }
  }

  private pluck(f: number, t: number): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g).connect(this.layers.arp);
    o.start(t);
    o.stop(t + 1);
  }

  private bass(f: number, t: number, accent: number): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 6;
    lp.frequency.setValueAtTime(180 + 500 * accent, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + STEP * 1.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.6 * accent + 0.2, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + STEP * 1.9);
    o.connect(lp).connect(g).connect(this.layers.bass);
    o.start(t);
    o.stop(t + STEP * 2);
  }

  private kick(t: number, out: AudioNode, level: number): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.4);
  }

  private noiseHit(t: number, type: BiquadFilterType, freq: number, len: number, level: number, out: AudioNode): void {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f).connect(g).connect(out);
    s.start(t, Math.random());
    s.stop(t + len + 0.02);
  }

  private snare(t: number): void {
    this.noiseHit(t, 'bandpass', 1800, 0.18, 0.7, this.layers.drums);
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g).connect(this.layers.drums);
    o.start(t);
    o.stop(t + 0.12);
  }

  private hat(t: number, level: number): void {
    this.noiseHit(t, 'highpass', 7000, 0.04, 0.25 * level, this.layers.drums);
  }

  private tom(t: number, f: number): void {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.2);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(this.layers.drums);
    o.start(t);
    o.stop(t + 0.3);
  }

  private stab(f: number, t: number): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2400, t);
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(lp).connect(g).connect(this.layers.stab);
    o.start(t);
    o.stop(t + 0.4);
  }
}
