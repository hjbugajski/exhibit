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
    // Threads over the default forks pool: consistently ~1s faster on this suite from cheaper
    // worker startup. Worker threads copy process.env per thread, so the int files' env mutation
    // stays isolated exactly as it did under forks.
    pool: 'threads',
    setupFiles: ['./testing/setup.ts'],
    // Centralize generated output under .reports/ (gitignored).
    coverage: { reportsDirectory: '.reports/coverage' },
  },
});
