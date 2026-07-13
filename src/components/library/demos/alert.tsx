import { XIcon } from 'lucide-react';

import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

const variants = ['default', 'info', 'success', 'warning', 'danger'] as const;

function AlertDemo() {
  return (
    <Playground
      controls={{
        variant: { kind: 'select', label: 'Variant', options: variants, defaultValue: 'default' },
        title: { kind: 'text', label: 'Title', defaultValue: 'Heads up' },
        description: {
          kind: 'text',
          label: 'Description',
          defaultValue: 'This is an alert with some description text.',
        },
        action: { kind: 'boolean', label: 'With action', defaultValue: false },
      }}
      render={(values) => (
        <Alert.Root className="max-w-sm" variant={values.variant}>
          <Alert.Title>{values.title}</Alert.Title>
          <Alert.Description>{values.description}</Alert.Description>
          {values.action && (
            <Alert.Action>
              <Button aria-label="Dismiss" variant="ghost">
                <XIcon data-icon="only" />
              </Button>
            </Alert.Action>
          )}
        </Alert.Root>
      )}
    />
  );
}

export const alertDemo: LibraryDemo = {
  slug: 'alert',
  title: 'Alert',
  description: 'Inline status messaging with a color-matched leading bar, no icon slot.',
  group: 'Components',
  render: () => <AlertDemo />,
};
