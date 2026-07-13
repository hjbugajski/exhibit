import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';
import { Tabs } from '@/components/ui/tabs';

const variants = ['default', 'line'] as const;

function TabsDemo() {
  return (
    <Playground
      controls={{
        variant: { kind: 'select', label: 'Variant', options: variants, defaultValue: 'default' },
        disabledTab: { kind: 'boolean', label: 'Disable "Two"', defaultValue: false },
      }}
      render={(values) => (
        <Tabs.Root defaultValue="one">
          <Tabs.List variant={values.variant}>
            <Tabs.Trigger value="one">One</Tabs.Trigger>
            <Tabs.Trigger disabled={values.disabledTab} value="two">
              Two
            </Tabs.Trigger>
            <Tabs.Trigger value="three">Three</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="one">Content for tab one.</Tabs.Content>
          <Tabs.Content value="two">Content for tab two.</Tabs.Content>
          <Tabs.Content value="three">Content for tab three.</Tabs.Content>
        </Tabs.Root>
      )}
    />
  );
}

export const tabsDemo: LibraryDemo = {
  slug: 'tabs',
  title: 'Tabs',
  description:
    'Switches between panels of content sharing the same context, one visible at a time.',
  group: 'Components',
  render: () => <TabsDemo />,
};
