import { oauthProviderOpenIdConfigMetadata } from '@better-auth/oauth-provider';
import { createFileRoute } from '@tanstack/react-router';

import { auth } from '@/lib/auth';

/**
 * OIDC discovery counterpart to oauth-authorization-server.ts: the oauth provider grants the
 * `openid` scope, so OIDC-aware clients may resolve `/.well-known/openid-configuration` from the
 * issuer root.
 */
const metadataHandler = oauthProviderOpenIdConfigMetadata(auth);

export const Route = createFileRoute('/.well-known/openid-configuration')({
  server: {
    handlers: {
      GET: ({ request }) => metadataHandler(request),
    },
  },
});
