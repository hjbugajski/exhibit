import { InboxIcon } from 'lucide-react';

import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';
import { Button } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';

const mediaVariants = ['default', 'icon'] as const;

function EmptyDemo() {
  return (
    <Playground
      controls={{
        media: { kind: 'select', label: 'Media', options: mediaVariants, defaultValue: 'icon' },
        title: { kind: 'text', label: 'Title', defaultValue: 'No artifacts yet' },
        description: {
          kind: 'text',
          label: 'Description',
          defaultValue: 'Publish one from Claude via MCP to see it here.',
        },
        action: { kind: 'boolean', label: 'With action', defaultValue: false },
      }}
      render={(values) => (
        <Empty.Root>
          <Empty.Header>
            <Empty.Media variant={values.media}>
              <InboxIcon />
            </Empty.Media>
            <Empty.Title>{values.title}</Empty.Title>
            <Empty.Description>{values.description}</Empty.Description>
          </Empty.Header>
          {values.action && (
            <Empty.Content>
              <Button variant="outline">View documentation</Button>
            </Empty.Content>
          )}
        </Empty.Root>
      )}
    />
  );
}

export const emptyDemo: LibraryDemo = {
  slug: 'empty',
  title: 'Empty',
  description: 'A placeholder state for lists and views with no data yet.',
  group: 'Components',
  render: () => <EmptyDemo />,
};
