// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithRouter } from '@testing/router';

vi.mock('@/lib/auth-client', () => ({
  authClient: { oauth2: { consent: vi.fn() } },
}));

const { authClient } = await import('@/lib/auth-client');
const { ConsentView } = await import('@/components/account/consent-view');

const HOUR_AGO = Date.now() - 3_600_000;

function client(
  overrides: Partial<{
    name: string | null;
    redirectHosts: string[];
    createdAt: number | null;
  }> = {},
) {
  return { name: 'Claude Code', redirectHosts: ['claude.ai'], createdAt: HOUR_AGO, ...overrides };
}

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
  it('renders the registered name and every redirect host from the loader data', async () => {
    renderWithRouter(
      <ConsentView
        client={client({ redirectHosts: ['claude.ai', '127.0.0.1:8765'] })}
        clientId="client-1"
        scope="openid"
      />,
    );

    expect(await screen.findByText('Claude Code')).toBeTruthy();
    expect(screen.getByText('claude.ai, 127.0.0.1:8765')).toBeTruthy();
  });

  it('does not warn about an established registration', async () => {
    renderWithRouter(<ConsentView client={client()} clientId="client-1" />);

    await screen.findByText('Claude Code');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('warns when the client registered minutes ago', async () => {
    renderWithRouter(
      <ConsentView client={client({ createdAt: Date.now() - 30_000 })} clientId="client-1" />,
    );

    // The timestamp is a nested <time>, so the title's text spans several nodes.
    const title = await screen.findByText(/^Registered/);

    expect(title.textContent).toBe('Registered just now');
  });

  /** Lookup failure and "no such registration" are the same story to the owner: nothing vouches. */
  it('falls back to the clientId and warns when there is no client on record', async () => {
    renderWithRouter(<ConsentView client={null} clientId="client-77" />);

    expect(await screen.findByText('client-77')).toBeTruthy();
    expect(screen.getByText('Registration unknown')).toBeTruthy();
    expect(screen.getByText('No redirect host is on record for this client.')).toBeTruthy();
  });

  it('renders scope items when scope has entries', async () => {
    renderWithRouter(<ConsentView client={client()} scope="openid email" />);

    expect(await screen.findByText('openid')).toBeTruthy();
    expect(screen.getByText('email')).toBeTruthy();
  });

  it('falls back to a generic name with no client and no clientId', async () => {
    renderWithRouter(<ConsentView client={null} />);

    expect(await screen.findByText('This application')).toBeTruthy();
  });

  it('Allow calls consent with accept true and navigates to the returned url', async () => {
    const hrefs = stubLocation('?client_id=client-1&scope=openid');

    vi.mocked(authClient.oauth2.consent).mockResolvedValue({
      data: { url: 'https://claude.ai/callback?code=abc' },
      error: null,
    } as never);

    renderWithRouter(<ConsentView client={client()} clientId="client-1" scope="openid" />);

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

    renderWithRouter(<ConsentView client={client()} clientId="client-1" />);

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

    renderWithRouter(<ConsentView client={client()} clientId="client-1" />);

    const allowButton = (await screen.findByRole('button', {
      name: 'Allow',
    })) as HTMLButtonElement;

    fireEvent.click(allowButton);

    expect(await screen.findByText('Failed to process consent')).toBeTruthy();
    expect(hrefs).toHaveLength(0);
    expect(allowButton.disabled).toBe(false);
  });
});
