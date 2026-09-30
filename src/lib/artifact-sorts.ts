export const artifactSorts = [
  'updated-desc',
  'updated-asc',
  'created-desc',
  'created-asc',
  'title-asc',
  'title-desc',
  'state-updated-desc',
] as const;

export type ArtifactSort = (typeof artifactSorts)[number];
