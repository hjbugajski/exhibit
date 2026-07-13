import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth-session', () => ({
  getServerSession: vi.fn(),
}));

const { getServerSession } = await import('@/lib/auth-session');
const { Route } = await import('./_authed');

describe('/_authed beforeLoad', () => {
  it('redirects to /sign-in with the current location as the redirect param when unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    let caught: unknown;
    try {
      await Route.options.beforeLoad?.({ location: { href: '/some/path?a=b' } } as never);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Response);
    expect(
      (caught as { options: { to: string; search: { redirect: string } } }).options,
    ).toMatchObject({ to: '/sign-in', search: { redirect: '/some/path?a=b' } });
  });

  it('returns the session in context when authenticated', async () => {
    const session = { user: { id: '1', email: 'owner@example.com' }, session: { id: 's1' } };
    vi.mocked(getServerSession).mockResolvedValue(session as never);

    const result = await Route.options.beforeLoad?.({ location: { href: '/' } } as never);

    expect(result).toEqual({ session });
  });
});
