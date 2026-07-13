import { createFileRoute, notFound, Outlet } from '@tanstack/react-router';

import { LibraryLayout } from '@/components/library/library-layout';

export const Route = createFileRoute('/_authed/dev/library')({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw notFound();
    }
  },
  head: () => ({ meta: [{ title: 'Library · Exhibit' }] }),
  component: LibraryLayoutRoute,
});

function LibraryLayoutRoute() {
  return (
    <LibraryLayout>
      <Outlet />
    </LibraryLayout>
  );
}
