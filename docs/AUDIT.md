# Quality audit against an AAA bar

2026-10-26 · first audit at build `8069844` (28 tests); progress column updated after the quality pass and M5 (40 tests)

## Re-audit 2026-10-27 (build `fdd5477`, 62 unit tests, 10 e2e)

**Overall 6.5 / 10: a polished indie vertical slice** (about 4 at the first audit). The slice plays end to end with objectives, three waves, win and loss, saves, animated characters, day and night, adaptive music and a professional HUD. What separates it from AAA now is content volume and tactical depth more than technology.

| Area | 26/10 → 27/10 | Biggest gaps |
| --- | --- | --- |
| UX / UI | 6 → 8 | tutorial, key rebinding, colour-blind palette, gamepad |
| Simulation architecture | 8 → 8.5 | sector LOD (v0.5) |
| Camera | 5 → 7.5 | collision in direct mode |
| Rendering | 6 → 7.5 | modelled buildings, water and sky, destruction, weather |
| VFX | 5 → 7 | rain, sparks on metal, bullet marks |
| Performance | 5 → 7 | fps not yet measured after the graphics pass; 25 ms worst tick at 4,000 zombies |
| Engineering | 7 → 7.5 | no remote, no CI, no crash reporting |
| Horde AI | 7 → 7 | Choir directives |
| Animation | 4 → 6.5 | blended transitions, hit reactions, animated climbing |
| Audio | 5 → 6.5 | recorded weapons, radio voice barks, reverb zones |
| Platform | 6 → 6 | Snap, Flatpak, Windows, macOS builds; Steam |
| Game loop | 6 → 6 | difficulty levels, economy depth, more scenarios |
| Squad AI and combat | 4 → 5 | cover, suppression, morale |
| Content | 3 | one mission; campaign, helicopter, artillery, more enemies (v0.5) |

**Update, same day:** squad tactics landed (suppression by stagger, fire distribution, cover seeking in `hold` and `defensive`, stress, panic and contact calls; 7 new tests). Squad AI and combat: 5 → 6.5. Gaps left there: path smoothing, flanking, grenades, medics.

Then the guided tutorial (nine steps over the real mission, each advancing on the player's action; on by default for a first game and from the main menu) and three difficulty levels on the briefing. UX / UI: 8 → 8.5; game loop: 6 → 6.5.

Then recorded audio: 53 CC0 clips (rifle, LMG stand-in, shotgun, reloads, dry fire, flesh and metal impacts, ten groans, roars, bites, screams, explosions, radio static, a truck engine loop that follows the nearest moving truck), loaded after the first gesture with the procedural recipes as fallback; shot events now carry the weapon. Audio: 6.5 → 7.5. Gaps left there: radio voice barks, reverb zones, a real LMG recording.

Next, in order: dense-horde render test and sector LOD for the city; licensed building and vehicle art; remote repository and CI.

## Verdict

The foundation is the strong part: one deterministic, tested, authoritative simulation in a worker, with views that cannot corrupt it. Everything the player sees and hears is prototype level. Measured against an AAA bar the build is a **tech demo**: systems work, but there is no game loop (no objective, win or loss), no audio, no animation and no art direction.

AAA is mostly content and polish: art direction, animated characters, audio, VFX, UX, and months of tuning. Procedural art and AI-written code can reach "polished indie" quality; the last step to AAA needs a human art direction pass and licensed or commissioned assets (characters, animation, music, voice). The plan below raises everything we can raise in code and defines measurable gates so "AAA" is not a feeling.

## Scorecard (0 = absent, 10 = AAA)

| Area | Before → now | What exists | Biggest gaps |
| --- | --- | --- | --- |
| Simulation architecture | 8 → 8 | deterministic kernel, worker authority, hash oracle, lint guard | save/load, sector LOD, profiling harness |
| Horde AI | 5 → 7 | flow field with structure costs, sight and noise, separation, cell cap, wall stacking and climbing, wave director, attacks on vehicles | attack variety (Choir directives), perf at 8k |
| Squad AI and combat | 4 → 4 | A*, formations, stances, hit model, reload, infection, re-plan around new walls | cover, suppression, morale, path smoothing |
| Game loop | 1 → 6 | construction, resupply near sites, convoy with risk policies, districts, 3 warned waves, objectives, victory/defeat, summary | more scenarios, economy depth, difficulty tuning |
| Rendering | 2 → 6 | toon ramp, depth outline, gamma posterize + dither, shadows following the view, building facades, props, fog | LOD, day/night, real textures, art direction |
| Animation | 0 → 4 | procedural limbs: walk by distance, aim, recoil, reload, zombie reach/attack/stack, death fall | blended skeletal animation, run, hit reactions |
| VFX | 1 → 5 | tracers, muzzle flash, blood spray, decals, persistent corpses, dust, structure debris | explosions, fire, smoke, screen shake |
| Audio | 0 → 5 | procedural weapons, impacts, groans, screams, reload, radio, UI, horde bed, tension drone, limiter, 24-voice cap | music, real recordings, reverb zones |
| UX / UI | 3 → 6 | main menu, briefing, pause, settings (volume, language, interface size, autosave, edge pan), save/load with export, summary, HUD, alerts, build ghost | minimap, tooltips, key rebinding, colour-blind palette, controller |
| Camera | 5 | continuous zoom, rotate, direct rig | edge pan, smoothing on pan, collision in direct mode, recoil/shake |
| Performance | 5 | 0.8 ms/tick at 200 zombies | flow field 5 ms per rebuild, no budgets or benchmarks in CI |
| Engineering | 6 → 7 | monorepo, strict TS, 56 unit tests, 8 Playwright e2e incl. soak, lint, vendor chunks | no CI (no remote yet), no crash reporting |
| Platform | 2 → 6 | browser, Electron (offline, isolated, sandboxed), AppImage built and smoke-tested, Snap/Flatpak/Windows/macOS configured, optional Steam | Snap/Flatpak/Windows/macOS builds, Steam achievements and cloud saves, code signing |

## The AAA bar (measurable gates)

Every gate needs a test, a benchmark or a recorded capture.

1. **Frame budget:** 60 fps (16.6 ms) on the reference laptop with 200 zombies in v0.1 and 5,000 in v0.5; worst frame under 33 ms during a 5-minute scripted battle.
2. **Sim budget:** mean tick under 4 ms (v0.1) and 12 ms (v0.5) at 4x.
3. **Feedback latency:** every player action produces visual and audio feedback within 100 ms (order marker + voice/UI click, shot + flash + sound).
4. **No dead pixels of state:** every gameplay state has a readable visual (bitten, reloading, out of ammo, attacking, stacked, dead, corpse).
5. **Everything animated:** no unit slides; every locomotion state has a matching animation and foot speed.
6. **Persistence you can see:** corpses, blood and wrecks persist (capped and faded), so losses are visible across camera modes.
7. **Audio mix:** 24-voice cap with priorities, horde bed that scales with visible count, no clipping (limiter on master).
8. **UX completeness:** menu → briefing → game → pause → summary flow, rebindable keys, pt-BR and en, colour-blind safe palette option, UI scale.
9. **Stability:** zero uncaught errors in a 30-minute soak test (Playwright), save/load hash test green.
10. **Content originality:** every asset listed in `docs/assets.md` with a licence.

## Priority plan

| # | Work | Why first |
| --- | --- | --- |
| 1 | Render pipeline: shadows, toon ramp, depth/normal outline, palette quantization, fog, day/night hook | largest perceived gap, cheap in code |
| 2 | Procedural rigged characters: soldiers and zombies with animated limbs (walk, run, aim, fire, attack, die) | removes "boxes sliding" |
| 3 | VFX and persistence: muzzle flash, hit sparks, blood decals, corpses, order markers, selection polish | feedback gate |
| 4 | Procedural audio: weapons, impacts, horde bed, UI, positional mix with voice cap | second largest gap, no licences needed |
| 5 | M5 construction + wall stacking | first real strategic decision |
| 6 | M6 logistics + M7 waves, objectives, victory/defeat | turns the sandbox into a game |
| 7 | Menus, briefing, settings, summary; e2e and soak tests; CI | UX and stability gates |
| 8 | Save/load, Electron packaging | platform |
| 9 | Art direction pass with licensed/commissioned assets | the step code cannot replace |
