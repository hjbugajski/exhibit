import { createFileRoute, lazyRouteComponent, notFound } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/dev/library/$slug')({
  // Demos hold render functions, so the loader only validates the slug; the component looks the
  // demo up again from the registry instead of receiving it through (serialized) loader data. Both
  // edges into the registry are dynamic so the dev-only demos never reach a production chunk.
  loader: async ({ params }) => {
    const { getLibraryDemo } = await import('@/components/library/registry');

    if (!getLibraryDemo(params.slug)) {
      throw notFound();
    }
  },
  component: lazyRouteComponent(
    () => import('@/components/library/library-demo-page'),
    'LibraryDemoPage',
  ),
});
