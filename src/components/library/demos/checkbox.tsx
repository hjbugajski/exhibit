import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';
import { Checkbox } from '@/components/ui/checkbox';

function CheckboxDemo() {
  return (
    <Playground
      controls={{
        checked: { kind: 'boolean', label: 'Checked by default', defaultValue: false },
        indeterminate: { kind: 'boolean', label: 'Indeterminate', defaultValue: false },
        disabled: { kind: 'boolean', label: 'Disabled', defaultValue: false },
        label: { kind: 'text', label: 'Label', defaultValue: 'Accept terms' },
      }}
      render={(values) => (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            defaultChecked={values.checked}
            disabled={values.disabled}
            indeterminate={values.indeterminate}
            key={String(values.checked)}
          />
          {values.label}
        </label>
      )}
    />
  );
}

export const checkboxDemo: LibraryDemo = {
  slug: 'checkbox',
  title: 'Checkbox',
  description:
    'A tri-state-capable binary input backed by Base UI, styled at the fixed 4px radius.',
  group: 'Components',
  render: () => <CheckboxDemo />,
};
