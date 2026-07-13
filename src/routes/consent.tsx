import { createFileRoute, redirect } from '@tanstack/react-router';

import { ConsentView } from '@/components/account/consent-view';
import { getServerSession } from '@/lib/auth-session';

export const Route = createFileRoute('/consent')({
  // In the real OAuth flow Better Auth only redirects here after sign-in, but the route is directly
  // addressable — guard it like every other page.
  beforeLoad: async ({ location }) => {
    const session = await getServerSession();

    if (!session) {
      throw redirect({ to: '/sign-in', search: { redirect: location.href } });
    }
  },
  validateSearch: (search: Record<string, unknown>) => ({
    client_id: typeof search.client_id === 'string' ? search.client_id : undefined,
    scope: typeof search.scope === 'string' ? search.scope : undefined,
  }),
  component: ConsentRoute,
});

function ConsentRoute() {
  const { client_id: clientId, scope } = Route.useSearch();

  return <ConsentView clientId={clientId} scope={scope} />;
}
