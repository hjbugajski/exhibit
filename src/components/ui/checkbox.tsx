import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';
import { CheckIcon, MinusIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export type CheckboxProps = CheckboxPrimitive.Root.Props;

function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'group/checkbox peer border-border-strong focus-visible:border-ring focus-visible:ring-focus aria-invalid:border-danger-strong aria-invalid:ring-focus-danger aria-invalid:aria-checked:border-accent bg-field data-checked:border-accent data-checked:bg-accent data-checked:text-accent-foreground data-indeterminate:border-accent data-indeterminate:bg-accent data-indeterminate:text-accent-foreground data-disabled:data-unchecked:bg-surface-subtle relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-3 aria-invalid:ring-3 data-disabled:cursor-not-allowed data-disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <CheckIcon className="group-data-[indeterminate]/checkbox:hidden" />
        <MinusIcon className="hidden group-data-[indeterminate]/checkbox:block" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
