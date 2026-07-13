import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'group/badge focus-visible:border-ring focus-visible:ring-focus aria-invalid:border-danger-strong aria-invalid:ring-focus-danger inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-sm border border-transparent px-1 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:ring-[3px] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:pointer-events-none [&>svg]:size-3!',
  {
    variants: {
      variant: {
        default:
          'border-border-strong bg-surface-muted text-foreground [a]:hover:bg-surface-muted-hover',
        outline:
          'border-border text-foreground [a]:hover:bg-surface-muted [a]:hover:text-foreground-muted',
        info: 'border-info-line bg-info-subtle text-info',
        success: 'border-success-line bg-success-subtle text-success',
        warning: 'border-warning-line bg-warning-subtle text-warning',
        danger:
          'border-danger-line bg-danger-subtle text-danger focus-visible:ring-focus-danger [a]:hover:bg-danger-muted',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export type BadgeProps = useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>;

function Badge({ className, variant = 'default', render, ...props }: BadgeProps) {
  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props,
    ),
    render,
    state: {
      slot: 'badge',
      variant,
    },
  });
}

export { Badge, badgeVariants };
