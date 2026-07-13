import type { ComponentProps } from 'react';

import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';

import { cn } from '@/lib/utils';

export type CardRootProps = ComponentProps<'div'>;

function Root({ className, ...props }: CardRootProps) {
  return (
    <div
      data-slot="card"
      className={cn(
        'group/card bg-surface text-foreground gap-card py-card flex flex-col overflow-hidden rounded-xl border text-sm has-[>img:first-child]:pt-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl',
        className,
      )}
      {...props}
    />
  );
}

export type CardHeaderProps = ComponentProps<'div'>;

function Header({ className, ...props }: CardHeaderProps) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        'group/card-header px-card @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto]',
        className,
      )}
      {...props}
    />
  );
}

export type CardTitleProps = useRender.ComponentProps<'div'>;

function Title({ className, render, ...props }: CardTitleProps) {
  return useRender({
    defaultTagName: 'div',
    render,
    props: mergeProps<'div'>(
      {
        className: cn('font-heading text-base leading-snug font-medium', className),
      },
      props,
    ),
    state: { slot: 'card-title' },
  });
}

export type CardDescriptionProps = ComponentProps<'div'>;

function Description({ className, ...props }: CardDescriptionProps) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-foreground-muted text-sm', className)}
      {...props}
    />
  );
}

export type CardActionProps = ComponentProps<'div'>;

function Action({ className, ...props }: CardActionProps) {
  return (
    <div
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...props}
    />
  );
}

export type CardContentProps = ComponentProps<'div'>;

function Content({ className, ...props }: CardContentProps) {
  return <div data-slot="card-content" className={cn('px-card', className)} {...props} />;
}

export type CardFooterProps = ComponentProps<'div'>;

function Footer({ className, ...props }: CardFooterProps) {
  return (
    <div
      data-slot="card-footer"
      className={cn('px-card flex items-center', className)}
      {...props}
    />
  );
}

export const Card = { Root, Header, Title, Description, Action, Content, Footer };
