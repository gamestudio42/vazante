# Profile: web-game

Use this profile at the root of a GameStudio42 game repository whose
client renders with React.

The normal layout is a pnpm workspace: `apps/*` for clients and
`packages/*` for the simulation and shared code. React is declared on
the app package, not on the root `package.json`.

## Detection signals

- `react` in `dependencies`, `devDependencies`, or `peerDependencies`
  of the root `package.json`, or of a package named by
  `pnpm-workspace.yaml` (or by the `workspaces` field)
- A package outside that list does not count

## What to read in the live tree

1. `pnpm-workspace.yaml` and the root `package.json` scripts (`dev`,
   `check`, `build`)
2. The repository `AGENTS.md`, which names the simulation package
3. The app under `apps/` that you will change, and its bundler config
4. README deploy notes (ZIP layout, `game_id`, host URL)
5. The host contract if this repo documents the GameStudio42 game server

## Write locations

- Game rules stay in the simulation package the repository already
  uses. React under `apps/` sends commands and reads state.
- Build output and `node_modules` are not source. Do not commit them
  unless the repository already tracks a deliberate publish folder.

## Validation

Run the project's build from the repository root. The artifact must
contain `index.html` at its root and must load under the published
base path. `gs42-standards validate --profile web-game` checks that
the root `package.json` exists and has a `build` script. It does not
run the build.
