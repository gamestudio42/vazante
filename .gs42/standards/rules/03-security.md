# Security

- Never expose credentials, tokens, player data, or environment secrets
  in commits, logs, pull requests, builds, or chat.
- Do not hard-code secrets. Read them from the project's existing secret
  mechanism. Client builds (Godot export, React bundle) must not contain
  private keys or admin tokens.
- Do not copy hostnames, passwords, or tokens from one project into
  another project's documentation.
- Treat `.env`, credential files, certificates, save dumps, and
  unpublished build artifacts as confidential. `.env.example` may list
  keys with empty or fake values.
- Do not delete published games, wipe `uploads/`, or reset production
  data without explicit approval.
- Do not disable authentication, cheat guards, or linters to hide a
  failure.
- Do not ship a debug backdoor, unlimited-currency flag, or editor-only
  shortcut in a release export unless the design doc calls it a player
  feature and it is gated.
