import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';
import { Label } from '@/components/ui/label';
import { RadioGroup } from '@/components/ui/radio-group';

function RadioGroupDemo() {
  return (
    <Playground
      controls={{
        disabled: { kind: 'boolean', label: 'Disabled', defaultValue: false },
      }}
      render={(values) => (
        <RadioGroup.Root className="max-w-sm" defaultValue="a" disabled={values.disabled}>
          <div className="flex items-center gap-2">
            <RadioGroup.Item id="lib-radio-a" value="a" />
            <Label htmlFor="lib-radio-a">Option A</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroup.Item id="lib-radio-b" value="b" />
            <Label htmlFor="lib-radio-b">Option B</Label>
          </div>
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
