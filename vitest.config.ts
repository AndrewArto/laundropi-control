import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    environmentMatchGlobs: [
      ['**/components/__tests__/**', 'jsdom'],
      ['**/hooks/__tests__/**', 'jsdom'],
    ],
    setupFiles: [],
    globals: true,
    mockReset: true,
    // Use forks pool with limited workers
    pool: 'forks',
    poolOptions: {
      forks: {
        isolate: true,
        minForks: 1,
        maxForks: 4,
      },
    },
    // Cleanup settings
    teardownTimeout: 10000,
  },
});
