/*
 * Every number layout is allowed to know. Sizes, gaps and typography only — a color here would
 * make a theme flip a re-layout, which is exactly what this library exists to avoid.
 */

export interface DiagramMetrics {
  fontSize: number;
  /** Unitless multiple of `fontSize`, as in CSS. */
  lineHeight: number;
  /**
   * Measurer cache key and canvas font shorthand; never rendered as an attribute. The default
   * measurer is an advance table for InterVariable at weight 400 — it cannot read this field, so
   * naming another family changes what the browser paints and nothing about what layout measured.
   * Pass a `measurer` that knows the face (or the post-font-load refinement) alongside it.
   */
  fontFamily: string;
  /**
   * One weight for every role, and the same caveat as `fontFamily`: the shipped table is a 400
   * table, so a heavier label is measured as if it were regular and every box it sits in comes out
   * short. `Diagram.Root` warns about both in development.
   */
  fontWeight: number;
  letterSpacing: number;
  /** Edge and sequence-message labels: a caption on a line, one step under a node label. */
  edgeLabelFontSize: number;
  /** Cluster titles: the smallest role, tracked out so it reads as a container name. */
  clusterTitleFontSize: number;
  /** Tracking for the cluster-title role only; measured here and mirrored into CSS. */
  clusterTitleLetterSpacing: number;
  /** Wrap width for labels before a node grows; a single longer word is never broken. */
  maxLabelWidth: number;

  nodePaddingX: number;
  nodePaddingY: number;
  minNodeWidth: number;
  minNodeHeight: number;
  /** Rect corner radius, and the elbow radius of `edgeShape: 'ortho'`. */
  cornerRadius: number;
  /**
   * How far back along the straights either side of a mid-air jog `edgeShape: 'ortho'` reaches to
   * bridge the two corners with one S-curve, and with it how lazy that curve is. A jog wider than
   * twice the reach it can find stays two rounded corners: at that width it is a dogleg between
   * lanes, not a wobble in a straight run, and an S would read as a diagonal.
   */
  jogReach: number;

  /** Cross-axis gap between two real nodes on a rank. */
  nodeSep: number;
  /** Gap between rank bands. */
  rankSep: number;
  /** Cross-axis gap involving a virtual (edge) node, and the parallel-edge offset step. */
  edgeSep: number;

  clusterPadding: number;
  clusterTitleHeight: number;

  /** Sequence: horizontal breathing room between two participant headers. */
  actorMargin: number;
  /** Sequence: smallest vertical step from one message to the next. */
  messageMinGap: number;
  /** Sequence: width of an activation bar. */
  activationWidth: number;

  arrowLength: number;
  arrowWidth: number;
  /** Diameter of the `--o` circle and the span of the `--x` cross; the solid head is unaffected. */
  arrowCapSize: number;
  /** Extent of the lobe a self-loop leaves on the node's trailing side. */
  selfLoopSize: number;
  /** Breathing room between an edge label and the geometry it sits on. */
  labelGap: number;
  /**
   * Keep-out around a line label's box: the rect a stroke is gapped for, and — inset by a stroke —
   * the plate its renderer paints. A whole stroke at least, so the plate still covers the box it is
   * there to knock strokes out of, and under `labelGap`, so a label placed beside an edge keeps out
   * of it rather than being cut for it.
   */
  labelPadding: number;

  /** Outer padding of the scene bounding box. */
  padding: number;
  /** Layout-visible stroke width; paint still comes from CSS. */
  strokeWidth: number;
}

export const defaultMetrics: DiagramMetrics = {
  fontSize: 13,
  lineHeight: 1.4,
  fontFamily: 'InterVariable, sans-serif',
  fontWeight: 400,
  letterSpacing: 0,
  edgeLabelFontSize: 12,
  clusterTitleFontSize: 11,
  clusterTitleLetterSpacing: 0.22,
  maxLabelWidth: 200,

  nodePaddingX: 14,
  nodePaddingY: 10,
  minNodeWidth: 36,
  minNodeHeight: 32,
  cornerRadius: 6,
  jogReach: 20,

  nodeSep: 40,
  rankSep: 48,
  edgeSep: 14,

  clusterPadding: 16,
  clusterTitleHeight: 24,

  actorMargin: 36,
  messageMinGap: 32,
  activationWidth: 10,

  arrowLength: 9,
  arrowWidth: 6,
  arrowCapSize: 8,
  selfLoopSize: 36,
  labelGap: 4,
  labelPadding: 2,

  padding: 8,
  strokeWidth: 1.5,
};

/**
 * Padding of the plate a line label paints: its keep-out, inset by a whole stroke. A gapped stroke
 * ends on the keep-out and its round cap reaches half a stroke back inside it, so a plate drawn on
 * the keep-out itself is painted over that cap; inset, it stays half a stroke clear of the ink.
 */
export function labelPlatePadding(m: DiagramMetrics): number {
  return Math.max(0, m.labelPadding - m.strokeWidth);
}

export type DiagramDensity = 'compact' | 'comfortable';

/** Density is a small overlay on `defaultMetrics`, not a second full table. */
export const densityPresets: Record<DiagramDensity, Partial<DiagramMetrics>> = {
  compact: {
    nodePaddingX: 10,
    nodePaddingY: 6,
    minNodeHeight: 28,
    nodeSep: 28,
    rankSep: 34,
    edgeSep: 10,
    clusterPadding: 12,
    maxLabelWidth: 160,
    actorMargin: 26,
    messageMinGap: 26,
  },
  comfortable: {},
};

export function resolveMetrics(
  overrides?: Partial<DiagramMetrics>,
  density: DiagramDensity = 'comfortable',
): DiagramMetrics {
  return { ...defaultMetrics, ...densityPresets[density], ...overrides };
}
