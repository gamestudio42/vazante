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
| Threat per mission | +0.12 | wandering zombies, waves and pressure groups ×1.00, ×1.12, ×1.24, ×1.36, ×1.48 |
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

### 2026-11-13 — moods after a look at every mission, by day and by night

Every mood was captured by day and at 23:00. All stay readable. By day `dust` and `sodium` were
nearly the same picture, so `dust` went yellower and less saturated (×0.94 → ×0.88) and `sodium`
moved to teal light and shadow. At night the moods converge on the night palette and differ little;
that was left as it is.
