import { lazy, Suspense } from 'react';

import type { CatalogComponentProps } from '@/catalog/catalog';
import { flowBlock } from '@/components/catalog/flow';
import { Skeleton } from '@/components/ui/skeleton';
import { useNearViewport } from '@/lib/use-near-viewport';
import { cn } from '@/lib/utils';

type Props = CatalogComponentProps<'Map'>;

/**
 * maplibre-gl is heavy and browser-only: the real map is a lazy chunk rendered
 * strictly after mount, so SSR (and test DOMs) never import it and specs without a
 * Map never download it.
 */
const MapInner = lazy(() => import('./map-inner'));

export function Map({ props }: { props: Props }) {
  // Each map is a live WebGL context and browsers cap how many a page may hold, so a long itinerary
  // of Days must not mount them all at once.
  const { ref, mounted } = useNearViewport<HTMLDivElement>();

  const fallback = <Skeleton className="h-full w-full rounded-none" />;

  return (
    <div ref={ref} className={cn('h-80 overflow-hidden rounded-lg border', flowBlock)}>
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
