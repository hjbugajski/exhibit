import { createContext, useContext, type ComponentProps } from 'react';

import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/*
 * No icon slot: each alert carries a floating 2px fully-rounded bar (the `before:` pseudo) that
 * picks up the variant's text color via bg-current.
 */
const alertVariants = cva(
  'group/alert relative grid w-full gap-1 rounded-lg py-3 pr-3 pl-5 text-left text-sm before:absolute before:inset-y-3 before:left-2 before:w-0.5 before:rounded-full before:bg-current has-data-[slot=alert-action]:pr-18',
  {
    variants: {
      variant: {
        default: 'bg-surface-subtle text-foreground',
        info: 'bg-info-subtle text-info',
        success: 'bg-success-subtle text-success',
        warning: 'bg-warning-subtle text-warning',
        danger: 'bg-danger-subtle text-danger',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

type AlertVariant = NonNullable<VariantProps<typeof alertVariants>['variant']>;

/** Lets Description and Action pick up the Root's variant without re-declaring it. */
const AlertVariantContext = createContext<AlertVariant>('default');

export type AlertRootProps = ComponentProps<'div'> & VariantProps<typeof alertVariants>;

function Root({ className, variant = 'default', ...props }: AlertRootProps) {
  return (
    <AlertVariantContext.Provider value={variant ?? 'default'}>
      <div
        data-slot="alert"
        role="alert"
        className={cn(alertVariants({ variant }), className)}
        {...props}
      />
    </AlertVariantContext.Provider>
  );
}

export type AlertTitleProps = ComponentProps<'div'>;

function Title({ className, ...props }: AlertTitleProps) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        '[&_a]:hover:text-foreground font-medium [&_a]:underline [&_a]:underline-offset-3',
        className,
      )}
      {...props}
    />
  );
}

/* Body copy uses the scale's last step (`-body`, step 12) — titles and the bar stay on the
   step-11 tone anchor. */
const descriptionVariantClassName: Record<AlertVariant, string> = {
  default: 'text-foreground',
  info: 'text-info-body',
  success: 'text-success-body',
  warning: 'text-warning-body',
  danger: 'text-danger-body',
};

export type AlertDescriptionProps = ComponentProps<'div'>;

function Description({ className, ...props }: AlertDescriptionProps) {
  const variant = useContext(AlertVariantContext);

  return (
    <div
      data-slot="alert-description"
      className={cn(
        '[&_a]:hover:text-foreground text-sm text-balance md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_p:not(:last-child)]:mb-4',
        descriptionVariantClassName[variant],
        className,
      )}
      {...props}
    />
  );
}

/*
 * Descendant selectors (`[&_[data-slot=button]…]`) out-specify the Button's own variant classes
 * (ghost's `hover:text-foreground`, `[&_svg]:text-foreground-muted`), so a slotted close button
 * takes the alert's tone without call-site overrides.
 */
const actionVariantClassName: Record<AlertVariant, string | undefined> = {
  default: undefined,
  info: 'text-info [&_[data-slot=button]:hover]:bg-info-muted [&_[data-slot=button]:hover]:text-info [&_[data-slot=button]_svg]:text-info',
  success:
    'text-success [&_[data-slot=button]:hover]:bg-success-muted [&_[data-slot=button]:hover]:text-success [&_[data-slot=button]_svg]:text-success',
  warning:
    'text-warning [&_[data-slot=button]:hover]:bg-warning-muted [&_[data-slot=button]:hover]:text-warning [&_[data-slot=button]_svg]:text-warning',
  danger:
    'text-danger [&_[data-slot=button]:hover]:bg-danger-muted [&_[data-slot=button]:hover]:text-danger [&_[data-slot=button]_svg]:text-danger',
};

export type AlertActionProps = ComponentProps<'div'>;

function Action({ className, ...props }: AlertActionProps) {
  const variant = useContext(AlertVariantContext);

  return (
    <div
      data-slot="alert-action"
      className={cn('absolute top-2 right-2', actionVariantClassName[variant], className)}
      {...props}
    />
  );
}

export const Alert = { Root, Title, Description, Action };
