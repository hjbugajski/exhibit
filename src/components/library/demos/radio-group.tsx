import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';
import { RadioGroup } from '@/components/ui/radio-group';

function RadioGroupDemo() {
  return (
    <Playground
      controls={{
        disabled: { kind: 'boolean', label: 'Disabled', defaultValue: false },
      }}
      render={(values) => (
        <RadioGroup.Root className="max-w-sm" defaultValue="a" disabled={values.disabled}>
          <label className="flex items-center gap-2 text-sm">
            <RadioGroup.Item value="a" />
            Option A
          </label>
          <label className="flex items-center gap-2 text-sm">
            <RadioGroup.Item value="b" />
            Option B
          </label>
        </RadioGroup.Root>
      )}
    />
  );
}

export const radioGroupDemo: LibraryDemo = {
  slug: 'radio-group',
  title: 'Radio Group',
  description:
    'Single-select control for a small, always-visible set of mutually exclusive options.',
  group: 'Components',
  render: () => <RadioGroupDemo />,
};
