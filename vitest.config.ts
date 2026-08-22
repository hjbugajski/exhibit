import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
      '@testing': new URL('./testing', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // Several *.int.test.ts files each boot the real vite dev server in their beforeAll; on a cold
    // cache with concurrent workers that can blow past the 30s default.
    hookTimeout: 120_000,
    setupFiles: ['./testing/setup.ts'],
    // Centralize generated output under .reports/ (gitignored).
    coverage: { reportsDirectory: '.reports/coverage' },
  },
});
