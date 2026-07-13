import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';
import { Button } from '@/components/ui/button';
import { Popover } from '@/components/ui/popover';

const sides = ['top', 'right', 'bottom', 'left'] as const;

function PopoverDemo() {
  return (
    <Playground
      controls={{
        side: { kind: 'select', label: 'Side', options: sides, defaultValue: 'bottom' },
        title: { kind: 'text', label: 'Title', defaultValue: 'Artifact settings' },
      }}
      render={(values) => (
        <Popover.Root>
          <Popover.Trigger render={<Button variant="outline" />}>Open popover</Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner side={values.side}>
              <Popover.Popup className="w-64">
                <Popover.Title>{values.title}</Popover.Title>
                <Popover.Description>
                  Control who can view this artifact and how it's rendered.
                </Popover.Description>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      )}
    />
  );
}

export const popoverDemo: LibraryDemo = {
  slug: 'popover',
  title: 'Popover',
  description: 'Anchored overlay for supplementary content or controls triggered by a click.',
  group: 'Components',
  render: () => <PopoverDemo />,
};
