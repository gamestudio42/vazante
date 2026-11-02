# Git workflow

- Keep changes small and focused on the authorized task.
- Respect history and authorship. Do not rewrite shared history.
- Do not include unrelated files or drive-by formatting.
- Run the repository validators before claiming the work is complete.
- Do not discard unrelated working-tree changes.
- Do not create commits without authorization.
- Do not push, merge, rebase, or force-push without explicit authorization.
- Review the final diff before reporting completion.

Commit and pull-request title formats are **repository-specific**.
Inspect recent commits on the target branch before inventing a style.

When the repository has no stricter convention, use `.gitmessage`:

`[TAG] area: short description`

The first line should stay valid after *"if applied, this commit will …"*.
Explain **why** in the body. One system, scene, or feature per commit
when feasible. Allowed tags:

`[FIX]` `[IMP]` `[ADD]` `[GD]` `[BAL]` `[ART]` `[AUDIO]` `[REF]`
`[REM]` `[PERF]` `[TEST]` `[CLN]`

`[GD]` is a design change. `[BAL]` is a numbers change. Do not hide a
design change inside a refactor tag.

Enable the template with `git config commit.template .gitmessage` when
the user asks. Do not overwrite an existing `.gitmessage`.
