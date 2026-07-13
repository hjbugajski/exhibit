import { Radio as RadioPrimitive } from '@base-ui/react/radio';
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group';

import { cn } from '@/lib/utils';

export type RadioGroupRootProps = RadioGroupPrimitive.Props;

function Root({ className, ...props }: RadioGroupRootProps) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn('grid w-full gap-2', className)}
      {...props}
    />
  );
}

export type RadioGroupItemProps = RadioPrimitive.Root.Props;

function Item({ className, ...props }: RadioGroupItemProps) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(
        'group/radio-group-item peer border-border-strong focus-visible:border-ring focus-visible:ring-focus aria-invalid:border-danger-strong aria-invalid:ring-focus-danger aria-invalid:aria-checked:border-accent bg-field data-checked:border-accent data-checked:bg-accent data-checked:text-accent-foreground data-disabled:bg-surface-subtle relative flex aspect-square size-4 shrink-0 rounded-full border outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-3 aria-invalid:ring-3 data-disabled:cursor-not-allowed data-disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <RadioPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="flex size-4 items-center justify-center"
      >
        <span className="bg-accent-foreground absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full" />
      </RadioPrimitive.Indicator>
    </RadioPrimitive.Root>
  );
}

export const RadioGroup = { Root, Item };
