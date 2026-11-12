# Benchmarks

How to reproduce:

- Simulation: `pnpm bench 1200` (fixed seed and script; the horde attacks the base while the truck drives across the city). Prints mean, p95 and worst tick and the most expensive systems.
- Frames: `pnpm --filter @vazante/desktop bench` opens the game for about 25 s on the real GPU. A horde of 300 attacks the base at 1x in the tactical view, and the last 20 s of frame times are recorded. In a browser, open `/?bench` (the result shows in a toast and in the console).
  The result carries `refreshHz`, the rate of the display the window ran on. Frame times are
  multiples of that interval, so only runs at the same rate compare. With several monitors the
  compositor picks the one the window opens on: unplug or turn off the others, or check `refreshHz`.

## Reference machine: Marcel's laptop

| | |
| --- | --- |
| CPU | Intel Core i7-13620H, 10 cores / 16 threads, up to 4.9 GHz |
| RAM | 30 GiB |
| GPU | Intel Raptor Lake-P UHD (used by the run below) and NVIDIA RTX 4050 Max-Q |
| OS | Ubuntu 25.10, kernel 6.17, Wayland |
| Node | 22.23 |

Measured on 2026-10-26 with Chrome, the app store and other apps busy (load average 5 to 8), so these are pessimistic.

### Simulation (2026-10-26, before the horde allocation pass)

| Case | Zombies alive | Mean tick | p95 | Worst | Top systems (ms per tick) |
| --- | --- | --- | --- | --- | --- |
| Slice | 199 | 0.72 ms | 2.31 | 5.1 | flow 0.31, horde 0.24 |
| Slice + attack | 291 | 0.88 ms | 2.76 | 7.8 | horde 0.36, flow 0.34 |
| 1,000 | 1,076 | 1.72 ms | 3.96 | 5.6 | horde 1.07, flow 0.39 |
| 4,000 | 4,057 | 4.09 ms | 6.40 | 16.8 | horde 3.41, flow 0.30 |
| 8,000 | 7,964 | 9.65 ms | 14.66 | 18.3 | horde 8.64, hash 0.48 |

The horde pass that followed removed the per-zombie allocations (closures, tuples, result objects) with bit-identical results (same state hashes). It cut the 8,000 case by about a third on the build machine (4.53 → 3.06 ms), so on this laptop it should land around 6 to 7 ms. To confirm on the next run.

### Frames (desktop app, Intel iGPU, 1600×852)

| Run | FPS | p50 | p95 | Worst | Zombies | Sim tick |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 57.4 | 16.7 ms | 16.7 ms | 133 ms | 290 | 2.1 ms |
| 2 | 59.4 | 16.7 ms | 16.7 ms | 83 ms | 290 | 2.1 ms |

## Against the gates

| Gate | Target | Result |
| --- | --- | --- |
| v0.1 frame budget | 60 fps with 200 zombies | ✅ vsync-locked (p95 16.7 ms) on the integrated GPU, with 290 zombies |
| v0.1 worst frame | under 33 ms | ❌ isolated hitches of 83 to 133 ms (2026-10-26). On 2026-11-05 the same code, before and after the 2026-10-30 render changes, gave the same frames at each refresh rate, with no long tasks and 2 to 11 ms of main-thread render in the slow frames: see that section |
| v0.1 sim budget | mean tick under 4 ms at 4x | ✅ 0.9 ms |
| v0.5 sim budget | 8,000 agents, mean tick under 12 ms | ✅ 9.65 ms on a busy machine before the horde pass |

## 2026-10-27: after squad tactics, v0.5 city and the render pass

Marcel's laptop, i7-13620H, ANGLE on Mesa Intel Graphics (RPL-P), desktop app at 1080×852 (Wayland), 20 s per run on 2026-10-27.

### Frames

| Case | Run | FPS | p50 | p95 | Worst | Zombies | Sim tick | Hitches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Slice | 1 | 59.95 | 16.7 ms | 16.7 ms | 33 ms | 282 | 0.38 ms | 0 |
| Slice | 2 | 59.95 | 16.7 ms | 16.7 ms | 33 ms | 282 | 0.45 ms | 0 |
| Porto Velário (2 km) | 1 | 59.2 | 16.7 ms | 16.7 ms | 50 ms | 6,132 | 10.5 ms (first run after the build) | 1 |
| Porto Velário (2 km) | 2 | 59.25 | 16.7 ms | 16.7 ms | 104 ms (at 1 s) | 6,133 | 4.5 ms | 3 |
| Porto Velário (2 km) | 3 | 59.9 | 16.7 ms | 16.7 ms | 50 ms | 6,132 | 3.4 ms | 1 |

Before the render pass (chunked instancing, off-screen culling, pixel-buffer minimap) the city ran at 49 fps with p95 33 ms; the slice was already at 59. No long tasks and no shader compiles while recording; the remaining hitches are missed vsyncs with little render time behind them (compositor).

### Simulation (`pnpm bench`, 1,200 ticks)

| Case | Mean | p95 | Worst |
| --- | --- | --- | --- |
| Slice | 0.52 ms | 1.59 | 5.4 |
| 4,000 | 1.23 ms | 1.72 | 5.6 |
| 8,000 | 2.58 ms | 3.10 | 3.6 |
| Porto Velário 8,000 | 3.89 ms | 5.88 | 6.3 |

Gates: v0.5 simulation (8,000 agents, mean under 12 ms) passes with a wide margin; v0.5 frames (60 fps) passes on the city with 6,000 zombies in the world, of which a few hundred are on screen in the benchmark view. A dense on-screen horde of 5,000 is still to be measured.

## 2026-11-05: three monitors, M8.2 hitch hunt

Marcel's laptop, now with three displays on the Intel iGPU: DP-1 2560×1080 at 60 Hz, HDMI-2
1080×1920 at 120 Hz and the 1600×900 panel at 144 Hz. Desktop app at 1080×852, slice, 20 s per run.
The window opens on whichever display the compositor picks, and the result follows the display,
not the code:

| Build | Display | FPS | p50 | p95 | Worst |
| --- | --- | --- | --- | --- | --- |
| main | 60 Hz (5 runs) | 50.5 to 56.0 | 16.7 ms | 33.3 ms | 67 to 83 ms |
| main | 144 Hz (2 runs) | 87.7, 95.2 | 7.0, 6.9 ms | 27.8, 20.8 ms | 56, 49 ms |
| `packages/view3d` from 8b3daf5 (before the 2026-10-30 shadow changes) | 60 Hz (2 runs) | 53.6, 52.8 | 16.7 ms | 33.3 ms | 67 ms |
| same | 120 Hz (1 run) | 116.2 | 8.3 ms | 9.1 ms | 23 ms |

- The shadow fit of 2026-10-30 is not a regression: with the old renderer the frames are the same at
  60 Hz. Its frustum is 0.46 to 0.74 times the area of the old square one at every zoom.
- Slow frames are whole vsync intervals with 2 to 11 ms of main-thread work, no long tasks and no
  shader compiles: the GPU or the compositor misses the vsync. On 2026-10-27 the slice ran at 59.95
  fps with p95 16.7 ms on the same machine, before the second and third displays.
- Autosave is not a cause either: in the city the main thread spends about 7 ms receiving the save
  and handing it to IndexedDB (8.5 MB); the 18 ms copy runs in the worker.
- Several runs stalled with no result while the window was covered. The desktop bench now keeps its
  window on top and focused, and prints the page state when it times out.

Next: repeat the slice and the city on a single display (the panel alone, 144 Hz) to tell what the
game costs from what three displays on one iGPU cost.

## Build machine (cloud container, for comparison)

Intel Xeon @ 2.10 GHz, Node 22.22, after the horde pass:

| Case | Mean | p95 | Worst |
| --- | --- | --- | --- |
| Slice | 0.24 ms | 0.75 | 1.4 |
| 1,000 | 0.49 ms | 1.18 | 4.1 |
| 4,000 | 1.60 ms | 2.49 | 6.7 |
| 8,000 | 3.28 ms | 4.30 | 9.7 |

Flow field cost by map size (open field, two sources), before → after the bucket queue: 128² 3.3 → 0.8 ms, 256² 13 → 5 ms, 512² (a 2 km city) 57 → 13 ms. It is rebuilt every 5 ticks, so v0.5 still needs sector LOD or a bounded search before the 2 km map.

## 2026-11-12: architectural variety, preliminary render cost

Chromium/SwiftShader, seed 1 slice, 1440×900 CSS pixels, unchanged internal resolution.
Counts include shadow and composite passes. Fixed centre (256,256), tactical spans 110/45 m,
map at maximum span; direct camera at (256,285), facing north. Before → after draw calls:
162→189 tactical, 106→124 close, 203→225 direct, 346→376 map. Triangles increased by about
33k–51k across these views, from about 621k–751k to 654k–802k. The extra work is the bounded
facade detail batch plus richer fragment shaders; no new render pass is used.

Software timings were noisy with validation processes running concurrently (roughly 2.5–4.6 ms
before and 3.4–7.2 ms after for short synchronous samples). They are not a hardware frame-rate
comparison or a passed performance gate. Measure on the reference GPU before increasing the
detail budget; the 5,000-visible-agent gate remains pending.

## 2026-11-12: solid scenery and infantry/vehicle collision

Before/after `pnpm bench 300 --json`, same i7-13620H and Node 22.23.4, six seeded benchmark scripts.
Mean tick milliseconds: slice 0.385→0.377; slice with attack 0.387→0.335; 1,000 agents
0.569→0.486; 4,000 1.545→1.370; 8,000 3.087→2.843; Porto Velário 8,000 5.227→4.363.
No case increased its mean tick time above 10%. These short samples do not establish a speedup:
new occupied cells affect routes and initial horde placement, so workload and state hashes change.

Collision work runs under the existing `units` and `vehicles` profiler entries. Slice vehicle time
rose from about 0.004 to 0.007 ms/tick, consistent with checking swept volumes against infantry;
city vehicle time was about 0.009→0.005 ms. Static footprints are generated once, not each tick.
This is a simulation comparison, not validation of the dense visible-horde rendering gate.
