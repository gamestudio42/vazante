# Vazante: Game Design Document

Version 0.2 · 2026-10-26 · owner: Marcel

Consolidates the original Vazante spec (`docs/reference/vazante-spec-v0.1-pt.md`). Where an earlier draft disagreed, the choice and the reason are in [DECISIONS.md](DECISIONS.md). Balance numbers live in [balancing.md](balancing.md); technical structure lives in [ARCHITECTURE.md](ARCHITECTURE.md).

## 1. Vision

A real-time strategy and survival game against a city-sized zombie horde. The player commands the last naval task force and tries to save what it can of a fallen city. The player plans on the operations map, zooms into any street to fight, and can take direct control of a soldier, vehicle or helicopter, without a loading screen. Everything that happens at any zoom level persists in the same world.

Working title: **Vazante** (Portuguese for ebb tide). Placeholders: the task force is **FT Âncora**, the hive mind is **the Choir** (o Coro), the city is **Porto Velário**.

### Pillars (priority order)

1. **One authoritative world, multiple control modes.** Map, battle and direct control are views of the same simulation. Switching never creates, duplicates or resolves anything.
2. **The horde is mass.** Thousands of agents, wall stacking, infection.
3. **Logistics decides the war.** Ammunition, fuel and materials are physical inventories in specific places. Resupply only happens at bases. A destroyed truck destroys its cargo.
4. **Losses are permanent.** You cannot save everyone.

### Tags used in this document

- **[FACT]** marks a rule this design keeps.
- **[EST]** is our estimate. Any untagged number is [EST].

### Originality rule

Names, city, factions, UI art, maps, music and text are our own. Real military equipment may be referred to by generic names (Humvee, M777).

## 2. Core loop

1. **Assess** on the operations map: district states, Choir warnings, stocks at each base.
2. **Decide** priorities under scarcity: hold a bridge or evacuate civilians, spend the last artillery salvo now or keep it, use the helicopter for scouting or for cargo.
3. **Order** squads, vehicles, convoys, construction and fire support.
4. **Zoom in** where it matters, micro-manage, or take direct control (TAB).
5. **Absorb consequences:** ammo spent stays spent, the dead stay dead (or come back as zombies), lost districts change routes and threats.
6. Repeat with fewer resources and new risks, until evacuation succeeds or the last base falls.

## 3. Views and control modes

The camera is continuous; the "mode" is a height band, plus direct control as a separate camera rig. None of them owns entities.

| Mode | Camera height | Shows | Player does |
| --- | --- | --- | --- |
| Strategic (operations map) | above 1,200 m | districts colored by state, unit icons, convoy routes, horde heatmap (only where seen), Choir markers | multi-select, move/attack/hold/withdraw, plan convoys, fire support |
| Transition | 300 to 1,200 m | buildings in low LOD fade in, icons shrink, tilt 90° to 55° | same as strategic |
| Tactical (battle) | 40 to 300 m | full 3D pixel-art scene, individual zombies, tactical HUD, ranges | box select, formations, stances, construction |
| Direct | third person, 12 m behind and 8 m above | crosshair, ammo, health, "TAB to exit" | WASD + mouse for soldier, vehicle or helicopter |

Rules:

- Mouse wheel scales height exponentially (×0.85 / ×1.18 per notch) with 150 ms easing. Sector streaming must keep up; no loading screens.
- `M` toggles between the current height and the map view. `Home` jumps to the latest alert.
- TAB enters direct control of the selected unit [FACT]. Simulation keeps running identically; only the source of that unit's commands changes. In direct control the speed is forced to 1x and pause is disabled. TAB again returns the unit to its AI.

## 4. Systems and rules

Numbers referenced here are in [balancing.md](balancing.md).

### 4.1 Horde agents

- **Flow field:** 8-neighbour distance field (cost 10 orthogonal, 14 diagonal) from every cell with a human visible to zombies, or with noise above 40. `blocked` cells cost infinity, except walls whose zombie pile is high enough (4.3). One field per active sector, recomputed when a target changes cell or a wall changes; budget of 4 sectors per tick.
- **States:** wandering (follows sector drift with RNG noise), chasing (descends the flow field), attacking (target under 1.2 m), stacked, clinging (to an aircraft), dead (corpse).
- **Perception:** a zombie switches to chasing if a human is within 25 m in line of sight or if cell noise exceeds 40. A gunshot adds noise 60 within 40 m; an explosion adds 200 within 150 m. Noise decays 10% per tick. Zombies never get perfect knowledge of player positions.
- **Movement:** desired velocity = flow direction × type speed. Separation via a cell spatial hash (radius 0.6 m, at most 6 neighbours checked). Acceleration capped at 4 m/s².
- Zombies do not enter buildings in the MVP; buildings are solid, roofs are reached by stacking.
- **MVP types:** common, runner, brute. Post-MVP candidates: climber (bypasses vertical obstacles), latent infected (risk during evacuation, already partly covered by bitten civilians), alpha (coordinates nearby hordes).

### 4.2 Combat

Pipeline per shot: target acquisition → line of sight → range and ammo check → hit chance → hitscan or projectile → damage, area effects → state update → domain event (audio, VFX, history).

- **Target acquisition:** each soldier picks the nearest visible zombie within weapon range, re-evaluated every 5 ticks. Stance `hold` only fires into the 90° arc in front of the formation.
- **Hit chance:** `chance = weaponAccuracy × rangeFactor × stanceFactor`, `rangeFactor = 1 − (d / range)² × 0.5`, `stanceFactor` 1.0 stationary, 0.6 moving. Every factor clamped to [0, 1]. Rolled with the engine RNG.
- Small arms are hitscan with tracer VFX. Grenades, rockets, mortars and artillery are simulated projectiles with area damage (linear falloff to the edge).
- **Zombie attack:** every 1.0 s in contact, a zombie deals 8 damage and has a 15% bite chance against soldiers on foot. Against vehicles: 2 damage, no bite. Vehicles above 5 m/s kill common zombies they hit.
- **Ammo:** each shot spends 1 from the soldier's own inventory. At 0 the soldier stops firing and the squad emits `out_of_ammo`.
- Environmental destruction in the MVP is limited to structures and whole buildings turning into rubble (4.8). Component destruction (windows, doors, wall segments) is post-MVP.

### 4.3 Wall stacking [FACT: zombies stack to climb walls and roofs]

- A chasing zombie blocked by a wall becomes `stacked` and adds 1 (0.5 m) to that wall cell's `pile`.
- A wall of height `h` becomes passable when `pile × 0.5 ≥ h`; its flow-field cost becomes normal and zombies climb over (z rises).
- Each dead stacked zombie removes 1 from `pile`. Without pressure, `pile` decays by 1 every 20 ticks.
- Rendered as a ramp of bodies leaning on the wall.

### 4.4 Infection [FACT: soldiers killed by the horde come back]

- A bitten soldier becomes `bitten`; after 60 to 180 s (rolled) becomes `turned`: leaves the squad and a zombie spawns at its position.
- A soldier killed by zombies rises after 20 s unless the body is destroyed. Killed by explosion: does not rise.
- Civilians follow the same rule. At quarantine triage, 20% of suspects are infected [EST].

### 4.5 Units, squads and orders

- Command unit is the squad (4 to 12 soldiers) or the vehicle.
- **Orders:** `move`, `hold`, `delay` (fall back to the next line when pressure passes 70%), `withdraw`, `escort`, `board`, `fastrope`, plus `attack` (target or area).
- **Stances:** hold, aggressive, defensive, withdraw.
- **Formations:** line, column, wedge, circle (static defence), spacing 2 m, positions relative to the leader; no two soldiers target the same slot. Squad AI assigns goals; soldier AI resolves movement, cover and line of fire.
- **Soldier states:** idle, moving, engaging, reloading, suppressed, boarding, disembarking, resupplying, wounded, bitten, dead, turned.
- **Pathfinding:** A* on the cell grid with a per-sector-pair cache. Ground vehicles use street cells only and respect street width.
- **Helicopters:** fly at 40 m ignoring the grid; land only on a free 3×3 cell area (street, square, flat roof). `fastrope`: hover at 10 m for 8 s, drop up to 8 soldiers.
- **Aircraft clinging [FACT]:** a helicopter below 6 m over zombies lets up to 6 cling; each adds 5% mass and 1 damage/s. Over 4 clinging, it loses altitude and crashes unless it climbs within 5 s.

### 4.6 Direct control [FACT: TAB]

- Soldier: WASD move, mouse aim, left button fires with the 4.2 rules plus +0.2 accuracy. R reloads from the soldier's own inventory.
- Vehicle: WASD drives, mouse aims the turret. Helicopter: WASD horizontal, Q/E altitude.
- Entering and leaving direct control must not change the simulation hash beyond the commands issued.

### 4.7 Visibility [FACT: hordes only shown within line of sight]

- Each unit reveals cells within a radius (soldier 40 m, vehicle 50 m, helicopter 150 m, drone 300 m) via a simple raycast against `height`.
- Out-of-sight sectors on the map show the last seen density with its age in minutes.
- Day/night cycle of 20 game minutes; at night vision drops 50% without lighting.

### 4.8 Fire support [FACT: weapon list and finite magazines]

- Request: pick asset and point (or line for airstrikes). Validations: range, magazine > 0, cooldown, friendly fire warning inside the safety radius.
- Flow: request → delay (marker shown on map and in battle) → impact.
- Area damage kills zombies and hurts humans. Buildings take structural damage; at 0 HP they become rubble (`blocked` bit 4), kill whoever is inside the radius, and dirty the flow field.

### 4.9 Base and construction

- A base is created on a free 24×24 cell area with a command post. Structures go on base cells and need materials from **that base's** stock.
- Placement flow: pick structure → ghost preview (green/red) → validate terrain, obstacles and stock → reserve materials → builders arrive → progress → done. The engine rejects invalid commands with the same reason the UI shows.
- Progress requires at least 2 soldiers (or 1 engineer) within 10 m: `built += 1 / buildTime` per second.
- Structures must change navigation, cover and line of sight. A purely visual wall is not a finished feature.

### 4.10 Logistics and convoys

Resources are physical. Every soldier, vehicle, structure and base holds its own inventory; nothing is global.

- **Resources (MVP):** ammunition, fuel, construction materials, food. Post-MVP: split ammo into light and heavy, add medical supplies.
- **Consumption:** soldiers spend ammo by firing; vehicles spend fuel per metre; bases spend food per refugee per game hour.
- **Resupply [FACT: only at bases]:** a squad within 30 m of an ammo depot reloads 10 rounds per soldier per second; a vehicle at a fuel point gets 5% per second. A squad out of ammo far from a base stays out of ammo.
- **Convoys:** the player sets origin, destination, vehicles, cargo, priority, escort, preferred route and **risk policy** (on blocked road or ambush: `push_through`, `reroute`, `halt_and_call`, `return`). Trucks follow street routes; helicopters carry slung cargo without a route.
- Cargo is held by the vehicle while in transit. It is removed from the origin stock at departure and added to the destination stock only on arrival. A destroyed truck loses its cargo (optionally leaves a salvageable crate, post-MVP).
- An attacked convoy becomes `ambushed` and emits an event.

### 4.11 Districts and civilians

- **Pressure (0 to 1000)**, recomputed every 5 s:
  `pressure += zombiesInDistrict / 50 − playerFirepower / 20 − defensiveStructures × 2`, clamped.
- **States:** Hold (< 300), Crisis (300 to 799), Lost (≥ 800). Lost returns to Crisis only after pressure stays below 500 for 2 minutes.
- In Crisis, 0.5% of civilians turn per minute; in Lost, 3% per minute.
- Losing a district does not end the game but changes routes, logistics and threats around it.
- **Evacuation:** civilians travel by convoy to a base or to the port. On arrival, quarantine triage: isolate (uses capacity and food for 3 minutes), release (risk of outbreak inside the base), or execute suspects [FACT: the choice exists]. Execution can be disabled in the briefing; disabling removes the button and the rule.

### 4.12 The Choir (strategic AI) [FACT: ambushes convoys, cuts roads, besieges bases, hunts isolated units, with advance warning]

Separate from individual zombie AI. Every 5 s it scores targets and creates at most one new directive if it has enough will:

```text
will += 1 per second (cap 100)
score(convoy) = cargoValue / 10 + 20 if the route crosses a sector with density > 200
score(base)   = 30 + refugees / 5 − defensiveStructures × 3
score(unit)   = 40 if isolated (no ally within 150 m) and ammo < 30%
cost          = strength / 20
create the highest-scoring directive if score > 25 and will ≥ cost
```

- Inputs are limited to what the Choir can detect (noise, sightings, convoy routes it has observed), never the exact position of every player unit.
- Each directive has `warnAt` (player warning 20 to 40 s before) and `executeAt`. Executing moves sector density from neighbours to the target, or spawns zombies from inside buildings (capped at 10% of the district total). `cut_road` marks street cells blocked by wrecks.
- At most 3 directives active.
- Post-MVP: the Choir learns from the match history (repeated convoy routes, weakest walls).

### 4.13 Time

- Speeds: pause, 1x, 2x, 4x [FACT: up to 4x]. While paused the player can inspect and queue orders.
- All timers (AI, construction, consumption, reload, infection) use simulation ticks, never wall-clock time.

### 4.14 End of match and campaign hook

- **Victory (full scenario):** evacuate at least 30% of the initial population to the port and board the ship. **Defeat:** lose every base or the port.
- **Campaign hook [FACT]:** what reaches the port (troops, vehicles, refugees, stocks) becomes the starting state of the next region. In the MVP this is a summary screen that writes that state into the save.

## 5. Scenarios

### 5.1 "O Último Comboio" (vertical slice)

A small hand-authored or fixed-seed map used as the first fully playable scenario and as the integration test bed from M3 onward.

- Map 512×512 m (128×128 cells, 8×8 sectors), 4 districts.
- A military post shelters 40 civilians and is running out of ammo. A loaded truck sits at a depot across infected streets.
- Player has 2 squads of 6 soldiers, 1 cargo truck, materials for 4 defensive structure types.
- 200 active zombies, 3 escalating waves after the truck returns.
- **Victory:** bring the cargo back and survive 3 waves with at least one civilian alive. **Defeat:** command post destroyed or no unit able to defend.
- Restartable from the summary screen.

### 5.2 Porto Velário (full MVP)

Procedural city of 2,048×2,048 m, 4 to 6 districts, port on the waterfront, 60,000 zombies and 40,000 civilians at start. Victory and defeat as in 4.14.

## 6. UI

React over the canvas. One floating panel at a time; Esc closes the panel before cancelling the tool. All player text comes from i18n.

| Element | Content |
| --- | --- |
| Boot | logo, current step, progress bar |
| Main menu | New game, Continue, Load, Settings, Quit (desktop only); city simulating in attract mode behind |
| Briefing | scenario, seed, difficulty (initial zombies and Choir will), content warning, toggle for triage execution |
| Top bar | game clock and day/night, speed, soldiers, civilians saved, ammo and fuel summed across bases, fleet magazines |
| District list (left) | name, state color, pressure, civilians left; click centers |
| Alert feed (right) | Choir warnings with countdown, convoy ambushed, out of ammo, district fell; click jumps |
| Selection panel (bottom) | icon, health, ammo, fuel, current order, stance and formation buttons; grid for multi-select |
| Fire support menu (B) | assets with magazine, cooldown, delay, range; out-of-range disabled with reason |
| Build menu (G) | structures with cost and time; green/red ghost; base only |
| Base panel | stocks, refugees, build queue, New convoy |
| Convoy planner | origin, destination, vehicles, cargo, priority, escort, risk policy, suggested route with risky sectors highlighted |
| Quarantine triage | arrivals, suspects, isolate / release / execute (if enabled); pauses the game |
| Minimap | districts, units, view rectangle; hidden in map view |
| Direct-control HUD | crosshair, ammo, health, "TAB to exit"; hides the rest |
| Summary | result, civilians saved, casualties, zombies killed, what embarked |
| Settings | volume, language, internal resolution scale, agent cap, key bindings |

### Default controls (remappable through an `InputAction` layer)

| Action | Keys |
| --- | --- |
| Move camera | WASD, arrows, middle-drag |
| Zoom | mouse wheel |
| Rotate (battle) | Q/E or Alt+drag |
| Select | left click, drag box, double click selects all visible of the type |
| Context order | right click |
| Groups | Ctrl+1..9 assign, 1..9 select, twice to center |
| Pause | Space |
| Speed | F1, F2, F3 for 1x, 2x, 4x |
| Stance | Z hold, X aggressive, C defensive, V withdraw |
| Formation | F cycles |
| Fire support | B |
| Build | G |
| Direct control | TAB |
| Map toggle | M |
| Latest alert | Home |

Gamepad and Steam Deck are out of the MVP, but all input goes through `InputAction`.

Languages: pt-BR (default locale) and en. English is the source of the i18n key types.

## 7. Art and audio direction

- 3D pixel art [FACT]: the scene renders at a low internal resolution (270 px tall by default) and is upscaled with nearest filtering. Toon shading, depth/normal outline, palette quantization, light ordered dithering.
- MVP art can be procedural or simple low-poly; the low resolution hides detail. Until a final asset exists, use theme-colored primitives.
- Horde moaning is one continuous layer whose volume follows visible zombie count (3 levels), not one sound per zombie. 24 voice cap with priorities (explosion, player shot, alert, ambience).

## 8. Out of scope for the MVP

Multiplayer, full world campaign, aircraft carriers and complex fixed-wing flight, fully destructible buildings, component destruction, city generation from real data, generative AI at runtime, gamepad.

## 9. Beyond the MVP

| Version | Name | Content |
| --- | --- | --- |
| 0.1 | Vertical slice | "O Último Comboio" fully playable |
| 0.5 | City war | Porto Velário, multiple bases, armed vehicles, helicopters, fire support, the Choir, partial destruction, advanced logistics |
| 1.0 | World survival | campaign across regions, more factions, long supply chains, delegated officers, persistent strategic world |

Ideas to keep for later:

- **A horde that learns:** the Choir weights targets by the match history (weak walls, repeated convoy routes).
- **Delegated officers:** logistics, recon, engineering and defence officers that take goals and constraints and execute plans with classic AI (utility AI or GOAP), reporting results. A local LLM could later translate natural-language orders into structured, engine-validated plans, never controlling per-frame behaviour.
- **Emergent campaign:** situations arise from the simulation (fuel shortage, isolated civilians, broken comms, outbreaks) instead of scripted missions.
