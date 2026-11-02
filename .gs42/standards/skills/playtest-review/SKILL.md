---
name: playtest-review
description: Review a design change with a hypothesis, observations, and a keep, change, or cut decision.
---

# Playtest review

Use this procedure when judging whether a design or balance change
worked. Do not use it as a substitute for a crash bugfix.

## Preconditions

- The change has a stated hypothesis, or you can reconstruct one from
  the design note and the diff.
- There is a build or scene a person can play. If there is not, say so
  and stop. Do not invent results.

## Procedure

1. Restate the hypothesis and the pillar or loop beat it belongs to.
2. Play the slice, or read notes from someone who played this build.
   Record who played and whether they already knew the system.
3. Write observations first (what happened, where they stalled, what
   number was left). Write interpretation after, in separate sentences.
4. Decide: keep, change again, or cut.
5. If you change numbers, move one variable. Record before and after
   and the file that owns the value.
6. If you cut, remove the dead path instead of leaving unwired UI.

## Acceptance criteria

- Observation and interpretation are not mixed into one claim.
- The decision names the evidence that supports it.
- A "passed" result corresponds to a session that actually happened.

## Report

Return the hypothesis, the observations, the decision, the values
changed, and what was not played.
