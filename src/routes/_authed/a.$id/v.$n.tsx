import { createFileRoute, notFound } from '@tanstack/react-router';

import { ArtifactDetailView } from '@/components/artifacts/artifact-detail';
import { getArtifactDetailFn } from '@/lib/artifacts';
import { parseVersionParam } from '@/lib/parse-version-param';

export const Route = createFileRoute('/_authed/a/$id/v/$n')({
  loader: async ({ params }) => {
    const version = parseVersionParam(params.n);

    if (version === undefined) {
      throw notFound();
    }

    const detail = await getArtifactDetailFn({ data: { id: params.id, version } });

    if (!detail) {
      throw notFound();
    }

    return detail;
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.artifact.title} · Exhibit` : 'Exhibit' }],
  }),
  // Uncached for the same reason as the latest-version route: the store must seed from the
  // server's current state.
  gcTime: 0,
  component: ArtifactDetailRoute,
});

function ArtifactDetailRoute() {
  const { id } = Route.useParams();
  const detail = Route.useLoaderData();

  // Same keying as the latest-version route: fresh mount per artifact so the state store re-seeds
  // from a fresh, uncached load.
  return <ArtifactDetailView detail={detail} id={id} key={id} />;
}
