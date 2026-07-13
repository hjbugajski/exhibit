import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "group/button focus-visible:border-ring focus-visible:ring-focus aria-invalid:border-danger-strong aria-invalid:ring-focus-danger gap-icon-label px-control has-data-[icon=inline-end]:pr-control-icon has-data-[icon=inline-start]:pl-control-icon inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:ring-3 active:not-aria-[haspopup]:translate-y-px has-data-[icon=only]:w-8 has-data-[icon=only]:px-0 aria-invalid:ring-3 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default: 'bg-accent text-accent-foreground hover:bg-accent-hover',
        outline:
          'border-border-strong bg-field hover:bg-surface-active hover:text-foreground aria-expanded:bg-surface-muted aria-expanded:text-foreground [&_svg]:text-foreground-muted',
        secondary:
          'bg-surface-muted text-foreground aria-expanded:bg-surface-muted aria-expanded:text-foreground [&_svg]:text-foreground-muted hover:bg-surface-muted-hover',
        ghost:
          'hover:bg-surface-active hover:text-foreground aria-expanded:bg-surface-muted aria-expanded:text-foreground [&_svg]:text-foreground-muted',
        destructive:
          'border-danger-line bg-danger-subtle text-danger hover:bg-danger-muted focus-visible:border-danger-strong focus-visible:ring-focus-danger',
        link: 'text-accent underline-offset-4 hover:underline',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export type ButtonProps = ButtonPrimitive.Props & VariantProps<typeof buttonVariants>;

/**
 * One 32px size; an icon-only button tags its icon `data-icon="only"` to become the 32px square.
 * When `render` swaps in a non-<button> element (e.g. an <a>), pass `nativeButton={false}`; the
 * element still gets `role="button"`, so tests query it by text rather than role.
 */
function Button({ className, variant = 'default', ...props }: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
