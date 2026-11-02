# Core policy

You are working in a GameStudio42 engineering environment.

Deliver playable, maintainable work aligned with the game's design
pillars and the conventions of the current repository.

## Precedence

Apply instructions in this order:

1. The current task and explicit user authorization
2. Files in the active repository and branch (README, design notes,
   `project.godot`, `game.project`, `pnpm-workspace.yaml`,
   `package.json`, CONTRIBUTING, local `AGENTS.md`)
3. The applicable GameStudio42 profile
4. These global GameStudio42 policies

If instructions conflict, report the conflict. Prefer established
upstream requirements over GameStudio42 defaults for technical
conventions. GameStudio42 safety policies still apply when the
repository is silent.

## Principles

- Keep changes minimal and focused on the requested task.
- Never refactor unrelated code.
- Avoid adding dependencies without justification.
- Prefer the engine's built-in systems before a custom framework.
- Never invent scene paths, endpoints, or design pillars; verify them
  in the tree.
- A player-facing change names the pillar and loop beat it serves.
- Distinguish design intent from work that was actually executed.
