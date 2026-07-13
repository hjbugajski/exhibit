import { createFileRoute } from '@tanstack/react-router';

import { Home } from '@/components/artifacts/home';
import { artifactSorts, type ArtifactSort } from '@/lib/artifact-sorts';
import { listArtifactsFn } from '@/lib/artifacts';

interface GallerySearch {
  query?: string;
  tags?: string[];
  type?: 'spec' | 'html';
  archived?: boolean;
  sort?: ArtifactSort;
}

export const Route = createFileRoute('/_authed/')({
  validateSearch: (search: Record<string, unknown>): GallerySearch => ({
    query: typeof search.query === 'string' && search.query ? search.query : undefined,
    tags: Array.isArray(search.tags)
      ? search.tags.filter((tag): tag is string => typeof tag === 'string')
      : undefined,
    type: search.type === 'spec' || search.type === 'html' ? search.type : undefined,
    archived: search.archived === true ? true : undefined,
    sort: artifactSorts.includes(search.sort as ArtifactSort)
      ? (search.sort as ArtifactSort)
      : undefined,
  }),
  loaderDeps: ({ search }) => ({
    query: search.query,
    tags: search.tags,
    type: search.type,
    archived: search.archived,
    sort: search.sort,
  }),
  loader: async ({ deps }) => {
    const page = await listArtifactsFn({
      data: {
        query: deps.query,
        tags: deps.tags,
        type: deps.type,
        archived: deps.archived,
        sort: deps.sort,
      },
    });

    return { page };
  },
  component: Home,
});
