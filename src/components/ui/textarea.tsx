import type { ComponentProps } from 'react';

import { Field as FieldPrimitive } from '@base-ui/react/field';

import { cn } from '@/lib/utils';

export type TextareaProps = ComponentProps<'textarea'> &
  Pick<FieldPrimitive.Control.Props, 'onValueChange'>;

/**
 * Renders through Field.Control so textareas inside Field.Root get validity wiring and auto ids;
 * works standalone too. The props Field.Control consumes go to it, because Base UI merges the render
 * element's props over the control's and drops the render element's `ref`.
 */
function Textarea({
  className,
  id,
  name,
  value,
  defaultValue,
  disabled,
  ref,
  onValueChange,
  ...props
}: TextareaProps) {
  return (
    <FieldPrimitive.Control
      id={id}
      name={name}
      value={value}
      defaultValue={defaultValue}
      disabled={disabled}
      ref={ref}
      onValueChange={onValueChange}
      data-slot="textarea"
      render={<textarea {...props} />}
      className={cn(
        'border-border-strong placeholder:text-foreground-subtle focus-visible:border-ring focus-visible:ring-focus disabled:bg-surface-subtle aria-invalid:border-danger-strong aria-invalid:ring-focus-danger bg-field px-control flex field-sizing-content min-h-16 w-full rounded-lg border py-2 text-base transition-colors outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 md:text-sm',
        className,
      )}
    />
  );
}

export { Textarea };
