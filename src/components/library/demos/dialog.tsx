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
        showCloseButton: { kind: 'boolean', label: 'Show close button', defaultValue: true },
      }}
      render={(values) => (
        <Dialog.Root>
          <Dialog.Trigger render={<Button variant="outline" />}>Open settings</Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay />
            <Dialog.Popup showCloseButton={values.showCloseButton}>
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
  description: 'A modal overlay for focused tasks like forms and settings, dismissible or not.',
  group: 'Components',
  render: () => <DialogDemo />,
};
