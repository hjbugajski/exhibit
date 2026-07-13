import { useState, type SubmitEvent } from 'react';

import { useRouter } from '@tanstack/react-router';

import { FormStatus } from '@/components/blocks/form-status';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Artifact } from '@/database/repository';
import { updateArtifactMetadataFn } from '@/lib/artifacts';
import { normalizeTags } from '@/lib/mcp/tags';
import { useFormAction } from '@/lib/use-form-action';

export interface EditArtifactDialogProps {
  artifact: Artifact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Controlled dialog — the opener (e.g. a menu item) owns the `open` state. */
export function EditArtifactDialog({ artifact, open, onOpenChange }: EditArtifactDialogProps) {
  const router = useRouter();
  const [title, setTitle] = useState(artifact.title);
  const [description, setDescription] = useState(artifact.description ?? '');
  const [tagsInput, setTagsInput] = useState(artifact.tags.join(', '));
  const { pending, status, setStatus, run } = useFormAction();

  // Reseed the form on every open, render-phase — the parent flips `open` directly, so an
  // onOpenChange callback would never see the opening edge.
  const [seededOpen, setSeededOpen] = useState(open);
  if (open !== seededOpen) {
    setSeededOpen(open);

    if (open) {
      setTitle(artifact.title);
      setDescription(artifact.description ?? '');
      setTagsInput(artifact.tags.join(', '));
      setStatus(null);
    }
  }

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
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
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
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
