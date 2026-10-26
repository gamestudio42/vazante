import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
    setupFiles: ['./vitest.setup.ts'],
  },
});
