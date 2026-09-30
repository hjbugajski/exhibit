import { XIcon } from 'lucide-react';

import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

function DialogDemo() {
  return (
    <Playground
      controls={{
        title: { kind: 'text', label: 'Title', defaultValue: 'Workspace settings' },
        description: {
          kind: 'text',
          label: 'Description',
          defaultValue: 'Update your workspace preferences.',
        },
      }}
      render={(values) => (
        <Dialog.Root>
          <Dialog.Trigger render={<Button variant="outline" />}>Open settings</Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay />
            <Dialog.Popup>
              <Dialog.Header>
                <Dialog.Title>{values.title}</Dialog.Title>
                <Dialog.Description>{values.description}</Dialog.Description>
              </Dialog.Header>
              <Field.Root name="lib-dialog-name">
                <Field.Label>Display name</Field.Label>
                <Input defaultValue="Jane Doe" />
              </Field.Root>
              <Dialog.Footer>
                <Dialog.Close render={<Button variant="outline" />}>Cancel</Dialog.Close>
                <Button>Save</Button>
              </Dialog.Footer>
              <Dialog.Action>
                <Dialog.Close aria-label="Close" render={<Button variant="ghost" />}>
                  <XIcon data-icon="only" />
                </Dialog.Close>
              </Dialog.Action>
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    />
  );
}

export const dialogDemo: LibraryDemo = {
  slug: 'dialog',
  title: 'Dialog',
  description: 'A modal overlay for focused tasks like forms and settings, with a composed close.',
  group: 'Components',
  render: () => <DialogDemo />,
};
