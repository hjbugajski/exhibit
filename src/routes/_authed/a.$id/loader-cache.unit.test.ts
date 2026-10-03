import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/artifacts', () => ({
  getArtifactDetailFn: vi.fn(() => Promise.resolve(null)),
  saveArtifactStateFn: vi.fn(() => Promise.resolve()),
  deleteArtifactFn: vi.fn(() => Promise.resolve()),
  setArtifactArchivedFn: vi.fn(() => Promise.resolve()),
  revertArtifactVersionFn: vi.fn(() => Promise.resolve()),
  updateArtifactMetadataFn: vi.fn(() => Promise.resolve()),
}));

const { Route: LatestRoute } = await import('./index');
const { Route: VersionRoute } = await import('./v.$n');

/**
 * Regression: a cached detail match re-rendered its old loader data on re-entry, seeding the state
 * store from answers older than the server's copy; the next edit then erased the newer answers.
 */
describe('artifact detail routes', () => {
  it.each([
    ['/a/$id', LatestRoute],
    ['/a/$id/v/$n', VersionRoute],
  ])('%s drops its match on exit so re-entry loads fresh state', (_path, route) => {
    expect(route.options.gcTime).toBe(0);
  });
});
