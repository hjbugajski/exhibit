import { ArchiveRestore } from 'lucide-react';

import { ConfirmDestructiveAction } from '@/components/blocks/confirm-destructive-action';
import { FormStatus } from '@/components/blocks/form-status';
import { Button } from '@/components/ui/button';
import type { Artifact } from '@/database/repository';
import { useFormAction } from '@/lib/use-form-action';

/**
 * The two mutations a deleted artifact accepts. Passed down as one identity-stable object (see
 * Home) so the memoized cards and rows still bail out of unrelated gallery renders.
 */
export interface TrashActions {
  restore: (id: string) => Promise<void>;
  purge: (id: string) => Promise<void>;
}

/**
 * Restore / delete-forever pair shown on every card and row while the gallery is filtered to the
 * trash. Restore is reversible, so it acts on one click; purging is not, hence the confirm dialog.
 */
export function ArtifactTrashActions({
  artifact,
  trash,
}: {
  artifact: Artifact;
  trash: TrashActions;
}) {
  const restoreAction = useFormAction();
  const purgeAction = useFormAction();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button
          disabled={restoreAction.pending}
          onClick={() => void restoreAction.run(() => trash.restore(artifact.id))}
          variant="outline"
        >
          <ArchiveRestore data-icon="inline-start" />
          {restoreAction.pending ? 'Restoring…' : 'Restore'}
        </Button>
        <ConfirmDestructiveAction
          action={purgeAction}
          actionLabel="Delete forever"
          confirmation="I understand this can’t be undone."
          description={
            <>
              <strong className="text-foreground font-medium">{artifact.title}</strong> and all of
              its versions are removed from the database.
            </>
          }
          onConfirm={() => void purgeAction.run(() => trash.purge(artifact.id))}
          pendingLabel="Deleting…"
          title="Delete forever"
          trigger={<Button disabled={purgeAction.pending} variant="destructive" />}
        />
      </div>
      <FormStatus status={restoreAction.status} />
    </div>
  );
}
