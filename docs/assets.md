# Asset register

Every third-party asset must be listed here with its license before it is committed. Until a final asset exists, use procedural primitives colored by the theme palette.

| Asset | Path | Author / source | License | Notes |
| --- | --- | --- | --- | --- |
| Soldier (Character_Soldier, AK only) | `apps/game/public/models/soldier.glb` | Quaternius, Toon Shooter Game Kit (Dec 2022), quaternius.com | CC0 1.0 | Built by `pnpm models` from `assets-src/toon-shooter/` (not committed); recoloured at load |
| Props: Debris_BrokenCar, SackTrench, Barrier_Large, Container_Long, Tank | `apps/game/public/models/props/*.glb` | Quaternius, Toon Shooter Game Kit (Dec 2022), quaternius.com | CC0 1.0 | Built by `pnpm models` from `assets-src/toon-shooter/env/`; recoloured at load |
| Interface icons | `lucide-react` (npm, bundled) | Lucide contributors, lucide.dev | ISC | HUD and menu icons |
| Fonts: Barlow, Barlow Condensed | `@fontsource/barlow`, `@fontsource/barlow-condensed` (npm, bundled) | Jeremy Tribby, via Fontsource | SIL OFL 1.1 | Self-hosted so the desktop build works offline |
| Infected (Character_Enemy, unarmed) | `apps/game/public/models/infected.glb` | Quaternius, Toon Shooter Game Kit (Dec 2022), quaternius.com | CC0 1.0 | Same; arms posed forward at bake time |

## Effects

Ten flipbook atlases in `apps/game/public/vfx/`, drawn by `FlipbookLayer` (`packages/view3d/src/flipbook.ts`) on top of the procedural particles. They are our own work, made headless in EffectCraft 0.21.1 (storytold/effectcraft) from shape layers with the palette colours; no third-party art is inside them. Without them the game shows the particles alone.

| Atlas | Frames | Plays on |
| --- | --- | --- |
| `vz_explosion_atlas.png` | 16 × 128 px, 24 fps, one horizontal strip | `vehicle_destroyed` |
| `vz_bile_burst_atlas.png` | 12 × 96 px, 24 fps, one horizontal strip | `zombie_burst` (Inchado) |
| `vz_muzzle_atlas.png` | 4 × 64 px, 30 fps, one horizontal strip (the last frame is empty) | `shot`, in direct control only |
| `vz_scream_atlas.png` | 22 × 128 px, 24 fps, one horizontal strip, drawn flat on the ground | `zombie_scream` (Gritador) |
| `vz_dust_atlas.png` | 24 × 128 px, 20 fps, one horizontal strip | `structure_destroyed` |
| `vz_sparks_atlas.png` | 8 × 64 px, 30 fps, one horizontal strip | `vehicle_hit` |
| `vz_blood_atlas.png` | 8 × 64 px, 24 fps, one horizontal strip | `shot` hits, `zombie_killed`, `soldier_hit`, `soldier_bitten` |
| `vz_settle_atlas.png` | 16 × 128 px, 20 fps, one horizontal strip | `structure_built`, `vehicle_repaired` (with three sparks) |
| `vz_heal_atlas.png` | 18 × 96 px, 20 fps, one horizontal strip | `soldier_cured` (the hospital cures a bitten soldier) |
| `vz_wave_pulse_atlas.png` | 16 × 96 px, 20 fps, one horizontal strip, white | HUD: the wave banner (`WaveBanner` in `App.tsx`) uses it as a CSS mask tinted by the alert's tone, three times |

To rebuild: `python3 tools/vfx/recipes.py <dir>`, then for each asset `effectcraft-cli run --commands <dir>/<asset>/build.json` and `effectcraft-cli render --comp <asset> --format png --channels rgba --start 0 --end <frames / fps> --out <dir>/<asset>/frames/<asset>.png <dir>/<asset>/<asset>.ecproj` (the end is exclusive). From `<dir>`, `python3 verify.py <assets…>` writes each alpha profile and `python3 pack.py` packs the atlases and writes `manifest.json`. It fails unless the first frame shows, the last is fully transparent, nothing touches the frame edge and the atlas keeps alpha. Copy an atlas here only after that passes.

## Audio

Recorded clips live in `apps/game/public/audio/` (53 files, about 540 KiB). All are **CC0 1.0**; each source page was opened and showed CC0 as its only licence (details and rejected packs in `assets-src/audio-cc0/MANIFEST.md`). `pnpm audio` (`tools/prepare-audio.ts`, needs ffmpeg) rebuilds them from `assets-src/audio-cc0/files/`: one shot cut per take, mono, silence trimmed, faded, peak-normalised, Ogg Vorbis q3. Anything missing falls back to the procedural recipe in `packages/audio`.

| Clips | Source file(s) | Author / source | License |
| --- | --- | --- | --- |
| `rifle_1..4` | AR-15 `D_24P.wav`, Tikka `W_24P.wav` | Ben Jaszczak et al., The Free Firearm Sound Library, opengameart.org/content/the-free-firearm-sound-library | CC0 1.0 |
| `lmg_1..3` (no CC0 LMG exists; AK-47 singles played 8% lower) | AK-47 `C_31P.wav`, `C_28P.wav` | same | CC0 1.0 |
| `shotgun_1..4` | Model 12 `K_17P.wav`, Nova `O_17P.wav`, Mossberg `N_30P.wav` | same | CC0 1.0 |
| `reload_1`, `pump_1` | `assaultriflereload1_0.wav`, `shotguncock_0.wav` | SpringySpringo, opengameart.org/content/gun-reload-sounds | CC0 1.0 |
| `reload_2` | `clipload1.wav` | BMacZero, opengameart.org/content/gun-reload-sound-effects | CC0 1.0 |
| `reload_3` | `gun_reload.1.ogg` | StarNinjas, opengameart.org/content/2-gun-reloads | CC0 1.0 |
| `dry_1` | `gun_reload_lock_or_click_sound.mp3` | pauliuw, opengameart.org/content/gun-reload-lock-or-click-sound | CC0 1.0 |
| `splat_1..4` | `impactsplat01/03/07/08` | Independent.nu, opengameart.org/content/8-wet-squish-slurp-impacts | CC0 1.0 |
| `break_1..2` | `Wet Break 2.wav`, `Wet Break 9.wav` | Zane Little Music, opengameart.org/content/fleshy-bone-breaksnap-sfx | CC0 1.0 |
| `punch_1..2`, `metal_1..3`, `debris_1` | `impactPunch_medium_*`, `impactMetal_heavy_*`, `impactPlate_heavy_001`, `impactMining_001` | Kenney, kenney.nl/assets/impact-sounds | CC0 1.0 |
| `explosion_2..3`, `static_1` | `explosionCrunch_000/002`, `computerNoise_001` | Kenney, kenney.nl/assets/sci-fi-sounds | CC0 1.0 |
| `explosion_1` | `Chunky Explosion.mp3` | Joth, opengameart.org/content/chunky-explosion | CC0 1.0 |
| `groan_1..4` | `monster.2/5/9/13.ogg` | StarNinjas, opengameart.org/content/16-monster-growls | CC0 1.0 |
| `groan_5..8` | `undead-1..4.ogg` | AntumDeluge, opengameart.org/content/undead-moans | CC0 1.0 |
| `groan_9..10`, `roar_1..2`, `bite_2..3` | `monster_02/04`, `roar_01/03`, `eat_01/04` | rubberduck, opengameart.org/content/80-cc0-creature-sfx | CC0 1.0 |
| `bite_1` | `crunchybite.ogg` | fvcalderan, opengameart.org/content/crunchy-bite | CC0 1.0 |
| `scream_1..5` | `slightscream-03/05/09/10/15.flac` | qubodup, opengameart.org/content/15-vocal-male-strainhurtpainjump-sounds | CC0 1.0 |
| `engine_loop` | `Car_Engine_Loop.ogg` | GGBotNet, opengameart.org/content/car-sound-effects-pack-low-quality | CC0 1.0 |

The music, ambience (wind, horde murmur, drone), siren, gate clank and UI sounds stay procedural.

Everything else (city, vehicles, structures, effects) is procedural: `packages/view3d`.

To rebuild the models, unpack the kit's `Characters/glTF/*.gltf` into `assets-src/toon-shooter/` and run `pnpm models`.
