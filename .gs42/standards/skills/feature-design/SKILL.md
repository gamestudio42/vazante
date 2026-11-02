---
name: feature-design
description: Shape a player-facing feature against pillars and the core loop before implementing it.
---

# Feature design

Use this procedure before building a new player-facing feature or
expanding one past a bug fix.

## Preconditions

- The repository and engine are identified.
- You have read the design notes, README, and `rules/design/`.
- The request is more than a typo or a crash.

## Procedure

1. State the player fantasy in one sentence, quoted from the project
   when it exists. If you inferred it, say so.
2. Name the pillar this feature serves. If none fits, stop and say the
   feature should be cut or recast. Do not implement it anyway.
3. Write the core loop as verbs and mark the beat this feature changes.
4. Write the hypothesis: what the player will do or feel differently,
   and what observation would make you revert.
5. Cut the work to the smallest playable slice: one scene, level, or
   match. List what is out of scope.
6. Name the source of truth for any new number (resource, export, or
   table the project already uses).
7. Only then change code or content. Keep the diff inside that slice.

## Acceptance criteria

- The slice can be played: the player can succeed and fail for a reason
  they can see.
- The design note matches the build, or you updated it.
- No second verb, currency, or menu was added "so it feels complete".

## Report

Return the fantasy, pillar, loop beat, hypothesis, what was played or
executed, and what was left unverified.
