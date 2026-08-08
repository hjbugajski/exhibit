import type { ComponentProps } from 'react';

import { Loader2Icon } from 'lucide-react';

import { cn } from '@/lib/utils';

export type SpinnerProps = ComponentProps<'svg'>;

function Spinner({ className, ...props }: SpinnerProps) {
  return (
    <Loader2Icon
      data-slot="spinner"
      // The suggested <output> tag can't replace the icon element itself.
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="status"
      aria-label="Loading"
      className={cn('size-3.5 animate-spin', className)}
      {...props}
    />
  );
}

export { Spinner };
