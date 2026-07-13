import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

export type SkeletonProps = ComponentProps<'div'>;

function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      data-slot="skeleton"
      className={cn('bg-surface-muted animate-pulse rounded-md', className)}
      {...props}
    />
  );
}

export { Skeleton };
