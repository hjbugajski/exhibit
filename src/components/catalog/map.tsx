import { lazy, Suspense, useEffect, useState } from 'react';

import type { CatalogComponentProps } from '@/catalog/catalog';
import { flowBlock } from '@/components/catalog/flow';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type Props = CatalogComponentProps<'Map'>;

/**
 * maplibre-gl is heavy and browser-only: the real map is a lazy chunk rendered
 * strictly after mount, so SSR (and test DOMs) never import it and specs without a
 * Map never download it.
 */
const MapInner = lazy(() => import('./map-inner'));

export function Map({ props }: { props: Props }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fallback = <Skeleton className="h-full w-full rounded-none" />;

  return (
    <div className={cn('h-80 overflow-hidden rounded-lg border', flowBlock)}>
      {mounted ? (
        <Suspense fallback={fallback}>
          <MapInner props={props} />
        </Suspense>
      ) : (
        fallback
      )}
    </div>
  );
}
