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

## D10. Construction simplifications for the slice

- **Pile is derived, not stored with decay.** Each tick the pile at a structure is the number of zombies stacked against it plus those climbing inside it. Dead or departed zombies leave the pile at once (the GDD's "decay by 1 every 20 ticks" is dropped). Simpler, deterministic, and it reads well on screen.
- **Structures cost flow, they are not walls of infinity.** An unclimbed structure adds 200 (20 cells) to the flow field. A short wall is bypassed; a sealed perimeter is besieged instead of making the horde give up.
- **MG nest crew is abstracted.** The nest fires on its own from the base ammo stock. Manning by a squad comes with M6 inventories.
- **One cell per structure.** Multi-cell gates and nests come later.
- **Idle squads help build.** A squad holding in or near a base walks to the nearest blueprint. A player "hold" opts that squad out, a move opts it back in. Without this, every blueprint needed manual micro.
- **HP in zombie attacks.** Structure HP counts attacks (one per zombie per second), not abstract damage.

## D11. Logistics and mission simplifications for the slice

- **Inventories are per soldier and per site.** Soldiers carry their own rounds; bases and depots hold stock. A soldier within 30 m of a site with stock refills at 10 rounds per second. There are no separate squad or vehicle inventories beyond the truck's cargo.
- **One vehicle type.** Only the cargo truck exists in the slice. It drives on street cells, plus the inside of bases and depots, and never through buildings or structures.
- **Four risk policies.** When 4 or more zombies block the road ahead the truck follows its policy: push through (slow, rams), reroute (one new route that avoids zombie cells, then halt), halt, or return to its origin. The player can change the policy while it drives.
- **The truck is noisy.** It stamps noise and is a flow source, so a convoy pulls the horde along its route. That is the cost of moving cargo.
- **The city has already fallen.** Only the district holding the command post starts under control (100). Control drops by 1 per second where zombies outnumber soldiers 5 to 1 (with at least 15 zombies) and recovers where soldiers hold.
- **Waves are one entry point each.** A wave spawns around one street cell at least 200 m from the base, after a 20 to 40 s warning. Wave zombies never give up the chase.
- **Civilians are an abstraction of command post HP.** They are not simulated as people yet.
- **Restart reloads the page** with the seed in the URL. "New city" uses the next seed. A proper menu flow comes with M8.
