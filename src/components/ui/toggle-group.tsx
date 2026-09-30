import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';
import { ToggleGroup as ToggleGroupPrimitive } from '@base-ui/react/toggle-group';

import { cn } from '@/lib/utils';

export type ToggleGroupRootProps<Value extends string> = ToggleGroupPrimitive.Props<Value>;

function Root<Value extends string>({ className, ...props }: ToggleGroupRootProps<Value>) {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      className={cn(
        'border-border bg-field text-foreground-muted inline-flex h-8 w-fit items-center justify-center rounded-lg border p-0.75',
        className,
      )}
      {...props}
    />
  );
}

export type ToggleGroupItemProps<Value extends string> = TogglePrimitive.Props<Value>;

function Item<Value extends string>({ className, ...props }: ToggleGroupItemProps<Value>) {
  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      className={cn(
        "text-foreground-muted hover:text-foreground focus-visible:ring-focus focus-visible:outline-ring gap-icon-label px-compact has-data-[icon=inline-end]:pr-compact-icon has-data-[icon=inline-start]:pl-compact-icon data-pressed:bg-surface-active data-pressed:text-foreground relative inline-flex h-full flex-1 items-center justify-center rounded-sm py-0.5 text-sm font-medium whitespace-nowrap transition-all focus-visible:ring-[3px] focus-visible:outline-1 data-disabled:pointer-events-none data-disabled:opacity-50 data-pressed:shadow-xs [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className,
      )}
      {...props}
    />
  );
}

export const ToggleGroup = { Root, Item };
