import { memo, useMemo } from 'react';

import { Link } from '@tanstack/react-router';

import { TagList } from '@/components/artifacts/tag-list';
import { TypeBadge } from '@/components/artifacts/type-badge';
import { Card } from '@/components/ui/card';
import type { Artifact } from '@/database/repository';
import { formatRelativeTime } from '@/lib/format-time';

/**
 * Memoized: gallery list renders are dominated by `Link`'s per-card route build, so the card must
 * bail out on unrelated parent renders (a search keystroke) and hold an identity-stable `params`.
 */
export const ArtifactCard = memo(function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const params = useMemo(() => ({ id: artifact.id }), [artifact.id]);

  return (
    <Link className="block h-full" params={params} to="/a/$id">
      <Card.Root className="hover:bg-surface-subtle h-full transition-colors">
        <Card.Content className="flex h-full flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-semibold tracking-tight">{artifact.title}</h2>
            <TypeBadge type={artifact.type} />
          </div>
          {artifact.description ? (
            <p className="text-foreground-muted line-clamp-2 text-sm">{artifact.description}</p>
          ) : null}
          <TagList tags={artifact.tags} />
          <p className="text-foreground-muted mt-auto text-xs">
            {formatRelativeTime(artifact.updatedAt)}
          </p>
        </Card.Content>
      </Card.Root>
    </Link>
  );
});
