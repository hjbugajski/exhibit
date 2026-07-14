import type { ReactNode } from 'react';

import type { CatalogComponentProps } from '@/catalog/catalog';
import { flowSection } from '@/components/catalog/flow';
import { cn } from '@/lib/utils';

type Props = CatalogComponentProps<'Itinerary'>;

export function Itinerary({ props, children }: { props: Props; children?: ReactNode }) {
  const hasHeader = Boolean(props.title || props.dateRange);

  return (
    <div className={flowSection}>
      {hasHeader ? (
        <div>
          {props.title ? (
            <h2 className="text-foreground text-2xl font-semibold tracking-tight">{props.title}</h2>
          ) : null}
          {props.dateRange ? (
            <p className="text-foreground-muted mt-2 text-sm">{props.dateRange}</p>
          ) : null}
        </div>
      ) : null}
      <div className={cn(hasHeader && 'mt-8')}>{children}</div>
    </div>
  );
}
