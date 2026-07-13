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
});
