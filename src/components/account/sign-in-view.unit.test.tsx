// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithRouter } from '@testing/router';

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: { email: vi.fn() },
    requestPasswordReset: vi.fn(),
  },
}));

const { authClient } = await import('@/lib/auth-client');
const { SignInView } = await import('@/components/account/sign-in-view');

const RESET_MESSAGE = 'Password reset. Sign in with your new password.';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SignInView', () => {
  it('blocks an empty submit with inline required errors instead of calling signIn', async () => {
    renderWithRouter(<SignInView resetAvailable={false} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Email is required.')).toBeTruthy();
    expect(screen.getByText('Password is required.')).toBeTruthy();
    expect(authClient.signIn.email).not.toHaveBeenCalled();
  });

  it('confirms a completed password reset as a status', async () => {
    renderWithRouter(<SignInView reset resetAvailable={false} />);

    expect((await screen.findByText(RESET_MESSAGE)).closest('[role="status"]')).toBeTruthy();
  });

  it('shows no reset confirmation without the reset flag', async () => {
    renderWithRouter(<SignInView resetAvailable={false} />);

    await screen.findByRole('button', { name: 'Sign in' });
    expect(screen.queryByText(RESET_MESSAGE)).toBeNull();
  });

  it('replaces the reset confirmation with the sign-in error', async () => {
    vi.mocked(authClient.signIn.email).mockResolvedValue({
      error: { message: 'Invalid email or password.' },
    } as never);

    renderWithRouter(<SignInView reset resetAvailable={false} />);

    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'owner@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Invalid email or password.')).toBeTruthy();
    expect(screen.queryByText(RESET_MESSAGE)).toBeNull();
  });

  async function submitCredentials() {
    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'owner@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  }

  it('navigates to the gallery after a plain sign-in', async () => {
    vi.mocked(authClient.signIn.email).mockResolvedValue({
      data: { redirect: false },
      error: null,
    } as never);

    renderWithRouter(<SignInView resetAvailable={false} />, {
      mountPath: '/sign-in',
      extraPaths: ['/'],
    });
    await submitCredentials();

    await vi.waitFor(() => expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull());
  });

  it('leaves navigation to the server redirect when sign-in resumes an authorize flow', async () => {
    vi.mocked(authClient.signIn.email).mockResolvedValue({
      data: { redirect: true, url: 'https://exhibit.example/consent?sig=abc' },
      error: null,
    } as never);

    renderWithRouter(<SignInView resetAvailable={false} />, {
      mountPath: '/sign-in',
      extraPaths: ['/'],
    });
    await submitCredentials();

    await vi.waitFor(() => expect(authClient.signIn.email).toHaveBeenCalled());
    // Proves a negative, so it needs a settle window: a client navigation would unmount the form.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByRole('button', { name: /sign/i })).toBeTruthy();
  });
});
