import type { ComponentProps } from 'react';

import { Input as InputPrimitive } from '@base-ui/react/input';

import { cn } from '@/lib/utils';

export type InputProps = ComponentProps<'input'>;

function Input({ className, type, ...props }: InputProps) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'border-border-strong file:text-foreground placeholder:text-foreground-subtle focus-visible:border-ring focus-visible:ring-focus disabled:bg-surface-subtle aria-invalid:border-danger-strong aria-invalid:ring-focus-danger bg-field px-control h-8 w-full min-w-0 rounded-lg border py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 md:text-sm',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
