import { useEffect, useState } from 'react';

import { z } from 'zod';

import { AuthScreen } from '@/components/account/auth-screen';
import { FormStatus } from '@/components/blocks/form-status';
import { Button } from '@/components/ui/button';
import { Item } from '@/components/ui/item';
import { authClient } from '@/lib/auth-client';
import { useFormAction } from '@/lib/use-form-action';

/**
 * The consent screen renders client_name as the thing the owner is trusting; parse the
 * (unauthenticated) client-info response instead of casting it.
 */
const publicOAuthClientSchema = z.object({
  client_id: z.string(),
  client_name: z.string().optional(),
});

type PublicOAuthClient = z.infer<typeof publicOAuthClientSchema>;

export function ConsentView({ clientId, scope }: { clientId?: string; scope?: string }) {
  const [client, setClient] = useState<PublicOAuthClient | null>(null);
  const { pending, status, setStatus, run } = useFormAction();
  const scopes = scope?.split(' ').filter(Boolean) ?? [];

  useEffect(() => {
    if (!clientId) {
      setClient(null);
      return;
    }

    let ignore = false;

    authClient.oauth2
      .publicClient({ query: { client_id: clientId } })
      .then(({ data }) => {
        if (ignore) {
          return;
        }

        const parsed = publicOAuthClientSchema.safeParse(data);

        setClient(parsed.success ? parsed.data : null);
      })
      .catch(() => {
        if (ignore) {
          return;
        }

        setClient(null);
      });

    return () => {
      ignore = true;
    };
  }, [clientId]);

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
        <p className="text-sm">
          <strong className="font-semibold">
            {client?.client_name ?? clientId ?? 'This application'}
          </strong>{' '}
          is requesting access to your account.
        </p>
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
