import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
    __APP_BUILD_DATE__: JSON.stringify('2026-01-01T00:00:00Z'),
  },
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
