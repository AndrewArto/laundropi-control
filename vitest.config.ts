import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    environmentMatchGlobs: [
      ['**/components/__tests__/**', 'jsdom'],
    ],
    setupFiles: [],
    globals: true,
    mockReset: true,
  },
});
