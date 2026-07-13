import { useState } from 'react';

import { Link, useNavigate } from '@tanstack/react-router';

import { AuthScreen } from '@/components/account/auth-screen';
import { FormStatus } from '@/components/blocks/form-status';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { authClient } from '@/lib/auth-client';
import { useFormAction } from '@/lib/use-form-action';

export function ResetPasswordView({ token }: { token?: string }) {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const { pending, status, setStatus, run } = useFormAction();

  return (
    <AuthScreen title="Reset password">
      {token ? (
        <Form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();

            void run(async () => {
              const { error } = await authClient.resetPassword({ newPassword, token });

              if (error) {
                setStatus({
                  kind: 'error',
                  message: error.message ?? 'Could not reset the password.',
                });
                return;
              }

              await navigate({ to: '/sign-in' });
            });
          }}
        >
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
          <FormStatus status={status} />
          <Button className="w-full" disabled={pending} type="submit">
            {pending ? 'Resetting…' : 'Reset password'}
          </Button>
        </Form>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-foreground-muted text-sm">
            This reset link is missing its token. Request a new one from the sign-in page.
          </p>
          <Button nativeButton={false} render={<Link to="/sign-in">Back to sign in</Link>} />
        </div>
      )}
    </AuthScreen>
  );
}
