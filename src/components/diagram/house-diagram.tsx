/*
 * The repo binding, and the only file in `src/components/diagram` allowed to import app code —
 * `extraction-seam.unit.test.ts` holds the rest of the folder to it. Everything house-specific
 * lives here: flow rhythm, caption tone, the failure UI.
 *
 * A diagram that cannot be drawn degrades the same way an invalid exhibit fence does: the source
 * stays on screen with one line saying why, because that feedback is what gets the next version
 * right. It is the last resort, though, not the first: a caller with another engine behind it
 * passes `fallback`, and a source this engine claimed from its header but could not draw is handed
 * back rather than dumped — the drawing a second engine can still produce beats a precise reason
 * for the one that failed. Paint still comes entirely from `@layer diagram.house` in styles.css.
 */

import { Suspense, lazy, type ReactNode } from 'react';

import { flowBlock } from '@/components/catalog/flow';
import type { DiagramDensity } from '@/lib/diagram/metrics';
import { cn } from '@/lib/utils';

import { Diagram } from './diagram';
import type { DiagramClassNames, DiagramFit } from './diagram-context';
import { useDiagramScene } from './diagram-context';
import { useDiagram } from './use-diagram';

const houseClassNames: DiagramClassNames = {
  title: 'text-foreground-muted mt-3 text-sm',
  legend: 'mt-3',
  issues: 'mt-2 text-xs',
};

const fallbackClassName = 'bg-surface-muted overflow-x-auto rounded-lg p-4 text-sm';

/**
 * Split out because the tokenizer and its twelve language definitions are ~5.5KB gzip that only a
 * broken diagram ever needs. Every drawing that works would otherwise pay for it.
 */
const HighlightedCode = lazy(async () => ({
  default: (await import('@/components/blocks/highlighted-code')).HighlightedCode,
}));

/**
 * Keeps the source on screen when nothing could be drawn. The reason is not repeated here —
 * `Diagram.Issues` below is the one place a diagnostic is worded, and it paints its own severity.
 *
 * The suspense fallback is the same `<pre>` without token colors, so the source is on screen from
 * the first frame and the chunk only ever adds color to text that is already there.
 */
function Fallback() {
  const { scene, source } = useDiagramScene();

  if (scene) {
    return null;
  }

  return (
    <Suspense fallback={<pre className={fallbackClassName}>{source}</pre>}>
      <HighlightedCode className={fallbackClassName} code={source} />
    </Suspense>
  );
}

export interface HouseDiagramProps {
  /** Mermaid-syntax source. */
  source: string;
  /**
   * Visible caption, overriding a `title` line in the source; the accessible name stays the
   * generated summary either way.
   */
  title?: string;
  density?: DiagramDensity;
  fit?: DiagramFit;
  className?: string;
  /** Rendered bare in place of the whole figure when this engine drew nothing. */
  fallback?: ReactNode;
}

/**
 * The hook is hoisted so the binding can read the engine's own verdict on the drawing before
 * deciding how to present it: a scene that is 400 units long and 30 tall is legible scrolled and a
 * hairline scaled, and only the engine knows which one it produced. An explicit `fit` always wins —
 * this picks a default, it does not override a caller.
 */
export function HouseDiagram({
  source,
  title,
  density,
  fit,
  className,
  fallback,
}: HouseDiagramProps) {
  const diagram = useDiagram(source, { density });
  const unreadable = diagram.diagnostics.some((diagnostic) => diagnostic.code === 'extreme-extent');
  // A `title` line in the source is a caption its author asked to see; the prop still wins.
  const caption = title ?? diagram.scene?.caption;

  // Bare, and above `Diagram.Root`: the caller's engine brings its own flow rhythm wrapper, and two
  // nested ones would double the block's margins.
  if (fallback && !diagram.scene) {
    return fallback;
  }

  return (
    <Diagram.Root
      diagram={diagram}
      source={source}
      density={density}
      fit={fit ?? (unreadable ? 'scroll' : 'scale')}
      className={cn(flowBlock, className)}
      classNames={houseClassNames}
    >
      <Diagram.Description />
      <Diagram.Svg />
      <Diagram.Legend />
      <Fallback />
      {caption ? <Diagram.Title>{caption}</Diagram.Title> : null}
      <Diagram.Issues />
    </Diagram.Root>
  );
}
