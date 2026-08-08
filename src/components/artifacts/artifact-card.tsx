import { memo, useMemo } from 'react';

import { Link } from '@tanstack/react-router';

import { TagList } from '@/components/artifacts/tag-list';
import type { TrashActions } from '@/components/artifacts/trash-actions';
import { ArtifactTrashActions } from '@/components/artifacts/trash-actions';
import { TypeBadge } from '@/components/artifacts/type-badge';
import { RelativeTime } from '@/components/blocks/relative-time';
import { Card } from '@/components/ui/card';
import type { ArtifactListItem } from '@/database/repository';

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
  artifact: ArtifactListItem;
  trash?: TrashActions;
}) {
  const params = useMemo(() => ({ id: artifact.id }), [artifact.id]);
  // Suppressed in the trash: a deleted artifact has no detail page to answer anything on.
  const awaiting =
    !trash && artifact.answers !== null && artifact.answers.answered < artifact.answers.total;

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
        <div className="text-foreground-muted mt-auto flex flex-wrap items-center gap-2 text-xs">
          <RelativeTime value={artifact.updatedAt} />
          {awaiting ? (
            <span className="text-foreground flex items-center gap-1.5">
              <span aria-hidden="true" className="bg-foreground size-1.5 rounded-full" />
              Awaiting your reply
            </span>
          ) : null}
        </div>
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
