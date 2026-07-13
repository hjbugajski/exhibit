import type { ComponentProps } from 'react';

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { XIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type DialogRootProps = DialogPrimitive.Root.Props;

function Root({ ...props }: DialogRootProps) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

export type DialogTriggerProps = DialogPrimitive.Trigger.Props;

function Trigger({ ...props }: DialogTriggerProps) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

export type DialogPortalProps = DialogPrimitive.Portal.Props;

function Portal({ ...props }: DialogPortalProps) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

export type DialogCloseProps = DialogPrimitive.Close.Props;

function Close({ ...props }: DialogCloseProps) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

export type DialogOverlayProps = DialogPrimitive.Backdrop.Props;

function Overlay({ className, ...props }: DialogOverlayProps) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        'data-open:animate-fade-in data-closed:animate-fade-out bg-overlay fixed inset-0 isolate z-50 supports-backdrop-filter:backdrop-blur-xs',
        className,
      )}
      {...props}
    />
  );
}

export type DialogPopupProps = DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
};

function Popup({ className, children, showCloseButton = true, ...props }: DialogPopupProps) {
  return (
    <DialogPrimitive.Popup
      data-slot="dialog-content"
      className={cn(
        'bg-surface text-foreground data-open:animate-scale-in data-closed:animate-scale-out gap-dialog p-dialog fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border text-sm shadow-lg outline-none sm:max-w-sm',
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close
          data-slot="dialog-close"
          render={<Button variant="ghost" className="absolute top-2 right-2" />}
        >
          <XIcon data-icon="only" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Popup>
  );
}

export type DialogHeaderProps = ComponentProps<'div'>;

function Header({ className, ...props }: DialogHeaderProps) {
  return (
    <div data-slot="dialog-header" className={cn('flex flex-col gap-2', className)} {...props} />
  );
}

export type DialogFooterProps = ComponentProps<'div'> & {
  showCloseButton?: boolean;
};

function Footer({ className, showCloseButton = false, children, ...props }: DialogFooterProps) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>Close</DialogPrimitive.Close>
      )}
    </div>
  );
}

export type DialogTitleProps = DialogPrimitive.Title.Props;

function Title({ className, ...props }: DialogTitleProps) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('font-heading text-base leading-none font-medium', className)}
      {...props}
    />
  );
}

export type DialogDescriptionProps = DialogPrimitive.Description.Props;

function Description({ className, ...props }: DialogDescriptionProps) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        'text-foreground-muted *:[a]:hover:text-foreground text-sm *:[a]:underline *:[a]:underline-offset-3',
        className,
      )}
      {...props}
    />
  );
}

export const Dialog = {
  Root,
  Trigger,
  Portal,
  Close,
  Overlay,
  Popup,
  Header,
  Footer,
  Title,
  Description,
};
