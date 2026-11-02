# Systems

A system is the rules that turn a player action into a visible
consequence. If the player cannot tell what changed, the system is not
done.

## Read first

- The design note for the economy, resources, or verbs you are touching
- The data that already defines those numbers (resources, tables, or
  exported constants — not a magic number copied into a scene)
- One existing source and one existing sink for the same resource

## Rules

- Name the resource, the verb that creates it, and the verb that spends
  it. A source without a sink inflates. A sink without a source stalls.
- Closed loops should be readable: the player can point at why a number
  went up or down.
- Feedback loops are either reinforcing (success makes the next success
  easier) or balancing (success spends the advantage). Say which one
  you are adding, and what stops it from running away.
- Do not add a currency, timer, or inventory slot that no current verb
  reads. Dead resources teach the player to ignore the UI.
- Consequences land in the same moment the player acted, unless the
  design is explicitly about delayed payoff. Delayed payoff still needs
  a telegraph.
- Coupling: a change to one system must list the other systems that
  read its output. Update those readers in the same change, or do not
  change the output.
- Randomness is a design choice. If the player is meant to read skill,
  do not hide the outcome in an unexplained roll.

## Numbers

Tune numbers in the project's data source. Do not scatter the same
constant through scenes and scripts. A balance change follows
`rules/design/playtest.md`.
