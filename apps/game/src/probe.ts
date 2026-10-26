/** Per-frame timings of the main loop, read by the frame benchmark to explain slow frames. */
export const probe = {
  shellMs: 0,
  inputMs: 0,
  renderMs: 0,
  audioMs: 0,
  /** Compiled shader programs; a jump during play means a shader compiled mid-game. */
  programs: 0,
};
