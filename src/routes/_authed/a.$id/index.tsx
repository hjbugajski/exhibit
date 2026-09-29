import { createFileRoute, notFound } from '@tanstack/react-router';

import { ArtifactDetailView } from '@/components/artifacts/artifact-detail';
import { loadStateStoreFactory } from '@/components/artifacts/state-store-loader';
import { getArtifactDetailFn } from '@/lib/artifacts';

export const Route = createFileRoute('/_authed/a/$id/')({
  loader: async ({ params }) => {
    const detail = await getArtifactDetailFn({ data: { id: params.id } });

    if (!detail) {
      throw notFound();
    }

    // Loads the state store's factory with the route instead of suspending the view on it.
    if (detail.artifact.type !== 'html') {
      await loadStateStoreFactory();
    }

    return detail;
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.artifact.title} · Exhibit` : 'Exhibit' }],
  }),
  // Never cache an exited match: re-entry would render its old loader data at once and seed the
  // state store from answers older than the server's, which the next save would overwrite.
  gcTime: 0,
  component: ArtifactDetailRoute,
});

function ArtifactDetailRoute() {
  const { id } = Route.useParams();
  const detail = Route.useLoaderData();

  // Keyed by artifact id: ArtifactDetailView seeds its state store once per mount, so a different
  // artifact must get a fresh mount. gcTime 0 makes every mount a fresh load, so the seed is never
  // older than the server's state.
  return <ArtifactDetailView detail={detail} id={id} key={id} />;
}
