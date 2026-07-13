import { itineraryFixture } from '@/catalog/fixtures/itinerary';
import type { Artifact, ArtifactVersion } from '@/database/repository';

/**
 * Fixture Artifact; the default id matches makeVersion's default artifactId so the two compose
 * without overrides.
 */
export function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
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
