# Balancing

Every value here is [EST] unless tagged otherwise, and lives in `packages/shared/src/balance/*.ts` (one file per table). When a value changes, update this file and add a line to the change log at the bottom with the reason.

Target feel: an idle National Guard squad that is never reached kills about 700 common zombies before running dry, but dies in under a minute if 30 zombies reach contact.

## Zombies (`balance/zombies.ts`)

| Kind | HP | Speed (m/s) | Damage per hit | Bite chance | Share |
| --- | --- | --- | --- | --- | --- |
| Common | 30 | 1.4 | 8 | 15% | 85% |
| Runner | 20 | 4.0 | 6 | 15% | 10% |
| Brute | 120 | 1.0 | 20 | 10% | 5% |

Perception radius 25 m (line of sight); chase on noise > 40; attack range 1.2 m; one hit per 1.0 s.

## Weapons (`balance/weapons.ts`)

| Weapon | Range (m) | Shots/s | Damage | Accuracy | Area radius (m) | Ammo per soldier |
| --- | --- | --- | --- | --- | --- | --- |
| Rifle | 60 | 2 | 34 | 0.55 | 0 | 180 |
| Light machine gun | 80 | 8 | 30 | 0.35 | 0 | 500 |
| Shotgun (police) | 15 | 1 | 60 × 6 pellets | 0.5 | 0 | 40 |
| .50 HMG (vehicle) | 150 | 8 | 80 | 0.4 | 0 | 1,200 |
| 25 mm cannon | 300 | 3 | 120 | 0.6 | 2 | 600 |
| 120 mm tank gun | 400 | 0.15 | 400 | 0.8 | 8 | 40 |
| 30 mm (attack helicopter) | 500 | 10 | 100 | 0.4 | 3 | 1,200 |

Noise: shot 60 within 55 m; explosion 200 within 150 m; decay 10% per tick.

## Squads (`balance/units.ts`)

| Kind | Soldiers | HP each | Weapons | Speed (m/s) | Availability |
| --- | --- | --- | --- | --- | --- |
| National Guard | 8 | 100 | 7 rifles, 1 LMG | 3.0 | start |
| Police | 6 | 80 | 4 shotguns, 2 rifles | 3.2 | start |
| Marines | 10 | 120 | 8 rifles, 2 LMGs | 3.0 | reinforcement every 6 min |

The vertical slice uses two squads of 6 (5 rifles + 1 LMG).

## Vehicles (`balance/vehicles.ts`)

| Vehicle | HP | Speed (m/s) | Weapons | Passengers | Cargo | Fuel per km |
| --- | --- | --- | --- | --- | --- | --- |
| Light utility (Humvee) | 400 | 20 | .50 | 4 | 0.5 t | 2% |
| Wheeled APC (LAV) | 900 | 18 | 25 mm | 6 | 0 | 3% |
| Tracked IFV (Bradley) | 1,200 | 12 | 25 mm | 6 | 0 | 4% |
| Tank | 3,000 | 11 | 120 mm + .50 | 0 | 0 | 6% |
| Cargo truck (hooklift) | 500 | 15 | none | 2 | 8 t or 20 refugees | 3% |
| Transport helicopter | 600 | 50 | 2 LMG | 11 | 4 t slung | 5% |
| Attack helicopter | 800 | 60 | 30 mm + rockets | 0 | 0 | 6% |

## Fire support (`balance/support.ts`)

| Asset | Delay (s) | Radius (m) | Damage | Initial magazine | Cooldown (s) | Range |
| --- | --- | --- | --- | --- | --- | --- |
| 155 mm howitzer battery | 25 | 25 | 600 | 60 rounds | 10 between salvos | 20 km from base |
| Rocket launcher | 40 | 60 | 1,000 | 12 | 60 | 60 km |
| 5" naval gun | 20 | 20 | 500 | 300 | 3 | 20 km from ship |
| Cruise missile | 90 | 80 | 3,000 | 8 | 120 | whole city |
| Airstrike (fighter) | 60 | line 200 × 30 | 800 | 12 sorties | 180 | whole city |
| Gunship (orbit) | 45 | 15 per shot | 200 | 1 orbit of 120 s | 600 | whole city |
| Drone (vision orbit) | 30 | vision 300 | 0 | 2 orbits of 300 s | 300 | whole city |

## Structures (`balance/structures.ts`)

Implemented in v0.1 (values in code). HP counts zombie attacks (1 per attack, 1 attack/s per zombie). Materials are base stock units (base starts with 400).

| Structure | Cells | Height (m) | HP | Materials | Build time (s) | Effect |
| --- | --- | --- | --- | --- | --- | --- |
| HESCO barrier | 1 × 1 | 2.2 | 300 | 20 | 15 | blocks movement, not sight; climbable with pile 5 |
| Concrete wall | 1 × 1 | 3.5 | 600 | 40 | 30 | blocks movement and sight; climbable with pile 7 |
| Gate | 1 × 1 | 3.0 | 450 | 30 | 25 | open/close (G); closed blocks movement and sight |
| MG nest | 1 × 1 | 1.2 | 250 | 35 | 20 | crewed: 9 shots/s, 45 m, 60% base accuracy, 35 dmg, fires over walls, uses base ammo |

Planned (not implemented yet):

| Structure | Cells | Height (m) | HP | Materials (t) | Build time (s) | Effect |
| --- | --- | --- | --- | --- | --- | --- |
| Scaffold | 1 × 1 | 3.0 | 200 | 0.3 | 8 | soldiers fire from the wall top |
| CIWS | 2 × 2 | 3.0 | 800 | 3.0 | 60 | auto cannon, 50 shots/s, 100 m, 3,000 rounds |
| Mortar pit | 2 × 2 | 0 | 400 | 1.0 | 20 | indirect fire 50 to 1,500 m, radius 10 m |
| Ammo depot | 3 × 3 | 2.5 | 600 | 2.0 | 30 | resupply point, 50,000 rounds |
| Fuel point | 3 × 3 | 2.0 | 400 | 2.0 | 30 | refuels vehicles, 20,000 L |
| Light tower | 1 × 1 | 8.0 | 150 | 0.3 | 8 | lights 40 m at night |

## Logistics (`balance/logistics.ts`)

| Value | Slice |
| --- | --- |
| Resupply radius | 30 m from a base or depot |
| Resupply rate | 10 rounds per soldier per second |
| Cargo truck | 400 HP, 7 m/s, 6,000 rounds or 400 materials |
| Blocked when | 4 zombies within 3 m ahead |
| Push through | 35% speed, 12 damage per tick to zombies at the bumper |
| Reroute | zombie cells cost +120; gives up after 6 s blocked |
| Truck noise | 45 within 25 m |

## Mission "O Último Comboio" (`balance/mission.ts`)

| Value | Slice |
| --- | --- |
| Civilians | 40 (scale with command post HP: 800) |
| Base stock at start | 300 rounds, 160 materials |
| Truck cargo | 4,000 rounds, 240 materials |
| Waves | 60, 100, 150 zombies |
| Warning | 20 to 40 s; 20 s calm between waves |
| Wave spawn | at least 200 m from the base |
| District lost | control 0; drops 1/s at 5:1 zombies to soldiers (15+ zombies) |

## Squad tactics (`balance/tactics.ts`)

| Constant | Value | Effect |
| --- | --- | --- |
| Stagger per non-lethal hit | rifle 0.4 s, LMG 0.3 s, shotgun 0.9 s (brutes half) | zombie moves at 15% speed and cannot attack; sustained fire holds a line back |
| Fire distribution | +80% effective distance per squadmate already on a target | a squad spreads fire over the front instead of all on the nearest |
| Cover | walkable cell next to a wall, barrier, closed gate or building | hit chance ×1.15, stress gain ×0.55 |
| Cover search | 2 cells around each slot, obstacle on the enemy side, every 1 s | only while holding in `hold` or `defensive` stance |
| Stress gain | 3/s per zombie within 8 m (max 10), +6/s out of ammo, +1/s in the dark | ×0.75 with 3+ squadmates within 10 m |
| Stress shocks | bitten 30, squadmate down 22 (others nearby 11), squadmate bitten 12 (6) | within 15 m |
| Recovery | 8/s with no zombie within 8 m, 16/s at a lit base or depot | |
| Nerve | hit chance −35% at full stress | |
| Panic | at 92 stress: runs from the nearest zombie for 3 s, holds fire; then stress ≤ 60 and no new panic for 30 s | the player keeps control in direct mode |
| Contact call | `squad_contact` on first engagement, then at most every 30 s per squad | radio blip and alert |
| Suppress stance (T) | fire ×1.5 at 85% hit chance; every burst staggers all infected within 3 m of the target for 2× the weapon's stagger | holds a crowd back; burns ammunition |
| Firing on the move | half the fire rate (and hit chance ×0.6) | walking into contact costs; stop and hold |
| Flank and rear | a zombie within 8 m behind the squad's front counts 2.5× for stress | a squad caught from behind breaks |

## Difficulty (`balance/difficulty.ts`)

Veteran is the reference; every other table in this file is tuned for it. Chosen on the briefing, fixed for the game and stored in saves.

| | Recruit | Veteran | Nightmare |
| --- | --- | --- | --- |
| Zombies in the city at start | ×0.7 | ×1 (200) | ×1.3 |
| Wave size | ×0.65 | ×1 (60, 100, 150) | ×1.4 |
| Wave warning | +15 s | 20 to 40 s | −10 s (at least 5 s) |
| Zombie damage | ×0.7 | ×1 | ×1.25 |
| Bite chance | ×0.5 | ×1 | ×1.4 |
| Stress gain | ×0.7 | ×1 | ×1.25 |
| Base materials / ammo | +80 / +300 | 160 / 300 | −40 / −100 |

## World and AI (`balance/world.ts`)

| Constant | Value |
| --- | --- |
| Tick | 0.1 s (10 Hz) |
| Initial zombies, full city | 60,000 |
| Initial civilians, full city | 40,000 |
| Agent pool capacity | 16,384 |
| Day/night cycle | 20 game minutes; vision −50% at night without light |
| Choir directive interval | 5 s; max 3 active |
| Warning before an attack | 20 to 40 s |
| Turn time after bite | 60 to 180 s |
| Rise time after death by zombie | 20 s |

## Presentation (`balance/presentation.ts`)

Cosmetic values only; these do not change visibility, combat, clocks or the world hash.

- Post saturation: 1.04. Shadow gain: up to 20%, fading to zero at linear luminance 0.35.
- Outline blend: 0.62 in tactical/direct, smoothly falling to 0.28 in strategic view.
- Vignette: 0.18 in tactical/direct, 0.08 in strategic view.
- Sky reaches its zenith colour at world-space ray elevation 0.65.
- Facade detail fades between projected footprints of 0.25 and 0.75 pattern periods per pixel.
- **Mission moods** (`MOODS`, `MISSION_MOOD`): multipliers on the light, the sky and the final
  image, plus a saturation scale and extra vignette. All within 0.7–1.15 so every mood stays readable.

  | Mission | Mood | Look | Saturation | Vignette |
  | --- | --- | --- | --- | --- |
  | O Último Comboio | amber | last warm light | ×1.06 | +0.04 |
  | Hospital São Lucas | overcast | flat, cold, washed out | ×0.78 | +0.06 |
  | A Ponte | haze | blue river haze | ×0.86 | +0.05 |
  | Retomar a Ribeira | ember | smoke over a burning district | ×1.10 | +0.10 |
  | Linha de Suprimento | dust | dry yellow dust | ×0.88 | +0.03 |
  | Plantão Noturno | sodium | teal shadow under orange lamps | ×1.12 | +0.10 |
  | O Último Trem | storm | heavy steel sky | ×0.74 | +0.14 |
  | Survival, sandbox | clear | unchanged | ×1.00 | +0 |

- **End of mission** (`OUTCOME_GRADE`, eased over 2.5 s): defeat drains saturation to ×0.30 and adds
  0.30 vignette; victory lifts saturation to ×1.12 and the camera circles at 0.04 rad/s.
- **Opening** (`SCENES`): the view starts 320 m wide and closes to 110 m in 4 s; the title shows 5 s.
- Special infected are marked by a ground diamond scaled with the unit size: runner `#f2d14a`,
  brute `#c06bff`, Gritador `#ff5a3c` (the scream colour), Inchado `#a9b84a` (the bile colour).
- Lighting colours remain in the renderer's `palette.ts`: daytime zenith `#657e91`, horizon/fog
  `#aaa99b`, ground bounce `#655b4e`; night horizon/fog `#2b3446`.

## Veterancy (`balance/veterancy.ts`)

Campaign roster soldiers earn experience between missions; rank is applied in the simulation.

| Rank | Experience | Hit chance | Stress taken |
| --- | --- | --- | --- |
| Recruit | 0 | +0 | ×1.00 |
| Private | 25 | +0.02 | ×0.92 |
| Corporal | 75 | +0.04 | ×0.84 |
| Sergeant | 175 | +0.06 | ×0.76 |
| Veteran | 350 | +0.08 | ×0.68 |

Experience: 1 per infected killed, plus 15 for surviving a won mission or 5 for a lost one. The
hit-chance bonus is added after the other factors, like the direct-control bonus. Dead, turned
and bitten soldiers leave the roster at the end of the mission.

## Operation (`balance/operation.ts`)

A run of five city missions on one city; each won mission offers three requisitions, one is taken.

| Value | Number | Effect |
| --- | --- | --- |
| Missions per run | 5 of 6 | drawn from the city missions (not O Último Comboio), order by the run's seed |
| Threat per mission | recruit +0.20, veteran +0.12, nightmare +0.06 | wandering zombies, waves, pressure and hunting groups; fifth mission ×1.80, ×1.48, ×1.24. The daily operation is veteran |
| Hunting groups | 125 per ×1 above ×1, every 60 s | stages with no pressure of their own (reach, secure, convoy, retake) send driven zombies at the task force or the convoy truck once it is 350 m from the base: 15 at ×1.12, 60 at ×1.48. None while two groups are still alive; a hunter 300 m from every soldier and the truck leaves the map |
| Ammunition drop | +800 | base ammunition, next mission |
| Engineering supplies | +150 | base materials, next mission |
| Aerial recon | −20 % | the next mission's threat: wandering zombies, waves and pressure groups |
| Field drill | +25 xp | every living soldier, at once |
| Seasoned replacements | 25 xp | the next mission's recruits start as privates |

Score: 1,000 per won mission plus 250 for each mission before it (1,000, 1,250, … 2,000), 1 per
infected killed, and 50 per soldier alive when all five are won. The daily operation is always at
veteran difficulty.

## Change log

| Date | Value | Old → new | Reason |
| --- | --- | --- | --- |
| 2026-11-12 | M8 visual readability | subtractive contrast → black-preserving shadow gain; outline 0.85 → 0.62/0.28; vignette 0.35 → 0.18/0.08; saturation 1.1 → 1.04 | keep shadow detail and reduce distant edge noise without changing simulation or internal resolution |
| 2026-10-26 | — | — | initial tables from the Vazante spec |
| 2026-10-26 | structure HP | thousands → 250..600 zombie attacks | HP is counted in attacks; old values made walls immortal |
| 2026-10-26 | structure footprint | 2×2 nest, 2×1 gate → 1×1 | one cell per piece for the slice; multi-cell later |
| 2026-10-26 | flow penalty for structures | — → 200 (20 cells) | horde detours around short walls and besieges long ones |
| 2026-10-26 | cargo truck | 500 HP, 15 m/s, 8 t → 400 HP, 7 m/s | the truck has to be escorted; at 15 m/s it outran every threat |
| 2026-10-27 | squad tactics | — → table above | suppression, fire distribution, cover and morale; line battle still 10 of 10 |
| 2026-10-27 | difficulty | — → three levels | recruit for the tutorial and new players, nightmare for veterans of the slice |
| 2026-10-29 | tactical decisions | — → suppress stance, fire on the move ×0.5, rear stress ×2.5, shot noise 40 → 55 m, rifle ammo 210 → 180, LMG 600 → 500 | the balance bot, which only moves and shoots, won all four missions at veteran with 0 to 3 hits taken; now it loses or bleeds on A Ponte, and a bot that uses suppression there wins |
| 2026-10-29 | Retomar a Ribeira | pressure 35/45/55 → 55/70/85, waves 180/260/340 → 280/400/520 | four squads walked through it with no losses |
| 2026-10-29 | strategic point area | site rectangle + 40 m → circle reaching 40 m past the longer side (r 76 m depot, 88 m base) | the area is drawn on the ground and the minimap as a circle; in economy modes districts no longer raise alerts or count as a goal |
| 2026-10-29 | truck wreck | destroyed truck removed, mission lost → wreck keeps its cargo; 3 engineers repair it in 40 s to 50 % HP; the mission fails only if civilians aboard die or no engineer is left (and no held station) | losing the only truck ended the game with no way back |
| 2026-10-29 | engineer repairs | — → 3 HP/s per engineer, 3 at most, on any damaged structure | engineers get a role of their own beyond building |
| 2026-10-29 | field MG nest | drew on base stock anywhere → own box of 1500 rounds outside every base, topped up by an idle truck within 15 m | a nest far from the base should run dry and need supplying |
| 2026-10-29 | truck at the station | — → 200 materials, 3 trucks at most; replaces a wrecked mission truck | a second way to get a truck back |
| 2026-10-29 | Porto Velário layout | fixed river, base and depots → per seed: river course, base along the middle half of the shore, depot 360–500, hospital 330–480, station 170–300 cells from the base, each in its own district; block length, avenue rhythm and park share vary | "generate another city" barely changed the map: the points were always in the same place |
| 2026-10-30 | depot spacing | ≥ 30 cells between rectangles → ≥ 600 m between centres and ≥ 35° apart in bearing from the base, loosened to 500 then 400 m, else the old fixed layout | two points could land 150–200 m apart across a district boundary; over 200 seeds the closest pair is now 783 m |
| 2026-10-30 | survival day | 40 → 30 min (still from 08:00) | Diogo found 40 min too long; 20 min was too short |
| 2026-10-30 | wall climbing | PILE_UNIT_M 0.5 → 0.25 (14 stacked zombies top a 3.5 m wall, 9 a hesco); once climbable, one zombie per wall cell per second (CLIMB_INTERVAL_S 1); base ammo alerts below 800 and at 0 | Diogo saw hordes pour over walls: 7 zombies were enough and the whole pile went over at once, while the base sat at 0 ammo without warning. Bot at veteran unchanged: night shift, last convoy, hospital 3/3, bridge 2/3, survival 4 nights |
| 2026-10-30 | horde routing | flow field ignores zombies → each zombie beyond the first in a cell adds 10 (one cell of walking) to it, up to 80; lane lean 0.15 → 0.3 and slack 10 → 20 | Diogo saw the whole horde file through one gap in a single line; now a queue makes going round or hitting another stretch of wall look shorter. Bot at veteran: night shift, last convoy, hospital, bridge 3/3 |
| 2026-11-14 | Operation threat | scales wandering zombies only → also every wave and pressure group; +0.12 per mission unchanged | with only the wandering horde scaled the bot won the same missions at ×1.48 as at ×1.00 and five of six whole Operations with 0 to 5 fallen; scaled waves cost it 5 to 13 of 17 on A Ponte at ×1.36 and ×1.48 |
| 2026-11-15 | truck and infantry | infantry never moves for a truck → steps aside at 6 m/s when a truck waits for it; a truck stopped inside its destination parks there (2026-11-14) | a soldier placed in front of the bumper and the truck waited for each other for ever; three of six bot Operations stood still on a convoy stage, and all six now reach a real ending |
| 2026-11-16 | Operation hunting groups | none → 100 driven zombies per ×1 of threat above ×1 every 60 s on reach, secure, convoy and retake stages, started beyond the task force and never within 350 m of the base | only A Ponte felt the threat: the other four missions lost almost nobody even at ×1.72; now Linha de Suprimentos costs 1 to 8 and O Último Trem 0 to 3 late in a run |
| 2026-11-18 | A Ponte pressure, hunting groups | A Ponte pressure grow 0.2 → 0.1 per group; hunting groups 100 → 125 per ×1 of threat | A Ponte was all or nothing (the last groups outran what 17 soldiers can kill: 568 at once at ×1.48) and decided every lost Operation; smoothed, the threat is spread: six bot Operations lost 5 to 25 soldiers on four different missions. Campaign A Ponte at ×1: still 6/6, 0 lost |
| 2026-11-19 | Operation threat by difficulty | +0.12 for every difficulty → recruit +0.20, veteran +0.12, nightmare +0.06 | with one step recruit won six Operations of six losing 1 to 3 soldiers each and nightmare won none, three of them gone in the first two missions; now recruit 6/6 losing 1 to 12, nightmare 2/6 |
| 2026-11-22 | hunting groups on long missions | no limit → no new group while two are alive; a hunter left 300 m behind every soldier and the truck leaves the map | Linha de Suprimentos (about 45 minutes) piled up 290 hunters at once at ×1.48 and lost 6 of 6; at ×1.24, 3 of 6 lost the command post to slow hunters the squads had outrun. Now ×1.24 wins 6/6, ×1.48 2/6, and veteran Operations lose 5 to 19 soldiers instead of 5 to 25 |

### 2026-11-12 — architecture presentation tuning

Cosmetic settings in `balance/presentation.ts`: body inset 0.3 m, trim projection 0.12 m,
cornice height/width 0.28/0.24 m, facade floor spacing 3 m, shop lintel 2.6 m, neighbourhood
size 16 cells. Industrial variants require height at most 12 m and both dimensions at least
8 m. Up to three residential sill rows or three civic columns; at most 12 detail boxes per
building. Wear ranges from 0.12 to below 0.42. Fine material detail fades at projected
footprints of 0.12–0.65 m/pixel, with grain strength 0.12 and pavement tiles of 0.75 m.
These are new appearance controls; simulation balance is unchanged.

### Solid scenery and vehicle collision (2026-11-12)

New controls in `balance/collision.ts`: soldier radius 0.3 m, sweep step at most 0.15 m,
truck body 7×2.5 m. Solid tents, containers, tanks and car wrecks reserve 8×4 m; barriers and
sandbags reserve 4×4 m. Models fit within those footprints. Site deployment clearance is 8 m,
with at most eight tents. Objects previously placed independently by the renderer now reserve
real cells on vacant lots. Road cells remain open. Tents currently have no traversable interior.

This changes navigation and movement, not resource costs, unit stats or damage. Trucks yield to
infantry rather than overlapping it. The separate static-prop flag is not a climbable structure.

### 2026-11-12 — bounded architectural reference block

Presentation only: the nearest building to the base anchors a cluster with a 40 m half-extent.
Roof rise is at most 2.4 m or 25% of building height; setbacks are at most 1.2 m or 25% of the
narrower footprint. Residential and industrial buildings up to 15 m use gables. Ground-floor plinths are 0.45 m
high, canopies 0.5 m deep and 65% of facade width. The detail budget rises from 12 to 20 boxes
per building in this prototype. Existing sidewalk cells around the cluster use staggered
4-texel slabs (2 m at the current ground-texture density), joint shade 0.84 and colour variation
±0.035. No occupied cells, terrain kinds, sight-blocking heights or gameplay balance change.

### 2026-11-12 — abandoned-car distribution

Scan every vacant lot cell instead of sampling every third cell for cars. Candidate hashing uses
modulo 11, with 24 m minimum spacing and one new car per 32-cell sector. Cars require two free
lot cells adjacent to a street or sidewalk and keep the two-cell exclusion around bases/depots.
Existing sparse dressing remains. This restores cars without occupying streets or sidewalks;
existing saves retain their saved placements.

### Direct-camera obstruction (2026-11-12)

Camera clearance is 0.6 m around building envelopes. The default offset is 12 m behind,
8 m above ground, measured from a 1.5 m target. Obstructions retract the camera immediately;
return to the full offset eases over 0.3 s. Presentation only.

### Close direct-camera visibility (2026-11-12)

Hide the controlled soldier's rendered body and selection ring below 2.5 m camera-to-target
separation; restore above 3 m to avoid oscillation at the threshold. Applies to both the baked
model and procedural fallback. Simulation state, other soldiers and camera obstacle clearance
are unchanged. This keeps the camera from looking through its own soldier at tight walls.

### City-wide architecture (2026-11-12)

Apply the validated roof profiles city-wide. Waterfront visual anchors search within 12 cells
of a base for water. Landmark bands increase the detail budget to 22 boxes per building;
all parts stay below the authoritative height and within the occupied footprint.

### Image cleanup (2026-11-12)

Surface ordered-dither amplitude decreases from 0.5 to 0.22. Perspective sky and fully fogged
surfaces keep smooth gradients instead of colour quantization; intermediate fog blends the two.
Facade detail now fades at 0.18–0.55 projected window periods (previously 0.25–0.75), and glass
variation converges to its mean at distance. Black map background and world visibility remain intact.

### 2026-11-13 — campaign roster and veterancy

New table `balance/veterancy.ts` (above). Survivors of a mission now carry over with experience and
rank, so the campaign rewards keeping soldiers alive and losses cost something beyond the mission.
The balance bot plays without a roster (every soldier a recruit), so its results are unchanged; a
fully veteran infantry squad facing 300 commons (five seeds) killed the same number as recruits but
fired 12–25 % fewer rounds (481–522 against 579–643), on top of steadier nerves: rank saves ammo, the
resource the campaign is built around. Reaching it takes several missions of keeping people alive.

### 2026-11-13 — Operation mode

New table `balance/operation.ts` (above). The threat ramp and the requisition sizes are first
guesses and have not been through the balance bot: the bot plays single missions, and only the
pressure of the wandering horde grows, not the waves or the pressure groups. The fifth mission at
×1.48 is meant to be hard with a weakened task force; playtest logs will show where runs end.

### 2026-11-14 — Operation through the balance bot

`pnpm balance operation veteran 6` plays whole Operations (cities 1001 to 1006) with the scripted
commander: the run's own task force, the threat ramp and one requisition after each win (ammunition
first, then replacements, drill, recon, materials). `SEED0` and `THREAT` do the same for one mission.

What it found, in order:

- **Hospital São Lucas could not be finished.** Not balance: a truck stopped for the squad standing
  on its parking spot and never arrived, so the evacuation never began (fixed in the simulation, see
  the commit `[FIX] convoy`). The bot had gone from 3/3 to 0/3 since the 2026-11-12 collision change.
- **The bot stood in front of its own truck** on Linha de Suprimentos and ran out the clock. Its
  escort now walks 20 m behind and its limit is 60 minutes (the mission takes 38 to 46).
- **The ramp did nothing.** Scaling only the wandering horde, single missions at ×1.48 ended like
  ×1.00 (15 of 18 won or still going in both, cities 1001 to 1003, before the hospital fix), and whole Operations
  ended 5 of 6 won with 0 to 5 soldiers fallen in the run. The one not won was the bot standing still.

The threat now multiplies every wave and pressure group as well. Same six Operations after that:

| City | Result | Fallen in the run | Where it turned |
| --- | --- | --- | --- |
| 1001 | won 5/5 | 17 | A Ponte ×1.48: 10 of 17 lost |
| 1002 | 4/5, bot stalled | 6 | A Ponte ×1.36: 5 of 17 lost; O Último Trem ×1.48 not finished in 60 min |
| 1003 | 2/5, bot stalled | 7 | O Último Trem ×1.24 not finished in 60 min, nobody lost there |
| 1004 | 2/5, bot stalled | 15 | Retomar a Ribeira ×1.12: 14 of 31 lost; Linha de Suprimentos not finished |
| 1005 | lost 2/5 | 19 | A Ponte ×1.24: all 17 lost |
| 1006 | won 5/5 | 17 | A Ponte ×1.48: 13 of 17 lost |

Missions one and two are as before (0 to 3 lost, apart from Retomar a Ribeira on city 1004); from
the third on the task force bleeds, and A Ponte late in a run is the mission that decides it. That
is the shape wanted for a commander who never builds, so +0.12 per mission stays. Requisition sizes
were not tuned: the bot always takes ammunition and never ran dry, which says little about the others.

Not settled: three of the six runs ended with the bot standing still on a convoy stage (O Último
Trem twice, Linha de Suprimentos once), not with a defeat, so the sample of real endings is three
runs. A Ponte carries most of the difficulty; whether that is the mission or the bot holding a
bridge badly is not known. Recruit and nightmare were not played.

### 2026-11-15 — infantry steps aside for a waiting truck

The three runs above that did not finish were one defect, and not the bot's alone: a soldier whose
place in the formation was in front of the bumper waited for the truck to leave, and the truck
waited for the soldier. New control in `balance/collision.ts`: `stepAsideSpeed` 6 m/s, the speed at
which infantry in the way of a waiting truck moves off to the nearer side. It is above every squad's
walking speed on purpose, so a soldier ordered to hold that spot still clears the lane. A soldier
under direct control is left to the player, and one who is down does not move: he still blocks.

The same six Operations (veteran, cities 1001 to 1006), now all played to a real ending:

| City | Result | Fallen in the run | Where it turned |
| --- | --- | --- | --- |
| 1001 | won 5/5 | 17 | A Ponte ×1.48: 10 of 17 lost |
| 1002 | won 5/5 | 10 | A Ponte ×1.36: 5 of 17 lost; O Último Trem ×1.48: 4 of 27 |
| 1003 | won 5/5 | 23 | A Ponte ×1.48: 11 of 17 lost |
| 1004 | won 5/5 | 31 | Retomar a Ribeira ×1.12: 14 of 31 lost; Turno da Noite ×1.36: 16 of 21 |
| 1005 | lost 2/5 | 19 | A Ponte ×1.24: all 17 lost |
| 1006 | lost 4/5 | 26 | A Ponte ×1.48: all 17 lost |

Four of six won, each at a cost of 10 to 31 soldiers, and both defeats are A Ponte. Hospital São
Lucas, O Último Trem and Linha de Suprimentos never cost more than 5 at any threat. So the ramp
does its work, but one mission decides the run: an Operation that draws A Ponte early or last is
much harder than one that does not. +0.12 per mission stays; A Ponte is the thing to look at next
(the bot holds the bridge in the open and never builds, so part of this is the bot).

Still not done: requisition sizes, recruit and nightmare.

### 2026-11-15 — why A Ponte decided the run

Part of it was the bot. A Ponte gives the task force a truck with 3,000 rounds and the scripted
commander left it at the base. It now takes a truck that no stage asks for along with its first
squad. A Ponte alone, veteran, cities 1001 to 1006, won of six:

| Threat | Truck left at the base | Truck with the squads |
| --- | --- | --- |
| ×1.00 | 6, with 0 to 14 lost | 6, with 0 or 1 lost |
| ×1.24 | 5 | 5 |
| ×1.36 | not played | 4 |
| ×1.48 | 2 | 3 |

It is all or nothing: the bridge is held with almost nobody lost or all 17 die, and they die in the
last minute, when the pressure groups are largest (120 growing by 20 % each, times the threat: 568
in the last group at ×1.48). The "ammunition at zero" in those runs is not a cause: the counter
adds up the living, so it reads zero when everyone is dead.

Whole Operations with the truck, same six cities:

| Threat per mission | Won | Fallen per run | Lost where |
| --- | --- | --- | --- |
| +0.12 (kept) | 6 of 6 | 1, 1, 5, 5, 19, 20 | — |
| +0.18 (tried, not kept) | 3 of 6 | 3, 18, 20, 20, 20, 22 | A Ponte at ×1.72, three times, always as the last mission |

The rest of it is the missions. At +0.18 the other four did not notice the threat: O Último Trem
at ×1.72 lost nobody, Turno da Noite at ×1.54 nobody, Linha de Suprimentos at ×1.72 two. Every
soldier lost to the ramp is lost on A Ponte, whose pressure is the largest in the game and grows.
A steeper ramp only turns "A Ponte last" into a certain defeat and leaves the other runs as easy
as before, so the step stays at +0.12.

Open, and a design choice more than a number: with this commander four of the five missions in a
run do not get harder, so an Operation is easy unless it draws A Ponte late. Making the threat
bite everywhere needs something those missions feel (more driven groups on their convoy and hold
stages, less warning before waves, or a threat weight per mission), not a larger multiplier.

### 2026-11-16 — hunting groups

New row in the Operation table: while the threat is above ×1, a stage with no pressure or waves of
its own sends a group of driven zombies at the task force (at the truck during a convoy) every
60 s. How big, where they start and when they stop mattered more than how many:

- They start on streets 120 to 220 m from their quarry and **farther from the base than it is**.
  Driven zombies go for the nearest soldier, truck or command post; groups started between the
  task force and the base went for the truck parked there or the undefended command post instead.
  In the first tries that lost Linha de Suprimentos four times in six (command post down in the
  first six minutes) and O Último Trem twice (the evacuation truck wrecked at the base, all 27 dead).
- Nobody is hunted closer than 350 m to the base, for the same reason.
- Left-over hunters stop being driven when the stage ends, like pressure groups.

Same six Operations, veteran, cities 1001 to 1006, with the truck brought along:

| | Won | Fallen per run |
| --- | --- | --- |
| No hunting (2026-11-15) | 6 of 6 | 1, 1, 5, 5, 19, 20 |
| Hunting groups | 5 of 6 | 4, 6, 8, 16, 16, 19 |

The defeat is A Ponte at ×1.48 as the last mission. Linha de Suprimentos now costs 1 to 8 soldiers
and O Último Trem 0 to 3; both cost 0 to 2 before. It is a first step: the other missions now feel
the threat a little, A Ponte is still where runs are lost. Group size was not tuned beyond 100.

### 2026-11-18 — A Ponte smoothed, hunting groups 125

A trace of A Ponte lost at ×1.48 (city 1003) shows why it was all or nothing: driven zombies on
their way to the bridge went 391, 1,428, 2,468 at three, five and six minutes while the 17 soldiers
killed 534 in all. The hold is a race against the last, largest groups (120 growing 20 % each), not
a fight; the threat only made them arrive before the 300 s ran out.

A Ponte's pressure now grows 10 % per group. Alone, veteran, cities 1001 to 1006, won of six:

| Threat | Grow 0.2 | Grow 0.1 |
| --- | --- | --- |
| ×1.00 | 6, with 0 or 1 lost | 6, none lost |
| ×1.24 | 5 | 5 |
| ×1.48 | 3 | 5, with 0 to 14 lost |

City 1003 loses it at every threat above ×1 with either number: that bridge's layout, not the
growth. Smoothing it alone would make Operations easy again, so the hunting groups went up.
Six Operations, veteran, the same cities:

| Hunting groups | Won | Fallen per run | Lost on |
| --- | --- | --- | --- |
| 100, A Ponte grow 0.2 | 5 of 6 | 4, 6, 8, 16, 16, 19 | A Ponte ×1.48 |
| 150, grow 0.1 (tried) | 1 of 6 | 3 to 26 | Linha de Suprimentos four times, Turno da Noite once |
| 125, grow 0.1 (kept) | 5 of 6 | 5, 5, 11, 17, 19, 25 | Linha de Suprimentos ×1.48 |

At 125 the soldiers a run costs come from four missions (Linha de Suprimentos 2 to 7, A Ponte 0
to 13, Turno da Noite 15 once, O Último Trem 0 to 5), and no single mission decides it. Hunting is
steep: 150 lost runs on Linha de Suprimentos, the longest mission (about 45 minutes, so about 40
groups), which is the first thing to cap if playtests show it as the new wall.

### 2026-11-19 — difficulty and requisitions

Six Operations each, cities 1001 to 1006. `REQS=a,b,c` makes the bot take requisitions in another
order (default: ammunition, replacements, drill, recon, materials).

| Run | Won | Fallen per run |
| --- | --- | --- |
| Recruit, +0.12 per mission | 6 of 6 | 1, 2, 2, 2, 2, 3 |
| Recruit, +0.20 (kept) | 6 of 6 | 1, 4, 4, 8, 8, 12 |
| Veteran, ammunition first (reference) | 5 of 6 | 5, 5, 11, 17, 19, 25 |
| Veteran, recon and drill first | 5 of 6 | 0, 5, 6, 9, 17, 19 |
| Veteran, materials first, ammunition last | 4 of 6 | 6, 6, 6, 9, 19, 28 |
| Nightmare, +0.12 per mission | 0 of 6 | 22 to 33, four with nobody left |
| Nightmare, +0.06 (kept) | 2 of 6 | 14 to 33 |

- **Difficulty.** One step for all made recruit trivial and nightmare hopeless, so the step is per
  difficulty. Nightmare stays very hard for this commander: two runs die on Hospital São Lucas as
  the first mission, at ×1, where no ramp acts. That is campaign nightmare, not the Operation.
- **Requisitions.** They matter little to a commander that never builds: leaving ammunition for
  last costs one run in six, recon and drill instead of ammunition change nothing. Sizes are
  unchanged; materials are worth nothing to this bot by construction, so it cannot judge them.

### 2026-11-22 — hunting groups on Linha de Suprimentos

Linha de Suprimentos is the longest mission (about 45 minutes, four hunted stages), and the bot
lost it whenever it came late in a run. Alone at a fixed threat, cities 1 to 6:

| Threat | No limit | Cap only | Cap, lost hunters ordinary | Cap, lost hunters leave (kept) |
| --- | --- | --- | --- | --- |
| ×1.00 | 6 of 6 (0 to 6 lost) | | | |
| ×1.24 | 3 of 6 | 4 of 6 | 5 of 6, one stuck at 60 min | 6 of 6 |
| ×1.48 | 0 of 6 | 2 of 6 | 0 of 6 | 2 of 6 |

- **Pile-up.** A group came every minute whether or not the last one was dead: on the convoy at
  ×1.48 the driven zombies went from 60 to 290 while the squads ran out of ammunition. No new group
  comes while two groups' worth are alive.
- **Command post.** The ×1.24 losses were the command post, 1.8 km behind the squads, eaten by ten
  hunters. Driven zombies never give up, most walk at 1 to 1.4 m/s against about 3 m/s for a
  marching squad, and once left behind the nearest human thing is the post. A hunter 300 m from
  every soldier (and from the convoy truck) now leaves the map. Turned into an ordinary zombie
  instead, it stopped counting against the cap and stayed on the route: worse at ×1.48.

Six veteran Operations, cities 1001 to 1006: 5 of 6 won as before, fallen 5, 6, 7, 6, 19, 11
(before: 5, 5, 11, 17, 19, 25). Linha de Suprimentos at ×1.24 and ×1.36 costs 1 to 6. The lost
run is the same one: 1005 ends on Linha de Suprimentos at ×1.48.

### 2026-11-13 — moods after a look at every mission, by day and by night

Every mood was captured by day and at 23:00. All stay readable. By day `dust` and `sodium` were
nearly the same picture, so `dust` went yellower and less saturated (×0.94 → ×0.88) and `sodium`
moved to teal light and shadow. At night the moods converge on the night palette and differ little;
that was left as it is.

### 2026-11-25 — direct-control presentation

Direct camera distance/height changes from 12/8 m to 7/4 m, with a 0.65 m shoulder offset.
Mouse pitch is limited to -0.15..0.45 radians; it changes camera look only. The target height
remains 1.5 m and look-ahead 10 m. Hit confirmation lasts three simulation ticks. Values live
in `PRESENTATION.directCamera`. Camera obstacle bounds now include props, completed structures
(including open gate posts), and trucks. Weapon ranges, the 1 m aim corridor, accuracy, ammo,
movement and simulation visibility are unchanged.
