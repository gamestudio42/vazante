# React games

The repository is a game that happens to render with React. Simulation
state does not live in render state.

A GameStudio42 game is a pnpm workspace. Clients live under `apps/`.
The simulation lives in its own package (often `packages/simulation`
or `packages/kernel`). Read the repository `AGENTS.md` to see which
package that is. Do not copy paths from another title.

## Read first

- `pnpm-workspace.yaml` and the root `package.json` scripts
- The repository `AGENTS.md` and the simulation package it names
- The app under `apps/` you will change, and its bundler config
- How the current build addresses assets (relative paths or a `base`)

## Rules

- The simulation package is pure TypeScript: no DOM, no Node APIs, no
  wall-clock time, and no `Math.random`. The repository lint is what
  enforces the boundary. Do not weaken that lint to make a change pass.
- React components never contain the game rules. They send commands
  and read state. Do not advance the rules inside render or in an
  effect that runs because the parent re-rendered.
- The renderer never mutates simulation state.
- Follow the component and folder layout already in the repository.
- Player input goes through the project's input path. Do not bind a
  second global key listener beside the one the game already owns.
- No secrets, admin tokens, or private API hosts in client code. The
  bundle is public.
- Dependencies: prefer what the workspace already has. Do not add a
  state library, physics library, or UI kit for one screen.
- Player-facing strings stay in the project's i18n source. English is
  the source language unless the repository says otherwise.
- Deterministic replays, seeds, or daily challenges use the project's
  existing RNG, in a deterministic order.

## Scope

A feature lands in the app and the simulation package that play it.
Do not rebuild the shell, router, or menu chrome unless the task is
about that chrome.
