import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

const actionVariants = ['default', 'destructive'] as const;

function AlertDialogDemo() {
  return (
    <Playground
      controls={{
        variant: {
          kind: 'select',
          label: 'Variant',
          options: actionVariants,
          defaultValue: 'destructive',
        },
        title: { kind: 'text', label: 'Title', defaultValue: 'Delete this artifact?' },
        description: {
          kind: 'text',
          label: 'Description',
          defaultValue: 'This action cannot be undone.',
        },
      }}
      render={(values) => (
        <AlertDialog.Root>
          <AlertDialog.Trigger render={<Button variant="outline" />}>
            Delete artifact
          </AlertDialog.Trigger>
          <AlertDialog.Portal>
            <AlertDialog.Overlay />
            <AlertDialog.Popup variant={values.variant}>
              <AlertDialog.Header>
                <AlertDialog.Title>{values.title}</AlertDialog.Title>
                <AlertDialog.Description>{values.description}</AlertDialog.Description>
              </AlertDialog.Header>
              <AlertDialog.Footer>
                <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
                <AlertDialog.Action variant={values.variant}>Delete</AlertDialog.Action>
              </AlertDialog.Footer>
            </AlertDialog.Popup>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      )}
    />
  );
}

export const alertDialogDemo: LibraryDemo = {
  slug: 'alert-dialog',
  title: 'Alert Dialog',
  description: 'A blocking confirmation for destructive or irreversible actions.',
  group: 'Components',
  render: () => <AlertDialogDemo />,
};
