# Production

Scope is a design tool. A smaller slice that is playable teaches more
than a wide slice that only exists in documents.

## Vertical slice

A vertical slice proves the fantasy: the core verb, one readable
consequence, and enough presentation that the feel can be judged. It
is not a horizontal list of every menu and system at greybox quality.

Before building a feature, name:

- The smallest scene, level, or match in which the feature can be played
- What is explicitly out of this change
- The signal that the slice is done (a player can finish it, fail it
  fairly, and tell what the game wanted)

## Definition of done

A player-facing feature is done when:

- It serves a named pillar and a named loop beat
- The player can succeed and fail for a reason they can see
- The data lives in the project's source of truth, not only in one scene
- A regression test or a written play check covers the behavior
- Design notes match the build

"The code compiles" is not done for a feature the player is meant to feel.

## Cutting

When the slice grows past the request, stop and name the cut. Prefer
finishing the verb over starting the next system. Do not leave half-wired
UI for a system the slice does not contain.
