import { ChevronDownIcon } from 'lucide-react';

import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';
import { Collapsible } from '@/components/ui/collapsible';

function CollapsibleDemo() {
  return (
    <Playground
      controls={{
        defaultOpen: { kind: 'boolean', label: 'Open by default', defaultValue: false },
        disabled: { kind: 'boolean', label: 'Disabled', defaultValue: false },
      }}
      render={(values) => (
        <Collapsible.Root
          className="w-full max-w-sm"
          defaultOpen={values.defaultOpen}
          disabled={values.disabled}
          key={String(values.defaultOpen)}
        >
          <Collapsible.Trigger className="group flex w-full items-center justify-between gap-2 text-left text-sm font-medium data-disabled:opacity-50">
            Toggle details
            <ChevronDownIcon className="size-3.5 shrink-0 transition-transform group-data-[panel-open]:rotate-180" />
          </Collapsible.Trigger>
          <Collapsible.Content>
            <p className="text-foreground-muted mt-2 text-sm">
              Collapsed content revealed on toggle.
            </p>
          </Collapsible.Content>
        </Collapsible.Root>
      )}
    />
  );
}

export const collapsibleDemo: LibraryDemo = {
  slug: 'collapsible',
  title: 'Collapsible',
  description: 'An animated show/hide panel for progressively disclosing secondary content.',
  group: 'Components',
  render: () => <CollapsibleDemo />,
};
