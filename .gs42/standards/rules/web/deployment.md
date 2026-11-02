# Web game deployment

Published web games are static builds served under a game id. The build
must run on its own, from the folder the host extracts.

## Contract

Read the host repository before assuming paths. The GameStudio42 game
server expects:

- A ZIP of the production build
- `index.html` at the root of the ZIP, not nested in an extra folder
- A `game_id` (stable slug) and a version string
- Assets that resolve under `/games/<game_id>/`

Set the bundler `base` (Vite `base`, or `homepage` / `PUBLIC_URL` for
the tool the repo uses) so script and style URLs are relative or
prefixed with that path. A build that only works at `/` is not
deployable.

## Rules

- The ZIP contains the build output, not `node_modules` or source maps
  the project does not intend to publish.
- Do not rely on `cdn.tailwindcss.com` or any other CDN for the game to
  boot. Ship the CSS and JS the build produced.
- `game_id` stays stable across versions. Bump `version` when the
  published build changes. Do not reuse a version string for a different
  artifact.
- Do not put secrets in the ZIP. `.env` files stay out of the archive.
- Verify the build locally by opening the extracted folder the way the
  host will, or by deploying to a non-production id. Report the command.

## What not to do

Do not delete or overwrite a published `game_id` as a side effect of
testing. Use a throwaway id unless the user asked to replace that game.
