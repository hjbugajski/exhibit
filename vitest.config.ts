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
    setupFiles: ['./testing/setup.ts'],
    // Centralize generated output under .reports/ (gitignored).
    coverage: { reportsDirectory: '.reports/coverage' },
    outputFile: {
      junit: '.reports/vitest/junit.xml',
      json: '.reports/vitest/results.json',
      html: '.reports/vitest/html/index.html',
    },
  },
});
