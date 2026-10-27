// Turns the CC0 recordings in assets-src/audio-cc0/ into the short mono .ogg files the game loads:
// one shot cut from each take, leading silence trimmed, tail faded, peak-normalised. Needs ffmpeg on
// the PATH. Run with `pnpm audio` after changing the list. Sources and licences: docs/assets.md.
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';

interface Clip {
  out: string;
  src: string;
  /** Cut start and length in seconds; without a start the leading silence is trimmed instead. */
  at?: number;
  dur?: number;
  /** Loops keep their full length and get no fade. */
  loop?: boolean;
  /** Peak level in dBFS after normalising. */
  peak?: number;
}

const SRC = 'assets-src/audio-cc0/files';
const OUT = 'apps/game/public/audio';
const FIRE = `${SRC}/the-free-firearm-sound-library/Prepared SFX Library`;
const KENNEY = `${SRC}/kenney_impact-sounds/Audio`;
const SCIFI = `${SRC}/kenney_sci-fi-sounds/Audio`;

// Cut points come from ffmpeg silencedetect (-35 dB, 0.25 s) on each take.
const CLIPS: Clip[] = [
  { out: 'rifle_1', src: `${FIRE}/AR-15/D_24P.wav`, at: 0.53, dur: 1.2 },
  { out: 'rifle_2', src: `${FIRE}/AR-15/D_24P.wav`, at: 3.89, dur: 1.2 },
  { out: 'rifle_3', src: `${FIRE}/Tikka/W_24P.wav`, at: 0.74, dur: 1.2 },
  { out: 'rifle_4', src: `${FIRE}/Tikka/W_24P.wav`, at: 5.36, dur: 1.2 },
  { out: 'lmg_1', src: `${FIRE}/AK-47/C_31P.wav`, at: 0.32, dur: 1.1 },
  { out: 'lmg_2', src: `${FIRE}/AK-47/C_31P.wav`, at: 4.38, dur: 1.1 },
  { out: 'lmg_3', src: `${FIRE}/AK-47/C_28P.wav`, at: 0.59, dur: 0.5 },
  { out: 'shotgun_1', src: `${FIRE}/Model 12/K_17P.wav`, at: 0.89, dur: 1.4 },
  { out: 'shotgun_2', src: `${FIRE}/Nova/O_17P.wav`, at: 0.67, dur: 1.4 },
  { out: 'shotgun_3', src: `${FIRE}/Nova/O_17P.wav`, at: 3.69, dur: 1.4 },
  { out: 'shotgun_4', src: `${FIRE}/Mossberg/N_30P.wav`, at: 1.68, dur: 0.6 },
  { out: 'reload_1', src: `${SRC}/gun-reload-sounds/assaultriflereload1_0.wav`, peak: -4 },
  { out: 'reload_2', src: `${SRC}/gun-reload-sound-effects/clipload1.wav`, peak: -4 },
  { out: 'reload_3', src: `${SRC}/2-gun-reloads/gun_reload.1.ogg`, peak: -4 },
  { out: 'pump_1', src: `${SRC}/gun-reload-sounds/shotguncock_0.wav`, peak: -4 },
  { out: 'dry_1', src: `${SRC}/gun-reload-lock-or-click-sound/gun_reload_lock_or_click_sound.mp3`, peak: -4 },
  { out: 'splat_1', src: `${SRC}/8-wet-squish-slurp-impacts/impsplat/impactsplat01.mp3.flac`, dur: 0.5 },
  { out: 'splat_2', src: `${SRC}/8-wet-squish-slurp-impacts/impsplat/impactsplat03.mp3.flac`, dur: 0.5 },
  { out: 'splat_3', src: `${SRC}/8-wet-squish-slurp-impacts/impsplat/impactsplat07.mp3.flac`, dur: 0.5 },
  { out: 'splat_4', src: `${SRC}/8-wet-squish-slurp-impacts/impsplat/impactsplat08.mp3.flac`, dur: 0.5 },
  { out: 'break_1', src: `${SRC}/fleshy-bone-breaks/Wet Break 2.wav`, dur: 0.6 },
  { out: 'break_2', src: `${SRC}/fleshy-bone-breaks/Wet Break 9.wav`, dur: 0.5 },
  { out: 'punch_1', src: `${KENNEY}/impactPunch_medium_000.ogg` },
  { out: 'punch_2', src: `${KENNEY}/impactPunch_medium_002.ogg` },
  { out: 'groan_1', src: `${SRC}/16-monster-growls/monster.2.ogg` },
  { out: 'groan_2', src: `${SRC}/16-monster-growls/monster.5.ogg` },
  { out: 'groan_3', src: `${SRC}/16-monster-growls/monster.9.ogg` },
  { out: 'groan_4', src: `${SRC}/16-monster-growls/monster.13.ogg` },
  { out: 'groan_5', src: `${SRC}/undead-moans/undead-1.ogg` },
  { out: 'groan_6', src: `${SRC}/undead-moans/undead-2.ogg` },
  { out: 'groan_7', src: `${SRC}/undead-moans/undead-3.ogg` },
  { out: 'groan_8', src: `${SRC}/undead-moans/undead-4.ogg` },
  { out: 'groan_9', src: `${SRC}/80-cc0-creature-sfx/monster_02.ogg` },
  { out: 'groan_10', src: `${SRC}/80-cc0-creature-sfx/monster_04.ogg` },
  { out: 'roar_1', src: `${SRC}/80-cc0-creature-sfx/roar_01.ogg` },
  { out: 'roar_2', src: `${SRC}/80-cc0-creature-sfx/roar_03.ogg` },
  { out: 'bite_1', src: `${SRC}/crunchy-bite/crunchybite.ogg` },
  { out: 'bite_2', src: `${SRC}/80-cc0-creature-sfx/eat_01.ogg` },
  { out: 'bite_3', src: `${SRC}/80-cc0-creature-sfx/eat_04.ogg` },
  { out: 'scream_1', src: `${SRC}/15-vocal-male-strainhurtpainjump-sounds/slightscream-03.flac` },
  { out: 'scream_2', src: `${SRC}/15-vocal-male-strainhurtpainjump-sounds/slightscream-05.flac` },
  { out: 'scream_3', src: `${SRC}/15-vocal-male-strainhurtpainjump-sounds/slightscream-09.flac` },
  { out: 'scream_4', src: `${SRC}/15-vocal-male-strainhurtpainjump-sounds/slightscream-10.flac` },
  { out: 'scream_5', src: `${SRC}/15-vocal-male-strainhurtpainjump-sounds/slightscream-15.flac` },
  { out: 'explosion_1', src: `${SRC}/chunky-explosion/Chunky Explosion.mp3`, dur: 3 },
  { out: 'explosion_2', src: `${SCIFI}/explosionCrunch_000.ogg` },
  { out: 'explosion_3', src: `${SCIFI}/explosionCrunch_002.ogg` },
  { out: 'metal_1', src: `${KENNEY}/impactMetal_heavy_000.ogg` },
  { out: 'metal_2', src: `${KENNEY}/impactMetal_heavy_002.ogg` },
  { out: 'metal_3', src: `${KENNEY}/impactPlate_heavy_001.ogg` },
  { out: 'debris_1', src: `${KENNEY}/impactMining_001.ogg` },
  { out: 'static_1', src: `${SCIFI}/computerNoise_001.ogg`, at: 0.4, dur: 0.3, peak: -8 },
  { out: 'engine_loop', src: `${SRC}/car-sound-effects-pack/Car_Engine_Loop.ogg`, loop: true, peak: -6 },
];

function ff(args: string[]): string {
  return execFileSync('ffmpeg', ['-hide_banner', '-nostats', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

const TRIM = 'silenceremove=start_periods=1:start_threshold=-45dB';

function probe(src: string, entry: string): string {
  return execFileSync('ffprobe', ['-v', 'error', '-show_entries', entry, '-of', 'csv=p=0', src], { encoding: 'utf8' }).trim();
}

function filters(c: Clip): string[] {
  // Mono sources pass through; stereo takes are folded down.
  const f: string[] = [probe(c.src, 'stream=channels') === '1' ? 'pan=mono|c0=c0' : 'pan=mono|c0=0.5*c0+0.5*c1'];
  if (c.loop) return f;
  // Trim silence at both ends (the tail by reversing), then cap the length.
  if (c.at === undefined) f.push(TRIM, 'areverse', TRIM, 'areverse');
  const d = Math.min(c.dur ?? Infinity, Number(probe(c.src, 'format=duration')));
  if (c.at === undefined && c.dur !== undefined) f.push(`atrim=0:${c.dur}`);
  f.push('afade=t=in:d=0.003', `afade=t=out:st=${(d * 0.7).toFixed(3)}:d=${(d * 0.3).toFixed(3)}`);
  return f;
}

function maxVolume(c: Clip, f: string[]): number {
  const cut = c.at !== undefined ? ['-ss', String(c.at), '-t', String(c.dur)] : [];
  const r = execFileSync('ffmpeg', ['-hide_banner', '-nostats', ...cut, '-i', c.src, '-af', [...f, 'volumedetect'].join(','), '-f', 'null', '-'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return Number(/max_volume: (-?[\d.]+) dB/.exec(r)?.[1] ?? 0);
}

mkdirSync(OUT, { recursive: true });
let total = 0;
for (const c of CLIPS) {
  const f = filters(c);
  const gain = (c.peak ?? -1) - maxVolume(c, f);
  const cut = c.at !== undefined ? ['-ss', String(c.at), '-t', String(c.dur)] : [];
  const out = `${OUT}/${c.out}.ogg`;
  ff(['-y', ...cut, '-i', c.src, '-af', [...f, `volume=${gain.toFixed(2)}dB`].join(','), '-ar', '44100', '-c:a', 'libvorbis', '-q:a', '3', '-map_metadata', '-1', out]);
  total += statSync(out).size;
}
console.log(`${CLIPS.length} clips, ${(total / 1024).toFixed(0)} KiB in ${OUT}`);
