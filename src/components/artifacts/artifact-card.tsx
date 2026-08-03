import { memo, useMemo } from 'react';

import { Link } from '@tanstack/react-router';

import { TagList } from '@/components/artifacts/tag-list';
import { TypeBadge } from '@/components/artifacts/type-badge';
import { RelativeTime } from '@/components/blocks/relative-time';
import { Card } from '@/components/ui/card';
import type { Artifact } from '@/database/repository';

/**
 * Memoized: gallery list renders are dominated by `Link`'s per-card route build, so the card must
 * bail out on unrelated parent renders (a search keystroke) and hold an identity-stable `params`.
 */
export const ArtifactCard = memo(function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const params = useMemo(() => ({ id: artifact.id }), [artifact.id]);

  return (
    <Link
      className="focus-visible:ring-focus block h-full rounded-xl outline-none focus-visible:ring-3"
      params={params}
      to="/a/$id"
    >
      <Card.Root className="hover:bg-surface-subtle h-full transition-colors">
        <Card.Content className="flex h-full flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            {/* Claude-authored titles run long with unbreakable URL-ish tokens. */}
            <h2 className="line-clamp-2 font-semibold tracking-tight break-words">
              {artifact.title}
            </h2>
            <TypeBadge type={artifact.type} />
          </div>
          {artifact.description ? (
            <p className="text-foreground-muted line-clamp-2 text-sm break-words">
              {artifact.description}
            </p>
          ) : null}
          <TagList tags={artifact.tags} />
          <RelativeTime
            className="text-foreground-muted mt-auto text-xs"
            value={artifact.updatedAt}
          />
        </Card.Content>
      </Card.Root>
    </Link>
  );
});
