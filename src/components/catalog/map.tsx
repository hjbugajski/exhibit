import { lazy, Suspense, useEffect, useRef, useState } from 'react';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  /*
   * Each map is a live WebGL context and browsers cap how many a page may hold, so a long
   * itinerary of Days must not mount them all at once: defer each until it nears the viewport,
   * then keep it (tearing maps down on scroll-out would refetch tiles). Where no observer exists
   * the deferral is dropped, not the map.
   */
  useEffect(() => {
    const container = containerRef.current;

    if (!container || typeof IntersectionObserver === 'undefined') {
      setMounted(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setMounted(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  const fallback = <Skeleton className="h-full w-full rounded-none" />;

  return (
    <div ref={containerRef} className={cn('h-80 overflow-hidden rounded-lg border', flowBlock)}>
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
