import { memo, useMemo } from 'react';

import { Link } from '@tanstack/react-router';

import { TagList } from '@/components/artifacts/tag-list';
import type { TrashActions } from '@/components/artifacts/trash-actions';
import { ArtifactTrashActions } from '@/components/artifacts/trash-actions';
import { TypeBadge } from '@/components/artifacts/type-badge';
import { RelativeTime } from '@/components/blocks/relative-time';
import { Card } from '@/components/ui/card';
import type { Artifact } from '@/database/repository';

/**
 * Memoized: gallery list renders are dominated by `Link`'s per-card route build, so the card must
 * bail out on unrelated parent renders (a search keystroke) and hold an identity-stable `params`.
 *
 * `trash` marks the card as a trash entry: deleted artifacts have no detail page (getArtifact
 * resolves them as missing), so the card links nowhere and carries restore/purge controls instead.
 */
export const ArtifactCard = memo(function ArtifactCard({
  artifact,
  trash,
}: {
  artifact: Artifact;
  trash?: TrashActions;
}) {
  const params = useMemo(() => ({ id: artifact.id }), [artifact.id]);

  const card = (
    <Card.Root className={trash ? 'h-full' : 'hover:bg-surface-subtle h-full transition-colors'}>
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
        {trash ? <ArtifactTrashActions artifact={artifact} trash={trash} /> : null}
      </Card.Content>
    </Card.Root>
  );

  if (trash) {
    return card;
  }

  return (
    <Link
      className="focus-visible:ring-focus block h-full rounded-xl outline-none focus-visible:ring-3"
      params={params}
      to="/a/$id"
    >
      {card}
    </Link>
  );
});
