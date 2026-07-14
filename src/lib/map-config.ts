import { createServerFn } from '@tanstack/react-start';

import { env } from '@/lib/env';
import { sessionMiddleware } from '@/lib/session-middleware';

/**
 * The Protomaps key is a public browser key (scoped by the CORS allowlist on the Protomaps
 * account), but it lives in server env and reaches the map at runtime through this fn so it
 * doesn't have to be baked into the client bundle at build time.
 */
export const getProtomapsApiKeyFn = createServerFn({ method: 'GET' })
  .middleware([sessionMiddleware])
  .handler(() => env.PROTOMAPS_API_KEY ?? null);
