# Roadmap

Milestones are strictly ordered. A milestone is done only when every acceptance criterion has an automated test (or, for rendering/perf, a recorded benchmark) that passes. Compiling is not done. Each milestone ends with a runnable build.

Status legend: ✅ done · 🟡 in progress · ⬜ not started.

## v0.1 Vertical slice: "O Último Comboio"

### Status (2026-10-31)

v0.1 is complete: every milestone below is done, the slice is playable end to end in the browser (GitHub Pages, deployed by CI on every push to main) and as a desktop app (AppImage locally, Snap built in CI). Items checked by hand rather than by a test are marked in their rows.
Automated: 136 Vitest tests (engine, missions, balance, determinism, saves) and the Playwright e2e suite, run by CI on every push. The headless balance bot (`pnpm balance`) plays every mission; its latest results are in `balancing.md`.
Still open from v0.1: the occasional 80 to 130 ms frame hitch (M8.2), and Flatpak, Windows and macOS builds in CI (M8.5; the electron-builder targets exist but nothing builds them yet). The Snap is published on the edge channel and waits on a promotion to stable.

### M0. Foundation ✅

| ID | Task | Acceptance |
| --- | --- | --- |
| M0.1 | pnpm monorepo, TypeScript strict, ESLint, Vitest | `pnpm check` (typecheck + lint + test) passes |
| M0.2 | `kernel`: xoshiro128** RNG, FNV-1a hash | same seed gives same sequence; known hash vectors |
| M0.3 | Lint rules for `simulation` and `kernel`: forbid `Math.random`, `Date`, `performance`, transcendental Math | a file using `Math.sin` fails lint |
| M0.4 | Docs and `AGENTS.md` | files exist and are linked from README |
| M0.5 | CI on GitHub Actions + Pages deploy | ✅ `pages.yml` checks every push and deploys main; `snap.yml` builds the Snap |

### M1. World core, map and cameras ✅ (M1.4 and the M1.5 bands checked by hand)

| ID | Task | Acceptance |
| --- | --- | --- |
| M1.1 | `SimulationEngine`: fixed tick, command queue, event ring, `hashState`, `frame()` | `runTicks(n)` twice from the same seed and commands gives the same hash |
| M1.2 | Scenario map generator for the 512 m slice: streets, blocks, buildings with heights, 4 districts, base and depot sites | same seed → same hash; every street cell reachable from the base (BFS) |
| M1.3 | Worker host + `GameClient` mirror; speed control (pause, 1x, 2x, 4x) | headless: 4x runs 4× the ticks of 1x for the same real time |
| M1.4 | `view3d`: low-res pixel render, buildings merged per sector | page shows the city at 270 px internal height |
| M1.5 | Continuous camera: strategic ↔ tactical by height, plus direct rig | changing camera mode never changes `hashState` |

### M2. Units, selection, orders ✅

| ID | Task | Acceptance |
| --- | --- | --- |
| M2.1 | Squads and soldiers; `move` with A* and formations (line, column, wedge, circle) | squad reaches target in formation; no soldier inside a blocked cell |
| M2.2 | Selection (click, box) and right-click orders in strategic and tactical views | e2e: box-select and move |
| M2.3 | Stances hold / aggressive / defensive / withdraw | hold fires only in the 90° front arc |

### M3. Zombies and combat ✅

| ID | Task | Acceptance |
| --- | --- | --- |
| M3.1 | Zombie pool (SoA) with wander / chase / attack and three kinds | zombie 20 m from a visible target reaches contact within 20 s |
| M3.2 | Flow field from humans and noise; separation via spatial hash | no zombie enters a blocked cell; max 12 per cell |
| M3.3 | Combat: targeting, hit chance, damage, ammo per soldier, zombie bites | idle squad vs 300 commons in a line wins 10/10 seeds; ammo spent stays spent |
| M3.4 | Infection: bitten soldiers turn after 60 to 180 s; killed-by-zombie rise after 20 s | test for both, explosion kills do not rise |
| M3.5 | Noise and perception | gunfire 40 m away makes wandering zombies chase |

### M4. Direct control ✅ (M4.2 HUD checked by hand)

| ID | Task | Acceptance |
| --- | --- | --- |
| M4.1 | TAB takes a soldier; WASD + mouse aim + fire + reload; speed forced to 1x | entering and leaving changes nothing but the issued commands (hash test) |
| M4.2 | Direct HUD (crosshair, ammo, health) | e2e: TAB, shoot, TAB back |

### M5. Construction and dynamic navigation ✅

| ID | Task | Acceptance |
| --- | --- | --- |
| M5.1 | Base, build menu with ghost preview, materials from base stock | invalid placement rejected by the engine with the same reason as the UI |
| M5.2 | HESCO, concrete wall, gate, MG nest (4 defensive types for the slice) | build, damage and destroy tests for each |
| M5.3 | Structures update `blocked`, flow field and paths locally | a new wall reroutes zombies |
| M5.4 | Wall stacking | 200 zombies vs undefended 3.5 m wall cross within 60 s; with active nest they don't within 120 s |

### M6. Inventories and logistics ✅

| ID | Task | Acceptance |
| --- | --- | --- |
| M6.1 | Per-holder inventories; resupply only near a depot | squad out of ammo far from base stays empty; near the depot reloads at the balance rate |
| M6.2 | Cargo truck with street-only routing, cargo held in transit, risk policy | stock moves only on arrival; destroyed truck delivers nothing |
| M6.3 | Convoy planner UI | e2e: plan and send a convoy |

### M7. Director, districts and the scenario ✅

| ID | Task | Acceptance |
| --- | --- | --- |
| M7.1 | District pressure and states | undefended district with enough zombies goes Hold → Lost within the balance window |
| M7.2 | Wave director with warnings (Choir-lite) | every attack has a 20 to 40 s warning |
| M7.3 | "O Último Comboio" objectives, victory, defeat, restart | scripted runs reach both victory and defeat |

### M8. Persistence, performance, polish, desktop 🟡 (M8.1 ✅, M8.2 ✅ except the worst-frame hitch, M8.3 ✅, M8.4 ✅, M8.5 AppImage ✅ and Snap in CI ✅; Flatpak, Windows and macOS pending)

| ID | Task | Acceptance |
| --- | --- | --- |
| M8.1 | Save/load in worker, IndexedDB + file | save mid-combat, load, run 1,000 ticks → same hash as without saving |
| M8.2 | Benchmarks | 200 zombies + 12 soldiers at 60 fps on a named reference machine, recorded in `docs/benchmarks.md` |
| M8.3 | Audio (24-voice cap), VFX, toon/outline/palette pass | voice cap respected |
| M8.4 | `apps/desktop` Electron with `app://`, COOP/COEP, minimal preload | opens offline; `crossOriginIsolated === true` |
| M8.5 | electron-builder: AppImage, Snap, Flatpak, Windows, macOS; optional steamworks.js | Linux artifacts built in CI; Steam absent → game still opens |

## v0.5 City war

Porto Velário (2 km procedural city), sector LOD L0/L1/L2 with conservation and calibration tests, **performance gate: 8,000 agents at 4x with mean tick < 12 ms, and 60 fps with 5,000 visible**, armored vehicles, helicopters (fast-rope, clinging), fire support, evacuation and quarantine triage, the full Choir, building damage and rubble, day/night.

If the v0.5 performance gate fails, stop and re-evaluate the architecture with Marcel before continuing.

Progress (2026-10-31):

Done:

- [x] Porto Velário generator: 512 × 512 cells, bay, meandering river crossed by street bridges, avenues, six districts. Since 2026-10-29 the layout changes with the seed (river course, base, block rhythm, parks); every new game draws a new city unless "Cidade fixa" is set. Strategic points stay at least 600 m and 35° apart.
- [x] `city_war` sandbox (four squads, a truck per depot, 6,000 infected at veteran); desktop `--city`, `bench:city`.
- [x] Horde flow field rebuilt in per-tick slices (`FlowJob`), resumable from saves, identical to the one-shot field (test). Crowding now adds cost, so a jammed gap sends the horde round other routes.
- [x] Simulation gate: 8,000 agents on the 2 km city, mean 6.6 ms, p95 10.3 ms (container); 60 fps on Marcel's laptop with 6,000 zombies in the world.
- [x] Data-driven missions with ordered stages and pressure groups. Campaign of seven: O Último Comboio, Hospital São Lucas, A Ponte, Retomar a Ribeira, Linha de Suprimento, Turno da Noite, O Último Trem.
- [x] Survival mode: endless days (30 min) and nights with growing hordes, an economy of strategic points (depots, hospital, station) captured by presence, income, buying reinforcements and trucks, best run kept per difficulty.
- [x] Infected: Gritador and Inchado. Roles: marines with marksman and medic, engineers (build outside bases, repair structures and truck wrecks), field resupply from parked trucks.
- [x] Tactics: suppression, fire on the move, flanks, squad follow-the-leader, drag to face, queued routes (Shift + right click or R), trucks that follow a squad.
- [x] Fog of war on the view and the minimap; waves enter from several sides and spread.
- [x] Construction: field MG nests with their own ammo, a nest panel, walls that need 14 stacked zombies (9 for a hesco) and let one climber per cell per second; base ammo alerts.
- [x] Truck wrecks that keep their cargo and can be repaired; mission defeat only when no recovery is possible.
- [x] Rendering: shadows fitted to the view (wide screens included) and faded when zoomed far out; outline that no longer darkens the scene when zooming.
- [x] Languages: Portuguese, English, Spanish, French, German. Licence AGPL-3.0-or-later. Recorded CC0 audio with procedural fallback.
- [x] Balance bot for every mission (veteran, three seeds): all campaign missions win except A Ponte at 2 to 3 of 3; survival reaches about four nights.

Still to do for v0.5:

- [ ] Render gate with a dense on-screen horde (5,000 visible) on Marcel's laptop.
- [ ] Sector LOD L0/L1/L2 with conservation and calibration tests (only needed if the render gate fails).
- [ ] Human playtest and balance (Diogo's feedback rounds are under way).
- [ ] Armored vehicles, helicopters (fast-rope, clinging), fire support.
- [ ] Evacuation and quarantine triage, the full Choir, building damage and rubble.

## v1.0 World survival

Campaign across regions carried by what reaches the port, delegated officers, adaptive Choir, more factions.
