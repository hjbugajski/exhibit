import { Collapsible as CollapsiblePrimitive } from '@base-ui/react/collapsible';

import { cn } from '@/lib/utils';

export type CollapsibleRootProps = CollapsiblePrimitive.Root.Props;

function Root({ ...props }: CollapsibleRootProps) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

export type CollapsibleTriggerProps = CollapsiblePrimitive.Trigger.Props;

function Trigger({ ...props }: CollapsibleTriggerProps) {
  return <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />;
}

export type CollapsibleContentProps = CollapsiblePrimitive.Panel.Props;

function Content({ className, ...props }: CollapsibleContentProps) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-content"
      className={cn(
        'h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-150 ease-out data-ending-style:h-0 data-starting-style:h-0',
        className,
      )}
      {...props}
    />
  );
}

export const Collapsible = { Root, Trigger, Content };
