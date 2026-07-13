import { createFileRoute, notFound } from '@tanstack/react-router';

import { ArtifactDetailView } from '@/components/artifacts/artifact-detail';
import { getArtifactDetailFn } from '@/lib/artifacts';

export const Route = createFileRoute('/_authed/a/$id/')({
  loader: async ({ params }) => {
    const detail = await getArtifactDetailFn({ data: { id: params.id } });

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

  // Keyed by artifact id: ArtifactDetailView seeds its spec state store once per mount, so a
  // different artifact must get a fresh mount.
  return <ArtifactDetailView detail={detail} id={id} key={id} />;
}
