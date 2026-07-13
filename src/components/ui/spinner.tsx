import type { ComponentProps } from 'react';

import { Loader2Icon } from 'lucide-react';

import { cn } from '@/lib/utils';

export type SpinnerProps = ComponentProps<'svg'>;

function Spinner({ className, ...props }: SpinnerProps) {
  return (
    <Loader2Icon
      data-slot="spinner"
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="status"
      aria-label="Loading"
      className={cn('size-3.5 animate-spin', className)}
      {...props}
    />
  );
}

export { Spinner };
