import { createFileRoute } from '@tanstack/react-router';

import { env } from '@/lib/env';

/**
 * RFC 9728 protected resource metadata for the `/mcp` endpoint. Better Auth's oauth-provider plugin
 * does not serve this document itself (it's the resource server's responsibility, not the
 * authorization server's), so it's hand-rolled here.
 */
export const Route = createFileRoute('/.well-known/oauth-protected-resource')({
  server: {
    handlers: {
      GET: () => {
        const baseURL = env.BASE_URL;

        return Response.json(
          {
            resource: `${baseURL}/mcp`,
            authorization_servers: [baseURL],
            bearer_methods_supported: ['header'],
          },
          { headers: { 'cache-control': 'public, max-age=3600' } },
        );
      },
    },
  },
});
