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

## Persistence

Save envelope: `{ format: 'vazante-save', version, seed, tick, checksum, state }`. Grid layers as base64, tables as JSON. Migrations are pure functions per version. Saves are written by the worker; IndexedDB in the browser, files through the preload bridge in Electron.

Required test: save mid-combat, load, run N ticks; the hash must equal running N ticks without saving.

## Desktop (M8)

- Electron loads `apps/game/dist` through a custom `app://` protocol, `contextIsolation: true`, `nodeIntegration: false`.
- Preload exposes only `window.vazanteNative`: save/load file, optional Steam achievements (steamworks.js, absent client must not break the game), quit.
- COOP/COEP headers on `app://` to enable `SharedArrayBuffer` (used for the horde buffer from v0.5; transfer fallback always works).
