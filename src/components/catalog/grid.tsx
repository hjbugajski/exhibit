import { Children, type ReactNode } from 'react';

import type { CatalogComponentProps } from '@/catalog/catalog';
import { flowBlock, flowCell } from '@/components/catalog/flow';
import { cn } from '@/lib/utils';

type Props = CatalogComponentProps<'Grid'>;

const colsClass = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
} as const;

export function Grid({ props, children }: { props: Props; children?: ReactNode }) {
  // 1 column is the catalog's vertical-flow container: a normal div, so children space themselves
  // with their own collapsing margins (prose rhythm) instead of a uniform grid gap.
  if (props.columns === 1) {
    return <div className={flowBlock}>{children}</div>;
  }

  return (
    <div className={cn('grid grid-cols-1 gap-6', colsClass[props.columns], flowBlock)}>
      {Children.map(children, (child) => (
        <div className={flowCell}>{child}</div>
      ))}
    </div>
  );
}
