import { AuthScreen } from '@/components/account/auth-screen';
import { FormStatus } from '@/components/blocks/form-status';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Item } from '@/components/ui/item';
import type { ConsentClient } from '@/lib/account';
import { authClient } from '@/lib/auth-client';
import { formatRelativeTime } from '@/lib/format-time';
import { useFormAction } from '@/lib/use-form-action';

const RECENT_REGISTRATION_MS = 10 * 60 * 1000;

/**
 * A registration minutes old is either the client the owner is connecting right now, or one an
 * attacker registered seconds ago to catch this exact prompt — the owner is the only one who can
 * tell those apart, so say so. Unknown age (no matching registration, or a row without a timestamp)
 * fails toward caution and warns too.
 */
function isRecentlyRegistered(createdAt: number | null | undefined): boolean {
  return createdAt == null || Date.now() - createdAt < RECENT_REGISTRATION_MS;
}

export interface ConsentViewProps {
  /** The client registration on record; null when the lookup found nothing or failed. */
  client: ConsentClient | null;
  clientId?: string;
  scope?: string;
}

/**
 * The one control between an attacker-registered OAuth client and a token for the whole gallery. It
 * leads with the two things the client cannot choose for itself — where the authorization code will
 * be delivered, and how long the registration has existed — because the name beside them is a free
 * string set at dynamic registration.
 */
export function ConsentView({ client, clientId, scope }: ConsentViewProps) {
  const { pending, status, setStatus, run } = useFormAction();
  const scopes = scope?.split(' ').filter(Boolean) ?? [];
  const hosts = client?.redirectHosts ?? [];

  function handleRespond(accept: boolean) {
    void run(async () => {
      const oauthQuery = window.location.search.slice(1);
      const { data, error } = await authClient.oauth2.consent({
        accept,
        oauth_query: oauthQuery,
      });

      if (error || !data?.url) {
        setStatus({ kind: 'error', message: error?.message ?? 'Could not process consent.' });
        return;
      }

      window.location.href = data.url;
    });
  }

  return (
    <AuthScreen title="Authorize access">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            <strong className="font-semibold">
              {client?.name ?? clientId ?? 'This application'}
            </strong>{' '}
            is requesting access to your account.
          </p>
          <p className="text-sm">
            {hosts.length > 0 ? (
              <>
                It receives the authorization code at{' '}
                <strong className="font-semibold">{hosts.join(', ')}</strong>.
              </>
            ) : (
              'No redirect host is on record for this client.'
            )}
          </p>
        </div>
        {isRecentlyRegistered(client?.createdAt) ? (
          <Alert.Root variant="warning">
            <Alert.Title>
              {client?.createdAt == null
                ? 'Registration unknown'
                : `Registered ${formatRelativeTime(client.createdAt)}`}
            </Alert.Title>
            <Alert.Description>
              This is the first time you are seeing this client. Allow it only if you just started
              connecting one yourself.
            </Alert.Description>
          </Alert.Root>
        ) : null}
        {scopes.length > 0 ? (
          <Item.Group>
            {scopes.map((s) => (
              <Item.Root key={s} variant="outline">
                <Item.Title>{s}</Item.Title>
              </Item.Root>
            ))}
          </Item.Group>
        ) : null}
        <FormStatus status={status} />
        <div className="flex gap-3">
          <Button disabled={pending} onClick={() => handleRespond(true)}>
            Allow
          </Button>
          <Button disabled={pending} onClick={() => handleRespond(false)} variant="outline">
            Deny
          </Button>
        </div>
      </div>
    </AuthScreen>
  );
}
