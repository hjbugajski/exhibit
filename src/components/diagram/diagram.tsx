/*
 * The `Diagram` namespace. `Root` owns the pipeline and the context; every other part is a thin,
 * overridable renderer.
 *
 * Typography flows outward (C14): the resolved `DiagramMetrics` — the same numbers layout measured
 * with — are written on the figure as `--diagram-font-*` custom properties, and `diagram.css`
 * consumes them. Nothing reads type back off the DOM, so the server and the client compute the same
 * geometry. In dev a rendered label is compared against the metric once and logs if they diverge.
 *
 * Accessibility is static (C31): `role="img"` named by the generated summary, `aria-describedby`
 * pointing at the sr-only structure beside the drawing — the hidden table that accompanies
 * `catalog/chart`, in list form. The summary is the name and the list is the description, so
 * nothing is announced twice.
 * `<title>` is deliberately not used inside the SVG — React 19 exempts the SVG namespace from
 * metadata hoisting (verified against the installed react-dom, both fizz and fiber), but an HTML
 * element outside the SVG is the more robust name anyway and needs no such guarantee.
 *
 * `Root` publishes two contexts, not one: a stable half every part of the drawing subscribes to and
 * a volatile half only the composition parts read. `DiagramBoundary` owns the volatile half so a
 * crash below it degrades to the same error-plus-null-scene shape a parser failure produces.
 */

import { useEffect, useId, useMemo, useRef } from 'react';
import type { CSSProperties, ComponentProps, RefObject } from 'react';

import { useRender } from '@base-ui/react/use-render';

import { round2 } from '@/lib/diagram/core/geometry/path';
import { interMetrics } from '@/lib/diagram/core/text/font-metrics-inter';
import { metricsMeasurer } from '@/lib/diagram/core/text/measurers';
import type { DiagramMetrics } from '@/lib/diagram/metrics';
import type { Diagnostic, PieScene, TextMeasurer } from '@/lib/diagram/types';
import { cn } from '@/lib/utils';

import { useOptionalDiagramCanvas } from './canvas-context';
import { Canvas, CanvasControls } from './canvas-parts';
import { DiagramBoundary } from './diagram-boundary';
import type {
  DiagramClassNames,
  DiagramComponents,
  DiagramConfigValue,
  DiagramFit,
  DiagramSceneValue,
} from './diagram-context';
import { DiagramConfigProvider, useDiagramConfig, useDiagramScene } from './diagram-context';
import type { DiagramFamilyView } from './family-views';
import { resolveFamilyView } from './family-views';
import type { UseDiagramOptions, UseDiagramResult } from './use-diagram';
import { useDiagram, useStableValue } from './use-diagram';

const NO_CLASSNAMES: DiagramClassNames = {};
const NO_COMPONENTS: DiagramComponents = {};

/** Divergence between the measured metric and the rendered type before dev complains. */
const TYPE_TOLERANCE = 0.05;

function typographyStyle(
  metrics: DiagramMetrics,
  sceneWidth: number | null,
  maxHeight?: string | number,
): CSSProperties {
  const style: Record<string, string> = {
    '--diagram-font-size': `${metrics.fontSize}px`,
    '--diagram-font-family': metrics.fontFamily,
    '--diagram-font-weight': String(metrics.fontWeight),
    '--diagram-line-height': String(metrics.lineHeight),
    '--diagram-letter-spacing': `${metrics.letterSpacing}px`,
    '--diagram-edge-font-size': `${metrics.edgeLabelFontSize}px`,
    '--diagram-cluster-label-font-size': `${metrics.clusterTitleFontSize}px`,
    '--diagram-cluster-label-letter-spacing': `${metrics.clusterTitleLetterSpacing}px`,
    '--diagram-stroke-width': `${metrics.strokeWidth}px`,
  };

  // `fit="scale"` shrinks and never grows: the drawing's own width is its ceiling, so 13px type
  // stays 13px in a wide column instead of being blown up with the viewBox.
  if (sceneWidth !== null) {
    style['--diagram-scene-inline-size'] = `${round2(sceneWidth)}px`;
  }

  if (maxHeight !== undefined) {
    style['--diagram-max-block-size'] =
      typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight;
  }

  return style as CSSProperties;
}

/** Each measured type role, and the selector that finds an element drawn at it. */
const TYPE_ROLES: readonly [role: string, selector: string, size: keyof DiagramMetrics][] = [
  ['node labels', '[data-part="node-label"], [data-part="slice-label"]', 'fontSize'],
  [
    'edge labels',
    '[data-part="edge-label-text"], [data-part="message-label-text"]',
    'edgeLabelFontSize',
  ],
  ['cluster titles', '[data-part="cluster-label-text"]', 'clusterTitleFontSize'],
];

/**
 * Layout measured each role at its own size; if CSS renders one of them at another size, every box
 * in that role is the wrong width. Only checkable once the shipped stylesheet is in effect, so the
 * computed family has to name the font the metrics asked for before the comparison means anything.
 *
 * The size checks compare the DOM against the metrics. The two before them compare the metrics
 * against the *measurer*, which is the failure CSS cannot cause and the DOM cannot reveal: the
 * default measurer is one advance table for one face at one weight, and it reads neither
 * `fontFamily` nor `fontWeight`. Ask for `fontWeight: 600` and the browser will faithfully draw
 * bold glyphs in boxes that were measured for regular, with every element on the page agreeing.
 * Only the shipped default is checked that way: a caller who supplied a measurer, or the post-load
 * refinement, has already answered for the face being drawn.
 */
function useTypeAssertion(
  target: RefObject<HTMLElement | null>,
  metrics: DiagramMetrics,
  measurer: TextMeasurer,
) {
  const warned = useRef(false);

  useEffect(() => {
    if (!import.meta.env.DEV || warned.current || typeof window === 'undefined') {
      return;
    }

    const expectedFamily = metrics.fontFamily.split(',')[0]?.trim().replaceAll(/['"]/g, '') ?? '';

    if (!expectedFamily) {
      return;
    }

    if (
      measurer === metricsMeasurer &&
      (metrics.fontWeight !== interMetrics.weight || expectedFamily !== interMetrics.family)
    ) {
      warned.current = true;
      console.warn(
        `[diagram] metrics ask for ${expectedFamily} ${metrics.fontWeight}, but the default measurer only knows ${interMetrics.family} ${interMetrics.weight} — every label was measured with that table and its boxes will not fit. Pass a \`measurer\` built for the face you are rendering.`,
      );

      return;
    }

    for (const [role, selector, key] of TYPE_ROLES) {
      const label = target.current?.querySelector(selector);

      if (!label) {
        continue;
      }

      const computed = window.getComputedStyle(label);
      const rendered = Number.parseFloat(computed.fontSize);
      const expected = metrics[key] as number;

      if (!computed.fontFamily.includes(expectedFamily) || !(rendered > 0)) {
        continue;
      }

      if (Number.parseFloat(computed.fontWeight) !== metrics.fontWeight) {
        warned.current = true;
        console.warn(
          `[diagram] ${role} render at weight ${computed.fontWeight} but layout measured ${metrics.fontWeight}. Set diagram type through the \`metrics\` prop, not with CSS on diagram parts.`,
        );

        return;
      }

      if (Math.abs(rendered - expected) / expected > TYPE_TOLERANCE) {
        warned.current = true;
        console.warn(
          `[diagram] ${role} render at ${rendered}px but layout measured ${expected}px. Set diagram type through the \`metrics\` prop, not with CSS on diagram parts.`,
        );

        return;
      }
    }
  }, [target, metrics, measurer]);
}

// --------------------------------------------------------------------------------------- root

export interface DiagramRootProps
  extends Omit<useRender.ComponentProps<'figure'>, 'title'>, UseDiagramOptions {
  /**
   * Mermaid-syntax source. With `diagram` supplied this is not parsed — it is the text a binding
   * falls back to when nothing could be drawn.
   */
  source?: string;
  /**
   * A hoisted `useDiagram(...)` result. Pass it when the diagnostics or the scene are needed beside
   * the figure; everything the parts read comes from this one object, so there are no half-states.
   * Without it `Root` runs the hook itself over `source`. The pipeline options below (`metrics`,
   * `shapes`, `limits`, …) belong to whichever call actually runs — pass them to `useDiagram` when
   * hoisting it, because `Root` will not re-run the pipeline to apply them.
   */
  diagram?: UseDiagramResult;
  /** Accessible name for the drawing; defaults to the generated summary. */
  label?: string;
  fit?: DiagramFit;
  /** Cap for `fit="scale"`; a number is pixels. Defaults to the stylesheet's 40rem. */
  maxHeight?: string | number;
  classNames?: DiagramClassNames;
  /**
   * Part overrides. Hold this object at module scope: a fresh literal is a new identity every
   * render, and it is the key every part in the drawing subscribes to.
   */
  components?: DiagramComponents;
  /** Called whenever the diagnostics change; the identity of the callback does not matter. */
  onDiagnostics?: (diagnostics: readonly Diagnostic[]) => void;
}

function Root({
  source = '',
  diagram,
  label,
  fit = 'scale',
  maxHeight,
  classNames: classNameOverrides = NO_CLASSNAMES,
  components = NO_COMPONENTS,
  onDiagnostics,
  metrics: metricsOverrides,
  density = 'comfortable',
  shapes,
  families,
  edgeShape,
  clusters,
  orderSweeps,
  limits,
  measurer,
  className,
  style,
  render,
  children,
  ref: forwardedRef,
  ...props
}: DiagramRootProps) {
  const id = useId();
  const figure = useRef<HTMLElement>(null);
  const classNames = useStableValue(classNameOverrides);
  // Hooks cannot be conditional, so the controlled path runs the pipeline over an empty source —
  // which detects no family and returns immediately — and then discards the result.
  const own = useDiagram(diagram ? '' : source, {
    metrics: metricsOverrides,
    density,
    shapes,
    families,
    edgeShape,
    clusters,
    orderSweeps,
    limits,
    measurer,
  });
  const { scene, diagnostics, family, metrics, description, measurer: inUse } = diagram ?? own;

  useTypeAssertion(figure, metrics, inUse);

  // Latched: an inline arrow is a new function every render, and keying the effect on it would
  // re-invoke the consumer with diagnostics it has already seen on every parent render.
  const notify = useRef(onDiagnostics);

  useEffect(() => {
    notify.current = onDiagnostics;
  }, [onDiagnostics]);

  useEffect(() => {
    notify.current?.(diagnostics);
  }, [diagnostics]);

  const config = useMemo<DiagramConfigValue>(
    () => ({ metrics, components, classNames, id, fit }),
    [metrics, components, classNames, id, fit],
  );
  const drawn = useMemo<DiagramSceneValue>(
    () => ({
      source,
      scene,
      diagnostics,
      family,
      description,
      accessibleName: label ?? description?.summary ?? '',
    }),
    [source, scene, diagnostics, family, description, label],
  );

  return useRender({
    defaultTagName: 'figure',
    render,
    ref: forwardedRef ? [figure, forwardedRef] : figure,
    props: {
      'data-slot': 'diagram',
      'data-diagram': family ?? undefined,
      'data-density': density,
      'data-fit': fit,
      className: cn(classNames.root, className),
      style: { ...typographyStyle(metrics, scene?.size.width ?? null, maxHeight), ...style },
      children: (
        <DiagramConfigProvider value={config}>
          <DiagramBoundary value={drawn}>{children}</DiagramBoundary>
        </DiagramConfigProvider>
      ),
      ...props,
    },
  });
}

// ---------------------------------------------------------------------------------------- svg

export interface DiagramSvgProps extends ComponentProps<'svg'> {
  /** Family id -> view override; falls back to the builtin map, then to the scene kind. */
  views?: Readonly<Record<string, DiagramFamilyView>>;
}

/**
 * Childless renders the detected family's view. Passing children replaces it wholesale, which is
 * how a consumer draws parts in a different order or adds a decoration layer.
 */
function Svg({ views, className, children, ...props }: DiagramSvgProps) {
  const { classNames, id, fit } = useDiagramConfig();
  const { scene, accessibleName, description } = useDiagramScene();
  // Inside a canvas the drawing is always natural size — the canvas transform, not `fit`, decides
  // what is on screen.
  const canvas = useOptionalDiagramCanvas();

  if (!scene) {
    return null;
  }

  const View = resolveFamilyView(scene, views);
  const width = round2(scene.size.width);
  const height = round2(scene.size.height);
  const natural = canvas !== null || fit === 'scroll';

  return (
    <svg
      data-part="svg"
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="img"
      aria-label={accessibleName || undefined}
      aria-describedby={
        description && description.details.length > 0 ? `${id}-description` : undefined
      }
      viewBox={`0 0 ${width} ${height}`}
      {...(natural ? { width, height } : {})}
      className={cn(classNames.svg, className)}
      {...props}
    >
      {children ?? <View scene={scene} />}
    </svg>
  );
}

// -------------------------------------------------------------------------------------- title

export type DiagramTitleProps = useRender.ComponentProps<'figcaption'>;

function Title({ className, render, ...props }: DiagramTitleProps) {
  const { classNames, id } = useDiagramConfig();

  return useRender({
    defaultTagName: 'figcaption',
    render,
    props: {
      id: `${id}-title`,
      'data-part': 'title',
      className: cn(classNames.title, className),
      ...props,
    },
  });
}

// -------------------------------------------------------------------------------- description

export type DiagramDescriptionProps = useRender.ComponentProps<'div'>;

/**
 * The text alternative: the ordered structure lines from `describeScene`, referenced by the SVG's
 * `aria-describedby`. Visually hidden but in the accessibility tree and reachable by find-in-page,
 * exactly like the table beside `catalog/chart`. The summary sentence is deliberately absent — it
 * is already the drawing's accessible name.
 *
 * The list is both the `aria-describedby` target and a node in the normal reading order, so a
 * browse-mode user can meet it twice. That is deliberate and matches `chart-inner.tsx`: dropping
 * the reference would leave a focused `role="img"` with a name and no structure, and hiding the
 * list from the reading order would make it unreachable by find-in-page. `describeScene` caps the
 * list, so meeting it twice stays cheap.
 */
function Description({ className, render, children, ...props }: DiagramDescriptionProps) {
  const { classNames, id } = useDiagramConfig();
  const { description } = useDiagramScene();
  const details = description?.details ?? [];

  return useRender({
    enabled: children !== undefined || details.length > 0,
    defaultTagName: 'div',
    render,
    props: {
      id: `${id}-description`,
      'data-part': 'description',
      className: cn('sr-only', classNames.description, className),
      children: children ?? (
        <ul>
          {details.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      ),
      ...props,
    },
  });
}

// ------------------------------------------------------------------------------------- issues

export type DiagramIssuesProps = useRender.ComponentProps<'ul'>;

const SEVERITY_RANK: Readonly<Record<Diagnostic['severity'], number>> = {
  error: 0,
  warning: 1,
  info: 2,
};

/**
 * What stopped the drawing comes first, then source order — sorting on severity alone would shuffle
 * same-severity lines away from the statements that caused them. A diagnostic with no span sorts
 * last within its severity: it is about the diagram, not about a line.
 */
function ordered(diagnostics: readonly Diagnostic[]): readonly Diagnostic[] {
  return [...diagnostics].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      (a.span?.offset ?? Number.MAX_SAFE_INTEGER) - (b.span?.offset ?? Number.MAX_SAFE_INTEGER),
  );
}

/**
 * Renders nothing when the source was clean, so it is safe to leave in every composition. Severity
 * is carried by a marker as well as by colour (`diagram.css` keys `::before` off `data-severity`),
 * and the code is printed from `data-code` — so a consumer's own `<li>` markup stays viable.
 */
function Issues({ className, render, children, ...props }: DiagramIssuesProps) {
  const { classNames } = useDiagramConfig();
  const { diagnostics } = useDiagramScene();

  return useRender({
    enabled: diagnostics.length > 0,
    defaultTagName: 'ul',
    render,
    props: {
      'data-part': 'issues',
      className: cn(classNames.issues, className),
      children:
        children ??
        ordered(diagnostics).map((diagnostic, index) => (
          <li
            key={index}
            data-part="issue"
            data-severity={diagnostic.severity}
            data-code={diagnostic.code}
            className={classNames.issue}
          >
            {diagnostic.message}
          </li>
        )),
      ...props,
    },
  });
}

// ------------------------------------------------------------------------------------- legend

export interface DiagramLegendProps extends useRender.ComponentProps<'ul'> {
  /** Prints the raw slice value alongside the share. Defaults to the source's `pie showData`. */
  showValues?: boolean;
}

function percent(fraction: number): string {
  return `${Math.round(fraction * 1000) / 10}%`;
}

/**
 * Pie legends are HTML, not SVG: the swatch is a styled box and the text wraps and reflows like any
 * other prose, which is why `PieScene.legend` carries no geometry.
 */
function Legend({ showValues, className, render, children, ...props }: DiagramLegendProps) {
  const { classNames } = useDiagramConfig();
  const { scene } = useDiagramScene();
  const pie = scene?.kind === 'pie' ? (scene as PieScene) : null;
  const values = showValues ?? pie?.showData ?? false;

  return useRender({
    enabled: pie !== null && pie.legend.length > 0,
    defaultTagName: 'ul',
    render,
    props: {
      'data-part': 'legend',
      className: cn(classNames.legend, className),
      children:
        children ??
        pie?.legend.map((item) => (
          <li
            key={item.id}
            data-part="legend-item"
            data-id={item.id}
            data-series={item.swatchIndex}
            className={classNames.legendItem}
          >
            <span data-part="legend-swatch" data-series={item.swatchIndex} />
            <span data-part="legend-label">{item.label}</span>
            <span data-part="legend-value">
              {values ? `${item.value} (${percent(item.fraction)})` : percent(item.fraction)}
            </span>
          </li>
        )),
      ...props,
    },
  });
}

export const Diagram = { Root, Svg, Canvas, CanvasControls, Title, Description, Issues, Legend };
