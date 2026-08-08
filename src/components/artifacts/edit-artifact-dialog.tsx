import { useState, type SubmitEvent } from 'react';

import { useRouter } from '@tanstack/react-router';

import { FormStatus } from '@/components/blocks/form-status';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Artifact } from '@/database/repository';
import { normalizeTags } from '@/lib/artifact-metadata';
import { updateArtifactMetadataFn } from '@/lib/artifacts';
import { useFormAction } from '@/lib/use-form-action';

export interface EditArtifactDialogProps {
  artifact: Artifact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function seedFrom(artifact: Artifact) {
  return {
    title: artifact.title,
    description: artifact.description ?? '',
    tagsInput: artifact.tags.join(', '),
  };
}

/** Controlled dialog — the opener (e.g. a menu item) owns the `open` state. */
export function EditArtifactDialog({ artifact, open, onOpenChange }: EditArtifactDialogProps) {
  const router = useRouter();
  const [seed, setSeed] = useState(() => seedFrom(artifact));
  const [title, setTitle] = useState(seed.title);
  const [description, setDescription] = useState(seed.description);
  const [tagsInput, setTagsInput] = useState(seed.tagsInput);
  const [discardOpen, setDiscardOpen] = useState(false);
  const { pending, status, setStatus, run } = useFormAction();

  // Reseed the form on every open, render-phase — the parent flips `open` directly, so an
  // onOpenChange callback would never see the opening edge.
  const [seededOpen, setSeededOpen] = useState(open);
  if (open !== seededOpen) {
    setSeededOpen(open);

    if (open) {
      const next = seedFrom(artifact);

      setSeed(next);
      setTitle(next.title);
      setDescription(next.description);
      setTagsInput(next.tagsInput);
      setStatus(null);
      setDiscardOpen(false);
    }
  }

  // Dirty against the values seeded at open, not against `artifact` — a background refetch must
  // not silently reclassify an untouched draft as dirty (or vice versa).
  const isDirty =
    title !== seed.title || description !== seed.description || tagsInput !== seed.tagsInput;

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    void run(async () => {
      const tags = normalizeTags(tagsInput.split(','));
      const trimmedDescription = description.trim();

      await updateArtifactMetadataFn({
        data: {
          id: artifact.id,
          title: title.trim(),
          description: trimmedDescription === '' ? null : trimmedDescription,
          tags,
        },
      });

      onOpenChange(false);
      await router.invalidate();
    });
  }

  return (
    <Dialog.Root
      onOpenChange={(next, eventDetails) => {
        // A dirty draft is only discarded deliberately: an accidental outside press or Escape
        // routes through the confirm instead of closing. Cancel/X and a successful save close
        // outright.
        const isDismissal =
          eventDetails.reason === 'outside-press' || eventDetails.reason === 'escape-key';

        if (!next && isDirty && isDismissal) {
          eventDetails.cancel();
          setDiscardOpen(true);

          return;
        }

        onOpenChange(next);
      }}
      open={open}
    >
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Popup>
          <Dialog.Header>
            <Dialog.Title>Edit artifact</Dialog.Title>
            <Dialog.Description>Update the title, description, and tags.</Dialog.Description>
          </Dialog.Header>
          <Form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <Field.Root name="title">
              <Field.Label>Title</Field.Label>
              <Input
                maxLength={200}
                onChange={(event) => setTitle(event.target.value)}
                required
                value={title}
              />
              <Field.Error match="valueMissing">Title is required.</Field.Error>
            </Field.Root>
            <Field.Root name="description">
              <Field.Label>Description</Field.Label>
              <Textarea
                maxLength={2000}
                onChange={(event) => setDescription(event.target.value)}
                value={description}
              />
            </Field.Root>
            <Field.Root name="tags">
              <Field.Label>Tags</Field.Label>
              <Input
                onChange={(event) => setTagsInput(event.target.value)}
                placeholder="comma, separated, tags"
                value={tagsInput}
              />
            </Field.Root>
            <FormStatus status={status} />
            <Dialog.Footer>
              <Dialog.Close render={<Button disabled={pending} type="button" variant="outline" />}>
                Cancel
              </Dialog.Close>
              <Button disabled={pending} type="submit">
                {pending ? 'Saving…' : 'Save'}
              </Button>
            </Dialog.Footer>
          </Form>
          {/* Nested inside the popup so Base UI stacks it above the edit dialog. */}
          <AlertDialog.Root onOpenChange={setDiscardOpen} open={discardOpen}>
            <AlertDialog.Portal>
              <AlertDialog.Overlay />
              <AlertDialog.Popup>
                <AlertDialog.Header>
                  <AlertDialog.Title>Discard changes?</AlertDialog.Title>
                  <AlertDialog.Description>
                    Your edits to this artifact have not been saved.
                  </AlertDialog.Description>
                </AlertDialog.Header>
                <AlertDialog.Footer>
                  <AlertDialog.Cancel>Keep editing</AlertDialog.Cancel>
                  <AlertDialog.Action
                    onClick={() => {
                      setDiscardOpen(false);
                      onOpenChange(false);
                    }}
                    variant="destructive"
                  >
                    Discard
                  </AlertDialog.Action>
                </AlertDialog.Footer>
              </AlertDialog.Popup>
            </AlertDialog.Portal>
          </AlertDialog.Root>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
