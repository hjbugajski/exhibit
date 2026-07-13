// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { McpConnection } from '@/lib/account';
import { renderWithRouter } from '@testing/router';

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    updateUser: vi.fn(),
    changeEmail: vi.fn(),
    changePassword: vi.fn(),
  },
}));
vi.mock('@/lib/account', () => ({
  revokeMcpConnectionFn: vi.fn(),
}));

const { authClient } = await import('@/lib/auth-client');
const { revokeMcpConnectionFn } = await import('@/lib/account');
const { SettingsView } = await import('@/components/account/settings-view');

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function makeConnection(overrides: Partial<McpConnection> = {}): McpConnection {
  return {
    clientId: 'client-1',
    name: 'Claude Code',
    createdAt: 1000,
    lastGrantAt: 2000,
    activeGrants: 1,
    scopes: ['openid'],
    ...overrides,
  };
}

describe('SettingsView', () => {
  it('renders each section title as a real heading', async () => {
    renderWithRouter(
      <SettingsView
        connections={[]}
        email="owner@example.com"
        mailerAvailable={false}
        seed="seed-1"
      />,
    );

    expect(await screen.findByRole('heading', { level: 2, name: 'Email' })).toBeTruthy();
  });

  describe('EmailCard', () => {
    it('disables the save button until the email is actually changed, and renders an error via FormStatus', async () => {
      vi.mocked(authClient.changeEmail).mockResolvedValue({
        error: { message: 'Email already in use' },
      } as never);

      renderWithRouter(
        <SettingsView
          connections={[]}
          email="owner@example.com"
          mailerAvailable={false}
          seed="seed-1"
        />,
      );

      const saveButton = await screen.findByRole('button', {
        name: 'Save email',
      });

      expect(saveButton.getAttribute('aria-disabled')).toBe('true');

      // aria-disabled (not the native `disabled` attribute) keeps the button focusable; Base UI's
      // button handler still no-ops on click while aria-disabled is true.
      fireEvent.click(saveButton);
      expect(authClient.changeEmail).not.toHaveBeenCalled();

      const input = screen.getByLabelText('Email');

      fireEvent.change(input, { target: { value: 'new@example.com' } });
      expect(saveButton.getAttribute('aria-disabled')).toBe('false');

      fireEvent.click(saveButton);

      expect(await screen.findByText('Email already in use')).toBeTruthy();
      expect(authClient.changeEmail).toHaveBeenCalledWith({ newEmail: 'new@example.com' });
    });
  });

  describe('PasswordCard', () => {
    it('changes the password with revokeOtherSessions, clears both fields, and shows the signed-out message', async () => {
      vi.mocked(authClient.changePassword).mockResolvedValue({ error: null } as never);

      renderWithRouter(
        <SettingsView
          connections={[]}
          email="owner@example.com"
          mailerAvailable={false}
          seed="seed-1"
        />,
      );

      const currentPassword = (await screen.findByLabelText(
        'Current password',
      )) as HTMLInputElement;
      const newPassword = screen.getByLabelText('New password') as HTMLInputElement;

      fireEvent.change(currentPassword, { target: { value: 'old-password' } });
      fireEvent.change(newPassword, { target: { value: 'new-password-123' } });
      fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

      expect(
        await screen.findByText('Password updated. Other sessions were signed out.'),
      ).toBeTruthy();
      expect(authClient.changePassword).toHaveBeenCalledWith({
        currentPassword: 'old-password',
        newPassword: 'new-password-123',
        revokeOtherSessions: true,
      });
      expect(currentPassword.value).toBe('');
      expect(newPassword.value).toBe('');
    });

    it('leaves the submit button re-enabled after a failed password change', async () => {
      vi.mocked(authClient.changePassword).mockResolvedValue({
        error: { message: 'Current password is incorrect' },
      } as never);

      renderWithRouter(
        <SettingsView
          connections={[]}
          email="owner@example.com"
          mailerAvailable={false}
          seed="seed-1"
        />,
      );

      fireEvent.change(await screen.findByLabelText('Current password'), {
        target: { value: 'wrong-password' },
      });
      fireEvent.change(screen.getByLabelText('New password'), {
        target: { value: 'new-password-123' },
      });

      const submitButton = screen.getByRole('button', {
        name: 'Change password',
      }) as HTMLButtonElement;

      fireEvent.click(submitButton);

      expect(await screen.findByText('Current password is incorrect')).toBeTruthy();
      expect(submitButton.disabled).toBe(false);
    });
  });

  describe('ConnectionRow', () => {
    it('revokes the connection for the confirmed row by clientId', async () => {
      vi.mocked(revokeMcpConnectionFn).mockResolvedValue({ revoked: true });

      renderWithRouter(
        <SettingsView
          connections={[makeConnection({ clientId: 'client-42', name: 'Claude Code' })]}
          email="owner@example.com"
          mailerAvailable={false}
          seed="seed-1"
        />,
      );

      fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }));

      // The trigger and the dialog's confirm action are both labeled "Revoke"; once the dialog
      // opens (Base UI portals its content), the confirm action is the second match.
      const revokeButtons = await screen.findAllByRole('button', { name: 'Revoke' });

      fireEvent.click(revokeButtons.at(-1) as HTMLElement);

      expect(revokeMcpConnectionFn).toHaveBeenCalledWith({ data: { clientId: 'client-42' } });
    });
  });
});
