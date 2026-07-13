import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth-session', () => ({
  getServerSession: vi.fn(),
}));

const { getServerSession } = await import('@/lib/auth-session');
const { Route } = await import('./reset-password');

describe('/reset-password beforeLoad', () => {
  it('redirects to / when authenticated with no token', async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: '1', email: 'owner@example.com' },
      session: { id: 's1' },
    } as never);

    let caught: unknown;
    try {
      await Route.options.beforeLoad?.({ search: {} } as never);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Response);
    expect((caught as { options: { to: string } }).options).toMatchObject({ to: '/' });
  });

  it('does not redirect when authenticated with a token', async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: '1', email: 'owner@example.com' },
      session: { id: 's1' },
    } as never);

    let caught: unknown;
    try {
      await Route.options.beforeLoad?.({ search: { token: 'abc' } } as never);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeUndefined();
  });

  it('does not redirect when unauthenticated without a token', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    let caught: unknown;
    try {
      await Route.options.beforeLoad?.({ search: {} } as never);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeUndefined();
  });

  it('does not redirect when unauthenticated with a token', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    let caught: unknown;
    try {
      await Route.options.beforeLoad?.({ search: { token: 'abc' } } as never);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeUndefined();
  });
});
