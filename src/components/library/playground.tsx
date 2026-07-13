import { useState, type ReactNode } from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type PlaygroundControl =
  | { kind: 'select'; label: string; options: readonly string[]; defaultValue: string }
  | { kind: 'boolean'; label: string; defaultValue: boolean }
  | { kind: 'text'; label: string; defaultValue: string; placeholder?: string };

export type PlaygroundControls = Record<string, PlaygroundControl>;

/**
 * Maps each control key to its value type; select controls narrow to the union of their declared
 * options (the `const` type parameter on Playground preserves the literals).
 */
export type PlaygroundValues<C extends PlaygroundControls> = {
  [K in keyof C]: C[K] extends { kind: 'select'; options: infer O }
    ? O extends readonly (infer V)[]
      ? V
      : string
    : C[K] extends { kind: 'boolean' }
      ? boolean
      : string;
};

function defaultValuesOf<C extends PlaygroundControls>(controls: C): PlaygroundValues<C> {
  return Object.fromEntries(
    Object.entries(controls).map(([key, control]) => [key, control.defaultValue]),
  ) as PlaygroundValues<C>;
}

function ControlField({
  control,
  onChange,
  value,
}: {
  control: PlaygroundControl;
  onChange: (value: string | boolean) => void;
  value: string | boolean;
}) {
  if (control.kind === 'boolean') {
    // Field auto-wires the label to the checkbox; a wrapping <label> would re-dispatch clicks on
    // the control in some DOM implementations and double-toggle.
    return (
      <Field.Root className="flex-row items-center gap-2 self-end pb-2">
        <Checkbox
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked === true)}
        />
        <Field.Label className="cursor-pointer">{control.label}</Field.Label>
      </Field.Root>
    );
  }

  if (control.kind === 'select') {
    return (
      <Field.Root>
        <Field.Label>{control.label}</Field.Label>
        <Select.Root onValueChange={(next) => onChange(String(next))} value={String(value)}>
          <Select.Trigger aria-label={control.label} className="w-full">
            <Select.Value />
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner alignItemWithTrigger={false}>
              <Select.Popup alignItemWithTrigger={false}>
                <Select.Group>
                  {control.options.map((option) => (
                    <Select.Item key={option} value={option}>
                      {option}
                    </Select.Item>
                  ))}
                </Select.Group>
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>
      </Field.Root>
    );
  }

  return (
    <Field.Root>
      <Field.Label>{control.label}</Field.Label>
      <Input
        onChange={(event) => onChange(event.target.value)}
        placeholder={control.placeholder}
        value={String(value)}
      />
    </Field.Root>
  );
}

/**
 * Live preview with a prop-controls panel below it. Declare controls with literal option arrays;
 * `render` receives the current values, typed per control (select values narrow to their options).
 * Pass `layout="block"` for full-width block content (catalog components) instead of a centered
 * preview; pass no controls for a preview-only page.
 */
export function Playground<const C extends PlaygroundControls>({
  controls,
  layout = 'centered',
  render,
}: {
  controls: C;
  layout?: 'centered' | 'block';
  render: (values: PlaygroundValues<C>) => ReactNode;
}) {
  const [values, setValues] = useState(() => defaultValuesOf(controls));
  const entries = Object.entries(controls);

  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn(
          'min-h-56 rounded-lg border p-8',
          layout === 'centered' && 'flex items-center justify-center',
        )}
      >
        {render(values)}
      </div>
      {entries.length > 0 && (
        <div className="bg-surface grid gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map(([key, control]) => (
            <ControlField
              control={control}
              key={key}
              onChange={(value) =>
                setValues((prev) => ({ ...prev, [key]: value }) as PlaygroundValues<C>)
              }
              value={values[key as keyof C] as string | boolean}
            />
          ))}
        </div>
      )}
    </div>
  );
}
