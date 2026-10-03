export const artifactTypes = ['spec', 'html', 'markdown'] as const;

export type ArtifactType = (typeof artifactTypes)[number];
