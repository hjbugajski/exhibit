import type { ComponentProps } from 'react';

import { AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type AlertDialogRootProps = AlertDialogPrimitive.Root.Props;

function Root({ ...props }: AlertDialogRootProps) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

export type AlertDialogTriggerProps = AlertDialogPrimitive.Trigger.Props;

function Trigger({ ...props }: AlertDialogTriggerProps) {
  return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />;
}

export type AlertDialogPortalProps = AlertDialogPrimitive.Portal.Props;

function Portal({ ...props }: AlertDialogPortalProps) {
  return <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />;
}

export type AlertDialogOverlayProps = AlertDialogPrimitive.Backdrop.Props;

function Overlay({ className, ...props }: AlertDialogOverlayProps) {
  return (
    <AlertDialogPrimitive.Backdrop
      data-slot="alert-dialog-overlay"
      className={cn(
        'data-open:animate-fade-in data-closed:animate-fade-out bg-overlay fixed inset-0 isolate z-50 supports-backdrop-filter:backdrop-blur-xs',
        className,
      )}
      {...props}
    />
  );
}

export type AlertDialogPopupProps = AlertDialogPrimitive.Popup.Props & {
  /** `destructive` renders the title in the danger text color. */
  variant?: 'default' | 'destructive';
};

function Popup({ className, variant = 'default', ...props }: AlertDialogPopupProps) {
  return (
    <AlertDialogPrimitive.Popup
      data-slot="alert-dialog-content"
      data-variant={variant}
      className={cn(
        'group/alert-dialog-content bg-surface text-foreground data-open:animate-scale-in data-closed:animate-scale-out focus-visible:ring-focus gap-dialog p-dialog fixed top-1/2 left-1/2 z-50 grid w-full max-w-xs -translate-x-1/2 -translate-y-1/2 rounded-xl border shadow-lg outline-none focus-visible:ring-3 sm:max-w-sm',
        className,
      )}
      {...props}
    />
  );
}

export type AlertDialogHeaderProps = ComponentProps<'div'>;

function Header({ className, ...props }: AlertDialogHeaderProps) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn(
        'grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-4 sm:place-items-start sm:text-left sm:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]',
        className,
      )}
      {...props}
    />
  );
}

export type AlertDialogFooterProps = ComponentProps<'div'>;

function Footer({ className, ...props }: AlertDialogFooterProps) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

export type AlertDialogMediaProps = ComponentProps<'div'>;

function Media({ className, ...props }: AlertDialogMediaProps) {
  return (
    <div
      data-slot="alert-dialog-media"
      className={cn(
        "bg-surface-muted mb-2 inline-flex size-10 items-center justify-center rounded-md sm:row-span-2 *:[svg:not([class*='size-'])]:size-6",
        className,
      )}
      {...props}
    />
  );
}

export type AlertDialogTitleProps = ComponentProps<typeof AlertDialogPrimitive.Title>;

function Title({ className, ...props }: AlertDialogTitleProps) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn(
        'font-heading group-data-[variant=destructive]/alert-dialog-content:text-danger text-base font-medium sm:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2',
        className,
      )}
      {...props}
    />
  );
}

export type AlertDialogDescriptionProps = ComponentProps<typeof AlertDialogPrimitive.Description>;

function Description({ className, ...props }: AlertDialogDescriptionProps) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn(
        'text-foreground-muted *:[a]:hover:text-foreground text-sm text-balance md:text-pretty *:[a]:underline *:[a]:underline-offset-3',
        className,
      )}
      {...props}
    />
  );
}

export type AlertDialogActionProps = ComponentProps<typeof Button>;

function Action({ className, ...props }: AlertDialogActionProps) {
  return <Button data-slot="alert-dialog-action" className={className} {...props} />;
}

export type AlertDialogCancelProps = AlertDialogPrimitive.Close.Props &
  Pick<ComponentProps<typeof Button>, 'variant'>;

function Cancel({ className, variant = 'outline', ...props }: AlertDialogCancelProps) {
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-cancel"
      className={className}
      render={<Button variant={variant} />}
      {...props}
    />
  );
}

export const AlertDialog = {
  Root,
  Trigger,
  Portal,
  Overlay,
  Popup,
  Header,
  Footer,
  Media,
  Title,
  Description,
  Action,
  Cancel,
};
