import { createFileRoute, lazyRouteComponent, notFound } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/dev/library')({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw notFound();
    }
  },
  head: () => ({ meta: [{ title: 'Library · Exhibit' }] }),
  component: lazyRouteComponent(
    () => import('@/components/library/library-layout'),
    'LibraryLayout',
  ),
});
