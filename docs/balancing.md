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
| Rifle | 60 | 2 | 34 | 0.55 | 0 | 210 |
| Light machine gun | 80 | 8 | 30 | 0.35 | 0 | 600 |
| Shotgun (police) | 15 | 1 | 60 × 6 pellets | 0.5 | 0 | 40 |
| .50 HMG (vehicle) | 150 | 8 | 80 | 0.4 | 0 | 1,200 |
| 25 mm cannon | 300 | 3 | 120 | 0.6 | 2 | 600 |
| 120 mm tank gun | 400 | 0.15 | 400 | 0.8 | 8 | 40 |
| 30 mm (attack helicopter) | 500 | 10 | 100 | 0.4 | 3 | 1,200 |

Noise: shot 60 within 40 m; explosion 200 within 150 m; decay 10% per tick.

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

## Change log

| Date | Value | Old → new | Reason |
| --- | --- | --- | --- |
| 2026-10-26 | — | — | initial tables from the Vazante spec |
| 2026-10-26 | structure HP | thousands → 250..600 zombie attacks | HP is counted in attacks; old values made walls immortal |
| 2026-10-26 | structure footprint | 2×2 nest, 2×1 gate → 1×1 | one cell per piece for the slice; multi-cell later |
| 2026-10-26 | flow penalty for structures | — → 200 (20 cells) | horde detours around short walls and besieges long ones |
| 2026-10-26 | cargo truck | 500 HP, 15 m/s, 8 t → 400 HP, 7 m/s | the truck has to be escorted; at 15 m/s it outran every threat |
