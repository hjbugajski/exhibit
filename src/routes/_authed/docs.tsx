import { createFileRoute } from '@tanstack/react-router';

import { DocsView } from '@/components/docs/docs-view';
import { getMcpConnectUrlFn } from '@/lib/mcp/origin';

export const Route = createFileRoute('/_authed/docs')({
  loader: async () => ({ mcpUrl: await getMcpConnectUrlFn() }),
  head: () => ({ meta: [{ title: 'Docs · Exhibit' }] }),
  component: DocsRoute,
});

function DocsRoute() {
  const { mcpUrl } = Route.useLoaderData();

  return <DocsView mcpUrl={mcpUrl} />;
}
