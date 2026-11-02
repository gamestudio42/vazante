# Feel and presentation

Feel is how an action reads in the body: anticipation, the moment of
contact, and the follow-through. Presentation that does not serve a
verb is decoration.

## Read first

The art direction is local. Read the repository before applying a look:

- README, art notes, and reference images
- Render settings in `project.godot` or the web project's style setup
- Existing camera, audio, and feedback used by the same verb

If the project is pixel-art, low-poly, or billboard-based, follow that
project. Do not impose another game's filter, palette, or silhouette
rules here.

## Rules

- Every player verb gets feedback on three channels when the project
  already uses them: motion, picture, and sound. Missing feedback makes
  the verb feel unconfirmed.
- Juice exaggerates a verb the player already performed. It does not
  create a new outcome. Screen shake, hit-stop, and particles must stay
  readable; if the player cannot see the threat, reduce the effect.
- Camera framing keeps the goal and the immediate risk in view. Do not
  move the camera in a way that hides the thing the player must read.
- Audio marks state changes (success, failure, warning), not every
  frame. Match loudness and density to the surrounding mix.
- Silhouette and contrast come before detail. The player must tell
  interactive things from scenery at the play resolution.
- UI copy is short and uses the game's verbs. Do not invent a second
  name for a resource the design note already named.

## Pixel-art and 3D kits

When the project documents a texture filter (for example nearest
filtering and no anisotropic filtering), keep imports on that setting.
When mesh names encode LOD or state, follow that naming. Do not add a
second convention beside the one the project already ships.
