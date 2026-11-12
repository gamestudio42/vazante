# Architecture

Core principle: **one authoritative world, multiple control modes.** The strategic map, the tactical camera and direct control all read and command the same simulation, which runs in a Web Worker and knows nothing about cameras, frames or animations.

## Stack

| Layer | Choice |
| --- | --- |
| Language | TypeScript (strict), ES2023 |
| Workspace | pnpm workspaces; packages expose `src/index.ts` directly, no per-package build |
| App bundler | Vite |
| UI | React (HUD and panels only) |
| Renderer | Three.js (WebGL2; WebGPU later) |
| Simulation host | Dedicated Web Worker |
| Tests | Vitest (unit, scenario), Playwright (e2e, later) |
| Desktop | Electron + electron-builder: AppImage, Snap, Flatpak, Windows NSIS, macOS dmg; Steam via SteamPipe |

The browser build is the primary target. The desktop build loads the same `apps/game/dist`.

## Repository layout

```text
apps/
  game/          Vite + React shell: boot, HUD, input, worker host
  desktop/       Electron main + preload + electron-builder config (M8)
packages/
  kernel/        RNG (xoshiro128**), FNV-1a hash, fixed-step helpers. No game rules.
  shared/        Types, commands, events, worker protocol, balance/*.ts
  simulation/    SimulationEngine, world state, systems/*, scenarios/*, persistence
  view3d/        Three.js scene, low-res pixel pipeline, camera rigs, instancing, picking
tools/           headless-sim.ts, bench.ts
docs/            GDD, ARCHITECTURE, ROADMAP, DECISIONS, balancing, assets
AGENTS.md
```

Dependency direction: `kernel ← shared ← simulation`; `shared ← view3d`; `apps/game` uses everything. `simulation` must never import `view3d`, React, DOM or Node APIs.

## Runtime topology

```text
 main thread                                   worker
┌────────────────────────────┐   commands   ┌──────────────────────────┐
│ Input → InputAction layer  │ ───────────▶ │ SimulationEngine          │
│ React HUD (reads store)    │              │  enqueue(cmd) → queue     │
│ GameClient (read mirror)   │ ◀─────────── │  tick() fixed 10 Hz       │
│ view3d (interpolates)      │  frame msg   │  frame() → typed arrays   │
└────────────────────────────┘ (transfer)   └──────────────────────────┘
```

- **Worker (authority):** `SimulationEngine` exposes `enqueue(cmd)`, `tick()`, `runTicks(n)`, `frame()`, `serialize()`, `SimulationEngine.fromSnapshot()`, and `hashState()`. The worker's clock converts real time into ticks according to speed (pause, 1x, 2x, 4x) and runs at most 8 ticks per real frame.
- **Main thread:** `GameClient` holds a read-only mirror built from the latest frame message (typed arrays transferred, not copied) plus the events of that tick. The renderer interpolates between the last two frames.
- **UI:** React reads a small store derived from the mirror. All player actions become `Command`s. UI validation calls the same pure validators the engine uses, so the UI never shows an action the engine will reject for a different reason.
- **Camera modes are presentation only.** Switching mode sends no command except `set_direct_control`, which only changes the source of one unit's orders.

## Commands and events

Commands are intentions; events are results. Neither carries rendering data.

```ts
interface CommandEnvelope { seq: number; tick: number; cmd: Command }  // tick = tick it applies on
type Command =
  | { type: 'set_speed'; speed: 0 | 1 | 2 | 4 }
  | { type: 'move'; squads: number[]; to: Vec2; formation?: Formation }
  | { type: 'stance'; squads: number[]; stance: Stance }
  | { type: 'set_direct_control'; soldier: number | null }
  | { type: 'direct_input'; soldier: number; move: Vec2; aim: Vec2; fire: boolean; reload: boolean }
  | ... // build, convoy, fire_support added per milestone

interface SimEvent { tick: number; type: EventType; source?: number; target?: number; x?: number; y?: number; value?: number }
```

- Commands are applied at the start of a tick in arrival order (`seq`).
- Every rejected command produces a `command_rejected` event with a reason key.
- Events are kept in a ring buffer of the last 2,000 for the alert feed and debugging; they are not part of the saved state, except the mission log.

## World model

The world is a grid of 4 m cells stored as a structure of arrays. Discrete entities (soldiers, squads, vehicles, structures, bases) live in tables keyed by integer ids that are never reused within a save. Zombies live in a fixed-capacity pool of typed arrays.

| Scale | Size | Use |
| --- | --- | --- |
| Cell | 4 × 4 m | navigation, occupancy, flow field, construction |
| Sector | 64 × 64 m (16 × 16 cells) | horde aggregation, map fog, render chunks, LOD |
| District | several sectors | Hold / Crisis / Lost, civilians, map UI |
| Vertical slice map | 512 × 512 m = 128 × 128 cells = 8 × 8 sectors | 4 districts |
| Full city (v0.5) | 2,048 × 2,048 m = 512 × 512 cells = 32 × 32 sectors | 4 to 6 districts |

Grid layers: `ground` (street, sidewalk, lot, building, water, park), `buildingId`, `height` (m), `blocked` (bits: structure wall, closed gate, rubble, wreck), `pile` (zombie stack, 0.5 m units), `flow` (distance to nearest human target), `noise`, `visible`.

Zombie pool fields: `x, y, z, vx, vy` (Float32), `hp`, `state`, `kind` (Uint8), `target`, `timer` (Int32/Uint16). Free slots are kept in a stack so allocation is O(1) and deterministic.

Inventories are per holder: soldier (`ammo`), vehicle (`fuel`, `cargo`), base (`stock`). There is no global resource counter; any total the UI shows is a sum.

## Tick

`TICK_DT = 0.1 s` of game time (10 Hz), same rules at every zoom level. Fixed system order:

1. apply commands
2. director (Choir directives / scenario waves)
3. lod (promote/demote sectors; v0.5)
4. flowfield
5. horde aggregate (v0.5)
6. horde agents
7. units (orders, paths, formations, direct control)
8. combat (targeting, shots, damage, bites)
9. fire support (v0.5)
10. infection
11. logistics
12. construction
13. districts
14. visibility
15. events / frame

## Determinism

- One seeded RNG owned by the engine (xoshiro128**). `Math.random`, `Date`, `performance`, and transcendental functions (`sin`, `cos`, `tan`, `atan2`, `exp`, `log`, `pow`) are forbidden in `packages/simulation` and `packages/kernel` (enforced by ESLint). Allowed: `+ - * /`, `Math.sqrt`, `floor`, `round`, `min`, `max`, `abs`, `imul`, `trunc`, `sign`. `Math.hypot` is not allowed either; use `Math.sqrt`.
- Angles are unit vectors, or indices into a precomputed 16-direction table in `shared/balance/trig.ts`.
- Iteration is always by index or insertion order; never iterate a `Set`/`Map` whose order depends on hashing of floats or objects created in non-deterministic order.
- `hashState()` (FNV-1a over all state) is the oracle for determinism and save/load tests.

## Level of detail (v0.5)

The vertical slice runs everything at full detail. From v0.5, each sector is L0 (aggregate density), L1 (simplified agents) or L2 (full agents) according to camera **and** player unit presence, never camera alone, so off-screen fights stay fair. L0 combat uses the same attributes and a Lanchester-style formula calibrated against L2 (casualties within ±25% over 10 seeds). Zombie count is conserved across promotion and demotion. Details in GDD and balancing.

## Navigation

| Level | Technique |
| --- | --- |
| City | street graph between district gates (v0.5) |
| Squad / vehicle | A* on the cell grid; vehicles only on street cells; per-sector-pair cache (v0.5) |
| Horde | Dijkstra flow field from human-occupied cells + separation steering via spatial hash |

Structure placement or destruction marks affected cells dirty; the flow field and cached paths in those sectors are invalidated locally, never the whole city.

## Rendering (`packages/view3d`)

1. Render target with low internal height (default 270 px), integer nearest upscale.
2. Camera rigs: `strategic` (top-down orthographic above 1,200 m), `tactical` (orthographic, 55° tilt, rotatable), `direct` (perspective third person). Height changes blend continuously between strategic and tactical.
3. Toon lighting (1 directional + ambient), outline pass and palette quantization arrive with the art pass.
4. Buildings merged per sector into one mesh. Zombies drawn with one `InstancedMesh` per kind. Soldiers and vehicles as individual low-poly meshes.
5. The renderer never writes to the simulation.

The M8 readability pass keeps the existing two-pass pixel pipeline and internal resolution.
`PixelPost` preserves dark linear-light values rather than subtracting a contrast offset, fades
outline/vignette strength towards the strategic view, and shades uncovered perspective background
with a world-oriented zenith/horizon gradient. The horizon uses the same colour as the distance fog;
outlines fade with that fog. Building shaders blend subpixel facade patterns towards their average
coverage using screen derivatives. None of these presentation choices alters fog-of-war, navigation,
entity counts or simulation time. Cosmetic tuning is in `shared/balance/presentation.ts`.

`e2e/lighting.spec.ts` tests the actual WebGL composite against dark swatches, black and day/night
sky gradients, then renders day/night fixtures in all three cameras while checking the paused
worker's state hash and soldier count. GPU performance gates still require the reference machine.

## Persistence

Save envelope: `{ format: 'vazante-save', version, seed, tick, checksum, state }`. Grid layers as base64, tables as JSON. Migrations are pure functions per version. Saves are written by the worker; IndexedDB in the browser, files through the preload bridge in Electron.

Required test: save mid-combat, load, run N ticks; the hash must equal running N ticks without saving.

## Desktop (M8)

- Electron loads `apps/game/dist` through a custom `app://` protocol, `contextIsolation: true`, `nodeIntegration: false`.
- Preload exposes only `window.vazanteNative`: save/load file, optional Steam achievements (steamworks.js, absent client must not break the game), quit.
- COOP/COEP headers on `app://` to enable `SharedArrayBuffer` (used for the horde buffer from v0.5; transfer fallback always works).

### Architectural appearance (M8)

`view3d/architecture.ts` derives four cosmetic families from building dimensions, seed and
neighbourhood: residential plaster/masonry, commercial panels/glass, industrial brick/steel,
and civic stone. The original solid body remains; cornices, shallow sill bands, pilasters and
shop lintels stay inside the occupied rectangle and below its authoritative height. They are
not entrances, cover, new entities or navigable terraces. Existing rooftop clutter is retained.

Bodies share one instanced material with per-instance family, variation and wear attributes.
Chunk splitting copies these attributes alongside instance transforms. Decorative boxes share
one additional batch per visible chunk. Procedural surface patterns use local metre coordinates
and derivative fading; coarse road paint and ground contact shadows remain intact. A one-byte
per-cell terrain texture selects asphalt, paving or gravel detail without increasing the large
ground colour texture. No extra render pass or external art dependency is added.

Acceptance: architecture unit bounds/repeatability tests, a simulation scenario checking that
city construction and chunking preserve map data and world hash, and the lighting WebGL suite.

External skyline buildings use a reserved negative facade family: their roof shading preserves
instance colour and the existing distance attenuation instead of replacing it with a fixed roof
colour. Orthographic world views keep uncovered background black; perspective views retain sky.

Rooftop fixture placement uses unsigned hash shifts and clamps the placement margin to half
of each roof dimension. This prevents negative cosmetic offsets and unsupported fixtures on
narrow roofs. `view3d/test/rooftops.test.ts` checks transformed fixture bounds and support heights
across 500 building hashes and three footprint sizes; it reproduces the former signed-shift bug.

### Solid set dressing and infantry/vehicle collision

The worker generates `World.props` and reserves their grid cells with `Blocked.Prop`. `MapInfo.props`
transfers these authoritative placements and occupied dimensions to the renderer. Tents, containers,
parked tanks and other solid props are rendered from those placements only. Imported meshes fit
inside their reserved rectangles. They are solid scenery, not usable vehicles or cover systems.

Site dressing occupies vacant lots outside the deployment cross and truck parking position.
Roadside dressing moves to vacant lots; it never reserves road cells. Tents are solid in this pass;
there are no tent interiors or entry commands. Grid occupancy affects A*, zombie flow, physical
movement and shared construction validation. The preview also respects non-buildable depots.

Infantry uses swept, axis-separated movement against the grid and oriented truck rectangles,
with an expanded navigation margin for routing. Trucks yield before sweeping into living infantry
and resume when clear; they also test their new heading before turning. This runs in the same
simulation in tactical, strategic and direct control. It adds no camera-dependent rules.

New snapshots retain the prop list and grid occupancy. Legacy snapshots without `props` continue
with their original occupancy and render no newly introduced solid props, avoiding invisible or
retroactively overlapping obstacles. Collision changes do not add destructibility or zombie/truck
body avoidance; existing zombie attack/ram rules remain in effect.

### Architectural reference block

A bounded presentation prototype selects the building nearest the starting base and its neighbours
within 40 m along each axis. Only that cluster gets pitched residential/industrial roofs, setback crowns,
ground-floor plinths/canopies and staggered sidewalk paving. The selection uses map geometry and
never consumes simulation RNG. Other buildings retain the previous appearance.

Roof volumes replace the upper portion of the facade, remain inside the occupied rectangle and
reach the original maximum height. Flat-roof fixtures use the actual crown footprint; pitched
roofs carry no flat-deck equipment. The simulation still uses its conservative rectangular height
for visibility; these are cosmetic roofs, not accessible terraces or interiors. Two instanced roof
batches reuse existing toon shading and chunk culling. No new per-tick system or render pass is added.

Tests cover small footprints, support bounds, deterministic selection, chunk attributes and an
unchanged world hash. `e2e/reference-block.spec.ts` captures the cluster close up, from the map and
in perspective at noon and night. GPU performance acceptance remains the separate roadmap gate.

### City-wide architecture (2026-11-12)

The reference cluster remains a camera fixture, but roof silhouettes now extend to all buildings.
A shared city appearance plan drives both bodies and supported rooftop equipment. Hospital sites
select a nearby civic building with a blue upper band and setback crown; stations select a gabled
hall with an amber band. A base within 12 cells of water selects a harbour-style warehouse with a
steel-blue band. These reuse existing occupied buildings as visual anchors; no port gameplay,
interiors or new collision volumes are introduced. Site assignment uses map geometry only.
