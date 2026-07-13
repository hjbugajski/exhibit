import type { ComponentProps } from 'react';

import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

export type EmptyRootProps = ComponentProps<'div'>;

function Root({ className, ...props }: EmptyRootProps) {
  return (
    <div
      data-slot="empty"
      className={cn(
        'flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-4 rounded-xl border-dashed p-6 text-center text-balance',
        className,
      )}
      {...props}
    />
  );
}

export type EmptyHeaderProps = ComponentProps<'div'>;

function Header({ className, ...props }: EmptyHeaderProps) {
  return (
    <div
      data-slot="empty-header"
      className={cn('flex max-w-sm flex-col items-center gap-2', className)}
      {...props}
    />
  );
}

const emptyMediaVariants = cva(
  'mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        icon: "bg-surface-muted text-foreground-muted flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export type EmptyMediaProps = ComponentProps<'div'> & VariantProps<typeof emptyMediaVariants>;

function Media({ className, variant = 'default', ...props }: EmptyMediaProps) {
  return (
    <div
      data-slot="empty-icon"
      data-variant={variant}
      className={cn(emptyMediaVariants({ variant, className }))}
      {...props}
    />
  );
}

export type EmptyTitleProps = ComponentProps<'div'>;

function Title({ className, ...props }: EmptyTitleProps) {
  return (
    <div
      data-slot="empty-title"
      className={cn('font-heading text-sm font-medium tracking-tight', className)}
      {...props}
    />
  );
}

export type EmptyDescriptionProps = ComponentProps<'p'>;

function Description({ className, ...props }: EmptyDescriptionProps) {
  return (
    <p
      data-slot="empty-description"
      className={cn(
        'text-foreground-muted [&>a:hover]:text-accent text-sm/relaxed [&>a]:underline [&>a]:underline-offset-4',
        className,
      )}
      {...props}
    />
  );
}

export type EmptyContentProps = ComponentProps<'div'>;

function Content({ className, ...props }: EmptyContentProps) {
  return (
    <div
      data-slot="empty-content"
      className={cn(
        'flex w-full max-w-sm min-w-0 flex-col items-center gap-2.5 text-sm text-balance',
        className,
      )}
      {...props}
    />
  );
}

export const Empty = { Root, Header, Title, Description, Content, Media };
