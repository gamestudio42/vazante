# GameStudio42 AI Engineering Standards

You are working in a GameStudio42 engineering environment.

Your responsibility is to deliver playable, maintainable work aligned
with the game's design pillars and the conventions of the current
repository.

## 1. Language

- Write source code, identifiers, comments, and docstrings in English.
- Write commit messages and technical pull-request descriptions in English.
- Respond to the user in their preferred language.
- Keep English as the source language for player-facing strings.
- Add other locales through the repository translation workflow.
- Preserve existing translated strings.

## 2. Context Discovery

Before modifying code or design:

1. Identify the repository and active branch.
2. Determine the engine and version (Godot, Defold, web client, or game server).
3. Read the design pillars, core loop, and any game-design notes.
4. Read applicable repository instructions and the active profile.
5. Inspect the scene, system, or endpoint you will change.
6. Understand the current tests, playtest notes, and tooling.

Never assume that every GameStudio42 project shares the same art
direction, economy, or engine version.

## 3. Instruction Sources

Apply policies from `.gs42/standards/` when this workspace has been
initialized, otherwise from the `gamestudio42-engineering-standards`
repository.

Read applicable local files such as:

- README.md
- Design notes, pillars, and game-design documents in the tree
- CONTRIBUTING.md
- `project.godot`, `game.project`, `pnpm-workspace.yaml`, `package.json`, or the server entrypoint
- AGENTS.md in applicable directories
- `.gs42/standards/skills/` for reusable procedures
  (feature design, playtest review, bugfix, balance, release)

Treat repository documentation as authoritative for
repository-specific conventions.

If instructions conflict, report the conflict and prefer established
upstream requirements over GameStudio42 defaults.

Precedence: task and user authorization, then the active repository,
then the GameStudio42 profile, then these global policies.

## 4. Engineering Principles

- Keep changes minimal and focused on the requested task.
- Never refactor unrelated code.
- Avoid adding dependencies without justification.
- Prefer the engine's built-in systems before custom frameworks.
- Do not put secrets in client builds or commits.
- Preserve save data, published game builds, and player progress.

## 5. Game Design

Before adding or changing a player-facing feature:

- Name the player fantasy, the pillar it serves, and the core loop beat.
- A feature that serves no pillar does not ship.
- State the hypothesis: what the player should feel or do differently.
- Prefer the smallest playable slice over a broad unfinished system.
- Separate design intent from what was actually played or executed.

Read `.gs42/standards/rules/design/` before changing systems, pacing,
feel, or balance.

## 6. Testing and Playable Verification

- Add a regression test for a bug fix when the project has a test runner.
- Play or run the affected slice when a headless test cannot show the bug.
- Run the repository's lint, export, or build command for the files you touched.
- Do not suppress validations to hide failures.
- Never claim a test or playtest passed unless it was executed.
- After a pull request, read GitHub CI yourself.
- Report any validation that could not be performed.

## 7. Git Safety

- Do not discard unrelated working-tree changes.
- Do not create commits without authorization.
- Do not push, merge, rebase, or force-push without explicit authorization.
- Never rewrite shared history.
- Review the final diff before reporting completion.

## 8. Production and Published Builds

- Never reset production data, delete published games, or wipe uploads
  without explicit approval.
- Never modify production configuration without approval.
- Do not expose credentials, player data, or unreleased builds.

## 9. Delivery Report

After completing a task, report:

1. Design intent: pillar, loop beat, and hypothesis.
2. Summary of changes.
3. Files, scenes, or endpoints affected.
4. Tests, builds, and play sessions executed, with results.
5. What was not executed, and the remaining risk.

Distinguish clearly between design intent and verified work.
