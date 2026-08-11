/*
 * `source -> scene`, staged so the two expensive halves invalidate independently: parsing is keyed
 * on the source alone, layout on the IR, the resolved metrics and the measurer identity. Editing a
 * density preset therefore re-lays-out without re-parsing, and typing in a playground re-parses
 * without re-resolving metrics.
 *
 * Object-valued options (`metrics`, `limits`) are stabilised by value so an inline literal at the
 * call site does not invalidate a memo on every render; function-valued ones (`shapes`, `families`,
 * `measurer`) are keyed on identity, and their defaults are module constants.
 */

import { useMemo, useRef, useState } from 'react';

import { layoutDiagram, parseDiagram, resolveLayoutOptions } from '@/lib/diagram/build';
import { metricsMeasurer } from '@/lib/diagram/core/text/measurers';
import { describeScene } from '@/lib/diagram/describe';
import type { SceneDescription } from '@/lib/diagram/describe';
import { detectFamily } from '@/lib/diagram/detect';
import { builtinFamilies } from '@/lib/diagram/family';
import { resolveMetrics } from '@/lib/diagram/metrics';
import type { DiagramDensity, DiagramMetrics } from '@/lib/diagram/metrics';
import type {
  ClusterMode,
  Diagnostic,
  DiagramFamily,
  DiagramLimits,
  EdgeShape,
  LayoutOptions,
  Scene,
  ShapeRegistry,
  TextMeasurer,
} from '@/lib/diagram/types';

import { useRefinedMeasurer } from './use-text-measurer';

export interface UseDiagramOptions {
  metrics?: Partial<DiagramMetrics>;
  density?: DiagramDensity;
  shapes?: ShapeRegistry;
  families?: readonly DiagramFamily[];
  edgeShape?: EdgeShape;
  clusters?: ClusterMode;
  orderSweeps?: number;
  limits?: Partial<DiagramLimits>;
  /** Overrides measurer selection, and disables the post-font-load refinement. */
  measurer?: TextMeasurer;
}

export interface UseDiagramResult {
  scene: Scene | null;
  diagnostics: readonly Diagnostic[];
  family: string | null;
  metrics: DiagramMetrics;
  measurer: TextMeasurer;
  /** Generated text alternative, or null when nothing was drawn. */
  description: SceneDescription | null;
}

/**
 * Keeps one object identity for as long as its JSON serialization is unchanged, so a fresh literal
 * with the same contents does not invalidate the memos downstream of it. Only for plain,
 * JSON-serializable data — a `components` map holds functions and cannot be stabilised this way.
 */
export function useStableValue<T>(value: T): T {
  const key = JSON.stringify(value ?? null);
  const held = useRef<{ key: string; value: T }>({ key, value });

  if (held.current.key !== key) {
    held.current = { key, value };
  }

  return held.current.value;
}

export function useDiagram(source: string, options: UseDiagramOptions = {}): UseDiagramResult {
  const { density = 'comfortable', families = builtinFamilies } = options;

  const [refined, setRefined] = useState<TextMeasurer | null>(null);
  const measurer = options.measurer ?? refined ?? metricsMeasurer;
  const metricsOverrides = useStableValue(options.metrics);
  const limitOverrides = useStableValue(options.limits);
  const metrics = useMemo(
    () => resolveMetrics(metricsOverrides, density),
    [metricsOverrides, density],
  );

  const parsed = useMemo(
    () => parseDiagram(source, { families, limits: limitOverrides }),
    [source, families, limitOverrides],
  );

  // Field by field, never `{ ...options }`: a fresh options literal at the call site would be a new
  // dependency every render and there would be no staging left. The already-resolved `metrics` goes
  // back through the resolver, which is a no-op on a complete metrics object.
  const layoutOptions = useMemo<LayoutOptions>(
    () =>
      resolveLayoutOptions({
        measurer,
        metrics,
        shapes: options.shapes,
        edgeShape: options.edgeShape,
        clusters: options.clusters,
        orderSweeps: options.orderSweeps,
        limits: limitOverrides,
      }),
    [
      measurer,
      metrics,
      options.shapes,
      options.edgeShape,
      options.clusters,
      options.orderSweeps,
      limitOverrides,
    ],
  );

  const laid = useMemo(
    () => (parsed.ir ? layoutDiagram(parsed.ir, layoutOptions, families) : null),
    [parsed, layoutOptions, families],
  );

  const scene = laid?.scene ?? null;
  const diagnostics = useMemo(
    () => [...parsed.diagnostics, ...(laid?.diagnostics ?? [])],
    [parsed, laid],
  );
  const family = useMemo(() => detectFamily(source, families), [source, families]);
  const description = useMemo(() => (scene ? describeScene(scene) : null), [scene]);

  useRefinedMeasurer(
    scene,
    metrics,
    options.measurer === undefined && refined === null,
    setRefined,
  );

  return { scene, diagnostics, family, metrics, measurer, description };
}
