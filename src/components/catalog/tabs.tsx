import type { ReactNode } from 'react';

import type { CatalogComponentProps } from '@/catalog/catalog';
import { Tabs as TabsPrimitive } from '@/components/ui/tabs';

type Props = CatalogComponentProps<'Tabs'>;

export function Tabs({ props, children }: { props: Props; children?: ReactNode }) {
  // Children arrive as one flat rendered list; the spec pairs child i with items[i], so panels are
  // matched to labels by position. Index the raw array directly instead of
  // Children.toArray/Children.map — both compact out null entries (e.g. a tab hidden via a
  // `visible` binding renders null), which would shift every later panel under the wrong label.
  const panels = Array.isArray(children) ? children : children === undefined ? [] : [children];

  return (
    <TabsPrimitive.Root defaultValue="0">
      <TabsPrimitive.List>
        {props.items.map((label, index) => (
          <TabsPrimitive.Trigger key={label} value={String(index)}>
            {label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {props.items.map((label, index) => (
        <TabsPrimitive.Content
          className="mt-4 flex flex-col gap-6"
          key={label}
          value={String(index)}
        >
          {panels[index]}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}
