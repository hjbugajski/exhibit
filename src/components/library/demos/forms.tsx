import type { LibraryDemo } from '@/components/library/demo';
import { Playground } from '@/components/library/playground';
import { Field } from '@/components/ui/field';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

function FormsDemo() {
  return (
    <Playground
      controls={{
        disabled: { kind: 'boolean', label: 'Disabled', defaultValue: false },
        invalid: { kind: 'boolean', label: 'Show error', defaultValue: false },
        notePlaceholder: { kind: 'text', label: 'Note placeholder', defaultValue: 'Add a note…' },
      }}
      layout="block"
      render={(values) => (
        <Form className="max-w-sm">
          <Field.Group>
            <Field.Root disabled={values.disabled} name="lib-name">
              <Field.Label>Name</Field.Label>
              <Input placeholder="Jane Doe" />
              <Field.Description>Shown on your public profile.</Field.Description>
            </Field.Root>
            <Field.Root disabled={values.disabled} invalid={values.invalid} name="lib-email">
              <Field.Label>Email</Field.Label>
              <Input placeholder="jane@example.com" type="email" />
              {values.invalid && <Field.Error match>Email is required.</Field.Error>}
            </Field.Root>
            <Field.Root disabled={values.disabled} name="lib-note">
              <Field.Label>Note</Field.Label>
              <Textarea placeholder={values.notePlaceholder} />
            </Field.Root>
          </Field.Group>
        </Form>
      )}
    />
  );
}

export const formsDemo: LibraryDemo = {
  slug: 'forms',
  title: 'Forms',
  description: 'Field, Label, Input, and Textarea composed for validated, labeled form controls.',
  group: 'Components',
  render: () => <FormsDemo />,
};
