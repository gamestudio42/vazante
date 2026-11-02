---
name: web-game-release
description: Produce a React game build that the GameStudio42 host can publish from a ZIP.
---

# Web game release

Use this procedure when preparing a client build for the game server
or any static host the repository documents.

## Preconditions

- The root `package.json` has a production build script.
- You know the `game_id` and whether this replaces a published id.
- You have read `rules/web/deployment.md` and the host README if it is
  in the workspace.

## Procedure

1. Confirm the bundler base path so assets load under
   `/games/<game_id>/`, or the prefix the host README names.
2. Remove CDN dependencies the game needs at boot (including
   `cdn.tailwindcss.com`). The ZIP must stand alone.
3. Run the production build. Do not zip the source tree.
4. Check the output: `index.html` is at the root of what you will zip,
   and script and style URLs are relative or correctly prefixed.
5. Confirm no `.env`, token, or private host landed in the output.
6. Zip that folder. Set the version to a new value when the artifact
   changed. Keep `game_id` stable.
7. Deploy only to a disposable id unless the user asked to replace a
   published game.

## Acceptance criteria

- `index.html` is at the ZIP root.
- The game boots without a CDN.
- The version string matches this artifact.

## Report

Return the build command and its result, `game_id`, version, and
whether a published id was touched.
