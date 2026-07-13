import type { ComponentProps } from 'react';

import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { ChevronRightIcon, CheckIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export type DropdownMenuRootProps = MenuPrimitive.Root.Props;

function Root({ ...props }: DropdownMenuRootProps) {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

export type DropdownMenuPortalProps = MenuPrimitive.Portal.Props;

function Portal({ ...props }: DropdownMenuPortalProps) {
  return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />;
}

export type DropdownMenuTriggerProps = MenuPrimitive.Trigger.Props;

function Trigger({ ...props }: DropdownMenuTriggerProps) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

export type DropdownMenuPositionerProps = MenuPrimitive.Positioner.Props;

function Positioner({
  className,
  align = 'start',
  alignOffset = 0,
  side = 'bottom',
  sideOffset = 4,
  ...props
}: DropdownMenuPositionerProps) {
  return (
    <MenuPrimitive.Positioner
      className={cn('isolate z-50 outline-none', className)}
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      {...props}
    />
  );
}

export type DropdownMenuPopupProps = MenuPrimitive.Popup.Props;

function Popup({ className, ...props }: DropdownMenuPopupProps) {
  return (
    <MenuPrimitive.Popup
      data-slot="dropdown-menu-content"
      className={cn(
        'bg-surface-raised text-foreground data-[side=bottom]:slide-from-top data-[side=inline-end]:slide-from-left data-[side=inline-start]:slide-from-right data-[side=left]:slide-from-right data-[side=right]:slide-from-left data-[side=top]:slide-from-bottom data-open:animate-scale-in data-closed:animate-scale-out p-popup z-50 max-h-(--available-height) w-(--anchor-width) min-w-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg border shadow-md outline-none data-closed:overflow-hidden',
        className,
      )}
      {...props}
    />
  );
}

export type DropdownMenuGroupProps = MenuPrimitive.Group.Props;

function Group({ ...props }: DropdownMenuGroupProps) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

export type DropdownMenuGroupLabelProps = MenuPrimitive.GroupLabel.Props & {
  inset?: boolean;
};

function GroupLabel({ className, inset, ...props }: DropdownMenuGroupLabelProps) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        'text-foreground-muted px-compact py-popup text-xs font-medium data-inset:pl-6.5',
        className,
      )}
      {...props}
    />
  );
}

export type DropdownMenuItemProps = MenuPrimitive.Item.Props & {
  inset?: boolean;
  variant?: 'default' | 'destructive';
};

function Item({ className, inset, variant = 'default', ...props }: DropdownMenuItemProps) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "group/dropdown-menu-item focus:bg-surface-muted focus:text-foreground not-data-[variant=destructive]:focus:**:text-foreground data-[variant=destructive]:text-danger data-[variant=destructive]:focus:bg-danger-subtle data-[variant=destructive]:focus:text-danger data-[variant=destructive]:*:[svg]:text-danger not-data-[variant=destructive]:[&_svg]:text-foreground-muted gap-icon-label px-compact py-popup has-data-[icon=inline-start]:pl-compact-icon relative flex cursor-default items-center rounded-md text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-inset:pl-6.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className,
      )}
      {...props}
    />
  );
}

export type DropdownMenuSubProps = MenuPrimitive.SubmenuRoot.Props;

function Sub({ ...props }: DropdownMenuSubProps) {
  return <MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />;
}

export type DropdownMenuSubTriggerProps = MenuPrimitive.SubmenuTrigger.Props & {
  inset?: boolean;
};

function SubTrigger({ className, inset, children, ...props }: DropdownMenuSubTriggerProps) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "focus:bg-surface-muted focus:text-foreground focus:**:text-foreground data-popup-open:bg-surface-muted data-popup-open:text-foreground data-open:bg-surface-muted data-open:text-foreground [&_svg]:text-foreground-muted gap-icon-label px-compact py-popup has-data-[icon=inline-start]:pl-compact-icon flex cursor-default items-center rounded-md text-sm outline-hidden select-none data-inset:pl-6.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto" />
    </MenuPrimitive.SubmenuTrigger>
  );
}

export type DropdownMenuCheckboxItemProps = MenuPrimitive.CheckboxItem.Props & {
  inset?: boolean;
};

function CheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: DropdownMenuCheckboxItemProps) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      className={cn(
        "focus:bg-surface-muted focus:text-foreground focus:**:text-foreground [&_svg]:text-foreground-muted gap-icon-label py-popup pl-compact has-data-[icon=inline-start]:pl-compact-icon relative flex cursor-default items-center rounded-md pr-8 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-inset:pl-6.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className,
      )}
      checked={checked}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <MenuPrimitive.CheckboxItemIndicator>
          <CheckIcon />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  );
}

export type DropdownMenuRadioGroupProps = MenuPrimitive.RadioGroup.Props;

function RadioGroup({ ...props }: DropdownMenuRadioGroupProps) {
  return <MenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />;
}

export type DropdownMenuRadioItemProps = MenuPrimitive.RadioItem.Props & {
  inset?: boolean;
};

function RadioItem({ className, children, inset, ...props }: DropdownMenuRadioItemProps) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={cn(
        "focus:bg-surface-muted focus:text-foreground focus:**:text-foreground [&_svg]:text-foreground-muted gap-icon-label py-popup pl-compact has-data-[icon=inline-start]:pl-compact-icon relative flex cursor-default items-center rounded-md pr-8 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-inset:pl-6.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className,
      )}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <MenuPrimitive.RadioItemIndicator>
          <CheckIcon />
        </MenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  );
}

export type DropdownMenuSeparatorProps = MenuPrimitive.Separator.Props;

function Separator({ className, ...props }: DropdownMenuSeparatorProps) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn('bg-border -mx-popup my-popup h-px', className)}
      {...props}
    />
  );
}

export type DropdownMenuShortcutProps = ComponentProps<'span'>;

function Shortcut({ className, ...props }: DropdownMenuShortcutProps) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        'text-foreground-muted group-focus/dropdown-menu-item:text-foreground ml-auto text-xs tracking-widest',
        className,
      )}
      {...props}
    />
  );
}

export const DropdownMenu = {
  Root,
  Portal,
  Trigger,
  Positioner,
  Popup,
  Group,
  GroupLabel,
  Item,
  SubmenuRoot: Sub,
  SubmenuTrigger: SubTrigger,
  CheckboxItem,
  RadioGroup,
  RadioItem,
  Separator,
  Shortcut,
};
