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
  component: ArtifactDetailRoute,
});

function ArtifactDetailRoute() {
  const { id } = Route.useParams();
  const detail = Route.useLoaderData();

  // Same keying as the latest-version route: fresh mount per artifact so the spec state store
  // re-seeds from the loader.
  return <ArtifactDetailView detail={detail} id={id} key={id} />;
}
