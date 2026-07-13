import { definePlugin } from 'nitro';

/** Relative import (see src/lib/auth.ts) for consistency with the other Nitro-plugin modules. */
import { env } from './env.ts';

/**
 * Sets baseline anti-framing/sniffing headers on a response, but only when the header is absent —
 * so a route that already sets its own (e.g. `src/routes/render.$id.$n.ts`'s hostile-HTML sandbox
 * CSP) is left untouched. HSTS is added only under an https `baseUrl`: self-hosted localhost/http
 * deployments must not have browsers cache an HSTS upgrade.
 */
export function applySecurityHeaders(headers: Headers, baseUrl: string): void {
  if (!headers.has('Content-Security-Policy')) {
    headers.set('Content-Security-Policy', "frame-ancestors 'none'");
  }

  if (!headers.has('X-Content-Type-Options')) {
    headers.set('X-Content-Type-Options', 'nosniff');
  }

  if (!headers.has('Strict-Transport-Security') && baseUrl.startsWith('https://')) {
    headers.set('Strict-Transport-Security', 'max-age=31536000');
  }
}

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook('response', (res) => {
    applySecurityHeaders(res.headers, env.BASE_URL);
  });
});
