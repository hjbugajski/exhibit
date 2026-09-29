import evlog from 'evlog/nitro/v3';
import { defineConfig } from 'nitro';

import { requestLogOptions } from './src/lib/request-log-options.ts';

// Reconciled with vite.config.ts's inline `nitro({ plugins: [...] })` call:
// `modules`/`experimental` here and `plugins` there are distinct Nitro config
// keys, so both are picked up by Nitro's own config loader (c12) without
// conflict.
export default defineConfig({
  experimental: {
    // Lets evlog's `useRequest()` (from `nitro/context`) resolve the
    // request-scoped logger from raw route handlers.
    asyncContext: true,
  },
  rolldownConfig: {
    // Dependencies' `'use client'` directives mean nothing in the server bundle; rolldown drops
    // them either way, so its one-warning-per-module output is noise.
    checks: { moduleLevelDirective: false },
  },
  modules: [
    evlog({
      ...requestLogOptions,
      // Int tests boot this server in process; keep per-request log lines out of vitest output
      // (`enabled`, not `silent` — silent without a drain warns at boot).
      enabled: process.env.NODE_ENV !== 'test',
    }),
  ],
});
