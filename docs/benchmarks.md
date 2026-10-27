# Benchmarks

How to reproduce:

- Simulation: `pnpm bench 1200` (fixed seed and script; the horde attacks the base while the truck drives across the city). Prints mean, p95 and worst tick and the most expensive systems.
- Frames: `pnpm --filter @vazante/desktop bench` opens the game for about 25 s on the real GPU. A horde of 300 attacks the base at 1x in the tactical view, and the last 20 s of frame times are recorded. In a browser, open `/?bench` (the result shows in a toast and in the console).

## Reference machine: Marcel's laptop

| | |
| --- | --- |
| CPU | Intel Core i7-13620H, 10 cores / 16 threads, up to 4.9 GHz |
| RAM | 30 GiB |
| GPU | Intel Raptor Lake-P UHD (used by the run below) and NVIDIA RTX 4050 Max-Q |
| OS | Ubuntu 25.10, kernel 6.17, Wayland |
| Node | 22.23 |

Measured on 2026-10-26 with Chrome, the app store and other apps busy (load average 5 to 8), so these are pessimistic.

### Simulation (commit 44e9eb0, before the horde allocation pass)

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
| v0.1 worst frame | under 33 ms | ❌ isolated hitches of 83 to 133 ms; cause not yet identified (main-thread GC or React re-render of the HUD on each frame are the suspects) |
| v0.1 sim budget | mean tick under 4 ms at 4x | ✅ 0.9 ms |
| v0.5 sim budget | 8,000 agents, mean tick under 12 ms | ✅ 9.65 ms on a busy machine before the horde pass |

## 2026-10-27: after squad tactics, v0.5 city and the render pass

Marcel's laptop, i7-13620H, ANGLE on Mesa Intel Graphics (RPL-P), desktop app at 1080×852 (Wayland), 20 s per run, build `9f67da0`.

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

## Build machine (cloud container, for comparison)

Intel Xeon @ 2.10 GHz, Node 22.22, after the horde pass:

| Case | Mean | p95 | Worst |
| --- | --- | --- | --- |
| Slice | 0.24 ms | 0.75 | 1.4 |
| 1,000 | 0.49 ms | 1.18 | 4.1 |
| 4,000 | 1.60 ms | 2.49 | 6.7 |
| 8,000 | 3.28 ms | 4.30 | 9.7 |

Flow field cost by map size (open field, two sources), before → after the bucket queue: 128² 3.3 → 0.8 ms, 256² 13 → 5 ms, 512² (a 2 km city) 57 → 13 ms. It is rebuilt every 5 ticks, so v0.5 still needs sector LOD or a bounded search before the 2 km map.
