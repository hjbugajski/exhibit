import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';
import { ToggleGroup } from '@/components/ui/toggle-group';

function ToggleGroupDemo() {
  return (
    <Playground
      controls={{
        disabledItem: { kind: 'boolean', label: 'Disable "Table"', defaultValue: false },
      }}
      render={(values) => (
        <ToggleGroup.Root aria-label="View" defaultValue={['grid']}>
          <ToggleGroup.Item value="grid">Grid</ToggleGroup.Item>
          <ToggleGroup.Item disabled={values.disabledItem} value="table">
            Table
          </ToggleGroup.Item>
          <ToggleGroup.Item value="list">List</ToggleGroup.Item>
        </ToggleGroup.Root>
      )}
    />
  );
}

export const toggleGroupDemo: LibraryDemo = {
  slug: 'toggle-group',
  title: 'Toggle group',
  description:
    'A set of pressed-state buttons for choosing between views or modes that act on the same content.',
  group: 'Components',
  render: () => <ToggleGroupDemo />,
};
