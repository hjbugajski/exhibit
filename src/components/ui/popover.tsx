import { Popover as PopoverPrimitive } from '@base-ui/react/popover';

import { cn } from '@/lib/utils';

export type PopoverRootProps = PopoverPrimitive.Root.Props;

function Root({ ...props }: PopoverRootProps) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

export type PopoverTriggerProps = PopoverPrimitive.Trigger.Props;

function Trigger({ ...props }: PopoverTriggerProps) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

export type PopoverPortalProps = PopoverPrimitive.Portal.Props;

function Portal({ ...props }: PopoverPortalProps) {
  return <PopoverPrimitive.Portal data-slot="popover-portal" {...props} />;
}

export type PopoverPositionerProps = PopoverPrimitive.Positioner.Props;

function Positioner({
  className,
  align = 'start',
  alignOffset = 0,
  side = 'bottom',
  sideOffset = 4,
  ...props
}: PopoverPositionerProps) {
  return (
    <PopoverPrimitive.Positioner
      className={cn('isolate z-50 outline-none', className)}
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      {...props}
    />
  );
}

export type PopoverPopupProps = PopoverPrimitive.Popup.Props;

function Popup({ className, ...props }: PopoverPopupProps) {
  return (
    <PopoverPrimitive.Popup
      data-slot="popover-content"
      className={cn(
        'bg-surface-raised text-foreground data-[side=bottom]:slide-from-top data-[side=inline-end]:slide-from-left data-[side=inline-start]:slide-from-right data-[side=left]:slide-from-right data-[side=right]:slide-from-left data-[side=top]:slide-from-bottom data-open:animate-scale-in data-closed:animate-scale-out p-card-sm z-50 max-h-(--available-height) origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg border text-sm shadow-md outline-none',
        className,
      )}
      {...props}
    />
  );
}

export type PopoverTitleProps = PopoverPrimitive.Title.Props;

function Title({ className, ...props }: PopoverTitleProps) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn('text-sm font-medium', className)}
      {...props}
    />
  );
}

export type PopoverDescriptionProps = PopoverPrimitive.Description.Props;

function Description({ className, ...props }: PopoverDescriptionProps) {
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className={cn('text-foreground-muted text-sm', className)}
      {...props}
    />
  );
}

export type PopoverCloseProps = PopoverPrimitive.Close.Props;

function Close({ ...props }: PopoverCloseProps) {
  return <PopoverPrimitive.Close data-slot="popover-close" {...props} />;
}

export const Popover = {
  Root,
  Trigger,
  Portal,
  Positioner,
  Popup,
  Title,
  Description,
  Close,
};
