import type { ReactNode } from 'react';

import type { CatalogComponentProps } from '@/catalog/catalog';
import { cn } from '@/lib/utils';

type Props = CatalogComponentProps<'Columns'>;

const ratioClass = {
  '1:1': 'sm:grid-cols-[1fr_1fr]',
  '1:2': 'sm:grid-cols-[1fr_2fr]',
  '2:1': 'sm:grid-cols-[2fr_1fr]',
} as const;

export function Columns({ props, children }: { props: Props; children?: ReactNode }) {
  return (
    <div className={cn('grid grid-cols-1 gap-8', ratioClass[props.ratio ?? '1:1'])}>{children}</div>
  );
}
