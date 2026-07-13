import type { ComponentProps } from 'react';

import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';

import { Separator as SeparatorPrimitive } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export type ItemGroupProps = ComponentProps<'div'>;

function Group({ className, ...props }: ItemGroupProps) {
  return (
    <div
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="list"
      data-slot="item-group"
      className={cn('group/item-group flex w-full flex-col gap-4', className)}
      {...props}
    />
  );
}

export type ItemSeparatorProps = ComponentProps<typeof SeparatorPrimitive>;

function Separator({ className, ...props }: ItemSeparatorProps) {
  return (
    <SeparatorPrimitive
      data-slot="item-separator"
      orientation="horizontal"
      className={cn('my-2', className)}
      {...props}
    />
  );
}

const itemVariants = cva(
  'group/item focus-visible:border-ring focus-visible:ring-focus [a]:hover:bg-surface-subtle flex w-full flex-wrap items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors duration-100 outline-none focus-visible:ring-[3px] [a]:transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent',
        outline: 'border-border',
        muted: 'bg-surface-subtle border-transparent',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export type ItemRootProps = useRender.ComponentProps<'div'> & VariantProps<typeof itemVariants>;

function Root({ className, variant = 'default', render, ...props }: ItemRootProps) {
  return useRender({
    defaultTagName: 'div',
    props: mergeProps<'div'>(
      {
        className: cn(itemVariants({ variant, className })),
      },
      props,
    ),
    render,
    state: {
      slot: 'item',
      variant,
    },
  });
}

const itemMediaVariants = cva(
  'flex shrink-0 items-center justify-center gap-2 group-has-data-[slot=item-description]/item:translate-y-0.5 group-has-data-[slot=item-description]/item:self-start [&_svg]:pointer-events-none',
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        icon: "text-foreground-muted [&_svg:not([class*='size-'])]:size-3.5",
        image: 'size-10 overflow-hidden rounded-sm [&_img]:size-full [&_img]:object-cover',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export type ItemMediaProps = ComponentProps<'div'> & VariantProps<typeof itemMediaVariants>;

function Media({ className, variant = 'default', ...props }: ItemMediaProps) {
  return (
    <div
      data-slot="item-media"
      data-variant={variant}
      className={cn(itemMediaVariants({ variant, className }))}
      {...props}
    />
  );
}

export type ItemContentProps = ComponentProps<'div'>;

function Content({ className, ...props }: ItemContentProps) {
  return (
    <div
      data-slot="item-content"
      className={cn('flex flex-1 flex-col gap-1 [&+[data-slot=item-content]]:flex-none', className)}
      {...props}
    />
  );
}

export type ItemTitleProps = ComponentProps<'div'>;

function Title({ className, ...props }: ItemTitleProps) {
  return (
    <div
      data-slot="item-title"
      className={cn(
        'line-clamp-1 flex w-fit items-center gap-2 text-sm leading-snug font-medium underline-offset-4',
        className,
      )}
      {...props}
    />
  );
}

export type ItemDescriptionProps = ComponentProps<'p'>;

function Description({ className, ...props }: ItemDescriptionProps) {
  return (
    <p
      data-slot="item-description"
      className={cn(
        'text-foreground-muted [&>a:hover]:text-accent line-clamp-2 text-left text-sm leading-normal font-normal [&>a]:underline [&>a]:underline-offset-4',
        className,
      )}
      {...props}
    />
  );
}

export type ItemActionsProps = ComponentProps<'div'>;

function Actions({ className, ...props }: ItemActionsProps) {
  return (
    <div data-slot="item-actions" className={cn('flex items-center gap-2', className)} {...props} />
  );
}

export type ItemHeaderProps = ComponentProps<'div'>;

function Header({ className, ...props }: ItemHeaderProps) {
  return (
    <div
      data-slot="item-header"
      className={cn('flex basis-full items-center justify-between gap-2', className)}
      {...props}
    />
  );
}

export type ItemFooterProps = ComponentProps<'div'>;

function Footer({ className, ...props }: ItemFooterProps) {
  return (
    <div
      data-slot="item-footer"
      className={cn('flex basis-full items-center justify-between gap-2', className)}
      {...props}
    />
  );
}

export const Item = {
  Root,
  Media,
  Content,
  Actions,
  Group,
  Separator,
  Title,
  Description,
  Header,
  Footer,
};
