import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

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
        <div className="flex items-center gap-2">
          <Checkbox
            defaultChecked={values.checked}
            disabled={values.disabled}
            id="lib-checkbox-playground"
            indeterminate={values.indeterminate}
            key={String(values.checked)}
          />
          <Label htmlFor="lib-checkbox-playground">{values.label}</Label>
        </div>
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
