import type { ErrorComponentProps } from '@tanstack/react-router';
import { Link } from '@tanstack/react-router';
import { FileQuestion, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';

/**
 * Router-wide fallbacks (wired in src/router.tsx). Every route renders one of these while its
 * loader is in flight, when it throws notFound(), or when it throws anything else.
 */
export function RoutePending() {
  return (
    <div className="flex min-h-96 w-full items-center justify-center p-6">
      <Spinner className="text-foreground-muted size-5" />
    </div>
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
        <Button nativeButton={false} render={<Link to="/">Back to artifacts</Link>} />
      </Empty.Content>
    </Empty.Root>
  );
}

export function RouteError({ error }: ErrorComponentProps) {
  return (
    <Empty.Root className="min-h-96 py-16">
      <Empty.Header>
        <Empty.Media variant="icon">
          <TriangleAlert />
        </Empty.Media>
        <Empty.Title>Something went wrong</Empty.Title>
        <Empty.Description>{error.message || 'This page failed to load.'}</Empty.Description>
      </Empty.Header>
      <Empty.Content>
        <Button nativeButton={false} render={<Link to="/">Back to artifacts</Link>} />
      </Empty.Content>
    </Empty.Root>
  );
}
