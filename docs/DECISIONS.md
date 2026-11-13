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

## D12. Saves are state snapshots, not command replays

A save is a structured clone of the whole `World` plus its state hash. Loading restores the class prototypes, rebuilds the id indexes and rejects the save if the hash does not match.

- **Replay was tried first and rejected.** Replaying the command log is the classic deterministic save, but it costs one simulation tick per saved tick: about 40 s to load a 20-minute game on the build machine.
- **Snapshots survive balance changes.** The hash checks integrity of the copied state, not the rules, so a save keeps loading after values in `balance/` change. A change to the shape of the state needs a `SAVE_VERSION` bump.
- **Where saves live.** IndexedDB in the browser and in Electron (slots: autosave, quick save, manual saves). Export and import as a gzipped JSON `.vazante` file, with typed arrays as base64 and non-finite numbers tagged.
- **Loading reloads the page** with `?load=<slot>`, so no state from the previous game can leak into the loaded one. Every game opens paused.

## D13. Desktop shell

- **Electron serves the web build from `app://game/`**, a privileged standard scheme, with COOP/COEP (cross-origin isolation for SharedArrayBuffer in v0.5) and a strict CSP. No HTTP server, so it works offline.
- **Sandboxed renderer**, context isolation, no Node in the page. The preload exposes only `vazanteDesktop.quit()`. Navigation outside `app://game` is blocked and external links open in the system browser. F11 toggles full screen.
- **Steam is optional.** With `VAZANTE_STEAM_APP_ID` set and `steamworks.js` installed, Steam is initialised; otherwise the game opens without it.
- **Packaging** uses electron-builder: AppImage, Snap and Flatpak on Linux, NSIS on Windows, DMG on macOS. The app id `io.github.vazante.Vazante` is a placeholder until the publisher identity is chosen.
- **`--smoke`** opens the game hidden, checks it reached the first frame with `crossOriginIsolated === true` and exits with a status code, for CI.

## D14. Medic treatment is a throttled event

- **Medics do not cure.** They heal HP and slow a bite, so they never emit `soldier_cured`; only the hospital cures.
- **`soldier_healed` once a second per treating medic.** A medic heals every tick, so an event per tick would flood the event stream. On ticks where `tick % TICK_HZ === 0` a medic who is treating someone emits it at the patient (`source` the patient, `target` the medic). A medic with no one hurt in reach emits nothing.
- **Not an alert.** It is for the renderer (a small heal glow), not the alert log, where it would repeat every second.

## D15. Solid scenery is placed by the simulation

Tents, parked tanks and containers previously existed only in the view and could be walked through.
The simulation now owns cell-aligned occupied footprints and supplies their render placements.
Keep road cells and the deployment cross clear; place roadside dressing on vacant lots rather
than silently closing convoy routes. Meshes fit the occupied footprint. Tents are solid: playable
interiors and entrances need their own interaction design and are not implied by decorative art.
Legacy saves keep their original occupancy and do not acquire new solid scenery after loading.

Infantry routes around truck bodies and direct control uses the same collision rules. Trucks yield
to living infantry instead of pushing or teleporting soldiers. Existing zombie attack and vehicle
ramming rules continue separately. This preserves one authoritative world across all cameras.

### D16 — bounded architectural reference cluster (2026-11-12)

Validate the next architecture pass near the starting base before applying it city-wide. Use
cosmetic gables and setback crowns within the existing authoritative building envelope. Keep
conservative rectangular sight blocking: no apparent roof space is traversable or advertised as
cover. This avoids changing navigation or combat balance for an art prototype. Place fixtures on
the actual flat crown, never above a slope or an empty setback. Sidewalk treatment only recolours
existing sidewalk cells; it does not create new pedestrian routes. Broader expansion follows visual
review and the existing render performance gate.

## D17. The campaign roster lives in the client; rank lives in the simulation (2026-11-13)

- **Why a roster.** Playtest notes and the 2026-11-13 review found nothing carries between
  missions, so a loss had no weight after the summary and a win no reward but the next mission.
- **Split.** Names, experience and the memorial are player meta-progression, stored with the
  settings in `localStorage` (`apps/game/src/roster.ts`). The simulation only receives seats
  (`rid`, `rank`) when a campaign mission is built, keeps them on the soldier, counts kills per
  soldier and exposes them in `Frame.crew`. Ranks are part of the hash and of saves; an empty crew
  hashes exactly as before.
- **Settled once, at the summary.** The client writes the result when the mission summary first
  shows. A rid that is no longer on the roster is ignored, so loading a save from before a death
  cannot revive anyone. Save-scumming a whole mission is still possible; an ironman option can come
  later if playtests show it matters.
- **Practice.** A game with the guided tutorial does not touch the roster, so learning the controls
  never kills a named soldier.

