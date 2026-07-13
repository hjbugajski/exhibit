import { oauthProviderAuthServerMetadata } from '@better-auth/oauth-provider';
import { createFileRoute } from '@tanstack/react-router';

import { auth } from '@/lib/auth';

/**
 * Better Auth's oauth-provider plugin serves this metadata via the auth handler catch-all too, but
 * some MCP clients skip header-based discovery and hit the well-known path directly, so it's served
 * explicitly here as well using the package's own helper (re-uses the same auth config).
 */
const metadataHandler = oauthProviderAuthServerMetadata(auth);

export const Route = createFileRoute('/.well-known/oauth-authorization-server')({
  server: {
    handlers: {
      GET: ({ request }) => metadataHandler(request),
    },
  },
});
