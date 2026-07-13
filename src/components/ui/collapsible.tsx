import { Collapsible as CollapsiblePrimitive } from '@base-ui/react/collapsible';

export type CollapsibleRootProps = CollapsiblePrimitive.Root.Props;

function Root({ ...props }: CollapsibleRootProps) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

export type CollapsibleTriggerProps = CollapsiblePrimitive.Trigger.Props;

function Trigger({ ...props }: CollapsibleTriggerProps) {
  return <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />;
}

export type CollapsibleContentProps = CollapsiblePrimitive.Panel.Props;

function Content({ ...props }: CollapsibleContentProps) {
  return <CollapsiblePrimitive.Panel data-slot="collapsible-content" {...props} />;
}

export const Collapsible = { Root, Trigger, Content };
