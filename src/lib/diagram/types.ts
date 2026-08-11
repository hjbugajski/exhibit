/*
 * The contract surface of the diagram core: geometry primitives, diagnostics, the IR and Scene
 * shapes, and the plug-in interfaces (text measurer, shapes, family). Contracts live here rather
 * than beside their implementations so the module graph stays strictly acyclic — implementation
 * modules import types downward and nothing imports back up.
 *
 * Scene carries geometry and author intent only. No color-valued string ever appears in it; paint
 * comes from `diagram.css` keyed on `data-part` / `data-class`.
 */

import type { DiagramDensity, DiagramMetrics } from './metrics.ts';

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Axis-aligned box with a top-left origin. Scene nodes use a center instead; clusters use this. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Source range. `offset`/`length` index the raw source; `line`/`column` are 1-based. */
export interface Span {
  offset: number;
  length: number;
  line: number;
  column: number;
}

export type Severity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  severity: Severity;
  /** Stable machine code, e.g. 'unknown-statement', 'unsupported-construct'. */
  code: string;
  message: string;
  span?: Span;
  /** Token kinds the parser could have accepted here; powers "expected --> or ---" hints. */
  expected?: readonly string[];
}

/** Hard caps. Exceeding one is an `error` diagnostic plus a null scene, never a partial draw. */
export interface DiagramLimits {
  chars: number;
  nodes: number;
  edges: number;
  clusterDepth: number;
  /**
   * Nodes the layered engine may work with *after* long edges are broken into one virtual node per
   * rank they cross. Declared size does not bound runtime — a few hundred densely connected nodes
   * normalize into tens of thousands — and ordering and positioning are superlinear in this number,
   * so this is the cap that keeps a build off the multi-second cliff.
   */
  layoutNodes: number;
}

export type EdgeShape = 'ortho' | 'smooth' | 'straight';
export type ClusterMode = 'recursive' | 'ignore';

// ---------------------------------------------------------------------------- text measurement

export interface TextStyle {
  fontSize: number;
  /** Only used to key measurer caches and to build the canvas font shorthand. */
  fontFamily: string;
  fontWeight: number;
  letterSpacing: number;
  /** Unitless multiple of `fontSize`, as in CSS. */
  lineHeight: number;
}

export interface TextMeasurer {
  /** Stable id — part of the layout memo key, and asserted in snapshot tests. */
  readonly id: string;
  measure(text: string, style: TextStyle): Size;
}

/**
 * A wrapped, measured label. `baseline` is the distance from the box top to the first line's
 * alphabetic baseline; each further line adds `lineHeight`.
 */
export interface LabelBox {
  lines: readonly string[];
  width: number;
  height: number;
  lineHeight: number;
  baseline: number;
}

// ------------------------------------------------------------------------------------- shapes

export interface ShapeDef {
  /** Outer box for a measured label; the shape owns its own padding. */
  size(label: Size, m: DiagramMetrics): Size;
  /** Outline `d`, origin-centred, so a node draws at its center with a translate. */
  outline(box: Size, m: DiagramMetrics): string;
  /** Boundary point toward a local-space direction. Defaults to the rectangle intersection. */
  anchor?(box: Size, toward: Point, m: DiagramMetrics): Point;
  /**
   * Where incident edges attach, when it is not simply where their ray meets the outline.
   * `spread` marks a connector bar: its long side lies on the cross axis whatever the direction,
   * and its edges are spread along it. `vertex` collapses every edge approaching a side onto that
   * side's axis point, which on a pointy shape is the only place an edge can meet it square — until
   * two arrowheads want it at once, which nothing can draw. See `core/graph/ports.ts`.
   */
  ports?: 'spread' | 'vertex';
  /**
   * How much of each side a port may use: the straight run of the horizontal (`width`) and vertical
   * (`height`) sides, and the radius of the arcs that round its ends away. A port slides along the
   * run and rides a little way onto an arc when its neighbours crowd it off the straight, so a side
   * shorter than the ports it carries still spreads them instead of stacking them on one point.
   * `corner: 0` is a hard stop rather than an arc — a fold, which no port may cross. A side with
   * neither run nor arc is a point: only a crowd may leave it, and only as far as it must. A shape
   * without this keeps the raw ray hit, clamped to its own extent. See `core/graph/ports.ts`.
   */
  sides?(box: Size, m: DiagramMetrics): { flat: Size; corner: number };
}

export type ShapeRegistry = Readonly<Record<string, ShapeDef>>;

// ----------------------------------------------------------------------------------------- IR

/**
 * Base of every family IR. `kind` is the family id, which is what `layoutDiagram` dispatches on.
 */
export interface DiagramIR {
  readonly kind: string;
  readonly source: string;
  accTitle?: string;
  accDescr?: string;
}

// -------------------------------------------------------------------------------------- scene

export type ArrowKind = 'none' | 'arrow' | 'circle' | 'cross';
/** `invisible` is flowchart's `~~~`: the edge constrains layout and is never drawn. */
export type LineKind = 'solid' | 'dotted' | 'thick' | 'invisible';

interface SceneBase {
  readonly kind: string;
  /** Family id that produced this scene — drives `data-diagram` and the family view lookup. */
  family: string;
  size: Size;
  /** Name for the generated summary — a visible title if the source declared one, else `accTitle`. */
  title?: string;
  /** The visible title the source declared, if any; renderers draw this one and never `title`. */
  caption?: string;
  description?: string;
}

export interface SceneNode {
  id: string;
  /** Box center. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Shape registry key; emitted as `data-shape`. */
  shape: string;
  /** Outline `d`, origin-centred. */
  outline: string;
  label: LabelBox;
  /**
   * What to call this node in the text alternative when it draws no label. State markers are the
   * case: `[*]` inside a composite means the composite, and a choice or fork keeps its declared
   * name even though nothing is written on it.
   */
  name?: string;
  /** `classDef` / `:::` names, emitted as `data-class`. Never paint. */
  classes: readonly string[];
  span?: Span;
}

/** A measured label placed at a point — edge labels and cluster titles. */
export interface PlacedLabel {
  box: LabelBox;
  /** Label box center. */
  x: number;
  y: number;
}

export interface SceneEdge {
  id: string;
  source: string;
  target: string;
  /** Route polyline after shape clipping and arrow trimming. */
  points: readonly Point[];
  /** Path `d` for the stroke — two subpaths when the label box was knocked out of it. */
  d: string;
  line: LineKind;
  /** Cap at the target end, plus its geometry when it is not 'none'. */
  arrow: ArrowKind;
  arrowD?: string;
  /** Cap at the source end (`<-->`, `o--o`, `x--x`). */
  startArrow: ArrowKind;
  startArrowD?: string;
  /** True when cycle breaking reversed this edge; points/arrows are already back in author order. */
  reversed: boolean;
  label?: PlacedLabel;
  /**
   * The stroke could not be split around the label — too short, or the split would have taken an
   * end of it — so the label needs its background painted to stay legible.
   */
  labelPlate?: boolean;
  classes: readonly string[];
  span?: Span;
}

export interface SceneCluster {
  id: string;
  box: Rect;
  title?: PlacedLabel;
  /** Nested clusters, outermost first at each level. */
  children: readonly SceneCluster[];
  depth: number;
  classes: readonly string[];
  span?: Span;
}

/** Flowchart and state both render as this. The family id distinguishes them. */
export interface GraphScene extends SceneBase {
  kind: 'graph';
  nodes: readonly SceneNode[];
  edges: readonly SceneEdge[];
  clusters: readonly SceneCluster[];
}

export interface SceneSlice {
  id: string;
  label: string;
  value: number;
  /** Share of the total, 0–1. */
  fraction: number;
  startAngle: number;
  endAngle: number;
  d: string;
  /** 0-based index into the series custom properties (`--diagram-series-N`). */
  swatchIndex: number;
  /** Centroid label, present only when the measured text fits inside the slice. */
  labelBox?: LabelBox;
  labelPoint?: Point;
}

export interface SceneLegendItem {
  id: string;
  label: string;
  value: number;
  fraction: number;
  swatchIndex: number;
}

export interface PieScene extends SceneBase {
  kind: 'pie';
  center: Point;
  radius: number;
  slices: readonly SceneSlice[];
  legend: readonly SceneLegendItem[];
  /** `pie showData` — the legend prints raw values as well as shares unless the consumer says not to. */
  showData: boolean;
}

// ----------------------------------------------------------------------------------- sequence

/**
 * Sequence message head. Mermaid's `->` draws no head at all, `->>` a filled arrow, `-x` a cross and
 * `-)` the open half arrow that means "async".
 */
export type MessageArrow = 'none' | 'arrow' | 'cross' | 'async';

export type FrameKind = 'loop' | 'alt' | 'opt' | 'par' | 'critical' | 'break';

export interface SceneParticipant {
  id: string;
  /** Lifeline x — every message on this participant is measured from here. */
  x: number;
  /** Header box at the top. */
  box: Rect;
  /** The header repeated at the bottom, so a long diagram stays readable at its foot. */
  footer: Rect;
  label: LabelBox;
  /** `actor` rather than `participant`; drawn differently, laid out identically. */
  actor: boolean;
  /** Lifeline extent: header bottom to footer top. */
  lifeline: { y1: number; y2: number };
  span?: Span;
}

export interface SceneMessage {
  id: string;
  source: string;
  target: string;
  /** Two points for a straight message, four for a self-message lobe. */
  points: readonly Point[];
  d: string;
  line: LineKind;
  arrow: MessageArrow;
  arrowD?: string;
  /** The target sits left of the source, so the arrow runs right to left. */
  reversed: boolean;
  /** Source and target are the same participant: a lobe to the right of the lifeline. */
  self: boolean;
  label?: PlacedLabel;
  span?: Span;
}

export interface SceneActivation {
  id: string;
  participant: string;
  box: Rect;
  /** Nesting level on that participant; each level steps the bar half a width to the right. */
  depth: number;
}

export interface SceneNote {
  id: string;
  box: Rect;
  label: PlacedLabel;
  placement: 'left' | 'right' | 'over';
  targets: readonly string[];
  span?: Span;
}

/** An `else` / `and` / `option` divider inside a frame, with the label that follows it. */
export interface SceneFrameSection {
  y: number;
  label?: PlacedLabel;
}

export interface SceneFrame {
  id: string;
  kind: FrameKind;
  box: Rect;
  /** The kind word, drawn inside the corner tab. */
  title: PlacedLabel;
  /** Outline behind the title. */
  tab: Rect;
  /** The condition text beside the tab. */
  label?: PlacedLabel;
  sections: readonly SceneFrameSection[];
  depth: number;
  span?: Span;
}

export interface SequenceScene extends SceneBase {
  kind: 'sequence';
  participants: readonly SceneParticipant[];
  messages: readonly SceneMessage[];
  activations: readonly SceneActivation[];
  notes: readonly SceneNote[];
  frames: readonly SceneFrame[];
}

export type Scene = GraphScene | PieScene | SequenceScene;

// ------------------------------------------------------------------------------------ families

export interface ParseContext {
  /** Diagnostics sink for the whole parse; the family returns `report.diagnostics`. */
  report: DiagnosticSink;
  limits: DiagramLimits;
}

export interface DiagnosticSink {
  readonly diagnostics: readonly Diagnostic[];
  readonly count: number;
  error(code: string, message: string, span?: Span, expected?: readonly string[]): void;
  warn(code: string, message: string, span?: Span, expected?: readonly string[]): void;
  info(code: string, message: string, span?: Span, expected?: readonly string[]): void;
}

export interface ParseResult<T extends DiagramIR = DiagramIR> {
  /** Null only when no header matched or every statement failed. */
  ir: T | null;
  diagnostics: readonly Diagnostic[];
}

/** Fully resolved layout inputs — `buildDiagram` fills every field before a family sees it. */
export interface LayoutOptions {
  measurer: TextMeasurer;
  metrics: DiagramMetrics;
  shapes: ShapeRegistry;
  edgeShape: EdgeShape;
  clusters: ClusterMode;
  orderSweeps: number;
  limits: DiagramLimits;
}

export interface LayoutResult<S extends Scene = Scene> {
  /** Null is the fatal signal: the caller renders the source fallback. */
  scene: S | null;
  diagnostics: readonly Diagnostic[];
}

export interface DiagramFamily<IR extends DiagramIR = DiagramIR, S extends Scene = Scene> {
  id: string;
  /** Receives the first logical line of the source, comments already stripped. */
  detect(header: string): boolean;
  parse(source: string, ctx: ParseContext): ParseResult<IR>;
  layout(ir: IR, options: LayoutOptions): LayoutResult<S>;
}

export interface ParseOptions {
  families?: readonly DiagramFamily[];
  limits?: Partial<DiagramLimits>;
}

export interface BuildOptions {
  measurer: TextMeasurer;
  /** Density preset applied under `metrics`; `metrics` always wins on a shared field. */
  density?: DiagramDensity;
  metrics?: Partial<DiagramMetrics>;
  shapes?: ShapeRegistry;
  families?: readonly DiagramFamily[];
  edgeShape?: EdgeShape;
  clusters?: ClusterMode;
  orderSweeps?: number;
  limits?: Partial<DiagramLimits>;
}

export interface BuildResult {
  scene: Scene | null;
  diagnostics: readonly Diagnostic[];
  family: string | null;
}
