/*
 * The layered engine: one implementation, every graph family.
 *
 * Phases run in order — direction normalization, sizing, cycle breaking, ranking, virtual-node
 * normalization, ordering, coordinate assignment, routing — with clusters handled by laying each
 * one out on its own and freezing it into a composite node in its parent. The engine only ever lays
 * out top-to-bottom: `LR`/`RL` swap width for height on the way in and x for y on the way out, `BT`
 * negates y and `RL` negates x. Getting that wrong is the classic cramped-LR bug.
 */

import type { DiagramMetrics } from '../../metrics.ts';
import type {
  GraphScene,
  LabelBox,
  LayoutOptions,
  LayoutResult,
  Point,
  Rect,
  SceneCluster,
  SceneEdge,
  SceneNode,
  ShapeDef,
  Size,
} from '../../types.ts';
import { Reporter } from '../diagnostics.ts';
import { reportExtent } from '../extent.ts';
import { arrowHead } from '../geometry/arrow.ts';
import { segmentHitsRect } from '../geometry/intersect.ts';
import { edgeD, polylineLength, splitAround } from '../geometry/path.ts';
import { resolveShape } from '../shapes/registry.ts';
import { textStyle, wrapLabel } from '../text/measure.ts';
import { breakCycles } from './acyclic.ts';
import type { ClusterTree, Levels } from './cluster.ts';
import {
  buildClusterTree,
  clusterIdOf,
  clusterPads,
  compositeId,
  isCompositeId,
  nodesAtLevel,
  resolveLevels,
  titleBand,
  titleRect,
} from './cluster.ts';
import { planElbow } from './elbow.ts';
import type { GutterBand, GutterObstacle, GutterPlan } from './gutter.ts';
import { gutterLanes, gutterPoints, planGutter, planTitleLane } from './gutter.ts';
import { separateLegs } from './legs.ts';
import type { Direction, GraphEdge, GraphModel, GraphNode, LayoutEdge } from './model.ts';
import { addEdge, addNode, createLayoutGraph } from './model.ts';
import { chainPoint, normalizeEdges } from './normalize.ts';
import { orderNodes } from './order.ts';
import type { EdgePorts, PortEdge, PortNode } from './ports.ts';
import { assignPorts, sideRun } from './ports.ts';
import { assignPositions } from './position.ts';
import { assignRanks } from './rank.ts';
import type { Axis, RouteEndpoint, RouteInput, RouteObstacle, RoutedEdge } from './route.ts';
import { borderPoint, loopSide, rankAxis, routeEdge, routeSelfLoop } from './route.ts';

// ------------------------------------------------------------------ direction transform

function toFinalPoint(direction: Direction, p: Point): Point {
  if (direction === 'TB') {
    return { x: p.x, y: p.y };
  }

  if (direction === 'BT') {
    return { x: p.x, y: -p.y };
  }

  return direction === 'LR' ? { x: p.y, y: p.x } : { x: -p.y, y: p.x };
}

/** The swap is its own inverse, so this converts sizes in both directions. */
function swapSize(direction: Direction, size: Size): Size {
  return direction === 'LR' || direction === 'RL'
    ? { width: size.height, height: size.width }
    : { width: size.width, height: size.height };
}

/**
 * A connector bar lies across the flow, so its long side follows the cross axis. Every other shape
 * is authored in final space and the double swap leaves it alone; this is the one exception.
 */
function alignToCross(direction: Direction, size: Size): Size {
  const long = Math.max(size.width, size.height);
  const short = Math.min(size.width, size.height);

  return direction === 'TB' || direction === 'BT'
    ? { width: long, height: short }
    : { width: short, height: long };
}

// ------------------------------------------------------------------------------ bounds

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function emptyBounds(): Bounds {
  return {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
}

function addPoint(bounds: Bounds, p: Point): void {
  bounds.minX = Math.min(bounds.minX, p.x);
  bounds.minY = Math.min(bounds.minY, p.y);
  bounds.maxX = Math.max(bounds.maxX, p.x);
  bounds.maxY = Math.max(bounds.maxY, p.y);
}

function addBox(bounds: Bounds, centre: Point, size: Size): void {
  addPoint(bounds, { x: centre.x - size.width / 2, y: centre.y - size.height / 2 });
  addPoint(bounds, { x: centre.x + size.width / 2, y: centre.y + size.height / 2 });
}

// -------------------------------------------------------------------------- placement

interface PlacedBox {
  centre: Point;
  size: Size;
}

interface PlacedEdge {
  /** Virtual-chain points in author order. */
  points: Point[];
  labelPoint: Point | null;
  reversed: boolean;
}

interface Placed {
  size: Size;
  nodes: Map<string, PlacedBox>;
  clusters: Map<string, PlacedBox>;
  edges: Map<string, PlacedEdge>;
}

function shiftPoint(p: Point, dx: number, dy: number): Point {
  return { x: p.x + dx, y: p.y + dy };
}

// ---------------------------------------------------------------------------- measure

interface Measured {
  label: LabelBox;
  shape: ShapeDef;
  /** Final space; the layout graph gets the swapped version. */
  size: Size;
}

export function layoutGraph(model: GraphModel, options: LayoutOptions): LayoutResult<GraphScene> {
  const report = new Reporter();
  const m = options.metrics;
  const style = textStyle(m);
  const edgeLabelStyle = textStyle(m, 'edgeLabel');
  const clusterTitleStyle = textStyle(m, 'clusterTitle');
  const direction = model.direction;

  if (model.nodes.length > options.limits.nodes) {
    report.error(
      'too-many-nodes',
      `Diagram has ${model.nodes.length} nodes; the limit is ${options.limits.nodes}.`,
    );

    return { scene: null, diagnostics: report.diagnostics };
  }

  if (model.edges.length > options.limits.edges) {
    report.error(
      'too-many-edges',
      `Diagram has ${model.edges.length} edges; the limit is ${options.limits.edges}.`,
    );

    return { scene: null, diagnostics: report.diagnostics };
  }

  let clamped = 0;
  let clampCeiling = 0;
  const onClamp = (ceiling: number) => {
    clamped += 1;
    clampCeiling = ceiling;
  };
  const useClusters = options.clusters === 'recursive';

  if (!useClusters && model.clusters.length > 0) {
    report.info('clusters-ignored', 'Cluster boxes are disabled; their members are laid out flat.');
  }

  const tree = buildClusterTree(useClusters ? model.clusters : []);

  if (tree.maxDepth > options.limits.clusterDepth) {
    report.error(
      'cluster-depth-exceeded',
      `Clusters nest ${tree.maxDepth} deep; the limit is ${options.limits.clusterDepth}.`,
    );

    return { scene: null, diagnostics: report.diagnostics };
  }

  // Duplicate ids would silently collapse into one node, so drop them loudly instead.
  const nodes: GraphNode[] = [];
  const byId = new Map<string, GraphNode>();

  for (const node of model.nodes) {
    if (byId.has(node.id)) {
      report.warn('duplicate-node', `Node '${node.id}' is declared twice.`, node.span);
      continue;
    }

    byId.set(node.id, node);
    nodes.push(node);
  }

  const edges: GraphEdge[] = [];

  for (const edge of model.edges) {
    const missing = byId.has(edge.source)
      ? byId.has(edge.target)
        ? null
        : edge.target
      : edge.source;

    if (missing === null) {
      edges.push(edge);
    } else {
      report.warn('unknown-endpoint', `Edge endpoint '${missing}' is not a node.`, edge.span);
    }
  }

  const resolved: GraphModel = { ...model, nodes, edges };
  const measured = new Map<string, Measured>();

  for (const node of nodes) {
    const label = wrapLabel(node.label, style, options.measurer, m.maxLabelWidth, onClamp);
    const shape = resolveShape(options.shapes, node.shape);
    const size = shape.size(label, m);

    measured.set(node.id, {
      label,
      shape,
      size: shape.ports === 'spread' ? alignToCross(direction, size) : size,
    });
  }

  const edgeLabels = new Map<string, LabelBox>();
  const layoutLabelSizes = new Map<string, Size>();

  for (const edge of edges) {
    if (!edge.label || edge.label.length === 0) {
      continue;
    }

    const label = wrapLabel(edge.label, edgeLabelStyle, options.measurer, m.maxLabelWidth, onClamp);

    if (label.lines.length === 0) {
      continue;
    }

    edgeLabels.set(edge.id, label);
    layoutLabelSizes.set(
      edge.id,
      swapSize(direction, { width: label.width, height: label.height }),
    );
  }

  const clusterTitles = new Map<string, LabelBox>();

  for (const cluster of tree.byId.values()) {
    const title = cluster.label
      ? wrapLabel(cluster.label, clusterTitleStyle, options.measurer, m.maxLabelWidth, onClamp)
      : null;

    if (title && title.lines.length > 0) {
      clusterTitles.set(cluster.id, title);
    }
  }

  const selfLoops = edges.filter((edge) => edge.source === edge.target);
  const loopPads = new Map<string, number>();

  /*
   * Clearance a looping node needs beside it: the lobes, and the column of labels stacked outside
   * the outermost of them (`stackLoopLabels`). A self-loop never enters the layered graph, so the
   * label virtual node that reserves a rank for every other label (`normalize.ts`) is not there to
   * reserve this one — without the label in the pad, the column is drawn over whatever the packing
   * put beside the node. Layout `+x` is the loop side in every direction, which is what `padRight`
   * holds, and `layoutLabelSizes` is already swapped into that space.
   */
  for (const edge of selfLoops) {
    const label = layoutLabelSizes.get(edge.id);
    const pad = m.selfLoopSize + (label ? m.labelGap + label.width : 0);

    loopPads.set(edge.source, Math.max(loopPads.get(edge.source) ?? 0, pad));
  }

  const levels = resolveLevels(resolved, tree);
  let placed: Placed;

  try {
    placed = layoutLevels(resolved, {
      m,
      options,
      tree,
      levels,
      measured,
      clusterTitles,
      layoutLabelSizes,
      loopPads,
      budget: { used: 0 },
    });
  } catch (cause) {
    if (!(cause instanceof GraphTooComplex)) {
      throw cause;
    }

    report.error(
      'graph-too-complex',
      `Routing these edges needs at least ${cause.count} layout nodes; the limit is ${options.limits.layoutNodes}. Shorten the edges that span many ranks, or raise \`limits.layoutNodes\`.`,
    );

    return { scene: null, diagnostics: report.diagnostics };
  }

  if (clamped > 0) {
    report.warn(
      'label-truncated',
      `${clamped} label line${clamped === 1 ? '' : 's'} ran past ${Math.round(clampCeiling)} units and ${clamped === 1 ? 'was' : 'were'} shortened. A single word is never broken, so an unspaced run of text grows its box until it is cut.`,
    );
  }

  const scene = assemble(resolved, placed, {
    m,
    options,
    tree,
    levels,
    measured,
    edgeLabels,
    clusterTitles,
  });

  reportExtent(report, scene.size);

  return { scene, diagnostics: report.diagnostics };
}

interface LayoutContext {
  m: DiagramMetrics;
  options: LayoutOptions;
  tree: ClusterTree;
  levels: Levels;
  measured: Map<string, Measured>;
  clusterTitles: Map<string, LabelBox>;
  layoutLabelSizes: Map<string, Size>;
  /** Extra clearance a node with self-loops needs on layout `+x`: lobes plus stacked labels. */
  loopPads: Map<string, number>;
  /** Running total of normalized nodes across every level; see `DiagramLimits.layoutNodes`. */
  budget: { used: number };
}

/**
 * The one control-flow escape in the engine. The budget can only be known partway down a recursive
 * layout, and unwinding a half-placed tree by hand would mean threading a failure through every
 * level; `layoutGraph` catches this immediately and turns it into the usual error-plus-null-scene.
 */
class GraphTooComplex extends Error {
  count: number;

  constructor(count: number) {
    super('graph-too-complex');
    this.count = count;
  }
}

/** Reserved band above a cluster's contents: the title, or nothing when it has none. */
function titleHeightOf(context: LayoutContext, clusterId: string): number {
  const title = context.clusterTitles.get(clusterId);

  return title ? titleBand(context.m, title) : 0;
}

function layoutLevels(model: GraphModel, context: LayoutContext): Placed {
  const { m, options, tree, levels, measured, layoutLabelSizes, loopPads } = context;
  const direction = model.direction;
  const byLevel = new Map<string | null, GraphEdge[]>();

  for (const edge of model.edges) {
    if (edge.source === edge.target) {
      continue;
    }

    const level = levels.edgeLevel.get(edge.id) ?? null;
    const bucket = byLevel.get(level);

    if (bucket) {
      bucket.push(edge);
    } else {
      byLevel.set(level, [edge]);
    }
  }

  const layoutLevel = (level: string | null): Placed => {
    const graph = createLayoutGraph();

    for (const node of nodesAtLevel(model, levels, level)) {
      const size = swapSize(direction, measured.get(node.id)?.size ?? { width: 0, height: 0 });

      addNode(graph, {
        id: node.id,
        kind: 'real',
        width: size.width,
        height: size.height,
        padRight: loopPads.get(node.id) ?? 0,
      });
    }

    const children = tree.childrenOf.get(level) ?? [];
    const nested = new Map<string, Placed>();

    for (const child of children) {
      const sub = layoutLevel(child.id);
      const pads = clusterPads(direction, m, titleHeightOf(context, child.id));
      const title = context.clusterTitles.get(child.id);
      const minimum = swapSize(direction, {
        width: title ? title.width + m.clusterPadding * 2 : 0,
        height: 0,
      });

      nested.set(child.id, sub);
      addNode(graph, {
        id: compositeId(child.id),
        kind: 'composite',
        width: Math.max(sub.size.width + pads.left + pads.right, minimum.width),
        height: Math.max(sub.size.height + pads.top + pads.bottom, minimum.height),
      });
    }

    const levelEdges = (byLevel.get(level) ?? []).filter((edge) => {
      const entity = levels.entityOf.get(edge.id);

      return entity !== undefined && entity.source !== entity.target;
    });
    const layoutEdges = new Map<string, LayoutEdge>();

    for (const edge of levelEdges) {
      const entity = levels.entityOf.get(edge.id) as { source: string; target: string };

      layoutEdges.set(
        edge.id,
        addEdge(graph, {
          id: edge.id,
          source: entity.source,
          target: entity.target,
          // A labelled edge must span two ranks so its label has a rank of its own to live on.
          minLen: layoutLabelSizes.has(edge.id) ? Math.max(2, edge.minLen) : edge.minLen,
          weight: edge.weight,
        }),
      );
    }

    breakCycles(graph);
    assignRanks(graph);

    const chains = normalizeEdges(graph, layoutLabelSizes, m);

    context.budget.used += graph.nodes.size;

    if (context.budget.used > options.limits.layoutNodes) {
      throw new GraphTooComplex(context.budget.used);
    }

    orderNodes(graph, options.orderSweeps);
    assignPositions(graph, m);

    const bounds = emptyBounds();

    for (const node of graph.nodes.values()) {
      addPoint(bounds, { x: node.x - node.width / 2, y: node.y - node.height / 2 });
      addPoint(bounds, {
        x: node.x + node.width / 2 + node.padRight,
        y: node.y + node.height / 2,
      });
    }

    const empty = !Number.isFinite(bounds.minX);
    const dx = empty ? 0 : -bounds.minX;
    const dy = empty ? 0 : -bounds.minY;
    const placed: Placed = {
      size: empty
        ? { width: 0, height: 0 }
        : { width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY },
      nodes: new Map(),
      clusters: new Map(),
      edges: new Map(),
    };

    for (const node of graph.nodes.values()) {
      if (node.kind === 'real') {
        placed.nodes.set(node.id, {
          centre: { x: node.x + dx, y: node.y + dy },
          size: { width: node.width, height: node.height },
        });
      }
    }

    for (const edge of levelEdges) {
      const chain = chains.get(edge.id);
      const reversed = layoutEdges.get(edge.id)?.reversed ?? false;
      const points = (chain?.nodes ?? []).map((id) => shiftPoint(chainPoint(graph, id), dx, dy));
      const labelNode = chain?.labelNode ?? null;

      placed.edges.set(edge.id, {
        points: reversed ? points.reverse() : points,
        labelPoint: labelNode ? shiftPoint(chainPoint(graph, labelNode), dx, dy) : null,
        reversed,
      });
    }

    for (const child of children) {
      const composite = graph.nodes.get(compositeId(child.id));
      const sub = nested.get(child.id);

      if (!composite || !sub) {
        continue;
      }

      const centre = { x: composite.x + dx, y: composite.y + dy };
      const size = { width: composite.width, height: composite.height };
      const pads = clusterPads(direction, m, titleHeightOf(context, child.id));
      const inner = {
        x: centre.x - size.width / 2 + pads.left,
        y: centre.y - size.height / 2 + pads.top,
      };
      // Extra room from a wide title is split evenly so the contents stay centred in the box.
      const slackX = size.width - pads.left - pads.right - sub.size.width;
      const slackY = size.height - pads.top - pads.bottom - sub.size.height;
      const ox = inner.x + slackX / 2;
      const oy = inner.y + slackY / 2;

      placed.clusters.set(child.id, { centre, size });

      for (const [id, box] of sub.nodes) {
        placed.nodes.set(id, { centre: shiftPoint(box.centre, ox, oy), size: box.size });
      }

      for (const [id, box] of sub.clusters) {
        placed.clusters.set(id, { centre: shiftPoint(box.centre, ox, oy), size: box.size });
      }

      for (const [id, edge] of sub.edges) {
        placed.edges.set(id, {
          points: edge.points.map((point) => shiftPoint(point, ox, oy)),
          labelPoint: edge.labelPoint ? shiftPoint(edge.labelPoint, ox, oy) : null,
          reversed: edge.reversed,
        });
      }
    }

    return placed;
  };

  return layoutLevel(null);
}

// ------------------------------------------------------------------------------ assemble

interface AssembleContext {
  m: DiagramMetrics;
  options: LayoutOptions;
  tree: ClusterTree;
  levels: Levels;
  measured: Map<string, Measured>;
  edgeLabels: Map<string, LabelBox>;
  clusterTitles: Map<string, LabelBox>;
}

interface Prepared {
  edge: GraphEdge;
  routed: RoutedEdge;
  labelCentre: Point | null;
}

/** An edge with its endpoints resolved, waiting on the gutter lanes its neighbours also want. */
interface Pending {
  edge: GraphEdge;
  source: RouteEndpoint;
  target: RouteEndpoint;
  selfLoop: boolean;
  interior?: Point[];
  sourceBorder?: Rect;
  targetBorder?: Rect;
  sourceBand?: GutterBand;
  targetBand?: GutterBand;
  sourcePlan?: GutterPlan | null;
  targetPlan?: GutterPlan | null;
  /** Border crossing moved clear of that cluster's title plate; see `planTitleLane`. */
  sourceCrossing?: Point;
  targetCrossing?: Point;
  /** Cross coordinate that end's port must take, so the whole run stays on the dodged lane. */
  sourceLane?: number;
  targetLane?: number;
  /** The route with no detour, kept when neither end needed one. */
  plain?: RoutedEdge;
  labelCentre?: Point | null;
}

/** A label's keep-out rect and the edge that owns it. */
interface LabelGap {
  owner: string;
  rect: Rect;
}

/**
 * Does the stroke enter the box, rather than graze the edge of it? A label placed off its own edge
 * keeps out of it by construction, and a lane packed against a label runs beside it on purpose;
 * half a stroke width of slack is what tells either apart from a stroke that really is drawn over
 * the glyphs. The cut itself still follows the full box, so a gap that is made keeps the whole of
 * the label's clearance.
 */
function crosses(points: readonly Point[], rect: Rect, m: DiagramMetrics): boolean {
  const inset = m.strokeWidth / 2;
  const inner: Rect = {
    x: rect.x + inset,
    y: rect.y + inset,
    width: rect.width - inset * 2,
    height: rect.height - inset * 2,
  };

  return points.some((point, i) => i > 0 && segmentHitsRect(points[i - 1] as Point, point, inner));
}

function same(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
}

/**
 * The runs a stroke is left in once a label gap is cut out of it, or null when the cut is not worth
 * making: it would take an end of the edge — and with it the arrowhead pinned there — or leave a
 * stub shorter than an arrowhead.
 */
function cutAround(runs: readonly Point[][], gap: Rect, m: DiagramMetrics): Point[][] | null {
  const out = runs.flatMap((run) => (crosses(run, gap, m) ? splitAround(run, gap) : [run]));
  const ends = [runs[0]?.[0], runs.at(-1)?.at(-1)];
  const kept = [out[0]?.[0], out.at(-1)?.at(-1)];

  if (ends.some((end, i) => !end || !kept[i] || !same(end, kept[i] as Point))) {
    return null;
  }

  return out.some((run) => polylineLength(run) < m.arrowLength) ? null : out;
}

/**
 * The stroke of one edge, with every label that sits on it knocked out: an edge runs through the
 * middle of its own label, and a neighbour's label is just as unreadable with a stroke through it,
 * so the `d` is emitted as subpaths with those boxes removed and the glyphs need nothing painted
 * behind them. A cut follows `label.box` grown by `labelPadding` — the keep-out the renderer plates
 * inside of — so a replaced `EdgeLabel` of a different size still gets the default label's gap.
 *
 * A label no stroke can be cut for is plated instead: the renderer paints its background back in,
 * over every edge, since labels are drawn after all of them.
 *
 * A dashed or dotted edge restarts its dash phase on the far side of the gap. Aligning the cut to a
 * dash boundary would mean layout knowing the pattern, which is paint — so the phase jump stays.
 */
function cutRuns(
  points: readonly Point[],
  gaps: readonly LabelGap[],
  plated: ReadonlySet<string>,
  m: DiagramMetrics,
): { runs: Point[][]; failed: string[] } {
  let runs: Point[][] = [points as Point[]];
  const failed: string[] = [];

  for (const gap of gaps) {
    if (plated.has(gap.owner) || !crosses(points, gap.rect, m)) {
      continue;
    }

    const cut = cutAround(runs, gap.rect, m);

    if (cut) {
      runs = cut;
    } else {
      failed.push(gap.owner);
    }
  }

  return { runs, failed };
}

function strokeOf(
  points: readonly Point[],
  gaps: readonly LabelGap[],
  plated: ReadonlySet<string>,
  m: DiagramMetrics,
  options: LayoutOptions,
): string {
  return cutRuns(points, gaps, plated, m)
    .runs.map((run) => edgeD(run, options.edgeShape, m))
    .join('');
}

/**
 * Labels no clean cut can be made for, so the renderer plates them instead of gapping the stroke.
 *
 * Judged with the cuts applied in the order they will be emitted in, not one at a time: two labels
 * over one stretch of stroke can each be cut for on their own and leave a stub between them
 * together. Plating one of them only ever lengthens the runs the others are cut from, so the
 * emitting pass never meets a cut this pass called feasible and finds it is not.
 */
function platedLabels(
  strokes: ReadonlyMap<string, readonly Point[]>,
  gaps: readonly LabelGap[],
  m: DiagramMetrics,
): Set<string> {
  const plated = new Set<string>();

  for (const points of strokes.values()) {
    for (const owner of cutRuns(points, gaps, plated, m).failed) {
      plated.add(owner);
    }
  }

  return plated;
}

function boxOf(centre: Point, size: Size): Rect {
  return {
    x: centre.x - size.width / 2,
    y: centre.y - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

function clusterOf(entity: string | undefined): string | undefined {
  return entity !== undefined && isCompositeId(entity) ? clusterIdOf(entity) : undefined;
}

/** Every cluster as a routable band: its box, its title reservation and everything laid out in it. */
function clusterBands(
  clusterBoxes: ReadonlyMap<string, Rect>,
  nodeBoxes: ReadonlyMap<string, PlacedBox>,
  context: AssembleContext,
): Map<string, GutterBand> {
  const contents = new Map<string, GutterObstacle[]>();
  const add = (clusterId: string, entry: GutterObstacle): void => {
    const bucket = contents.get(clusterId);

    if (bucket) {
      bucket.push(entry);
    } else {
      contents.set(clusterId, [entry]);
    }
  };

  for (const [id, box] of nodeBoxes) {
    const level = context.levels.nodeLevel.get(id) ?? null;

    for (const ancestor of level === null ? [] : (context.tree.chainOf.get(level) ?? [])) {
      add(ancestor, { node: id, rect: boxOf(box.centre, box.size) });
    }
  }

  for (const [id, box] of clusterBoxes) {
    for (const ancestor of (context.tree.chainOf.get(id) ?? []).slice(0, -1)) {
      add(ancestor, { node: null, rect: box });
    }
  }

  const bands = new Map<string, GutterBand>();

  for (const [id, box] of clusterBoxes) {
    const title = context.clusterTitles.get(id);

    bands.set(id, {
      id,
      box,
      titleHeight: title ? titleBand(context.m, title) : 0,
      contents: contents.get(id) ?? [],
    });
  }

  return bands;
}

/** Every node an edge can end on, as the box and outline the port pass needs. */
function portNodes(
  model: GraphModel,
  measured: ReadonlyMap<string, Measured>,
  nodeBoxes: ReadonlyMap<string, PlacedBox>,
): Map<string, PortNode> {
  const nodes = new Map<string, PortNode>();

  for (const node of model.nodes) {
    const box = nodeBoxes.get(node.id);
    const shape = measured.get(node.id)?.shape;

    if (box && shape) {
      nodes.set(node.id, { box: boxOf(box.centre, box.size), shape });
    }
  }

  return nodes;
}

/** Where an end faces: the far endpoint, or its own cluster's border when it is buried in one. */
function sourceAim(item: Pending): Point {
  const toward = item.interior?.[0] ?? item.target.centre;

  return item.sourceBorder ? borderPoint(item.sourceBorder, toward) : toward;
}

function targetAim(item: Pending): Point {
  const toward = item.interior?.at(-1) ?? item.source.centre;

  return item.targetBorder ? borderPoint(item.targetBorder, toward) : toward;
}

/**
 * An end buried in a collapsed cluster heads for its cluster's border rather than for the far
 * endpoint, so that is what its port faces. It has to be here rather than left to `routeEdge`: an
 * end left out of the pass is an end nothing else on its side knows to make room for, which is how
 * an edge comes to leave a node from the exact point another one arrives at.
 *
 * @param elbows target aim points for the edges `planElbow` chose an L for. An L arrives across the
 * side rather than the face, so it has to say so here, or the port pass puts it on the face the
 * chord came from and the two legs would be drawn along the outline.
 * @param axis rank axis, which is what turns a crossing a title plate pushed sideways into the
 * lateral offset the port pass takes; see `planTitleLane`.
 */
function portEdges(
  pending: readonly Pending[],
  elbows: ReadonlyMap<string, Point>,
  axis: Axis,
): PortEdge[] {
  const lateral: Axis = axis === 'y' ? 'x' : 'y';

  return pending
    .filter((item) => !item.selfLoop)
    .map((item) => {
      const edge: PortEdge = {
        id: item.edge.id,
        source: item.edge.source,
        target: item.edge.target,
        nearSource: item.sourceCrossing ?? sourceAim(item),
        nearTarget: item.targetCrossing ?? elbows.get(item.edge.id) ?? targetAim(item),
      };

      if (item.sourceLane !== undefined) {
        edge.alongSource = item.sourceLane - item.source.centre[lateral];
      }

      if (item.targetLane !== undefined) {
        edge.alongTarget = item.targetLane - item.target.centre[lateral];
      }

      return edge;
    });
}

/**
 * Every box a route has to claim empty space around before it may leave the lane it was given —
 * `planElbow` for the whole shape, `alignPortRun` for a run it wants to straighten. Nodes and
 * cluster title bands are the obvious ones; edge labels are here because a label already reserved a
 * rank of its own to sit on, and a stroke moved out from under one is a plate over a neighbour and a
 * knockout in the middle of the run that was supposed to be the clear alternative. Only labels
 * riding a virtual node are known this early, which is every label but a self-loop's.
 */
function routeObstacles(
  pending: readonly Pending[],
  nodeBoxes: ReadonlyMap<string, PlacedBox>,
  plates: ReadonlyMap<string, Rect>,
  context: AssembleContext,
): RouteObstacle[] {
  const out: RouteObstacle[] = [];

  for (const [id, box] of nodeBoxes) {
    out.push({ node: id, rect: boxOf(box.centre, box.size) });
  }

  for (const plate of plates.values()) {
    out.push({ node: null, rect: plate });
  }

  for (const item of pending) {
    const label = context.edgeLabels.get(item.edge.id);

    if (label && item.labelCentre) {
      out.push({
        node: null,
        rect: boxOf(item.labelCentre, {
          width: label.width + context.m.labelGap * 2,
          height: label.height + context.m.labelGap * 2,
        }),
      });
    }
  }

  return out;
}

/** `obstacles` less the two boxes an edge is allowed to touch: the ends it is drawn between. */
function obstaclesFor(obstacles: readonly RouteObstacle[], edge: GraphEdge): Rect[] {
  return obstacles
    .filter(({ node }) => node !== edge.source && node !== edge.target)
    .map(({ rect }) => rect);
}

/**
 * The edges drawn as an L, mapped to the point their target port should face.
 *
 * Three whole classes never qualify, before any geometry is looked at. A parallel pair is already
 * shaped by its offset and two Ls would land on top of each other; a labelled edge had its plate
 * reserved at the jog's own virtual node, and sliding the stroke out from under it would leave the
 * label sitting on a neighbour; and a self-loop has no rank to cross.
 */
function planElbows(
  pending: readonly Pending[],
  offsets: ReadonlyMap<string, number>,
  obstacles: readonly RouteObstacle[],
  axis: Axis,
  context: AssembleContext,
): Map<string, Point> {
  const elbows = new Map<string, Point>();

  if (context.options.edgeShape !== 'ortho') {
    return elbows;
  }

  for (const item of pending) {
    if (
      item.selfLoop ||
      context.edgeLabels.has(item.edge.id) ||
      (offsets.get(item.edge.id) ?? 0) !== 0
    ) {
      continue;
    }

    const aim = planElbow(
      {
        source: item.source,
        target: item.target,
        sourceId: item.edge.source,
        targetId: item.edge.target,
        aim: sourceAim(item),
        interior: item.interior ?? [],
      },
      obstacles,
      axis,
      context.m,
    );

    if (aim) {
      elbows.set(item.edge.id, aim);
    }
  }

  return elbows;
}

/**
 * `lane`, when that end's own side reaches it: the port has to be on the face the lane runs into,
 * and the lane within the straight of it. Otherwise nothing — an end that cannot follow keeps the
 * port it was given and the trail turns once to reach the one that did.
 */
function follows(
  endpoint: RouteEndpoint,
  port: Point | undefined,
  lane: number,
  axis: Axis,
  m: DiagramMetrics,
): number | undefined {
  const lateral: Axis = axis === 'y' ? 'x' : 'y';
  const reach = endpoint.size[axis === 'y' ? 'height' : 'width'] / 2;

  if (!port || Math.abs(Math.abs(port[axis] - endpoint.centre[axis]) - reach) > 0.5) {
    return undefined;
  }

  return Math.abs(lane - endpoint.centre[lateral]) <=
    sideRun(endpoint.shape, endpoint.size, axis, m)
    ? lane
    : undefined;
}

/**
 * Border crossings moved clear of the title plate of the cluster they cross into, and whether any of
 * them moved: a crossing is also the lane the port at that end sits on, so the port pass has to run
 * again when one did. An L-route and a parallel pair are left alone for the same reasons they are
 * left out of the elbow pass — the first proved its own two legs clear of every plate, and the second
 * is shaped by its offset rather than by a lane.
 */
function planTitleLanes(
  pending: readonly Pending[],
  ports: ReadonlyMap<string, EdgePorts>,
  plates: ReadonlyMap<string, Rect>,
  clearOf: ReadonlyMap<string, Rect[]>,
  elbows: ReadonlyMap<string, Point>,
  offsets: ReadonlyMap<string, number>,
  axis: Axis,
  m: DiagramMetrics,
): boolean {
  const lateral: Axis = axis === 'y' ? 'x' : 'y';
  const taken = new Map<string, number[]>();
  let moved = false;

  for (const item of pending) {
    if (item.selfLoop || elbows.has(item.edge.id) || (offsets.get(item.edge.id) ?? 0) !== 0) {
      continue;
    }

    const assigned = ports.get(item.edge.id);
    const crossing = (
      id: string,
      band: GutterBand | undefined,
      endpoint: RouteEndpoint,
      port: Point | undefined,
      outside: Point,
    ): Point | null => {
      if (!band || !port || plates.size === 0) {
        return null;
      }

      const side = `${id}${port[axis] < endpoint.centre[axis] ? 'low' : 'high'}`;
      const found = planTitleLane({
        plates: [...plates.values()],
        box: band.box,
        node: boxOf(endpoint.centre, endpoint.size),
        shape: endpoint.shape,
        port,
        outside,
        obstacles: clearOf.get(item.edge.id) ?? [],
        taken: taken.get(side) ?? [],
        axis,
        m,
      });

      if (found) {
        taken.set(side, [...(taken.get(side) ?? []), found[lateral]]);
      }

      return found;
    };
    const source = crossing(
      item.edge.source,
      item.sourceBand,
      item.source,
      assigned?.source,
      item.interior?.[0] ?? item.target.centre,
    );
    const target = crossing(
      item.edge.target,
      item.targetBand,
      item.target,
      assigned?.target,
      item.interior?.at(-1) ?? item.source.centre,
    );

    if (source) {
      item.sourceCrossing = source;
      item.sourceLane = source[lateral];
      moved = true;
    }

    if (target) {
      item.targetCrossing = target;
      item.targetLane = target[lateral];
      moved = true;
    }

    /*
     * The far end takes the same lane when its own side can reach it, which is worth more than it
     * looks: the two ends then agree, and an edge whose ends agree is drawn as one straight run
     * rather than a run with a jog in it. It also keeps the lane — the straightening pass takes a
     * run less than an arrowhead off its port back on trust, and a lane dodged by less than that
     * would be pulled straight back under the glyphs it was moved out from under.
     */
    if (item.sourceLane === undefined && item.targetLane !== undefined) {
      item.sourceLane = follows(item.source, assigned?.source, item.targetLane, axis, m);
    }

    if (item.targetLane === undefined && item.sourceLane !== undefined) {
      item.targetLane = follows(item.target, assigned?.target, item.sourceLane, axis, m);
    }
  }

  return moved;
}

/** Edges sharing one cluster gutter get their own lane in it, in declaration order. */
function assignLanes(pending: readonly Pending[], m: DiagramMetrics): Map<GutterPlan, number> {
  const groups = new Map<string, GutterPlan[]>();

  for (const item of pending) {
    for (const plan of [item.sourcePlan, item.targetPlan]) {
      if (!plan) {
        continue;
      }

      const key = `${plan.cluster}\u001F${plan.side}`;
      const group = groups.get(key);

      if (group) {
        group.push(plan);
      } else {
        groups.set(key, [plan]);
      }
    }
  }

  const lanes = new Map<GutterPlan, number>();

  for (const group of groups.values()) {
    const spread = gutterLanes(group[0] as GutterPlan, group.length, m);

    for (const [index, plan] of group.entries()) {
      lanes.set(plan, spread[index] as number);
    }
  }

  return lanes;
}

function parallelOffsets(edges: readonly GraphEdge[], step: number): Map<string, number> {
  const groups = new Map<string, string[]>();

  for (const edge of edges) {
    if (edge.source === edge.target) {
      continue;
    }

    const key =
      edge.source < edge.target
        ? `${edge.source}\u001F${edge.target}`
        : `${edge.target}\u001F${edge.source}`;
    const group = groups.get(key);

    if (group) {
      group.push(edge.id);
    } else {
      groups.set(key, [edge.id]);
    }
  }

  const offsets = new Map<string, number>();

  const byId = new Map(edges.map((edge) => [edge.id, edge]));

  for (const group of groups.values()) {
    for (const [index, id] of group.entries()) {
      // Offsets are indexed against the canonical orientation of the pair; an edge declared the
      // other way round has a flipped chord normal, so its offset flips to match.
      const edge = byId.get(id);
      const sign = edge && edge.source > edge.target ? -1 : 1;

      offsets.set(id, sign * (index - (group.length - 1) / 2) * step);
    }
  }

  return offsets;
}

/**
 * Labels for the loops of one node, stacked in a single column outside the outermost lobe.
 *
 * A loop's own lobe is the wrong anchor once a node has more than one: the lobes share a centre, so
 * every label lands on the same cross coordinate and reads as one run-together word, and an inner
 * label also sits on top of the lobes drawn outside it. One column past the widest lobe, one row per
 * loop in declaration order, keeps each label beside the arc it belongs to and clear of the rest.
 * A single loop is unaffected — its column is its own lobe and its row is its own centre.
 */
function stackLoopLabels(
  prepared: readonly Prepared[],
  loops: ReadonlyMap<string, readonly string[]>,
  edgeLabels: ReadonlyMap<string, LabelBox>,
  side: Axis,
  m: DiagramMetrics,
): void {
  if (loops.size === 0) {
    return;
  }

  const cross: Axis = side === 'x' ? 'y' : 'x';
  const byId = new Map(prepared.map((entry) => [entry.edge.id, entry]));
  const sizeAcross = ({ width, height }: LabelBox): number => (side === 'x' ? height : width);
  // Twice the gap between rows: a label keeps out to `labelPadding` on every side, so one gap would
  // leave consecutive labels with barely a stroke of daylight between them.
  const gap = m.labelGap * 2;

  for (const ids of loops.values()) {
    const entries = ids.flatMap((id) => {
      const entry = byId.get(id);
      const label = edgeLabels.get(id);

      return entry && label ? [{ entry, label }] : [];
    });
    const first = entries[0];

    if (!first) {
      continue;
    }

    const outer = ids.reduce(
      (furthest, id) => Math.max(furthest, byId.get(id)?.routed.labelPoint[side] ?? furthest),
      first.entry.routed.labelPoint[side],
    );
    const span = entries.reduce((total, { label }) => total + sizeAcross(label) + gap, -gap);
    let cursor = first.entry.routed.labelPoint[cross] - span / 2;

    for (const { entry, label } of entries) {
      const along = outer + m.labelGap + (side === 'x' ? label.width : label.height) / 2;
      const middle = cursor + sizeAcross(label) / 2;

      entry.labelCentre = side === 'x' ? { x: along, y: middle } : { x: middle, y: along };
      cursor += sizeAcross(label) + gap;
    }
  }
}

function assemble(model: GraphModel, placed: Placed, context: AssembleContext): GraphScene {
  const { m, options, tree, levels, measured, edgeLabels, clusterTitles } = context;
  const direction = model.direction;
  const axis = rankAxis(direction);
  const side = loopSide(direction);

  const nodeBoxes = new Map<string, PlacedBox>();

  for (const [id, box] of placed.nodes) {
    nodeBoxes.set(id, {
      centre: toFinalPoint(direction, box.centre),
      size: swapSize(direction, box.size),
    });
  }

  const clusterBoxes = new Map<string, Rect>();

  for (const [id, box] of placed.clusters) {
    const centre = toFinalPoint(direction, box.centre);
    const size = swapSize(direction, box.size);

    clusterBoxes.set(id, {
      x: centre.x - size.width / 2,
      y: centre.y - size.height / 2,
      width: size.width,
      height: size.height,
    });
  }

  const endpointOf = (id: string): RouteEndpoint | null => {
    const box = nodeBoxes.get(id);
    const shape = measured.get(id)?.shape;

    return box && shape ? { centre: box.centre, size: box.size, shape } : null;
  };

  const borderOf = (entity: string | undefined): Rect | undefined => {
    const id = clusterOf(entity);

    return id === undefined ? undefined : clusterBoxes.get(id);
  };

  const plates = new Map<string, Rect>();

  for (const [id, box] of clusterBoxes) {
    const title = clusterTitles.get(id);

    if (title) {
      plates.set(id, titleRect(box, title, m));
    }
  }

  const bands = clusterBands(clusterBoxes, nodeBoxes, context);
  const bandOf = (entity: string | undefined): GutterBand | undefined => {
    const id = clusterOf(entity);

    return id === undefined ? undefined : bands.get(id);
  };
  const offsets = parallelOffsets(model.edges, m.edgeSep);
  const pending: Pending[] = [];

  for (const edge of model.edges) {
    const source = endpointOf(edge.source);
    const target = endpointOf(edge.target);

    if (!source || !target) {
      continue;
    }

    if (edge.source === edge.target) {
      pending.push({ edge, source, target, selfLoop: true });
      continue;
    }

    const route = placed.edges.get(edge.id);

    if (!route) {
      continue;
    }

    const entity = levels.entityOf.get(edge.id);
    const interior = route.points.map((point) => toFinalPoint(direction, point));
    const item: Pending = {
      edge,
      source,
      target,
      selfLoop: false,
      interior,
      sourceBorder: borderOf(entity?.source),
      targetBorder: borderOf(entity?.target),
      labelCentre: route.labelPoint ? toFinalPoint(direction, route.labelPoint) : null,
      sourceBand: bandOf(entity?.source),
      targetBand: bandOf(entity?.target),
    };

    pending.push(item);
  }

  const loops = new Map<string, string[]>();

  for (const item of pending) {
    if (item.selfLoop) {
      const bucket = loops.get(item.edge.source);

      if (bucket) {
        bucket.push(item.edge.id);
      } else {
        loops.set(item.edge.source, [item.edge.id]);
      }
    }
  }

  const obstacles = routeObstacles(pending, nodeBoxes, plates, context);
  const clearOf = new Map(
    pending.map((item) => [item.edge.id, obstaclesFor(obstacles, item.edge)] as const),
  );
  const elbows = planElbows(pending, offsets, obstacles, axis, context);
  const portable = portNodes(model, measured, nodeBoxes);
  const first = assignPorts(portable, portEdges(pending, elbows, axis), axis, m);
  const ports = planTitleLanes(pending, first, plates, clearOf, elbows, offsets, axis, m)
    ? assignPorts(portable, portEdges(pending, elbows, axis), axis, m)
    : first;

  /**
   * Endpoints, ports and offsets. A border is the fallback for an endpoint inside a cluster, so it
   * drops out once that end has a detour to follow instead — which is why this is called once
   * before the plans exist and again after.
   */
  const baseInput = (item: Pending): RouteInput => {
    const input: RouteInput = {
      source: item.source,
      target: item.target,
      interior: item.interior ?? [],
      arrow: item.edge.arrow,
      startArrow: item.edge.startArrow,
      offset: offsets.get(item.edge.id) ?? 0,
      obstacles: clearOf.get(item.edge.id) ?? [],
    };
    const port = ports.get(item.edge.id);

    if (port?.source) {
      input.sourcePort = port.source;
    }

    if (port?.target) {
      input.targetPort = port.target;
    }

    if (elbows.has(item.edge.id)) {
      input.elbow = true;

      return input;
    }

    /*
     * A crossing planned clear of a title plate is taken on the lane the port actually came back on,
     * not the one it was planned for: the spacing pass may still have slid the port to clear a
     * neighbour, and a crossing left behind at the planned lane would put a jog inside the cluster —
     * under the plate the whole move was made to miss.
     */
    const laneAt = (crossing: Point, at: Point | undefined): Point[] => {
      if (!at) {
        return [crossing];
      }

      return [axis === 'y' ? { x: at.x, y: crossing.y } : { x: crossing.x, y: at.y }];
    };

    if (item.sourceBorder && !item.sourcePlan) {
      if (item.sourceCrossing) {
        input.sourceDetour = laneAt(item.sourceCrossing, port?.source);
      } else {
        input.sourceBorder = item.sourceBorder;
      }
    }

    if (item.targetBorder && !item.targetPlan) {
      if (item.targetCrossing) {
        input.targetDetour = laneAt(item.targetCrossing, port?.target);
      } else {
        input.targetBorder = item.targetBorder;
      }
    }

    return input;
  };

  /*
   * A detour is planned against the polyline the engine would actually draw, not against a model of
   * it. `routeEdge` elbows the whole trail at once and lands on the endpoint's outline, so any
   * cheaper approximation is wrong in both directions: it invents detours for routes that were
   * already clear, and misses the ones that are not. Routing twice costs one extra `routeEdge` per
   * edge that turns out to need a detour, and nothing for the rest.
   */
  for (const item of pending) {
    // An L-route has already been proved clear of everything the gutter exists to route around.
    if (item.selfLoop || elbows.has(item.edge.id) || (!item.sourceBand && !item.targetBand)) {
      continue;
    }

    const plain = routeEdge(baseInput(item), m, options.edgeShape, axis);
    const enclose = (band: GutterBand | undefined, enter: boolean): GutterPlan | null => {
      const endpoint = enter ? item.target : item.source;
      const outside = enter
        ? (item.interior?.at(-1) ?? item.source.centre)
        : (item.interior?.[0] ?? item.target.centre);

      return band
        ? planGutter({
            band,
            node: boxOf(endpoint.centre, endpoint.size),
            nodeId: enter ? item.edge.target : item.edge.source,
            outside,
            drawn: plain.points,
            enter,
            axis,
            m,
          })
        : null;
    };

    item.sourcePlan = enclose(item.sourceBand, false);
    item.targetPlan = enclose(item.targetBand, true);

    if (!item.sourcePlan && !item.targetPlan) {
      item.plain = plain;
    }
  }

  const lanes = assignLanes(pending, m);
  const prepared: Prepared[] = [];

  for (const item of pending) {
    if (item.selfLoop) {
      const siblings = loops.get(item.edge.source) ?? [];

      prepared.push({
        edge: item.edge,
        routed: routeSelfLoop(
          item.source,
          side,
          item.edge.arrow,
          item.edge.startArrow,
          m,
          siblings.indexOf(item.edge.id),
          siblings.length,
        ),
        labelCentre: null,
      });
      continue;
    }

    if (item.plain) {
      prepared.push({
        edge: item.edge,
        routed: item.plain,
        labelCentre: item.labelCentre ?? null,
      });
      continue;
    }

    const input = baseInput(item);

    if (item.sourcePlan) {
      input.sourceDetour = gutterPoints(item.sourcePlan, lanes.get(item.sourcePlan) ?? 0, axis);
    }

    if (item.targetPlan) {
      input.targetDetour = gutterPoints(item.targetPlan, lanes.get(item.targetPlan) ?? 0, axis);
    }

    prepared.push({
      edge: item.edge,
      routed: routeEdge(input, m, options.edgeShape, axis),
      labelCentre: item.labelCentre ?? null,
    });
  }

  // Node boxes only: a leg slid across the gap has to stay out of the ranks either side of it, and
  // a title band or a label is already a box the route it belongs to was planned around.
  separateLegs(
    prepared.map((entry) => entry.routed),
    obstacles.flatMap(({ node, rect }) => (node === null ? [] : [rect])),
    axis,
    m,
  );
  stackLoopLabels(prepared, loops, edgeLabels, side, m);

  // Everything is in place; find the extent, then move it once to the padded origin.
  const bounds = emptyBounds();

  for (const box of nodeBoxes.values()) {
    addBox(bounds, box.centre, box.size);
  }

  for (const box of clusterBoxes.values()) {
    addPoint(bounds, { x: box.x, y: box.y });
    addPoint(bounds, { x: box.x + box.width, y: box.y + box.height });
  }

  const labelPlacements = new Map<string, Point>();

  for (const entry of prepared) {
    for (const point of entry.routed.points) {
      addPoint(bounds, point);
    }

    for (const tip of [entry.routed.arrowTip, entry.routed.startArrowTip]) {
      if (tip) {
        addPoint(bounds, tip);
      }
    }

    const label = edgeLabels.get(entry.edge.id);

    if (!label) {
      continue;
    }

    const normal = entry.routed.labelNormal;
    const push = normal.x !== 0 || normal.y !== 0;
    const centre = entry.labelCentre ?? {
      x: entry.routed.labelPoint.x + normal.x * (m.labelGap + (push ? label.width / 2 : 0)),
      y: entry.routed.labelPoint.y + normal.y * (m.labelGap + (push ? label.height / 2 : 0)),
    };

    labelPlacements.set(entry.edge.id, centre);
    addBox(bounds, centre, { width: label.width, height: label.height });
  }

  const titleCentres = new Map<string, Point>();

  for (const [id, title] of clusterTitles) {
    const plate = plates.get(id);

    if (!plate) {
      continue;
    }

    const centre = { x: plate.x + plate.width / 2, y: plate.y + plate.height / 2 };

    titleCentres.set(id, centre);
    addBox(bounds, centre, { width: title.width, height: title.height });
  }

  const empty = !Number.isFinite(bounds.minX);
  const dx = empty ? 0 : m.padding - bounds.minX;
  const dy = empty ? 0 : m.padding - bounds.minY;
  const size: Size = empty
    ? { width: m.padding * 2, height: m.padding * 2 }
    : {
        width: bounds.maxX - bounds.minX + m.padding * 2,
        height: bounds.maxY - bounds.minY + m.padding * 2,
      };

  const sceneNodes: SceneNode[] = [];

  for (const node of model.nodes) {
    const box = nodeBoxes.get(node.id);
    const info = measured.get(node.id);

    if (!box || !info) {
      continue;
    }

    const sceneNode: SceneNode = {
      id: node.id,
      x: box.centre.x + dx,
      y: box.centre.y + dy,
      width: box.size.width,
      height: box.size.height,
      shape: node.shape,
      outline: info.shape.outline(box.size, m),
      label: info.label,
      classes: node.classes,
    };

    if (node.name !== undefined) {
      sceneNode.name = node.name;
    }

    if (node.span) {
      sceneNode.span = node.span;
    }

    sceneNodes.push(sceneNode);
  }

  const sceneEdges: SceneEdge[] = [];
  const strokes = new Map<string, Point[]>(
    prepared.map((entry) => [
      entry.edge.id,
      entry.routed.points.map((point) => shiftPoint(point, dx, dy)),
    ]),
  );
  const gaps: LabelGap[] = [];

  for (const [id, centre] of labelPlacements) {
    const label = edgeLabels.get(id);

    if (label) {
      gaps.push({
        owner: id,
        rect: boxOf(shiftPoint(centre, dx, dy), {
          width: label.width + m.labelPadding * 2,
          height: label.height + m.labelPadding * 2,
        }),
      });
    }
  }

  const plated = platedLabels(strokes, gaps, m);

  for (const entry of prepared) {
    const points = strokes.get(entry.edge.id) as Point[];
    const label = edgeLabels.get(entry.edge.id);
    const placement = labelPlacements.get(entry.edge.id);
    const scene: SceneEdge = {
      id: entry.edge.id,
      source: entry.edge.source,
      target: entry.edge.target,
      points,
      d: strokeOf(points, gaps, plated, m, options),
      line: entry.edge.line,
      arrow: entry.edge.arrow,
      startArrow: entry.edge.startArrow,
      reversed: placed.edges.get(entry.edge.id)?.reversed ?? false,
      classes: entry.edge.classes,
    };

    if (entry.edge.span) {
      scene.span = entry.edge.span;
    }

    if (entry.routed.arrowTip && points.length >= 2) {
      scene.arrowD = arrowHead(
        entry.edge.arrow,
        shiftPoint(entry.routed.arrowTip, dx, dy),
        points.at(-2) as Point,
        m,
      )?.d;
    }

    if (entry.routed.startArrowTip && points.length >= 2) {
      scene.startArrowD = arrowHead(
        entry.edge.startArrow,
        shiftPoint(entry.routed.startArrowTip, dx, dy),
        points[1] as Point,
        m,
      )?.d;
    }

    if (label && placement) {
      scene.label = { box: label, x: placement.x + dx, y: placement.y + dy };
    }

    if (plated.has(entry.edge.id)) {
      scene.labelPlate = true;
    }

    sceneEdges.push(scene);
  }

  const buildClusters = (parent: string | null, depth: number): SceneCluster[] => {
    const out: SceneCluster[] = [];

    for (const cluster of tree.childrenOf.get(parent) ?? []) {
      const box = clusterBoxes.get(cluster.id);

      if (!box) {
        continue;
      }

      const title = clusterTitles.get(cluster.id);
      const titleCentre = titleCentres.get(cluster.id);
      const scene: SceneCluster = {
        id: cluster.id,
        box: { x: box.x + dx, y: box.y + dy, width: box.width, height: box.height },
        children: buildClusters(cluster.id, depth + 1),
        depth,
        classes: cluster.classes,
      };

      if (cluster.span) {
        scene.span = cluster.span;
      }

      if (title && titleCentre) {
        scene.title = { box: title, x: titleCentre.x + dx, y: titleCentre.y + dy };
      }

      out.push(scene);
    }

    return out;
  };

  const scene: GraphScene = {
    kind: 'graph',
    family: model.family,
    size,
    nodes: sceneNodes,
    edges: sceneEdges,
    clusters: buildClusters(null, 0),
  };

  if (model.title !== undefined) {
    scene.title = model.title;
  }

  if (model.description !== undefined) {
    scene.description = model.description;
  }

  return scene;
}
