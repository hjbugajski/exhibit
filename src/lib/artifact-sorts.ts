/**
 * Client-safe: imported as a runtime value by route/components, so it must not live in
 * repository.ts (whose drizzle imports would leak into the client bundle).
 */
export const artifactSorts = [
  'updated-desc',
  'updated-asc',
  'created-desc',
  'created-asc',
  'title-asc',
  'title-desc',
] as const;

export type ArtifactSort = (typeof artifactSorts)[number];

export const artifactTypes = ['spec', 'html'] as const;
