# Quality audit against an AAA bar

2026-10-26 · first audit at build `8069844` (28 tests); progress column updated after the quality pass and M5 (40 tests)

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
| UX / UI | 3 → 4 | HUD, squads, alerts, selection, help, order markers, path preview, build menu with ghost and reasons | menus, briefing, pause screen, settings, minimap, tooltips, accessibility |
| Camera | 5 | continuous zoom, rotate, direct rig | edge pan, smoothing on pan, collision in direct mode, recoil/shake |
| Performance | 5 | 0.8 ms/tick at 200 zombies | flow field 5 ms per rebuild, no budgets or benchmarks in CI |
| Engineering | 6 | monorepo, strict TS, 52 tests, lint | no CI, no e2e, no bundle split, no crash reporting |
| Platform | 2 | browser | Electron, Steam, Flatpak, Snap |

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
