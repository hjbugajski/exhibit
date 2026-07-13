import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

export type TableRootProps = ComponentProps<'table'>;

function Root({ className, ...props }: TableRootProps) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto rounded-lg border">
      <table data-slot="table" className={cn('w-full text-sm', className)} {...props} />
    </div>
  );
}

export type TableHeaderProps = ComponentProps<'thead'>;

function Header({ className, ...props }: TableHeaderProps) {
  return (
    <thead
      data-slot="table-header"
      className={cn('bg-surface [&_tr]:border-b', className)}
      {...props}
    />
  );
}

export type TableBodyProps = ComponentProps<'tbody'>;

function Body({ className, ...props }: TableBodyProps) {
  return (
    <tbody
      data-slot="table-body"
      /* Row hovers live here, not on Row, so header rows never pick them up. */
      className={cn(
        '[&_tr]:hover:bg-surface-active [&_tr]:has-aria-expanded:bg-surface-active [&_tr:last-child]:border-0',
        className,
      )}
      {...props}
    />
  );
}

export type TableFooterProps = ComponentProps<'tfoot'>;

function Footer({ className, ...props }: TableFooterProps) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn('bg-surface border-t font-medium [&>tr]:last:border-b-0', className)}
      {...props}
    />
  );
}

export type TableRowProps = ComponentProps<'tr'>;

function Row({ className, ...props }: TableRowProps) {
  return (
    <tr
      data-slot="table-row"
      className={cn('data-[state=selected]:bg-surface-muted border-b transition-colors', className)}
      {...props}
    />
  );
}

export type TableHeadProps = ComponentProps<'th'>;

function Head({ className, ...props }: TableHeadProps) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'text-foreground-muted h-9 px-2 text-left align-middle text-xs font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0',
        className,
      )}
      {...props}
    />
  );
}

export type TableCellProps = ComponentProps<'td'>;

function Cell({ className, ...props }: TableCellProps) {
  return (
    <td
      data-slot="table-cell"
      className={cn('p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0', className)}
      {...props}
    />
  );
}

export const Table = { Root, Header, Body, Footer, Row, Head, Cell };
