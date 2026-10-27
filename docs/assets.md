# Asset register

Every third-party asset must be listed here with its license before it is committed. Until a final asset exists, use procedural primitives colored by the theme palette.

| Asset | Path | Author / source | License | Notes |
| --- | --- | --- | --- | --- |
| Soldier (Character_Soldier, AK only) | `apps/game/public/models/soldier.glb` | Quaternius, Toon Shooter Game Kit (Dec 2022), quaternius.com | CC0 1.0 | Built by `pnpm models` from `assets-src/toon-shooter/` (not committed); recoloured at load |
| Props: Debris_BrokenCar, SackTrench, Barrier_Large, Container_Long, Tank | `apps/game/public/models/props/*.glb` | Quaternius, Toon Shooter Game Kit (Dec 2022), quaternius.com | CC0 1.0 | Built by `pnpm models` from `assets-src/toon-shooter/env/`; recoloured at load |
| Interface icons | `lucide-react` (npm, bundled) | Lucide contributors, lucide.dev | ISC | HUD and menu icons |
| Fonts: Barlow, Barlow Condensed | `@fontsource/barlow`, `@fontsource/barlow-condensed` (npm, bundled) | Jeremy Tribby, via Fontsource | SIL OFL 1.1 | Self-hosted so the desktop build works offline |
| Infected (Character_Enemy, unarmed) | `apps/game/public/models/infected.glb` | Quaternius, Toon Shooter Game Kit (Dec 2022), quaternius.com | CC0 1.0 | Same; arms posed forward at bake time |

Everything else (city, vehicles, structures, effects, all audio) is procedural: `packages/view3d`, `packages/audio`.

To rebuild the models, unpack the kit's `Characters/glTF/*.gltf` into `assets-src/toon-shooter/` and run `pnpm models`.
