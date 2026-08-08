import { itineraryFixture } from '@/catalog/fixtures/itinerary';
import type { ArtifactListItem, ArtifactVersion } from '@/database/repository';

/**
 * Fixture artifact list row; the default id matches makeVersion's default artifactId so the two
 * compose without overrides. Typed as the wider list row (an `Artifact` plus the gallery's
 * interaction signals) so it serves both surfaces; the signals default to "nothing to report".
 */
export function makeArtifact(overrides: Partial<ArtifactListItem> = {}): ArtifactListItem {
  return {
    id: 'fixture-id',
    title: 'Kyoto Trip',
    description: 'A test description',
    type: 'spec',
    tags: ['travel', 'japan'],
    createdAt: 1000,
    updatedAt: 2000,
    archivedAt: null,
    deletedAt: null,
    stateUpdatedAt: null,
    answers: null,
    ...overrides,
  };
}

/**
 * Fixture ArtifactVersion; the default body is a valid serialized spec (itineraryFixture), matching
 * makeArtifact's default type.
 */
export function makeVersion(overrides: Partial<ArtifactVersion> = {}): ArtifactVersion {
  return {
    id: 'v1',
    artifactId: 'fixture-id',
    version: 1,
    body: JSON.stringify(itineraryFixture),
    createdAt: 1000,
    ...overrides,
  };
}
