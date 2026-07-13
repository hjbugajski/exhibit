import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

export type LabelProps = ComponentProps<'label'>;

function Label({ className, ...props }: LabelProps) {
  return (
    // oxlint-disable-next-line jsx-a11y/label-has-associated-control
    <label
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-xs leading-none font-medium select-none group-data-disabled:pointer-events-none group-data-disabled:opacity-50 peer-data-disabled:cursor-not-allowed peer-data-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Label };
