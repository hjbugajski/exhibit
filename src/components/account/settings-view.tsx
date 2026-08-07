import { useState, type SubmitEvent } from 'react';

import { Link, useRouter } from '@tanstack/react-router';

import { Identicon } from '@/components/account/identicon';
import { ConfirmDestructiveAction } from '@/components/blocks/confirm-destructive-action';
import { FormStatus } from '@/components/blocks/form-status';
import { RelativeTime } from '@/components/blocks/relative-time';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import type { TagUsage } from '@/database/repository';
import type { McpConnection } from '@/lib/account';
import { revokeMcpConnectionFn } from '@/lib/account';
import { removeTagFn, renameTagFn } from '@/lib/artifacts';
import { authClient } from '@/lib/auth-client';
import { useFormAction } from '@/lib/use-form-action';

function AvatarCard({ seed }: { seed: string }) {
  const router = useRouter();
  const { pending, status, setStatus, run } = useFormAction();

  function handleReroll() {
    void run(async () => {
      // The seed lives in Better Auth's user.image field; a fresh random value gives a fresh
      // deterministic identicon everywhere it renders.
      const { error } = await authClient.updateUser({ image: crypto.randomUUID() });

      if (error) {
        setStatus({ kind: 'error', message: error.message ?? 'Could not update the avatar.' });
        return;
      }

      await router.invalidate();
    });
  }

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title render={<h2>Avatar</h2>} />
        <Card.Description>
          Generated from a random seed. Re-roll until you like one.
        </Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <div className="inline-flex size-16 items-center rounded-full border p-4">
            <Identicon seed={seed} />
          </div>
          <Button disabled={pending} onClick={handleReroll} variant="outline">
            {pending ? 'Re-rolling…' : 'Re-roll'}
          </Button>
        </div>
        <FormStatus status={status} />
      </Card.Content>
    </Card.Root>
  );
}

function EmailCard({ email, mailerAvailable }: { email: string; mailerAvailable: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(email);
  const { pending, status, setStatus, run } = useFormAction();

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    void run(async () => {
      const { error } = await authClient.changeEmail({ newEmail: value });

      if (error) {
        setStatus({ kind: 'error', message: error.message ?? 'Could not update the email.' });
        return;
      }

      setStatus({
        kind: 'success',
        message: mailerAvailable
          ? 'Check your current inbox to confirm the change.'
          : 'Email updated.',
      });
      await router.invalidate();
    });
  }

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title render={<h2>Email</h2>} />
        <Card.Description>
          Used to sign in. The seed values from the environment only apply to the first boot.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <Form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <Field.Root name="email">
            <Field.Label>Email</Field.Label>
            <Input
              autoComplete="email"
              onChange={(event) => setValue(event.target.value)}
              required
              type="email"
              value={value}
            />
            <Field.Error match="valueMissing">Email is required.</Field.Error>
            <Field.Error match="typeMismatch">Email is invalid.</Field.Error>
          </Field.Root>
          <FormStatus status={status} />
          <div>
            <Button
              aria-describedby="settings-email-save-hint"
              disabled={pending || value === email}
              focusableWhenDisabled
              type="submit"
            >
              Save email
            </Button>
            <span className="sr-only" id="settings-email-save-hint">
              Change the email to enable saving
            </span>
          </div>
        </Form>
      </Card.Content>
    </Card.Root>
  );
}

function PasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const { pending, status, setStatus, run } = useFormAction();

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    void run(async () => {
      const { error } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });

      if (error) {
        setStatus({ kind: 'error', message: error.message ?? 'Could not update the password.' });
        return;
      }

      setCurrentPassword('');
      setNewPassword('');
      setStatus({ kind: 'success', message: 'Password updated. Other sessions were signed out.' });
    });
  }

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title render={<h2>Password</h2>} />
        <Card.Description>Changing the password signs out every other session.</Card.Description>
      </Card.Header>
      <Card.Content>
        <Form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <Field.Group>
            <Field.Root name="current-password">
              <Field.Label>Current password</Field.Label>
              <Input
                autoComplete="current-password"
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
                type="password"
                value={currentPassword}
              />
              <Field.Error match="valueMissing">Current password is required.</Field.Error>
            </Field.Root>
            <Field.Root name="new-password">
              <Field.Label>New password</Field.Label>
              <Input
                autoComplete="new-password"
                minLength={8}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                type="password"
                value={newPassword}
              />
              <Field.Error match="valueMissing">New password is required.</Field.Error>
              <Field.Error match="tooShort">Password must be at least 8 characters.</Field.Error>
            </Field.Root>
          </Field.Group>
          <FormStatus status={status} />
          <div>
            <Button disabled={pending} type="submit">
              Change password
            </Button>
          </div>
        </Form>
      </Card.Content>
    </Card.Root>
  );
}

function ConnectionRow({ connection }: { connection: McpConnection }) {
  const router = useRouter();
  const action = useFormAction();

  function handleRevoke() {
    void action.run(async () => {
      await revokeMcpConnectionFn({ data: { clientId: connection.clientId } });
      await router.invalidate();
    });
  }

  const lastActivity = connection.lastGrantAt ?? connection.createdAt;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate font-medium">{connection.name ?? 'Unnamed client'}</p>
        <p className="text-foreground-muted text-sm">
          {connection.activeGrants > 0
            ? `${connection.activeGrants} active grant${connection.activeGrants === 1 ? '' : 's'}`
            : 'No active grants'}
          {lastActivity ? (
            <>
              {' · last authorized '}
              <RelativeTime value={lastActivity} />
            </>
          ) : null}
          {connection.scopes.length > 0 ? ` · ${connection.scopes.join(', ')}` : ''}
        </p>
      </div>
      <ConfirmDestructiveAction
        action={action}
        actionLabel="Revoke"
        description="The client’s registration and tokens are removed and it can no longer publish. Access ends immediately, including for tokens it already holds; the client can reconnect later by authorizing again."
        onConfirm={handleRevoke}
        pendingLabel="Revoking…"
        title={`Revoke “${connection.name ?? connection.clientId}”?`}
        trigger={<Button disabled={action.pending} variant="destructive" />}
      />
    </div>
  );
}

function ConnectionsCard({ connections }: { connections: McpConnection[] }) {
  return (
    <Card.Root>
      <Card.Header>
        <Card.Title render={<h2>MCP connections</h2>} />
        <Card.Description>
          Clients that authorized against this gallery via OAuth (claude.ai connectors, Claude Code,
          scripts). Revoking removes the registration and all of its tokens. See the{' '}
          <Link className="text-foreground underline underline-offset-4" to="/docs">
            docs
          </Link>{' '}
          for how to connect a new client.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        {connections.length === 0 ? (
          <p className="text-foreground-muted text-sm">Nothing has connected yet.</p>
        ) : (
          <div className="flex flex-col">
            {connections.map((connection) => (
              <ConnectionRow connection={connection} key={connection.clientId} />
            ))}
          </div>
        )}
      </Card.Content>
    </Card.Root>
  );
}

function artifactCount(count: number) {
  return `${count} artifact${count === 1 ? '' : 's'}`;
}

function TagRow({ tag, count }: TagUsage) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(tag);
  const renameAction = useFormAction();
  const removeAction = useFormAction();

  function startEditing() {
    setValue(tag);
    renameAction.setStatus(null);
    setEditing(true);
  }

  function handleRename(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    void renameAction.run(async () => {
      await renameTagFn({ data: { from: tag, to: value } });
      setEditing(false);
      await router.invalidate();
    });
  }

  function handleRemove() {
    void removeAction.run(async () => {
      await removeTagFn({ data: { tag } });
      await router.invalidate();
    });
  }

  return (
    <div className="flex flex-col gap-2 border-b py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{tag}</p>
          <p className="text-foreground-muted text-sm">{artifactCount(count)}</p>
        </div>
        {editing ? null : (
          <div className="flex items-center gap-2">
            <Button onClick={startEditing} variant="outline">
              Rename
            </Button>
            <ConfirmDestructiveAction
              action={removeAction}
              actionLabel="Delete"
              description={
                <>
                  <strong className="text-foreground font-medium">{tag}</strong> is removed from{' '}
                  {artifactCount(count)}. The artifacts themselves are untouched.
                </>
              }
              onConfirm={handleRemove}
              pendingLabel="Deleting…"
              title={`Delete “${tag}”?`}
              trigger={<Button disabled={removeAction.pending} variant="destructive" />}
            />
          </div>
        )}
      </div>
      {editing ? (
        <Form className="flex flex-col gap-2" onSubmit={handleRename}>
          <Field.Root name="tag">
            <Field.Label>New name</Field.Label>
            <div className="flex items-center gap-2">
              <Input
                maxLength={50}
                onChange={(event) => setValue(event.target.value)}
                required
                value={value}
              />
              <Button disabled={renameAction.pending} type="submit">
                {renameAction.pending ? 'Saving…' : 'Save'}
              </Button>
              <Button
                disabled={renameAction.pending}
                onClick={() => setEditing(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
            </div>
            <Field.Error match="valueMissing">Tag name is required.</Field.Error>
          </Field.Root>
        </Form>
      ) : null}
      <FormStatus status={renameAction.status} />
    </div>
  );
}

function TagsCard({ tags }: { tags: TagUsage[] }) {
  return (
    <Card.Root>
      <Card.Header>
        <Card.Title render={<h2>Tags</h2>} />
        <Card.Description>
          The whole tag vocabulary. Renaming a tag into one that already exists merges them. Renames
          and deletes apply to archived and deleted artifacts too, so counts include them.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        {tags.length === 0 ? (
          <p className="text-foreground-muted text-sm">No tags yet.</p>
        ) : (
          <div className="flex flex-col">
            {tags.map((usage) => (
              <TagRow count={usage.count} key={usage.tag} tag={usage.tag} />
            ))}
          </div>
        )}
      </Card.Content>
    </Card.Root>
  );
}

export function SettingsView({
  email,
  seed,
  connections,
  mailerAvailable,
  tags,
}: {
  email: string;
  seed: string;
  connections: McpConnection[];
  mailerAvailable: boolean;
  tags: TagUsage[];
}) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <AvatarCard seed={seed} />
      <EmailCard email={email} mailerAvailable={mailerAvailable} />
      <PasswordCard />
      <ConnectionsCard connections={connections} />
      <TagsCard tags={tags} />
    </div>
  );
}
