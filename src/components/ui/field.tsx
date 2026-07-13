import type { ComponentProps } from 'react';

import { Field as FieldPrimitive } from '@base-ui/react/field';

import { cn } from '@/lib/utils';

export type FieldRootProps = FieldPrimitive.Root.Props;

function Root({ className, ...props }: FieldRootProps) {
  return (
    <FieldPrimitive.Root
      data-slot="field"
      className={cn('data-invalid:text-danger flex w-full flex-col gap-2', className)}
      {...props}
    />
  );
}

export type FieldLabelProps = FieldPrimitive.Label.Props;

function Label({ className, ...props }: FieldLabelProps) {
  return (
    <FieldPrimitive.Label
      data-slot="field-label"
      className={cn(
        'flex w-fit items-center gap-2 text-xs leading-none font-medium select-none data-disabled:pointer-events-none data-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export type FieldControlProps = FieldPrimitive.Control.Props;

function Control({ ...props }: FieldControlProps) {
  return <FieldPrimitive.Control data-slot="field-control" {...props} />;
}

export type FieldDescriptionProps = FieldPrimitive.Description.Props;

function Description({ className, ...props }: FieldDescriptionProps) {
  return (
    <FieldPrimitive.Description
      data-slot="field-description"
      className={cn('text-foreground-muted text-xs leading-normal font-normal', className)}
      {...props}
    />
  );
}

export type FieldErrorProps = FieldPrimitive.Error.Props;

function Error({ className, ...props }: FieldErrorProps) {
  return (
    <FieldPrimitive.Error
      data-slot="field-error"
      className={cn('text-danger text-xs font-normal', className)}
      {...props}
    />
  );
}

export type FieldGroupProps = ComponentProps<'div'>;

function Group({ className, ...props }: FieldGroupProps) {
  return (
    <div
      data-slot="field-group"
      className={cn('flex w-full flex-col gap-5', className)}
      {...props}
    />
  );
}

export const Field = {
  Root,
  Label,
  Control,
  Description,
  Error,
  Group,
};
