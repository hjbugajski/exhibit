import { createFileRoute, redirect } from '@tanstack/react-router';

import { SignInView } from '@/components/account/sign-in-view';
import { passwordResetAvailableFn } from '@/lib/account';
import { getServerSession } from '@/lib/auth-session';
import { sameOriginPath } from '@/lib/same-origin-path';

export const Route = createFileRoute('/sign-in')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const redirect = sameOriginPath(search.redirect);

    return redirect ? { redirect } : {};
  },
  beforeLoad: async ({ search }) => {
    const session = await getServerSession();

    if (session) {
      throw redirect({ to: search.redirect ?? '/' });
    }
  },
  loader: () => passwordResetAvailableFn(),
  head: () => ({ meta: [{ title: 'Sign in · Exhibit' }] }),
  component: SignInRoute,
});

function SignInRoute() {
  const { redirect } = Route.useSearch();
  const resetAvailable = Route.useLoaderData();

  return <SignInView redirect={redirect} resetAvailable={resetAvailable} />;
}
