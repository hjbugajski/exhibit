// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithRouter } from '@testing/router';

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    oauth2: {
      publicClient: vi.fn(),
      consent: vi.fn(),
    },
  },
}));

const { authClient } = await import('@/lib/auth-client');
const { ConsentView } = await import('@/components/account/consent-view');

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/**
 * The component reads `window.location.search` and assigns `window.location.href` directly;
 * happy-dom's real Location throws on an unresolvable href assignment, so tests stand up a minimal
 * stub and record every assignment instead.
 */
function stubLocation(search: string): string[] {
  const hrefs: string[] = [];

  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      search,
      get href() {
        return hrefs.at(-1) ?? '';
      },
      set href(value: string) {
        hrefs.push(value);
      },
    },
  });

  return hrefs;
}

describe('ConsentView', () => {
  it('renders client_name from a successful publicClient response', async () => {
    vi.mocked(authClient.oauth2.publicClient).mockResolvedValue({
      data: { client_id: 'client-1', client_name: 'Claude Code' },
    } as never);

    renderWithRouter(<ConsentView clientId="client-1" scope="openid" />);

    expect(await screen.findByText('Claude Code')).toBeTruthy();
  });

  it('falls back to clientId when the publicClient response fails schema validation', async () => {
    vi.mocked(authClient.oauth2.publicClient).mockResolvedValue({
      data: { client_name: 'Missing client_id' },
    } as never);

    renderWithRouter(<ConsentView clientId="client-77" />);

    expect(await screen.findByText('client-77')).toBeTruthy();
  });

  it('falls back to clientId when the publicClient fetch rejects', async () => {
    vi.mocked(authClient.oauth2.publicClient).mockRejectedValue(new Error('network error'));

    renderWithRouter(<ConsentView clientId="client-88" />);

    expect(await screen.findByText('client-88')).toBeTruthy();
  });

  it('renders scope items when scope has entries', async () => {
    renderWithRouter(<ConsentView scope="openid email" />);

    expect(await screen.findByText('openid')).toBeTruthy();
    expect(screen.getByText('email')).toBeTruthy();
    expect(screen.getByText('This application')).toBeTruthy();
  });

  it('Allow calls consent with accept true and navigates to the returned url', async () => {
    const hrefs = stubLocation('?client_id=client-1&scope=openid');

    vi.mocked(authClient.oauth2.consent).mockResolvedValue({
      data: { url: 'https://claude.ai/callback?code=abc' },
      error: null,
    } as never);

    renderWithRouter(<ConsentView clientId="client-1" scope="openid" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Allow' }));

    await waitFor(() => expect(hrefs.at(-1)).toBe('https://claude.ai/callback?code=abc'));
    expect(authClient.oauth2.consent).toHaveBeenCalledWith({
      accept: true,
      oauth_query: 'client_id=client-1&scope=openid',
    });
  });

  it('Deny calls consent with accept false', async () => {
    stubLocation('?client_id=client-1');

    vi.mocked(authClient.oauth2.consent).mockResolvedValue({
      data: { url: 'https://claude.ai/callback?error=access_denied' },
      error: null,
    } as never);

    renderWithRouter(<ConsentView clientId="client-1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Deny' }));

    await waitFor(() =>
      expect(authClient.oauth2.consent).toHaveBeenCalledWith({
        accept: false,
        oauth_query: 'client_id=client-1',
      }),
    );
  });

  it('shows the error via FormStatus, does not navigate, and re-enables the buttons', async () => {
    const hrefs = stubLocation('?client_id=client-1');

    vi.mocked(authClient.oauth2.consent).mockResolvedValue({
      data: null,
      error: { message: 'Failed to process consent' },
    } as never);

    renderWithRouter(<ConsentView clientId="client-1" />);

    const allowButton = (await screen.findByRole('button', {
      name: 'Allow',
    })) as HTMLButtonElement;

    fireEvent.click(allowButton);

    expect(await screen.findByText('Failed to process consent')).toBeTruthy();
    expect(hrefs).toHaveLength(0);
    expect(allowButton.disabled).toBe(false);
  });
});
