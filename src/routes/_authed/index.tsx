import { createFileRoute } from '@tanstack/react-router';

import { Home } from '@/components/artifacts/home';
import type { ArtifactType } from '@/database/repository';
import { artifactSorts, artifactTypes, type ArtifactSort } from '@/lib/artifact-sorts';
import { listArtifactsFn } from '@/lib/artifacts';

interface GallerySearch {
  query?: string;
  tags?: string[];
  type?: ArtifactType;
  archived?: boolean;
  deleted?: boolean;
  sort?: ArtifactSort;
}

export const Route = createFileRoute('/_authed/')({
  validateSearch: (search: Record<string, unknown>): GallerySearch => {
    // The trash is a flat view that ignores the archived split, so the two filters can't both be
    // on; a hand-written URL carrying both resolves to the trash.
    const deleted = search.deleted === true ? true : undefined;

    return {
      query: typeof search.query === 'string' && search.query ? search.query : undefined,
      tags: Array.isArray(search.tags)
        ? search.tags.filter((tag): tag is string => typeof tag === 'string')
        : undefined,
      type: artifactTypes.includes(search.type as ArtifactType)
        ? (search.type as ArtifactType)
        : undefined,
      archived: !deleted && search.archived === true ? true : undefined,
      deleted,
      sort: artifactSorts.includes(search.sort as ArtifactSort)
        ? (search.sort as ArtifactSort)
        : undefined,
    };
  },
  loaderDeps: ({ search }) => ({
    query: search.query,
    tags: search.tags,
    type: search.type,
    archived: search.archived,
    deleted: search.deleted,
    sort: search.sort,
  }),
  loader: async ({ deps }) => {
    const page = await listArtifactsFn({
      data: {
        query: deps.query,
        tags: deps.tags,
        type: deps.type,
        archived: deps.archived,
        deleted: deps.deleted,
        sort: deps.sort,
      },
    });

    return { page };
  },
  component: Home,
});
