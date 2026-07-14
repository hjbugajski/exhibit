import { lazy, Suspense } from 'react';

import type { CatalogComponentProps } from '@/catalog/catalog';
import { flowBlock } from '@/components/catalog/flow';
import { Skeleton } from '@/components/ui/skeleton';

type Props = CatalogComponentProps<'Chart'>;

/**
 * recharts is heavy: the real chart is a lazy chunk so specs without a Chart
 * never download it.
 */
const ChartInner = lazy(() => import('./chart-inner'));

export function Chart({ props }: { props: Props }) {
  return (
    <div className={flowBlock}>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <ChartInner props={props} />
      </Suspense>
    </div>
  );
}
