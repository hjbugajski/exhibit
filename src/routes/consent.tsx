import { createFileRoute, redirect } from '@tanstack/react-router';

import { ConsentView } from '@/components/account/consent-view';
import { getConsentClientFn } from '@/lib/account';
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
  loaderDeps: ({ search }) => ({ clientId: search.client_id }),
  // A failed lookup must not take the screen down with it: the owner is mid-OAuth and needs to be
  // able to deny. `null` renders the unknown-client fallback, which is the cautious presentation
  // anyway (see ConsentView).
  loader: async ({ deps }) => {
    if (!deps.clientId) {
      return null;
    }

    try {
      return await getConsentClientFn({ data: { clientId: deps.clientId } });
    } catch {
      return null;
    }
  },
  head: () => ({ meta: [{ title: 'Authorize · Exhibit' }] }),
  component: ConsentRoute,
});

function ConsentRoute() {
  const { client_id: clientId, scope } = Route.useSearch();
  const client = Route.useLoaderData();

  return <ConsentView client={client} clientId={clientId} scope={scope} />;
}
