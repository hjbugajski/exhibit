import evlog from 'evlog/nitro/v3';
import { defineConfig } from 'nitro';

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
  modules: [
    evlog({
      env: { service: 'exhibit' },
    }),
  ],
});
