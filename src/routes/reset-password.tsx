import { createFileRoute, redirect } from '@tanstack/react-router';

import { ResetPasswordView } from '@/components/account/reset-password-view';
import { getServerSession } from '@/lib/auth-session';

/**
 * Public route (like /sign-in): the reset token in the emailed link is the credential here. Only
 * reachable in deployments with Resend configured — without a mailer no reset link is ever issued.
 */
export const Route = createFileRoute('/reset-password')({
  validateSearch: (search: Record<string, unknown>): { token?: string } =>
    typeof search.token === 'string' ? { token: search.token } : {},
  beforeLoad: async ({ search }) => {
    const session = await getServerSession();

    // Only redirect away when there's no token: a token-bearing link must stay reachable while
    // authenticated, since the owner may hold a session in one browser but still be following a
    // reset link from another.
    if (session && !search.token) {
      throw redirect({ to: '/' });
    }
  },
  component: ResetPasswordRoute,
});

function ResetPasswordRoute() {
  const { token } = Route.useSearch();

  return <ResetPasswordView token={token} />;
}
