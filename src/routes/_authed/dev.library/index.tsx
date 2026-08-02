import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/dev/library/')({
  component: lazyRouteComponent(
    () => import('@/components/library/library-overview'),
    'LibraryOverview',
  ),
});
