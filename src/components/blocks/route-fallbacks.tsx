import { useEffect, useState } from 'react';

import type { ErrorComponentProps } from '@tanstack/react-router';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { FileQuestion, TriangleAlert } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { isUnauthorizedError } from '@/lib/unauthorized';

/**
 * Router-wide fallbacks (wired in src/router.tsx). Every route renders one of these while its
 * loader is in flight, when it throws notFound(), or when it throws anything else.
 */
export function RoutePending() {
  return (
    <output className="flex min-h-96 w-full items-center justify-center p-6">
      <Spinner className="text-foreground-muted size-5" />
      <span className="sr-only">Loading…</span>
    </output>
  );
}

export function RouteNotFound() {
  return (
    <Empty.Root className="min-h-96 py-16">
      <Empty.Header>
        <Empty.Media variant="icon">
          <FileQuestion />
        </Empty.Media>
        <Empty.Title>Page not found</Empty.Title>
        <Empty.Description>
          This page doesn’t exist, or the artifact it pointed at was deleted.
        </Empty.Description>
      </Empty.Header>
      <Empty.Content>
        <Link to="/" className={buttonVariants()}>
          Back to artifacts
        </Link>
      </Empty.Content>
    </Empty.Root>
  );
}

export function RouteError({ error }: ErrorComponentProps) {
  const unauthorized = isUnauthorizedError(error);
  const navigate = useNavigate();
  /*
   * Pinned at mount: the router moves `location` to /sign-in as soon as the navigation starts, and
   * following it would re-navigate with the sign-in page as its own redirect.
   */
  const [href] = useState(useLocation().href);

  // A server fn rejected because the session expired: send the owner to sign in and back here.
  useEffect(() => {
    if (unauthorized) {
      void navigate({ to: '/sign-in', search: { redirect: href }, replace: true });
    }
  }, [unauthorized, navigate, href]);

  if (unauthorized) {
    return null;
  }

  return (
    <Empty.Root className="min-h-96 py-16">
      <Empty.Header>
        <Empty.Media variant="icon">
          <TriangleAlert />
        </Empty.Media>
        <Empty.Title>Something went wrong</Empty.Title>
        <Empty.Description>
          {(error instanceof Error && error.message) || 'This page failed to load.'}
        </Empty.Description>
      </Empty.Header>
      <Empty.Content>
        <Link to="/" className={buttonVariants()}>
          Back to artifacts
        </Link>
      </Empty.Content>
    </Empty.Root>
  );
}
