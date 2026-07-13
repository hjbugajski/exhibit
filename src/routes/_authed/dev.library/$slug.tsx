import { createFileRoute, notFound } from '@tanstack/react-router';

import { getLibraryDemo } from '@/components/library/registry';

export const Route = createFileRoute('/_authed/dev/library/$slug')({
  // Demos hold render functions, so the loader only validates the slug; the component looks the
  // demo up again from the registry instead of receiving it through (serialized) loader data.
  loader: ({ params }) => {
    if (!getLibraryDemo(params.slug)) {
      throw notFound();
    }
  },
  component: LibraryDemoRoute,
});

function LibraryDemoRoute() {
  const { slug } = Route.useParams();
  const demo = getLibraryDemo(slug);

  if (!demo) {
    return null;
  }

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{demo.title}</h1>
        <p className="text-foreground-muted text-sm">{demo.description}</p>
      </header>
      {demo.render()}
    </article>
  );
}
