import { useState } from 'react';

import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';
import { Select } from '@/components/ui/select';

const typeLabels: Record<string, string> = {
  spec: 'Spec',
  html: 'HTML',
};

function SelectDemo() {
  const [value, setValue] = useState('spec');

  return (
    <Playground
      controls={{
        disabled: { kind: 'boolean', label: 'Disabled', defaultValue: false },
      }}
      render={(values) => (
        <Select.Root
          disabled={values.disabled}
          onValueChange={(next) => setValue(next ?? 'spec')}
          value={value}
        >
          <Select.Trigger aria-label="Type">
            <Select.Value>{(current: string) => typeLabels[current]}</Select.Value>
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner alignItemWithTrigger={false}>
              <Select.Popup alignItemWithTrigger={false}>
                <Select.Group>
                  <Select.Item value="spec">Spec</Select.Item>
                  <Select.Item value="html">HTML</Select.Item>
                </Select.Group>
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>
      )}
    />
  );
}

export const selectDemo: LibraryDemo = {
  slug: 'select',
  title: 'Select',
  description: 'Popup single-choice picker for a list of options that need not stay visible.',
  group: 'Components',
  render: () => <SelectDemo />,
};
