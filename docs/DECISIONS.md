# Decisions

Short architecture decision records. Newest last. To change a decision, add a new entry that supersedes it.

## D1. Browser first, TypeScript + Three.js, Electron for desktop

2026-10-26 · Marcel

- **Context:** an earlier draft recommended Godot 4 + GDScript, desktop first. The Vazante spec used the Urbe Oasis web stack.
- **Decision:** browser first. TypeScript, Vite, simulation in a Web Worker, Three.js renderer, React HUD. Electron packages the same build for Steam, Flatpak, Snap, AppImage, Windows and macOS.
- **Why:** Marcel asked for browser first with PixiJS or Three.js and Electron. Three.js over PixiJS because the game needs a 3D city with a continuous zoom and a third-person direct-control camera.
- **Consequences:** no editor, navmesh or physics engine out of the box; we own the grid navigation, flow fields and a minimal collision model. Headless tests run in Node with the same simulation code.

## D2. One authoritative world, multiple control modes

The simulation is the only owner of entities. Camera modes are presentation. Switching modes must never create, destroy, duplicate or auto-resolve anything. Enforced by hash tests (camera mode changes do not alter `hashState`).

## D3. Fixed tick of 10 Hz

An earlier draft suggested 20 Hz. We keep 10 Hz (0.1 s) from the Vazante spec because the horde target is thousands of agents and the render interpolates anyway. Revisit if direct control feels unresponsive; direct-control input is applied at the next tick, so worst-case latency is 100 ms plus a frame.

## D4. Continuous zoom with three named modes

An earlier draft describes three cameras (strategic, tactical, direct). Vazante describes a continuous zoom. We implement both: strategic and tactical are height bands of one continuous camera, direct is a separate rig entered with TAB.

## D5. Physical, local inventories

Every soldier, vehicle and base holds its own stock; nothing is global. Cargo is owned by the vehicle in transit and is lost with it. Convoys get a risk policy.

## D6. Vertical slice first, city scale second

The first playable target is the 512 m "O Último Comboio" with 12 soldiers and about 200 zombies, at full detail. The 2 km city, sector LOD and the 8,000-agent performance gate move to v0.5. The horde is still stored as SoA typed arrays from day one so the later scale-up does not require a rewrite.

## D7. Name and originality

Working title **Vazante**. Names, assets, text, maps and UI art are our own. Placeholders: FT Âncora, the Choir (o Coro), Porto Velário.

## D8. Languages

Code, comments, technical docs, commits: English. Player-facing text through i18n in pt-BR (default) and en; English is the source of the key types.

## D9. Own deterministic kernel instead of copying Urbe Oasis

The Urbe Oasis repository was not reachable from the build environment, so `packages/kernel` (xoshiro128**, FNV-1a) was written from scratch with the same API shape. It can be swapped for the Urbe Oasis version later if desired.
