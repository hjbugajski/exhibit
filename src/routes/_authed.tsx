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
  // The tag list scans every artifact's tags and changes only when the owner edits them — every
  // such mutation calls `router.invalidate()`, which refetches regardless of this window.
  staleTime: 5 * 60_000,
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
