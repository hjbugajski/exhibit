import { createFileRoute, redirect } from '@tanstack/react-router';

import { SignInView } from '@/components/account/sign-in-view';
import { passwordResetAvailableFn } from '@/lib/account';
import { getServerSession } from '@/lib/auth-session';

export const Route = createFileRoute('/sign-in')({
  // Only same-origin paths: reject absolute URLs and protocol-relative `//`.
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search.redirect === 'string' &&
    search.redirect.startsWith('/') &&
    !search.redirect.startsWith('//')
      ? { redirect: search.redirect }
      : {},
  beforeLoad: async ({ search }) => {
    const session = await getServerSession();

    if (session) {
      throw redirect({ to: search.redirect ?? '/' });
    }
  },
  loader: () => passwordResetAvailableFn(),
  component: SignInRoute,
});

function SignInRoute() {
  const { redirect } = Route.useSearch();
  const resetAvailable = Route.useLoaderData();

  return <SignInView redirect={redirect} resetAvailable={resetAvailable} />;
}
