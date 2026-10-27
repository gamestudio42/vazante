import type { Frame, SimEvent } from '@vazante/shared';
import { ZOMBIE_STRIDE, ZombieField } from '@vazante/shared';
import { MusicDirector } from './music.ts';

/** Where the player is listening from: the camera focus (map views) or the controlled soldier. */
export interface Listener {
  x: number;
  y: number;
  /** Camera yaw (radians); screen right is (cos yaw, -sin yaw) on the simulation plane. */
  yaw: number;
  /** Visible vertical span of the map view in metres; drives distance falloff. */
  span: number;
  direct: boolean;
}

export type UiSound = 'select' | 'order' | 'stance' | 'deny' | 'toggle';

/** Priorities: higher wins when the voice cap is reached. */
const enum Pri {
  Ambient = 1,
  Groan = 2,
  Shot = 4,
  Impact = 3,
  Unit = 6,
  Alert = 8,
  Ui = 9,
}

interface Voice {
  priority: number;
  end: number;
  out: GainNode;
}

const VOICE_CAP = 24;

/**
 * Procedural sound for Vazante: every effect is synthesized with Web Audio, so there are no
 * asset licences to track. Owns the mix (master limiter, buses, voice cap with priorities)
 * and turns simulation events into positioned one-shots. Purely presentational.
 */
export class AudioDirector {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private ui!: GainNode;
  private amb!: GainNode;
  private noise!: AudioBuffer;
  private hordeGain!: GainNode;
  private hordeFilter!: BiquadFilterNode;
  private droneGain!: GainNode;
  private readonly voices: Voice[] = [];
  private readonly lastPlayed = new Map<string, number>();
  private listener: Listener = { x: 0, y: 0, yaw: 0, span: 160, direct: false };
  private nearZombies = 0;
  private threat = 0;
  private groanTimer = 0;
  private nearest: [number, number][] = [];
  private music: MusicDirector | null = null;
  private recentShots = 0;
  volume = 0.8;
  musicVolume = 0.7;
  muted = false;

  /** Current music intensity 0..1 (for the debug overlay and tests). */
  get musicIntensity(): number {
    return this.music?.intensity ?? 0;
  }

  setMusicVolume(v: number): void {
    this.musicVolume = Math.max(0, Math.min(1, v));
    this.music?.setVolume(this.musicVolume);
  }

  /** Browsers only start audio after a user gesture; call from the first pointer or key event. */
  unlock(): void {
    if (!this.ctx) this.init();
    if (this.ctx!.state === 'suspended') void this.ctx!.resume();
  }

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyVolume();
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyVolume();
  }

  private applyVolume(): void {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
  }

  private init(): void {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    limiter.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(limiter);
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.sfx = this.bus(0.9);
    this.ui = this.bus(0.6);
    this.amb = this.bus(0.7);
    this.applyVolume();

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.startAmbience();
    this.music = new MusicDirector(ctx, this.master, this.noise);
    this.music.setVolume(this.musicVolume);
  }

  private bus(gain: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.value = gain;
    g.connect(this.master);
    return g;
  }

  /** Wind bed, horde murmur (scales with nearby zombies) and a low tension drone (scales with threat). */
  private startAmbience(): void {
    const ctx = this.ctx!;
    const wind = this.noiseSource(true);
    const wf = ctx.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 420;
    const wg = ctx.createGain();
    wg.gain.value = 0.05;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.025;
    lfo.connect(lfoGain).connect(wg.gain);
    wind.connect(wf).connect(wg).connect(this.amb);
    wind.start();
    lfo.start();

    const horde = this.noiseSource(true);
    this.hordeFilter = ctx.createBiquadFilter();
    this.hordeFilter.type = 'bandpass';
    this.hordeFilter.frequency.value = 220;
    this.hordeFilter.Q.value = 0.9;
    this.hordeGain = ctx.createGain();
    this.hordeGain.gain.value = 0;
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 0.6;
    const wobbleGain = ctx.createGain();
    wobbleGain.gain.value = 60;
    wobble.connect(wobbleGain).connect(this.hordeFilter.frequency);
    horde.connect(this.hordeFilter).connect(this.hordeGain).connect(this.amb);
    horde.start();
    wobble.start();

    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    const df = ctx.createBiquadFilter();
    df.type = 'lowpass';
    df.frequency.value = 160;
    df.connect(this.droneGain).connect(this.amb);
    for (const f of [55, 55.4, 82.4]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(df);
      o.start();
    }
  }

  private noiseSource(loop: boolean): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = loop;
    if (loop) s.loopStart = Math.random();
    return s;
  }

  // ----- Per-frame -----

  setListener(l: Listener): void {
    this.listener = l;
  }

  /** Called for every simulation frame: plays its events and samples the horde around the listener. */
  onFrame(f: Frame): void {
    if (!this.running) return;
    for (const e of f.events) this.onEvent(e);
    const r = this.hearingRadius();
    const z = f.zombies;
    let near = 0;
    let threat = 0;
    this.nearest.length = 0;
    for (let i = 0; i < z.length; i += ZOMBIE_STRIDE) {
      const dx = z[i + ZombieField.X] - this.listener.x;
      const dy = z[i + ZombieField.Y] - this.listener.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r) {
        near++;
        if (this.nearest.length < 32) this.nearest.push([z[i + ZombieField.X], z[i + ZombieField.Y]]);
        const state = z[i + ZombieField.KindState] % 16;
        if (state >= 2) threat++; // chasing, attacking, stacked, clinging
      }
    }
    this.nearZombies = near;
    this.threat = threat;
    if (this.music) this.music.target = MusicDirector.targetFor(f, threat, this.recentShots);
  }

  /** Called every render frame. */
  update(dt: number): void {
    if (!this.running) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const near = this.nearZombies;
    this.hordeGain.gain.setTargetAtTime(Math.min(0.35, Math.sqrt(near) * 0.03), t, 0.4);
    this.hordeFilter.Q.value = 0.9 + Math.min(2, near / 60);
    this.droneGain.gain.setTargetAtTime(Math.min(0.18, this.threat * 0.006), t, 1.2);
    // Individual groans from nearby zombies, more often when more are around.
    this.groanTimer -= dt;
    if (this.groanTimer <= 0 && this.nearest.length > 0) {
      const p = this.nearest[(Math.random() * this.nearest.length) | 0];
      this.groan(p[0], p[1]);
      this.groanTimer = 0.25 + Math.random() * (3 / Math.sqrt(near + 1));
    }
    for (let i = this.voices.length - 1; i >= 0; i--) if (this.voices[i].end < t) this.voices.splice(i, 1);
    this.recentShots *= Math.exp(-dt / 3);
    this.music?.update(dt);
  }

  private hearingRadius(): number {
    return this.listener.direct ? 45 : Math.max(40, this.listener.span * 0.6);
  }

  private onEvent(e: SimEvent): void {
    switch (e.type) {
      case 'shot':
        this.recentShots++;
        if (this.throttle('shot', 0.03)) this.gunshot(e.x!, e.y!, (e.value ?? 0) > 0);
        return;
      case 'zombie_killed':
        if (this.throttle('kill', 0.05)) this.splat(e.x!, e.y!, true);
        return;
      case 'soldier_hit':
        if (this.throttle('hit', 0.08)) this.splat(e.x!, e.y!, false);
        return;
      case 'soldier_bitten':
        this.scream(e.x!, e.y!, 0);
        this.radio(false);
        return;
      case 'soldier_died':
        this.scream(e.x!, e.y!, 1);
        return;
      case 'soldier_turned':
      case 'zombie_risen':
        this.groan(e.x!, e.y!, true);
        return;
      case 'reloading':
        if (this.throttle('reload', 0.1)) this.reload(e.x!, e.y!);
        return;
      case 'out_of_ammo':
        this.dryClick(e.x!, e.y!);
        this.radio(false);
        return;
      case 'squad_contact':
        if (this.throttle('contact', 1.5)) this.radio(false);
        return;
      case 'soldier_panicked':
        this.scream(e.x!, e.y!, 0);
        return;
      case 'squad_arrived':
        if (this.throttle('arrive', 0.3)) this.radio(true);
        return;
      case 'command_rejected':
        this.playUi('deny');
        return;
      case 'structure_built':
        if (this.throttle('built', 0.4)) this.radio(true);
        return;
      case 'structure_destroyed':
        this.crash(e.x!, e.y!);
        this.radio(false);
        return;
      case 'wave_warning':
        this.siren();
        return;
      case 'wave_started':
        this.roar(e.x, e.y);
        return;
      case 'convoy_blocked':
      case 'vehicle_destroyed':
      case 'district_lost':
        this.radio(false);
        if (e.type === 'vehicle_destroyed') this.crash(e.x!, e.y!);
        return;
      case 'cargo_delivered':
      case 'district_held':
        this.radio(true);
        return;
      case 'vehicle_hit':
        if (this.throttle('vhit', 0.12)) this.thud(e.x!, e.y!);
        return;
      case 'mission_won':
      case 'mission_lost':
        this.music?.end();
        this.stinger(e.type === 'mission_won');
        return;
      case 'gate_toggled':
        this.clank(e.x!, e.y!);
        return;
      default:
    }
  }

  private throttle(key: string, minGap: number): boolean {
    const t = this.ctx!.currentTime;
    const last = this.lastPlayed.get(key) ?? -1;
    if (t - last < minGap) return false;
    this.lastPlayed.set(key, t);
    return true;
  }

  // ----- Voice management and spatialisation -----

  /**
   * Allocate a voice: returns the node to connect sources to, or null when the cap is full of
   * higher-priority sounds or the source is inaudible.
   */
  private voice(priority: number, duration: number, x?: number, y?: number, gain = 1): AudioNode | null {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    let g = gain;
    let pan = 0;
    let cutoff = 20000;
    if (x !== undefined && y !== undefined) {
      const l = this.listener;
      const dx = x - l.x;
      const dy = y - l.y;
      const d = Math.hypot(dx, dy);
      const ref = l.direct ? 12 : Math.max(18, l.span * 0.3);
      if (d > ref * 5 && priority < Pri.Alert) return null;
      g *= 1 / (1 + (d / ref) * (d / ref));
      if (priority >= Pri.Alert) g = Math.max(g, gain * 0.25);
      // Screen-space pan: project onto the camera's right vector.
      const c = Math.cos(l.yaw);
      const s = Math.sin(l.yaw);
      const sx = l.direct ? -dx * s + dy * c : dx * c - dy * s;
      pan = Math.max(-1, Math.min(1, sx / (ref * 2)));
      cutoff = 18000 / (1 + (d / ref) * 2);
    }
    if (g < 0.01) return null;
    for (let i = this.voices.length - 1; i >= 0; i--) if (this.voices[i].end < t) this.voices.splice(i, 1);
    if (this.voices.length >= VOICE_CAP) {
      let lo = 0;
      for (let i = 1; i < this.voices.length; i++) if (this.voices[i].priority < this.voices[lo].priority) lo = i;
      if (this.voices[lo].priority >= priority) return null;
      const v = this.voices[lo];
      v.out.gain.setTargetAtTime(0, t, 0.01);
      this.voices.splice(lo, 1);
    }
    const out = ctx.createGain();
    out.gain.value = g;
    let node: AudioNode = out;
    if (pan !== 0) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      out.connect(p);
      node = p;
    }
    if (cutoff < 15000) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      node.connect(f);
      node = f;
    }
    node.connect(priority === Pri.Ui ? this.ui : this.sfx);
    this.voices.push({ priority, end: t + duration, out });
    return out;
  }

  private env(target: AudioParam, t: number, peak: number, attack: number, decay: number): void {
    target.setValueAtTime(0.0001, t);
    target.exponentialRampToValueAtTime(peak, t + attack);
    target.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private noiseBurst(out: AudioNode, t: number, type: BiquadFilterType, freq: number, q: number, peak: number, attack: number, decay: number): void {
    const ctx = this.ctx!;
    const src = this.noiseSource(false);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g.gain, t, peak, attack, decay);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 1.5, attack + decay + 0.05);
  }

  private tone(out: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, peak: number, attack: number, decay: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + attack + decay);
    const g = ctx.createGain();
    this.env(g.gain, t, peak, attack, decay);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  // ----- Sound recipes -----

  private gunshot(x: number, y: number, hit: boolean): void {
    const out = this.voice(Pri.Shot, 0.5, x, y, 0.9);
    if (!out) return;
    const t = this.ctx!.currentTime;
    const p = 0.92 + Math.random() * 0.16;
    this.noiseBurst(out, t, 'bandpass', 1700 * p, 0.8, 0.9, 0.001, 0.09);
    this.tone(out, t, 'sine', 150 * p, 45, 0.8, 0.002, 0.12);
    this.noiseBurst(out, t + 0.01, 'lowpass', 700, 0.5, 0.25, 0.01, 0.4); // urban slap-back tail
    if (hit) this.noiseBurst(out, t + 0.03, 'lowpass', 900, 1, 0.25, 0.002, 0.05);
  }

  private splat(x: number, y: number, kill: boolean): void {
    const out = this.voice(Pri.Impact, 0.6, x, y, 0.7);
    if (!out) return;
    const t = this.ctx!.currentTime;
    this.noiseBurst(out, t, 'lowpass', 1100, 2, 0.5, 0.003, 0.08);
    this.tone(out, t, 'sine', 220, 70, 0.4, 0.003, 0.12);
    if (kill) this.tone(out, t + 0.12, 'sine', 90, 40, 0.35, 0.005, 0.2); // body hits the ground
  }

  private groan(x: number, y: number, loud = false): void {
    const out = this.voice(loud ? Pri.Alert : Pri.Groan, 1.8, x, y, loud ? 0.8 : 0.35);
    if (!out) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const dur = 0.7 + Math.random() * 0.9;
    const base = 70 + Math.random() * 60;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(base * 1.15, t);
    o.frequency.linearRampToValueAtTime(base * 0.8, t + dur);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5 + Math.random() * 4;
    const vibG = ctx.createGain();
    vibG.gain.value = base * 0.05;
    vib.connect(vibG).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.15);
    g.gain.setValueAtTime(0.5, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    // Two vowel formants ("uhh"/"aah").
    for (const [f, q] of [
      [450 + Math.random() * 250, 6],
      [1000 + Math.random() * 300, 8],
    ]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      o.connect(bp).connect(g);
    }
    g.connect(out);
    o.start(t);
    vib.start(t);
    o.stop(t + dur + 0.05);
    vib.stop(t + dur + 0.05);
  }

  private scream(x: number, y: number, severity: number): void {
    const out = this.voice(Pri.Alert, 1, x, y, 0.8);
    if (!out) return;
    const t = this.ctx!.currentTime;
    this.tone(out, t, 'sawtooth', 520, severity ? 180 : 300, 0.25, 0.02, severity ? 0.7 : 0.35);
    this.noiseBurst(out, t, 'bandpass', 1400, 2, 0.2, 0.01, 0.3);
  }

  private reload(x: number, y: number): void {
    const out = this.voice(Pri.Unit, 0.8, x, y, 0.6);
    if (!out) return;
    const t = this.ctx!.currentTime;
    this.noiseBurst(out, t, 'highpass', 3000, 1, 0.4, 0.001, 0.03); // mag out
    this.noiseBurst(out, t + 0.35, 'highpass', 2500, 1, 0.5, 0.001, 0.04); // mag in
    this.noiseBurst(out, t + 0.55, 'bandpass', 1800, 3, 0.5, 0.001, 0.05); // bolt
  }

  private dryClick(x: number, y: number): void {
    const out = this.voice(Pri.Alert, 0.4, x, y, 0.7);
    if (!out) return;
    const t = this.ctx!.currentTime;
    this.noiseBurst(out, t, 'highpass', 4000, 1, 0.5, 0.001, 0.02);
    this.noiseBurst(out, t + 0.18, 'highpass', 4000, 1, 0.5, 0.001, 0.02);
  }

  private crash(x: number, y: number): void {
    const out = this.voice(Pri.Alert, 1.4, x, y, 1);
    if (!out) return;
    const t = this.ctx!.currentTime;
    this.noiseBurst(out, t, 'lowpass', 500, 0.7, 0.9, 0.005, 0.9);
    this.tone(out, t, 'sine', 70, 30, 0.8, 0.005, 0.6);
    for (let i = 0; i < 4; i++) this.noiseBurst(out, t + 0.15 + i * 0.12 + Math.random() * 0.05, 'bandpass', 1500 + Math.random() * 1500, 2, 0.2, 0.002, 0.08);
  }

  private clank(x: number, y: number): void {
    const out = this.voice(Pri.Unit, 1.2, x, y, 0.7);
    if (!out) return;
    const t = this.ctx!.currentTime;
    this.tone(out, t, 'square', 220, 210, 0.15, 0.003, 0.5);
    this.tone(out, t, 'sine', 587, 580, 0.12, 0.003, 0.7);
    this.noiseBurst(out, t + 0.05, 'bandpass', 900, 1, 0.3, 0.05, 0.6); // sliding leaf
  }

  /** Air-raid style siren: a slow rising and falling tone, not positioned. */
  private siren(): void {
    const out = this.voice(Pri.Alert, 4.2, undefined, undefined, 0.3);
    if (!out) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(300, t);
    o.frequency.linearRampToValueAtTime(700, t + 1.5);
    o.frequency.linearRampToValueAtTime(420, t + 2.4);
    o.frequency.linearRampToValueAtTime(700, t + 3.2);
    o.frequency.linearRampToValueAtTime(250, t + 4);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.4);
    g.gain.setValueAtTime(0.4, t + 3.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4);
    o.connect(f).connect(g).connect(out);
    o.start(t);
    o.stop(t + 4.1);
  }

  /** Distant mass of voices for a wave arriving. */
  private roar(x?: number, y?: number): void {
    const out = this.voice(Pri.Alert, 3, undefined, undefined, 0.5);
    if (!out) return;
    const t = this.ctx!.currentTime;
    this.noiseBurst(out, t, 'bandpass', 260, 1.2, 0.6, 0.6, 2.2);
    for (let i = 0; i < 5; i++) this.tone(out, t + i * 0.15, 'sawtooth', 70 + i * 13, 55 + i * 9, 0.08, 0.5, 1.8);
    if (x !== undefined && y !== undefined) for (let i = 0; i < 3; i++) this.groan(x + i, y, true);
  }

  private thud(x: number, y: number): void {
    const out = this.voice(Pri.Impact, 0.3, x, y, 0.6);
    if (!out) return;
    const t = this.ctx!.currentTime;
    this.tone(out, t, 'sine', 120, 60, 0.6, 0.002, 0.12);
    this.noiseBurst(out, t, 'bandpass', 600, 2, 0.3, 0.002, 0.08);
  }

  /** End-of-mission chord: major for victory, minor for defeat. */
  private stinger(won: boolean): void {
    const out = this.voice(Pri.Ui, 3, undefined, undefined, 0.5);
    if (!out) return;
    const t = this.ctx!.currentTime;
    const notes = won ? [261.6, 329.6, 392, 523.3] : [220, 261.6, 311.1, 207.7];
    notes.forEach((f, i) => this.tone(out, t + i * 0.18, 'triangle', f, f, 0.18, 0.02, 2.2 - i * 0.2));
  }

  /** Radio squelch and beeps: good news rises, bad news falls. */
  private radio(good: boolean): void {
    const out = this.voice(Pri.Alert, 0.5, undefined, undefined, 0.35);
    if (!out) return;
    const t = this.ctx!.currentTime;
    this.noiseBurst(out, t, 'bandpass', 2200, 1.5, 0.3, 0.002, 0.06);
    const [a, b] = good ? [1100, 1480] : [880, 620];
    this.tone(out, t + 0.07, 'square', a, a, 0.12, 0.003, 0.06);
    this.tone(out, t + 0.15, 'square', b, b, 0.12, 0.003, 0.08);
  }

  /** Immediate UI feedback for player actions. */
  playUi(kind: UiSound): void {
    if (!this.running) return;
    const out = this.voice(Pri.Ui, 0.3, undefined, undefined, 0.5);
    if (!out) return;
    const t = this.ctx!.currentTime;
    switch (kind) {
      case 'select':
        this.tone(out, t, 'triangle', 1200, 1500, 0.25, 0.002, 0.05);
        break;
      case 'order':
        this.noiseBurst(out, t, 'bandpass', 2500, 2, 0.15, 0.002, 0.04);
        this.tone(out, t + 0.03, 'square', 1320, 1320, 0.1, 0.002, 0.05);
        this.tone(out, t + 0.09, 'square', 1760, 1760, 0.1, 0.002, 0.06);
        break;
      case 'stance':
        this.tone(out, t, 'triangle', 900, 900, 0.22, 0.002, 0.06);
        this.tone(out, t + 0.06, 'triangle', 1200, 1200, 0.18, 0.002, 0.06);
        break;
      case 'toggle':
        this.tone(out, t, 'triangle', 700, 1000, 0.2, 0.002, 0.08);
        break;
      case 'deny':
        this.tone(out, t, 'square', 180, 160, 0.18, 0.005, 0.18);
        break;
    }
  }
}
