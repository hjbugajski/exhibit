import { createFileRoute } from '@tanstack/react-router';

import { LibraryOverview } from '@/components/library/library-overview';

export const Route = createFileRoute('/_authed/dev/library/')({
  component: LibraryOverview,
});
