import { describe, expect, it, vi } from 'vitest';

/** The route module pulls in the artifact server fns (and better-sqlite3 behind them). */
vi.mock('@/lib/artifacts', () => ({
  listArtifactsFn: vi.fn(() => Promise.resolve({ items: [], nextCursor: null })),
  purgeArtifactFn: vi.fn(),
  restoreArtifactFn: vi.fn(),
}));

const { Route } = await import('./index');

function validate(search: Record<string, unknown>) {
  const validateSearch = Route.options.validateSearch as (
    search: Record<string, unknown>,
  ) => Record<string, unknown>;

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

  it('keeps a valid query, tags, type and sort', () => {
    expect(
      validate({ query: 'kyoto', tags: ['travel', 'japan'], type: 'markdown', sort: 'title-asc' }),
    ).toMatchObject({
      query: 'kyoto',
      tags: ['travel', 'japan'],
      type: 'markdown',
      sort: 'title-asc',
    });
  });

  it.each([
    [{ query: '' }, 'query', undefined],
    [{ query: 42 }, 'query', undefined],
    [{ tags: 'solo' }, 'tags', undefined],
    [{ tags: ['a', 1, null, 'b'] }, 'tags', ['a', 'b']],
    [{ type: 'pdf' }, 'type', undefined],
    [{ sort: 'random' }, 'sort', undefined],
    [{ archived: 'true' }, 'archived', undefined],
    [{ deleted: 'true' }, 'deleted', undefined],
  ])('sanitizes %o to %s = %o', (search, field, expected) => {
    expect(validate(search)[field]).toEqual(expected);
  });
});
