import { lazy, Suspense, useEffect, useRef, useState } from 'react';

import type { CatalogComponentProps } from '@/catalog/catalog';
import { HighlightedCode } from '@/components/blocks/highlighted-code';
import { flowBlock } from '@/components/catalog/flow';
import { Skeleton } from '@/components/ui/skeleton';

type Props = CatalogComponentProps<'Mermaid'>;

/**
 * A diagram that cannot be drawn degrades loudly, the way an invalid exhibit fence does: the source
 * stays visible with one line saying why, because the feedback is what gets the next version right.
 * Exported so the lazy chunk failing to load lands in the same shape as a failed render.
 */
export function MermaidFallback({ code, message }: { code: string; message: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-danger text-sm">{message}</div>
      <HighlightedCode
        className="bg-surface-muted overflow-x-auto rounded-lg p-4 text-sm"
        code={code}
      />
    </div>
  );
}

/**
 * mermaid is heavy (~157 KB gzip before the per-diagram chunks) and browser-only: the renderer is a
 * lazy chunk mounted only once the diagram nears the viewport, so SSR (and test DOMs) never import
 * it and documents whose diagrams stay below the fold never download it.
 */
const MermaidInner = lazy(() =>
  import('./mermaid-inner').catch(() => ({
    default: ({ props }: { props: Props }) => (
      <MermaidFallback code={props.code} message="This diagram couldn’t be loaded." />
    ),
  })),
);

export function Mermaid({ props }: { props: Props }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

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

  // Also the SSR and pre-mount shape, so hydration swaps a skeleton for a skeleton.
  const fallback = <Skeleton className="h-64 w-full" />;

  return (
    <div ref={containerRef} className={flowBlock}>
      {mounted ? (
        <Suspense fallback={fallback}>
          <MermaidInner props={props} />
        </Suspense>
      ) : (
        fallback
      )}
    </div>
  );
}
