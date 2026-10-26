# Vazante

A real-time strategy and survival game against a city-sized zombie horde: plan on the operations map, zoom into any street to fight, or take direct control of a soldier, all in **one persistent simulation**. Names, city, art and code are original.

Browser first (TypeScript, Three.js, simulation in a Web Worker). Desktop builds for Steam, Flatpak, Snap and AppImage come through Electron (milestone M8).

## Quick start

```bash
pnpm install
pnpm dev      # open http://localhost:5173
pnpm check    # typecheck + lint + tests
pnpm sim      # headless run of the vertical slice with a state hash
```

Requires Node 22+ and pnpm 10.

## Documents

- [Game design](docs/GDD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap and acceptance criteria](docs/ROADMAP.md)
- [Decisions](docs/DECISIONS.md)
- [Balancing tables](docs/balancing.md)
- [Asset register](docs/assets.md)
- [Rules for AI agents](AGENTS.md)
- Original Portuguese spec: [docs/reference/vazante-spec-v0.1-pt.md](docs/reference/vazante-spec-v0.1-pt.md)

## Controls (current build)

| Action | Keys |
| --- | --- |
| Pan | WASD / arrows, middle-drag |
| Zoom (tactical ↔ strategic) | mouse wheel, `M` toggles the map |
| Rotate (tactical) | Q / E |
| Select squad | left click or drag a box |
| Move | right click |
| Stance | Z hold, X aggressive, C defensive, V withdraw |
| Formation | F cycles line, column, wedge, circle |
| Pause / speed | Space, F1 1x, F2 2x, F3 4x |
| Direct control | TAB on a selected squad (WASD move, mouse aim, click fire, R reload, TAB exit) |
| Build | B toggles build mode, 1-4 picks HESCO / wall / gate / MG nest, drag for a line, Shift keeps building, right click or Esc cancels |
| Gate / demolish | G opens or closes the gate under the cursor, Del demolishes |
| Sound | N toggles |
| Spawn test horde (dev) | K at the cursor |
