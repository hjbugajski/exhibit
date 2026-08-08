import { createFileRoute, lazyRouteComponent, notFound } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/dev/library/$slug')({
  // Demos hold render functions, so the loader only validates the slug; the component looks the
  // demo up again from the registry instead of receiving it through (serialized) loader data. Both
  // edges into the registry are dynamic, which keeps the registry and its demo modules out of the
  // entry chunk — a production build still emits them as assets, but the dev-only gate on the
  // parent route means nothing ever requests them.
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
