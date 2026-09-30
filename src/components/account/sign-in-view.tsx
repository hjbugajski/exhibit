import { useState, type SubmitEvent } from 'react';

import { useNavigate } from '@tanstack/react-router';

import { AuthScreen } from '@/components/account/auth-screen';
import { FormStatus } from '@/components/blocks/form-status';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { authClient } from '@/lib/auth-client';
import { sameOriginPath } from '@/lib/same-origin-path';
import { useFormAction, type ActionStatus } from '@/lib/use-form-action';

const RESET_STATUS: ActionStatus = {
  kind: 'success',
  message: 'Password reset. Sign in with your new password.',
};

export function SignInView({
  redirect,
  reset,
  resetAvailable,
}: {
  redirect?: string;
  reset?: boolean;
  resetAvailable: boolean;
}) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Two separate pending/run tracks so the submit and forgot-password buttons disable
  // independently, but one status slot below — whichever track ran most recently wins (each clears
  // the other's status before running).
  const signIn = useFormAction();
  const forgotPassword = useFormAction();
  // A local flag rather than a seeded status: `run` clears status on every call, so a seeded
  // message would reappear while a later attempt is pending.
  const [resetNotice, setResetNotice] = useState(reset ?? false);
  const status = signIn.status ?? forgotPassword.status ?? (resetNotice ? RESET_STATUS : null);

  function handleForgotPassword() {
    setResetNotice(false);
    signIn.setStatus(null);

    void forgotPassword.run(async () => {
      if (!email) {
        forgotPassword.setStatus({
          kind: 'error',
          message: 'Enter your email first, then request a reset link.',
        });
        return;
      }

      const { error } = await authClient.requestPasswordReset({
        email,
        redirectTo: '/reset-password',
      });

      if (error) {
        forgotPassword.setStatus({
          kind: 'error',
          message: error.message ?? 'Could not request a reset link.',
        });
        return;
      }

      forgotPassword.setStatus({
        kind: 'success',
        message: 'If that email has an account, a reset link is on its way.',
      });
    });
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setResetNotice(false);
    forgotPassword.setStatus(null);

    void signIn.run(async () => {
      const { data, error } = await authClient.signIn.email({ email, password });

      if (error) {
        signIn.setStatus({ kind: 'error', message: error.message ?? 'Invalid email or password.' });
        return;
      }

      // Signing in from an OAuth authorize request: the server answers with the next URL and the
      // auth client is already loading it, so a client navigation would only load the gallery
      // behind a page that is about to be replaced.
      if (data.redirect && data.url) {
        return;
      }

      await navigate({ to: sameOriginPath(redirect) ?? '/' });
    });
  }

  return (
    <AuthScreen title="Sign in">
      <Form className="flex flex-col gap-6" onSubmit={handleSubmit}>
        <Field.Group>
          <Field.Root name="email">
            <Field.Label>Email</Field.Label>
            <Input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
            <Field.Error match="valueMissing">Email is required.</Field.Error>
            <Field.Error match="typeMismatch">Email is invalid.</Field.Error>
          </Field.Root>
          <Field.Root name="password">
            <Field.Label>Password</Field.Label>
            <Input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
            <Field.Error match="valueMissing">Password is required.</Field.Error>
          </Field.Root>
        </Field.Group>
        <FormStatus status={status} />
        <Button className="w-full" disabled={signIn.pending} type="submit">
          {signIn.pending ? <Spinner data-icon="inline-start" /> : null}
          {signIn.pending ? 'Signing in…' : 'Sign in'}
        </Button>
        {resetAvailable ? (
          <Button
            className="text-foreground-muted w-full"
            disabled={forgotPassword.pending}
            onClick={handleForgotPassword}
            type="button"
            variant="link"
          >
            {forgotPassword.pending ? 'Sending…' : 'Forgot password?'}
          </Button>
        ) : null}
      </Form>
    </AuthScreen>
  );
}
