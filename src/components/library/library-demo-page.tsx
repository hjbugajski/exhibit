import { getRouteApi } from '@tanstack/react-router';

import { getLibraryDemo } from '@/components/library/registry';

const Route = getRouteApi('/_authed/dev/library/$slug');

/**
 * Page for a single library demo. It lives outside the route file so the registry — all 52 demos
 * plus the catalog fixtures — is reachable only through the route's dynamic import, never from a
 * production client chunk.
 */
export function LibraryDemoPage() {
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
