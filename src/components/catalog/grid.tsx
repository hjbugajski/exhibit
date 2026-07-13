import type { ReactNode } from 'react';

import type { CatalogComponentProps } from '@/catalog/catalog';
import { cn } from '@/lib/utils';

type Props = CatalogComponentProps<'Grid'>;

const colsClass = {
  1: undefined,
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
} as const;

export function Grid({ props, children }: { props: Props; children?: ReactNode }) {
  return <div className={cn('grid grid-cols-1 gap-4', colsClass[props.columns])}>{children}</div>;
}
