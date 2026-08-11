import { lazy, Suspense } from 'react';

import type { CatalogComponentProps } from '@/catalog/catalog';
import { HighlightedCode } from '@/components/blocks/highlighted-code';
import { flowBlock } from '@/components/catalog/flow';
import { HouseDiagram } from '@/components/diagram/house-diagram';
import { Skeleton } from '@/components/ui/skeleton';
import { detectFamily } from '@/lib/diagram/detect';
import { useNearViewport } from '@/lib/use-near-viewport';

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

/**
 * The stock renderer, for the families the house engine does not draw. It owns its own flow
 * wrapper because the house path gets one from `HouseDiagram` — one rhythm class per block either
 * way, never two nested.
 */
function StockMermaid({ props }: { props: Props }) {
  const { ref, mounted } = useNearViewport<HTMLDivElement>();

  // Also the SSR and pre-mount shape, so hydration swaps a skeleton for a skeleton.
  const fallback = <Skeleton className="h-64 w-full" />;

  return (
    <div ref={ref} className={flowBlock}>
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

/**
 * One block, two engines. The house engine draws the families it knows — flowchart, sequence,
 * state, pie — from the same mermaid source, and it draws them eagerly: detection is a read of the
 * header line, the layout is deterministic, and the result is house-themed SVG in the page rather
 * than a sandboxed frame, so there is no chunk to wait for and nothing to gate on the viewport.
 * Everything else still goes to mermaid.js on the terms it has always had.
 *
 * Detection is a claim on the header, not a promise about the body, so the fork is not one-way: a
 * source the house engine claims and then cannot draw — nested past a limit, too many edges to
 * route — goes to mermaid.js after all rather than degrading to source, because that is the
 * drawing the publisher got before this block had two engines.
 */
export function Mermaid({ props }: { props: Props }) {
  return detectFamily(props.code) ? (
    <HouseDiagram source={props.code} fallback={<StockMermaid props={props} />} />
  ) : (
    <StockMermaid props={props} />
  );
}
