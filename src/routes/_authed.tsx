import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';

import { AuthedLayout } from '@/components/blocks/authed-layout';
import { listTagsFn } from '@/lib/artifacts';
import { getServerSession } from '@/lib/auth-session';

export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ location }) => {
    const session = await getServerSession();

    if (!session) {
      throw redirect({ to: '/sign-in', search: { redirect: location.href } });
    }

    return { session };
  },
  loader: async () => ({ tags: await listTagsFn() }),
  component: AuthedLayoutRoute,
});

function AuthedLayoutRoute() {
  const { session } = Route.useRouteContext();

  return (
    <AuthedLayout email={session.user.email} seed={session.user.image ?? session.user.email}>
      <Outlet />
    </AuthedLayout>
  );
}
