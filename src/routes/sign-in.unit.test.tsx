import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth-session', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/account', () => ({
  passwordResetAvailableFn: vi.fn(),
}));

const { getServerSession } = await import('@/lib/auth-session');
const { Route } = await import('./sign-in');

describe('/sign-in beforeLoad', () => {
  it('redirects to / when authenticated with no redirect param', async () => {
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

  it('redirects to the redirect param when authenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: '1', email: 'owner@example.com' },
      session: { id: 's1' },
    } as never);

    let caught: unknown;
    try {
      await Route.options.beforeLoad?.({ search: { redirect: '/a/xyz' } } as never);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Response);
    expect((caught as { options: { to: string } }).options).toMatchObject({ to: '/a/xyz' });
  });

  it('does not redirect when unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    let caught: unknown;
    try {
      await Route.options.beforeLoad?.({ search: {} } as never);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeUndefined();
  });
});

describe('/sign-in validateSearch', () => {
  const validateSearch = Route.options.validateSearch as (search: Record<string, unknown>) => {
    redirect?: string;
  };

  it('drops a backslash redirect that resolves off-origin', () => {
    expect(validateSearch({ redirect: '/\\evil.com' })).toEqual({});
  });

  it('keeps a same-origin redirect', () => {
    expect(validateSearch({ redirect: '/a/xyz' })).toEqual({ redirect: '/a/xyz' });
  });

  it('returns no redirect key when the param is absent', () => {
    expect(validateSearch({})).toEqual({});
  });
});
