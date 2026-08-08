import { describe, expect, it, vi } from 'vitest';

/** The route module pulls in the artifact server fns (and better-sqlite3 behind them). */
vi.mock('@/lib/artifacts', () => ({
  listArtifactsFn: vi.fn(() => Promise.resolve({ items: [], nextCursor: null })),
  purgeArtifactFn: vi.fn(),
  restoreArtifactFn: vi.fn(),
}));

const { Route } = await import('./index');

function validate(search: Record<string, unknown>) {
  const validateSearch = Route.options.validateSearch as (search: Record<string, unknown>) => {
    archived?: boolean;
    deleted?: boolean;
  };

  return validateSearch(search);
}

describe('/_authed/ validateSearch', () => {
  it('keeps a lone archived or deleted filter', () => {
    expect(validate({ archived: true })).toMatchObject({ archived: true, deleted: undefined });
    expect(validate({ deleted: true })).toMatchObject({ archived: undefined, deleted: true });
  });

  it('prefers deleted when a URL carries both filters', () => {
    expect(validate({ archived: true, deleted: true })).toMatchObject({
      archived: undefined,
      deleted: true,
    });
  });
});
