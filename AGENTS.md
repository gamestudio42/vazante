# AGENTS.md

Instructions for AI coding agents working on Vazante. Read `docs/GDD.md`, `docs/ARCHITECTURE.md` and `docs/ROADMAP.md` before changing code.

## Core principle

**One authoritative world, multiple control modes.** The strategic map, the tactical camera and direct control observe and command the same simulation in the worker. Never create a separate simulation, copy of an entity, or auto-resolve for a view.

## Rules

1. Work one milestone at a time, in `docs/ROADMAP.md` order. A task is done only when its acceptance criterion has an automated test that passes. Compiling is not done.
2. `packages/simulation` and `packages/kernel` are pure deterministic TypeScript: no DOM, no Node APIs, no wall clock, no `Math.random`, no transcendental `Math` functions. Every random draw goes through the engine RNG in a fixed order. ESLint enforces this; do not disable the rule.
3. React has no game rules; it sends commands and reads state. The renderer never mutates the simulation.
4. Commands are intentions, events are results. Every rejected command emits `command_rejected` with a reason key. UI validation calls the same pure validators as the engine.
5. Every game number lives in `packages/shared/src/balance/`. When a value from the docs changes, update `docs/balancing.md` and its change log.
6. Every new system gets: unit tests, a scenario test in `packages/simulation/test/`, and a benchmark entry if it runs per tick.
7. Run `pnpm check` (typecheck, lint, tests) before each commit. For simulation changes, compare `pnpm bench` with the previous run and justify any slowdown above 10%.
8. Names, text, assets, maps and UI art are our own. Third-party assets only with a license recorded in `docs/assets.md`.
9. Code, comments, technical docs and commits in English. Commit subjects follow `.gitmessage` (`[TAG] area: short description`). Player text through i18n (`pt-BR` default; `en`, `es`, `fr`, `de`).
10. If a rule in the docs proves impossible or bad in practice, implement the simplest alternative that keeps the pillars, record it in `docs/DECISIONS.md`, and continue. Stop and ask only at the v0.5 performance gate or if a pillar is at risk.
11. Inspect the existing code before replacing anything. Do not overwrite working code without a reason written in the commit message.

## Critical invariants (each must have a test)

- Switching camera mode does not change `hashState()` and does not duplicate units.
- Zooming out does not freeze or slow the simulation.
- Units obey commands regardless of camera.
- Ammo consumed stays consumed; dead soldiers stay dead; destroyed defenses stay destroyed.
- Supply trucks carry real inventory; a destroyed truck delivers nothing.
- Zombies react to sight and to noise.
- Construction changes navigable routes.
- Save → load → run N ticks gives the same hash as running N ticks.
- The scenario can be won and lost.
- No gameplay system needs manual intervention outside the game.

## Commands

```bash
pnpm install
pnpm dev          # browser build at http://localhost:5173
pnpm check        # typecheck + lint + tests
pnpm test         # vitest
pnpm sim          # headless simulation run with a hash and timing summary
pnpm build        # production web build in apps/game/dist
```
