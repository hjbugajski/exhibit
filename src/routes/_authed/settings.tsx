import { createFileRoute } from '@tanstack/react-router';

import { SettingsView } from '@/components/account/settings-view';
import { listMcpConnectionsFn, passwordResetAvailableFn } from '@/lib/account';

export const Route = createFileRoute('/_authed/settings')({
  loader: async () => {
    const [connections, mailerAvailable] = await Promise.all([
      listMcpConnectionsFn(),
      passwordResetAvailableFn(),
    ]);

    return { connections, mailerAvailable };
  },
  head: () => ({ meta: [{ title: 'Settings · Exhibit' }] }),
  component: SettingsRoute,
});

function SettingsRoute() {
  const { connections, mailerAvailable } = Route.useLoaderData();
  const { session } = Route.useRouteContext();

  return (
    <SettingsView
      connections={connections}
      email={session.user.email}
      mailerAvailable={mailerAvailable}
      seed={session.user.image ?? session.user.email}
    />
  );
}
