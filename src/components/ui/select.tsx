import type { ComponentProps } from 'react';

import { Select as SelectPrimitive } from '@base-ui/react/select';
import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export type SelectRootProps<
  Value,
  Multiple extends boolean | undefined = false,
> = SelectPrimitive.Root.Props<Value, Multiple>;

function Root<Value, Multiple extends boolean | undefined = false>({
  ...props
}: SelectRootProps<Value, Multiple>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}

export type SelectPortalProps = SelectPrimitive.Portal.Props;

function Portal({ ...props }: SelectPortalProps) {
  return <SelectPrimitive.Portal data-slot="select-portal" {...props} />;
}

export type SelectGroupProps = SelectPrimitive.Group.Props;

function Group({ className, ...props }: SelectGroupProps) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn('p-popup scroll-my-1', className)}
      {...props}
    />
  );
}

export type SelectGroupLabelProps = SelectPrimitive.GroupLabel.Props;

function GroupLabel({ className, ...props }: SelectGroupLabelProps) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn('text-foreground-muted px-compact py-popup text-xs', className)}
      {...props}
    />
  );
}

export type SelectValueProps = SelectPrimitive.Value.Props;

function Value({ className, ...props }: SelectValueProps) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn('flex flex-1 text-left', className)}
      {...props}
    />
  );
}

export type SelectTriggerProps = SelectPrimitive.Trigger.Props;

function Trigger({ className, children, ...props }: SelectTriggerProps) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "border-border-strong focus-visible:border-ring focus-visible:ring-focus aria-invalid:border-danger-strong aria-invalid:ring-focus-danger data-placeholder:text-foreground-subtle bg-field hover:bg-surface-active gap-icon-label pr-control-icon pl-control *:data-[slot=select-value]:gap-icon-label data-disabled:bg-surface-subtle flex h-8 w-fit items-center justify-between rounded-lg border py-2 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3 aria-invalid:ring-3 data-disabled:cursor-not-allowed data-disabled:opacity-50 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={<ChevronDownIcon className="text-foreground-muted pointer-events-none size-3.5" />}
      />
    </SelectPrimitive.Trigger>
  );
}

export type SelectPositionerProps = SelectPrimitive.Positioner.Props;

function Positioner({
  className,
  side = 'bottom',
  sideOffset = 4,
  align = 'center',
  alignOffset = 0,
  alignItemWithTrigger = true,
  ...props
}: SelectPositionerProps) {
  return (
    <SelectPrimitive.Positioner
      side={side}
      sideOffset={sideOffset}
      align={align}
      alignOffset={alignOffset}
      alignItemWithTrigger={alignItemWithTrigger}
      className={cn('isolate z-50', className)}
      {...props}
    />
  );
}

function ScrollUpButton({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "bg-surface-raised top-0 z-10 flex w-full cursor-default items-center justify-center py-1 [&_svg:not([class*='size-'])]:size-3.5",
        className,
      )}
      {...props}
    >
      <ChevronUpIcon />
    </SelectPrimitive.ScrollUpArrow>
  );
}

function ScrollDownButton({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "bg-surface-raised bottom-0 z-10 flex w-full cursor-default items-center justify-center py-1 [&_svg:not([class*='size-'])]:size-3.5",
        className,
      )}
      {...props}
    >
      <ChevronDownIcon />
    </SelectPrimitive.ScrollDownArrow>
  );
}

export type SelectPopupProps = SelectPrimitive.Popup.Props & {
  /**
   * Mirrors the Positioner's `alignItemWithTrigger` so the popup can disable its open animation
   * when overlaid directly on the trigger.
   */
  alignItemWithTrigger?: boolean;
};

function Popup({ className, children, alignItemWithTrigger = true, ...props }: SelectPopupProps) {
  return (
    <SelectPrimitive.Popup
      data-slot="select-content"
      data-align-trigger={alignItemWithTrigger}
      className={cn(
        'bg-surface-raised text-foreground data-[side=bottom]:slide-from-top data-[side=inline-end]:slide-from-left data-[side=inline-start]:slide-from-right data-[side=left]:slide-from-right data-[side=right]:slide-from-left data-[side=top]:slide-from-bottom data-open:animate-scale-in data-closed:animate-scale-out relative isolate z-50 max-h-(--available-height) w-max max-w-(--available-width) min-w-(--anchor-width) origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg border shadow-md data-[align-trigger=true]:animate-none',
        className,
      )}
      {...props}
    >
      <ScrollUpButton />
      <SelectPrimitive.List>{children}</SelectPrimitive.List>
      <ScrollDownButton />
    </SelectPrimitive.Popup>
  );
}

export type SelectItemProps = SelectPrimitive.Item.Props;

function Item({ className, children, ...props }: SelectItemProps) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "focus:bg-surface-muted focus:text-foreground [&_svg]:text-foreground-muted gap-icon-label py-popup pl-compact has-data-[icon=inline-start]:pl-compact-icon relative flex w-full cursor-default items-center rounded-md pr-8 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="flex flex-1 shrink-0 gap-2 whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute right-2 flex size-3.5 items-center justify-center" />
        }
      >
        <CheckIcon className="pointer-events-none" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export type SelectSeparatorProps = SelectPrimitive.Separator.Props;

function Separator({ className, ...props }: SelectSeparatorProps) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn('bg-border -mx-popup my-popup pointer-events-none h-px', className)}
      {...props}
    />
  );
}

export const Select = {
  Root,
  Group,
  GroupLabel,
  Value,
  Trigger,
  Portal,
  Positioner,
  Popup,
  Item,
  Separator,
};
