import { afterEach } from 'vitest';

// Simulation tests are long synchronous loops. Yield a macrotask after each test so the worker
// can answer vitest's RPC messages; otherwise a slow machine trips "Timeout calling onTaskUpdate".
afterEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
