/*
 * The layout invariants, as reusable asserts. Every one of these is a property the engine must hold
 * for any input, so they run over synthetic models now and over parsed family fixtures later.
 */

import { expect } from 'vitest';

import { rayRect, segmentHitsRect } from '@/lib/diagram/core/geometry/intersect.ts';
import { COLLINEAR_SIN } from '@/lib/diagram/core/geometry/path.ts';
import { ELBOW_MIN_RUN } from '@/lib/diagram/core/graph/elbow.ts';
import type { Direction } from '@/lib/diagram/core/graph/model.ts';
import type { OrderResult } from '@/lib/diagram/core/graph/order.ts';
import { sideRun } from '@/lib/diagram/core/graph/ports.ts';
import { rankAxis } from '@/lib/diagram/core/graph/route.ts';
import { strokeGap } from '@/lib/diagram/core/graph/spacing.ts';
import { resolveShape } from '@/lib/diagram/core/shapes/registry.ts';
import type { DiagramMetrics } from '@/lib/diagram/metrics.ts';
import type {
  GanttScene,
  GraphScene,
  Point,
  Rect,
  Scene,
  SceneCluster,
  SceneEdge,
  SceneNode,
  SequenceScene,
  ShapeDef,
  ShapeRegistry,
  Size,
} from '@/lib/diagram/types.ts';

export interface OutlineContext {
  shapes: ShapeRegistry;
  metrics: DiagramMetrics;
  tolerance?: number;
}

function overlap(a: SceneNode, b: SceneNode, tolerance: number): boolean {
  return (
    Math.abs(a.x - b.x) < (a.width + b.width) / 2 - tolerance &&
    Math.abs(a.y - b.y) < (a.height + b.height) / 2 - tolerance
  );
}

/** No two node boxes may intersect; `tolerance` absorbs float noise, not real overlap. */
export function assertNoNodeOverlap(scene: GraphScene, tolerance = 0.01): void {
  for (let i = 0; i < scene.nodes.length; i += 1) {
    for (let j = i + 1; j < scene.nodes.length; j += 1) {
      const a = scene.nodes[i] as SceneNode;
      const b = scene.nodes[j] as SceneNode;

      expect(overlap(a, b, tolerance), `${a.id} overlaps ${b.id}`).toBe(false);
    }
  }
}

/**
 * Distance from a node's centre to its own outline, along the ray through `toward`. Measured
 * against the shape's anchor rather than the port policy: a port is one of the things being
 * checked, so asking it where the outline is would only ever confirm itself.
 */
function radiusToward(node: SceneNode, toward: Point, context: OutlineContext): number {
  const shape = resolveShape(context.shapes, node.shape);
  const size = { width: node.width, height: node.height };
  const direction = { x: toward.x - node.x, y: toward.y - node.y };
  const hit = shape.anchor?.(size, direction, context.metrics) ?? rayRect(size, direction);

  return Math.hypot(hit.x, hit.y);
}

/** How far back from the outline each cap kind pulls the stroke — mirrors `geometry/arrow.ts`. */
function trimOf(kind: SceneEdge['arrow'], metrics: DiagramMetrics): number {
  if (kind === 'none') {
    return 0;
  }

  // Mirrors `arrowHead`: the solid head is trimmed by its length, the circle and cross caps by the
  // cap size they are drawn at.
  return kind === 'arrow' ? metrics.arrowLength : metrics.arrowCapSize;
}

function untrim(at: Point, from: Point, amount: number): Point {
  const length = Math.hypot(at.x - from.x, at.y - from.y);

  if (length === 0 || amount === 0) {
    return at;
  }

  return {
    x: at.x + ((at.x - from.x) / length) * amount,
    y: at.y + ((at.y - from.y) / length) * amount,
  };
}

function onOutline(node: SceneNode, p: Point, context: OutlineContext, tolerance: number): boolean {
  const distance = Math.hypot(p.x - node.x, p.y - node.y);

  return Math.abs(distance - radiusToward(node, p, context)) <= tolerance;
}

/**
 * Every edge meets its nodes exactly on their outlines. The drawn endpoint is pulled back by the
 * cap length so an arrowhead does not poke through, so the check un-trims first; a shape whose
 * outline is not a rectangle is measured along the endpoint's own ray, which is exact for any shape.
 */
export function assertEndpointsOnOutline(scene: GraphScene, context: OutlineContext): void {
  const tolerance = context.tolerance ?? 0.5;
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));

  for (const edge of scene.edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    const first = edge.points[0];
    const second = edge.points[1];
    const last = edge.points.at(-1);
    const penultimate = edge.points.at(-2);

    if (!source || !target || !first || !second || !last || !penultimate) {
      continue;
    }

    const start = untrim(first, second, trimOf(edge.startArrow, context.metrics));
    const end = untrim(last, penultimate, trimOf(edge.arrow, context.metrics));

    expect(
      onOutline(source, start, context, tolerance) || onOutline(source, first, context, tolerance),
      `edge ${edge.id} does not leave ${edge.source} on its outline`,
    ).toBe(true);
    expect(
      onOutline(target, end, context, tolerance) || onOutline(target, last, context, tolerance),
      `edge ${edge.id} does not land on ${edge.target}'s outline`,
    ).toBe(true);
  }
}

/**
 * No stroke is drawn through a label it does not belong to. An edge label is knocked out of every
 * edge that crosses it, not only the one that carries it, so a crossing means a cut: one more
 * subpath in that edge's `d` for every label box its polyline enters. The label the engine could
 * not cut for is flagged `labelPlate` instead and its owner paints a background, which covers the
 * strokes underneath it rather than gapping them.
 */
export function assertLabelsUnstruck(scene: GraphScene, context: OutlineContext): void {
  // The label's own keep-out, less half a stroke: a stroke may graze the box it is placed beside,
  // and grazing is not striking through.
  const gap = context.metrics.labelPadding - context.metrics.strokeWidth / 2;
  const boxes = scene.edges.flatMap((edge) =>
    edge.label && !edge.labelPlate
      ? [
          {
            x: edge.label.x - edge.label.box.width / 2 - gap,
            y: edge.label.y - edge.label.box.height / 2 - gap,
            width: edge.label.box.width + gap * 2,
            height: edge.label.box.height + gap * 2,
          },
        ]
      : [],
  );

  for (const edge of scene.edges) {
    const cuts = boxes.filter((box) =>
      edge.points.some(
        (point, i) => i > 0 && segmentHitsRect(edge.points[i - 1] as Point, point, box),
      ),
    ).length;

    expect(
      (edge.d.match(/M/g) ?? []).length,
      `edge ${edge.id} is drawn through ${cuts} label box(es) it was not cut for`,
    ).toBeGreaterThanOrEqual(cuts + 1);
  }
}

function titledClusters(clusters: readonly SceneCluster[], into: SceneCluster[]): SceneCluster[] {
  for (const cluster of clusters) {
    if (cluster.title) {
      into.push(cluster);
    }

    titledClusters(cluster.children, into);
  }

  return into;
}

/** Endpoint pair an edge belongs to, orientation-independent — the group `parallelOffsets` spreads. */
function pairKey(edge: SceneEdge): string {
  return edge.source < edge.target
    ? `${edge.source}\u001F${edge.target}`
    : `${edge.target}\u001F${edge.source}`;
}

function within(outer: Rect, node: SceneNode): boolean {
  return (
    node.x - node.width / 2 >= outer.x &&
    node.y - node.height / 2 >= outer.y &&
    node.x + node.width / 2 <= outer.x + outer.width &&
    node.y + node.height / 2 <= outer.y + outer.height
  );
}

/** Every cluster in the scene keyed by id, with the clusters it sits inside, outermost first. */
function clusterChains(
  clusters: readonly SceneCluster[],
  inherited: readonly SceneCluster[],
  into: Map<string, readonly SceneCluster[]>,
): Map<string, readonly SceneCluster[]> {
  for (const cluster of clusters) {
    const chain = [...inherited, cluster];

    into.set(cluster.id, chain);
    clusterChains(cluster.children, chain, into);
  }

  return into;
}

function encloses(outer: Rect, inner: Rect, tolerance: number): boolean {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  );
}

function rectsMeet(a: Rect, b: Rect, tolerance: number): boolean {
  return (
    a.x + a.width - tolerance > b.x &&
    b.x + b.width - tolerance > a.x &&
    a.y + a.height - tolerance > b.y &&
    b.y + b.height - tolerance > a.y
  );
}

function assertNesting(
  parent: SceneCluster | null,
  clusters: readonly SceneCluster[],
  tolerance: number,
): void {
  for (const [index, cluster] of clusters.entries()) {
    if (parent) {
      expect(
        encloses(parent.box, cluster.box, tolerance),
        `cluster ${cluster.id} is not inside its parent ${parent.id}`,
      ).toBe(true);
    }

    for (const other of clusters.slice(index + 1)) {
      expect(
        rectsMeet(cluster.box, other.box, tolerance),
        `cluster ${cluster.id} overlaps its sibling ${other.id}`,
      ).toBe(false);
    }

    assertNesting(cluster, cluster.children, tolerance);
  }
}

/**
 * Every cluster holds what it owns. Boxes nest and siblings stay apart, and — when the caller can
 * say who belongs where — a member node sits inside its own cluster and inside every cluster that
 * one is nested in.
 *
 * Cluster geometry is the most fragile pass in the layout: each level is laid out on its own and
 * then folded into its parent as a composite, so a box that grew for a title band, a member the
 * padding did not account for, or a sibling pair packed against each other are all off-by-a-margin
 * mistakes that leave every other invariant holding. Containment is the property that catches them,
 * and it is cheap enough to run over the whole fuzz corpus.
 *
 * Membership is the one half that cannot be read off the scene — `SceneCluster` carries a box and
 * its children, never a member list — so `members` comes from the model the caller laid out. A
 * cluster the scene has no box for is skipped rather than failed: `clusters: 'ignore'` flattens
 * them all away on purpose, and whether a cluster survives at all is a different question from
 * whether it holds its own.
 */
export function assertClustersHold(
  scene: GraphScene,
  members?: readonly { id: string; cluster: string | null }[],
): void {
  const tolerance = 0.01;

  assertNesting(null, scene.clusters, tolerance);

  if (!members) {
    return;
  }

  const chains = clusterChains(scene.clusters, [], new Map());
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));

  for (const member of members) {
    const node = byId.get(member.id);
    const chain = member.cluster === null ? undefined : chains.get(member.cluster);

    if (!node || !chain) {
      continue;
    }

    for (const cluster of chain) {
      expect(within(cluster.box, node), `node ${node.id} escapes cluster ${cluster.id}`).toBe(true);
    }
  }
}

/**
 * No stroke runs under a cluster title it had room to run beside. The plate the renderer paints
 * behind the glyphs is opaque — it is what makes a title readable over a tinted cluster — so an edge
 * crossing one is not drawn faintly, it is cut in two with an arrowhead beyond the cut, which reads
 * as a severed line. Unlike an edge label there is no gap to fall back on: the title stays where it
 * is and the lane moves, which is `planTitleLane`.
 *
 * Room is the endpoint's own side. A node no wider than the title above it has no lane to be met on,
 * and a title band is only ever as wide as its cluster — so the crossing is geometry with no answer
 * rather than a route that chose badly, and the check has nothing to say about it. Neither does it
 * have anything to say about a route that never had a lane to move: a chord that was never elbowed
 * (a straight or smooth edge shape) runs where the shape asked for, and a parallel pair is spread by
 * its offset — both are outside the lane pass for the same reason they are outside the elbow pass.
 *
 * The plate is inset by half a stroke, the same slack `assertLabelsUnstruck` gives a label: a lane
 * that grazes it with the outer half of its width is a lane running beside the title.
 */
export function assertTitlesUnstruck(scene: GraphScene, options: InvariantOptions): void {
  const { labelGap, strokeWidth } = options.metrics;
  const inset = labelGap - strokeWidth / 2;
  const axis = rankAxis(options.direction);
  const lateral = axis === 'y' ? 'x' : 'y';
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  const pairs = new Map<string, number>();
  const crowd = new Map<string, number>();
  const sideOf = (node: SceneNode, port: Point): string =>
    `${node.id}\u001F${port[axis] < node[axis] ? 'low' : 'high'}`;

  for (const edge of scene.edges) {
    const key = pairKey(edge);

    pairs.set(key, (pairs.get(key) ?? 0) + 1);

    for (const end of ['source', 'target'] as const) {
      const node = byId.get(edge[end]);
      const port = end === 'source' ? edge.points[0] : edge.points.at(-1);

      if (node && port) {
        crowd.set(sideOf(node, port), (crowd.get(sideOf(node, port)) ?? 0) + 1);
      }
    }
  }

  const plates = titledClusters(scene.clusters, []).map((cluster) => {
    const title = cluster.title as NonNullable<SceneCluster['title']>;

    return {
      cluster,
      rect: {
        x: title.x - title.box.width / 2 - inset,
        y: title.y - title.box.height / 2 - inset,
        width: title.box.width + inset * 2,
        height: title.box.height + inset * 2,
      },
    };
  });
  const low = (rect: Rect): number => (lateral === 'x' ? rect.x : rect.y);
  const high = (rect: Rect): number =>
    lateral === 'x' ? rect.x + rect.width : rect.y + rect.height;

  for (const edge of scene.edges) {
    if ((pairs.get(pairKey(edge)) ?? 0) > 1 || !isOrthogonal(edge.points)) {
      continue;
    }

    const struck = plates.filter(({ rect }) =>
      edge.points.some(
        (point, i) => i > 0 && segmentHitsRect(edge.points[i - 1] as Point, point, rect),
      ),
    );

    if (struck.length === 0) {
      continue;
    }

    // A lane beside one of the titles this route runs under, that runs beside all of them: a route
    // crossing into a cluster and on into one nested inside it has to clear both plates at once.
    const lanes = struck
      .flatMap(({ rect }) => [high(rect) + strokeWidth, low(rect) - strokeWidth])
      .filter((lane) => struck.every(({ rect }) => lane <= low(rect) || lane >= high(rect)));
    const reachable = (id: string, port: Point | undefined): boolean => {
      const node = byId.get(id);

      if (!node || !port || !struck.some(({ cluster }) => within(cluster.box, node))) {
        return false;
      }

      const run = sideRun(
        resolveShape(options.shapes, node.shape),
        { width: node.width, height: node.height },
        axis,
        options.metrics,
      );
      // Room for the whole crowd on that side, not just for this one: ports that ask for a lane the
      // side cannot fit them all on are slid back along it together, and the innermost of them lands
      // where it started.
      const shared = ((crowd.get(sideOf(node, port)) ?? 1) - 1) * strokeGap(options.metrics);

      return lanes.some((lane) => Math.abs(lane - node[lateral]) + shared <= run);
    };

    expect(
      reachable(edge.source, edge.points[0]) || reachable(edge.target, edge.points.at(-1)),
      `edge ${edge.id} is drawn under the title of ${struck.map(({ cluster }) => cluster.id).join(', ')}, which it had room to miss`,
    ).toBe(false);
  }
}

/** Cardinal side a point sits on, relative to the node's own extent: the axis it is furthest along. */
function sideNormal(node: SceneNode, local: Point): Point {
  return Math.abs(local.x) * node.height >= Math.abs(local.y) * node.width
    ? { x: Math.sign(local.x), y: 0 }
    : { x: 0, y: Math.sign(local.y) };
}

/** Widest angle a stroke may leave its own outline at before it reads as running along it. */
const DEPARTURE_DEGREES = 60;

function isOrthogonal(points: readonly Point[]): boolean {
  return points.every((point, i) => {
    const previous = points[i - 1];

    return (
      !previous || Math.abs(point.x - previous.x) < 0.01 || Math.abs(point.y - previous.y) < 0.01
    );
  });
}

/**
 * Every orthogonal edge leaves and arrives across the outline rather than along it. A port and the
 * direction the stroke takes from it are decided separately — the port by which side faces the
 * neighbour, the direction by the elbow the router puts in — and when the two disagree the stroke
 * sets off tangent to the node it just left, hugging a corner arc for as far as it takes to clear
 * it. A chord that was never elbowed (a parallel edge's bulge, a straight or smooth edge shape)
 * arrives at whatever angle it runs at, which is the shape asked for rather than a graze.
 */
export function assertPortsLeaveSquare(scene: GraphScene): void {
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));

  for (const edge of scene.edges) {
    if (edge.source === edge.target || !isOrthogonal(edge.points)) {
      continue;
    }

    for (const end of ['source', 'target'] as const) {
      const node = byId.get(edge[end]);
      const port = end === 'source' ? edge.points[0] : edge.points.at(-1);
      const next = end === 'source' ? edge.points[1] : edge.points.at(-2);

      if (!node || !port || !next) {
        continue;
      }

      const away = { x: next.x - port.x, y: next.y - port.y };
      const length = Math.hypot(away.x, away.y);

      if (length < 0.01) {
        continue;
      }

      const normal = sideNormal(node, { x: port.x - node.x, y: port.y - node.y });
      const dot = (away.x * normal.x + away.y * normal.y) / length;
      const degrees = (Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI;

      expect(
        degrees,
        `edge ${edge.id} runs along ${node.id} instead of away from it at its ${end}`,
      ).toBeLessThanOrEqual(DEPARTURE_DEGREES);
    }
  }
}

/** Boxes of every cluster in the scene, outermost first. */
function clusterRects(clusters: readonly SceneCluster[]): Rect[] {
  return clusters.flatMap((cluster) => [cluster.box, ...clusterRects(cluster.children)]);
}

function holds(rect: Rect, node: SceneNode | undefined): boolean {
  return (
    node !== undefined &&
    node.x > rect.x &&
    node.x < rect.x + rect.width &&
    node.y > rect.y &&
    node.y < rect.y + rect.height
  );
}

/** How many rays the inscribed-box search sweeps through a quadrant. */
const PROBE_RAYS = 31;

/** The four sign combinations a probe ray is fired at, so no symmetry of the outline is assumed. */
const QUADRANTS: readonly Point[] = [
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];

/**
 * Half-extents of the largest axis-aligned box the outline is known to contain, found by sweeping
 * rays across a quadrant and keeping the corner that boxes the most area.
 *
 * The obvious probe — the single 45-degree hit — is not that box, it is just one point on the
 * outline, and for anything wider than it is tall it is far too small: a 152x38 rect leaves the
 * ray at (19, 19), so most of the node would go unchecked. Sweeping the slope instead finds the
 * corner that actually maximizes `|x| * |y|`, which for a rect is the rect and for a diamond is the
 * inscribed box rather than the extent. Every corner is fired into all four quadrants and reduced
 * to the componentwise smallest, so a shape with a lip on one side (a cylinder) is measured against
 * the side that lends least rather than assumed symmetric.
 */
function inscribedHalf(shape: ShapeDef, size: Size, m: DiagramMetrics): Point {
  if (!shape.anchor) {
    return { x: size.width / 2, y: size.height / 2 };
  }

  let best: Point = { x: 0, y: 0 };

  for (let i = 1; i <= PROBE_RAYS; i += 1) {
    // Open interval: a ray straight along an axis corners a box with no area either way.
    const angle = ((i / (PROBE_RAYS + 1)) * Math.PI) / 2;
    const half: Point = { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY };

    for (const sign of QUADRANTS) {
      const toward = { x: sign.x * Math.cos(angle), y: sign.y * Math.sin(angle) };
      const hit = shape.anchor(size, toward, m);

      half.x = Math.min(half.x, Math.abs(hit.x));
      half.y = Math.min(half.y, Math.abs(hit.y));
    }

    if (half.x * half.y > best.x * best.y) {
      best = half;
    }
  }

  return best;
}

/**
 * No edge may be drawn through a node that is not one of its endpoints.
 *
 * Two deliberate narrowings. Non-rectangular shapes are measured against the largest box their
 * outline contains rather than their bounding box, so a stroke clearing a diamond's corner is
 * correct even though it enters that diamond's extent; and the box is shrunk by the stroke width so
 * an edge legitimately running along an outline does not count. A node the edge is separated from by
 * a cluster border is skipped: a collapsed cluster is opaque to the level above it, so an edge that
 * neither enters nor leaves that cluster is not routed around its contents.
 */
export function assertNoEdgeThroughNode(scene: GraphScene, context: OutlineContext): void {
  const tolerance = context.metrics.strokeWidth;
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  const rects = clusterRects(scene.clusters);

  for (const node of scene.nodes) {
    const shape = resolveShape(context.shapes, node.shape);
    const size = { width: node.width, height: node.height };
    const half = inscribedHalf(shape, size, context.metrics);
    const box: Rect = {
      x: node.x - half.x + tolerance,
      y: node.y - half.y + tolerance,
      width: (half.x - tolerance) * 2,
      height: (half.y - tolerance) * 2,
    };
    const walls = rects.filter((rect) => holds(rect, node));

    for (const edge of scene.edges) {
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);

      if (
        edge.source === node.id ||
        edge.target === node.id ||
        walls.some((rect) => !holds(rect, source) && !holds(rect, target))
      ) {
        continue;
      }

      for (let i = 1; i < edge.points.length; i += 1) {
        expect(
          segmentHitsRect(edge.points[i - 1] as Point, edge.points[i] as Point, box),
          `edge ${edge.id} runs through node ${node.id}`,
        ).toBe(false);
      }
    }
  }
}

// ------------------------------------------------------------------------------ elbow routes

type Axis = 'x' | 'y';

function extentOf(box: Size, axis: Axis): number {
  return axis === 'x' ? box.width : box.height;
}

/**
 * The two legs of an L, or null when this edge is not one. An L is recognizable from its geometry
 * alone — three points, two perpendicular axis-aligned legs, and an arrival leg long enough to read
 * as a deliberate elbow — so nothing has to be marked in the scene, and any other route that comes
 * out that shape is held to the same standard.
 *
 * The arrival leg is measured before the cap trim, the same move `assertEndpointsOnOutline` makes:
 * the drawn leg is short by whatever the arrowhead pulled back, while `planElbow` enforced the bar
 * against the untrimmed entry point. Measuring what is drawn would leave every L whose real leg
 * lands within an arrow's length of the bar unrecognized, and so unasserted entirely.
 */
function elbowLegs(edge: SceneEdge, m: DiagramMetrics): { out: Axis; in: Axis } | null {
  const [from, corner, to] = edge.points;

  if (edge.points.length !== 3 || !from || !corner || !to) {
    return null;
  }

  const out: Axis = Math.abs(corner.x - from.x) < 0.01 ? 'y' : 'x';
  const arrive: Axis = out === 'y' ? 'x' : 'y';
  const square =
    Math.abs(corner[arrive] - from[arrive]) < 0.01 && Math.abs(to[out] - corner[out]) < 0.01;

  return square &&
    Math.abs(to[arrive] - corner[arrive]) + trimOf(edge.arrow, m) >= ELBOW_MIN_RUN - 0.01
    ? { out, in: arrive }
    : null;
}

/**
 * How far along a side a port may sit and still be square on the paint: the flat run plus half the
 * corner it may ride, and for a pointy side the whole half-extent, since a vertex has no run of its
 * own and a crowd on one fans out along the faces beside it. Capped either way by the half-extent
 * less an arrow's half-width, which is the most any outline lends.
 */
function reachAlong(shape: ShapeDef, box: Size, along: Axis, m: DiagramMetrics): number {
  const limit = Math.max(0, extentOf(box, along) / 2 - m.arrowWidth / 2);
  const sides = shape.sides?.(box, m);
  const flat = sides ? extentOf(sides.flat, along) : 0;

  // No run and no arc is a point — a diamond's vertex, a hexagon's — and lends the whole face.
  if (!sides || shape.ports === 'vertex' || (flat < 1e-6 && sides.corner < 1e-6)) {
    return limit;
  }

  return Math.min(Math.max(0, flat / 2 - m.arrowWidth / 2) + sides.corner / 2, limit);
}

function grow(rect: Rect, by: number): Rect {
  return {
    x: rect.x - by,
    y: rect.y - by,
    width: rect.width + by * 2,
    height: rect.height + by * 2,
  };
}

/**
 * Every L-routed edge is a clean elbow.
 *
 * Three properties, and between them they are the whole shape. The `d` draws exactly one rounded
 * corner, so nothing squared it off or bent it into a dogleg on the way to emission. Each end lands
 * on the part of its side an arrowhead can sit square on — the flat run of a rectangle or a stadium,
 * the axis vertex of a pointy shape — rather than partway down a slope or around a corner arc. And
 * both legs keep a stroke's clearance from every node that is not one of the edge's own endpoints,
 * which is the corridor the route was offered on: an L abandons the lane the layout chose, so the
 * empty space it claimed instead has to still be empty in the scene that came out.
 *
 * A connector bar is skipped at the attachment check. Its ports are spread along its length by
 * policy rather than placed on a side, which is a different question from this one.
 */
export function assertElbowRoutes(scene: GraphScene, context: OutlineContext): void {
  const m = context.metrics;
  const clearance = strokeGap(m);
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));

  for (const edge of scene.edges) {
    const legs = elbowLegs(edge, m);

    if (!legs) {
      continue;
    }

    // One subpath only: a label knocked out of this stroke splits it, and the corner may go with it.
    if ((edge.d.match(/M/g) ?? []).length === 1) {
      expect(
        (edge.d.match(/Q/g) ?? []).length,
        `edge ${edge.id} is an L drawn with something other than one rounded corner`,
      ).toBe(1);
    }

    for (const end of ['source', 'target'] as const) {
      const node = byId.get(edge[end]);
      const port = end === 'source' ? edge.points[0] : edge.points.at(-1);

      if (!node || !port) {
        continue;
      }

      const shape = resolveShape(context.shapes, node.shape);

      if (shape.ports === 'spread') {
        continue;
      }

      // The port slides along the side it sits on, which is across the leg that meets it.
      const along: Axis = end === 'source' ? legs.in : legs.out;
      const local = { x: port.x - node.x, y: port.y - node.y };
      const box = { width: node.width, height: node.height };

      expect(
        Math.abs(local[along]),
        `edge ${edge.id} meets ${node.id} off the flat of the side it leaves or arrives across`,
      ).toBeLessThanOrEqual(reachAlong(shape, box, along, m) + 0.5);
    }

    for (const node of scene.nodes) {
      if (node.id === edge.source || node.id === edge.target) {
        continue;
      }

      const corridor = grow(
        {
          x: node.x - node.width / 2,
          y: node.y - node.height / 2,
          width: node.width,
          height: node.height,
        },
        clearance,
      );

      for (let i = 1; i < edge.points.length; i += 1) {
        expect(
          segmentHitsRect(edge.points[i - 1] as Point, edge.points[i] as Point, corridor),
          `edge ${edge.id} runs an L leg within a stroke of node ${node.id}`,
        ).toBe(false);
      }
    }
  }
}

/** Along the rank axis, a non-reversed edge always moves forward. */
export function assertRankMonotone(scene: GraphScene, direction: Direction): void {
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));

  for (const edge of scene.edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);

    if (!source || !target || edge.reversed || edge.source === edge.target) {
      continue;
    }

    const delta =
      direction === 'TB' || direction === 'BT' ? target.y - source.y : target.x - source.x;
    const forward = direction === 'BT' || direction === 'RL' ? -delta : delta;

    expect(forward, `edge ${edge.id} runs backwards along ${direction}`).toBeGreaterThan(0);
  }
}

/**
 * No polyline doubles back on the rank axis for less than it takes to read as a detour.
 *
 * A long reversal is a route: an edge that leaves a cluster the way it came in, a back edge climbing
 * around the ranks it spans. A short one never is — nothing in the engine plans a jog of a few units
 * against the flow, so one in the scene is a pass that moved a point without the bound that put it
 * there, and it is drawn as a stroke folded over itself inside its own corner radii. The threshold is
 * the lane spacing, which is the smallest distance any pass here deliberately separates geometry by.
 */
export function assertNoRankBacktrack(scene: GraphScene, options: InvariantOptions): void {
  const axis = rankAxis(options.direction);
  const least = strokeGap(options.metrics);

  for (const edge of scene.edges) {
    if (edge.source === edge.target) {
      continue;
    }

    // Signed runs along the rank axis, consecutive moves the same way merged into one.
    const runs: number[] = [];

    for (let i = 1; i < edge.points.length; i += 1) {
      const delta = (edge.points[i] as Point)[axis] - (edge.points[i - 1] as Point)[axis];

      if (Math.abs(delta) < 0.01) {
        continue;
      }

      const last = runs.at(-1);

      if (last !== undefined && Math.sign(last) === Math.sign(delta)) {
        runs[runs.length - 1] = last + delta;
      } else {
        runs.push(delta);
      }
    }

    // A lateral segment moves nothing along the rank axis, so consecutive runs always alternate
    // direction: with more than one of them, every run is a reversal of the one beside it.
    for (const run of runs.length > 1 ? runs : []) {
      expect(
        Math.abs(run),
        `edge ${edge.id} doubles back ${Math.abs(run).toFixed(2)} along ${axis}, too short to be a detour`,
      ).toBeGreaterThanOrEqual(least - 0.01);
    }
  }
}

function walk(value: unknown, path: string, seen: (path: string, n: number) => void): void {
  if (typeof value === 'number') {
    seen(path, value);
    return;
  }

  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      walk(entry, `${path}[${index}]`, seen);
    }

    return;
  }

  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      walk(entry, `${path}.${key}`, seen);
    }
  }
}

export function assertFiniteCoordinates(scene: Scene): void {
  walk(scene, 'scene', (path, value) => {
    expect(Number.isFinite(value), `${path} is ${value}`).toBe(true);
  });

  if (scene.kind === 'sequence') {
    for (const message of scene.messages) {
      for (const d of [message.d, message.arrowD]) {
        expect(d ?? '').not.toMatch(/NaN|Infinity/);
      }
    }

    return;
  }

  if (scene.kind === 'pie') {
    for (const slice of scene.slices) {
      expect(slice.d).not.toMatch(/NaN|Infinity/);
    }

    return;
  }

  if (scene.kind === 'gantt') {
    for (const task of scene.tasks) {
      expect(task.milestoneD ?? '').not.toMatch(/NaN|Infinity/);
    }

    return;
  }

  for (const edge of scene.edges) {
    for (const d of [edge.d, edge.arrowD, edge.startArrowD]) {
      expect(d ?? '').not.toMatch(/NaN|Infinity/);
    }
  }

  for (const node of scene.nodes) {
    expect(node.outline).not.toMatch(/NaN|Infinity/);
  }
}

// ------------------------------------------------------------------------------ path quality

/** Every number an emitter is allowed to print: finite, and no finer than the emission grid. */
const NUMBER = /^-?\d+(?:\.\d{1,2})?$/;

/** Widest angle two tangents may differ by and still count as one continuous direction. */
const TANGENT_DEGREES = 3;

interface Command {
  letter: string;
  points: Point[];
}

/** Where a drawing command starts and ends going, when the geometry is long enough to have one. */
interface Link {
  letter: string;
  entry: Point | null;
  exit: Point | null;
}

function commandsOf(where: string, d: string): Command[] {
  const out: Command[] = [];

  for (const [, letter, body] of d.matchAll(/([A-Za-z])([^A-Za-z]*)/g)) {
    // The whole emitted vocabulary. Absolute only, and it also catches a `NaN` printed where a
    // number was meant: the walk would otherwise read it as two commands with nothing to draw.
    expect('MLQCAZ', `${where}: '${letter}' is not a command this library emits`).toContain(letter);

    const numbers: number[] = [];

    for (const [token] of (body as string).matchAll(/[^\s,]+/g)) {
      expect(NUMBER.test(token), `${where}: '${token}' is not a two-decimal number`).toBe(true);
      numbers.push(Number(token));
    }

    const points: Point[] = [];

    // Arc parameters run radii, rotation, two flags, then the endpoint; only the endpoint is a
    // point, and it is the last pair either way.
    for (let i = numbers.length % 2; i + 1 < numbers.length; i += 2) {
      points.push({ x: numbers[i] as number, y: numbers[i + 1] as number });
    }

    out.push({ letter: letter as string, points });
  }

  return out;
}

/** Unit direction, or null when the two points are too close together to have one. */
function unit(from: Point, to: Point): Point | null {
  const length = Math.hypot(to.x - from.x, to.y - from.y);

  // Five times the emission grid: below that a direction is rounding noise, not a heading.
  return length < 0.05 ? null : { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
}

function turnBetween(a: Point, b: Point): { degrees: number; sine: number } {
  const dot = Math.min(1, Math.max(-1, a.x * b.x + a.y * b.y));

  return { degrees: (Math.acos(dot) * 180) / Math.PI, sine: Math.abs(a.x * b.y - a.y * b.x) };
}

function linkOf(letter: string, from: Point, points: readonly Point[], to: Point): Link {
  const chord = unit(from, to);

  if (letter === 'Q') {
    const control = points[0] as Point;

    return { letter, entry: unit(from, control) ?? chord, exit: unit(control, to) ?? chord };
  }

  if (letter === 'C') {
    return {
      letter,
      entry: unit(from, points[0] as Point) ?? chord,
      exit: unit(points[1] as Point, to) ?? chord,
    };
  }

  return { letter, entry: chord, exit: chord };
}

function assertPath(where: string, d: string): void {
  let cursor: Point = { x: 0, y: 0 };
  let previous: Link | null = null;

  for (const { letter, points } of commandsOf(where, d)) {
    const to = points.at(-1);

    if (!to) {
      previous = null;
      continue;
    }

    if (letter === 'M' || letter === 'A') {
      // An arc is opaque to the tangent walk, and a move starts a new run: neither is a join.
      if (letter === 'A') {
        expect(to.x !== cursor.x || to.y !== cursor.y, `${where}: A draws nothing`).toBe(true);
      }

      cursor = to;
      previous = null;
      continue;
    }

    expect(to.x !== cursor.x || to.y !== cursor.y, `${where}: ${letter} draws nothing`).toBe(true);

    const link = linkOf(letter, cursor, points, to);

    if (previous?.exit && link.entry) {
      const turn = turnBetween(previous.exit, link.entry);

      if (previous.letter === 'L' && link.letter === 'L') {
        // A vertex the line runs straight through. Doubling back is collinear too, and is a route
        // that folded rather than a `d` that could have been shorter.
        const redundant = turn.degrees < 90 && turn.sine < COLLINEAR_SIN;

        expect(redundant, `${where}: a straight line is drawn as two`).toBe(false);
      } else {
        expect(
          turn.degrees,
          `${where}: the tangent breaks where ${previous.letter} meets ${letter}`,
        ).toBeLessThanOrEqual(TANGENT_DEGREES);
      }
    }

    cursor = to;
    previous = link;
  }
}

/**
 * Every `d` an edge or a message emits is well formed. Four properties, and the last is the one
 * worth the parser: numbers on the emission grid, no command that draws nothing, no vertex its own
 * neighbours run straight through, and a continuous tangent wherever a curve meets what comes next.
 * The first three are what naive path tooling trips over; the fourth is the whole reason a corner is
 * rounded at all, and the only check that catches a curve emitted with a control point misplaced.
 *
 * A move, an arc and the end of a subpath all break the tangent walk rather than being joins, so a
 * label knockout, a `--x` cap and an arrowhead are all measured for the rest and left alone here.
 */
export function assertPathQuality(scene: Scene): void {
  if (scene.kind === 'pie') {
    return;
  }

  if (scene.kind === 'gantt') {
    for (const task of scene.tasks) {
      if (task.milestoneD) {
        assertPath(`task ${task.id} milestone`, task.milestoneD);
      }
    }

    return;
  }

  const paths: [string, string | undefined][] =
    scene.kind === 'sequence'
      ? scene.messages.flatMap((message) => [
          [`message ${message.id}`, message.d],
          [`message ${message.id} arrow`, message.arrowD],
        ])
      : scene.edges.flatMap((edge) => [
          [`edge ${edge.id}`, edge.d],
          [`edge ${edge.id} arrow`, edge.arrowD],
          [`edge ${edge.id} start arrow`, edge.startArrowD],
        ]);

  for (const [where, d] of paths) {
    if (d) {
      assertPath(where, d);
    }
  }
}

// ----------------------------------------------------------------------------------- sequence

function contains(box: { x: number; y: number; width: number; height: number }, p: Point): boolean {
  return (
    p.x >= box.x - 0.01 &&
    p.x <= box.x + box.width + 0.01 &&
    p.y >= box.y - 0.01 &&
    p.y <= box.y + box.height + 0.01
  );
}

/**
 * The four properties a sequence layout cannot get wrong: participants read left to right in
 * declaration order, the cursor only ever moves down, an activation bar lives on its own lifeline,
 * and a frame encloses everything drawn while it was open.
 */
export function assertSequenceInvariants(scene: SequenceScene): void {
  assertFiniteCoordinates(scene);
  assertPathQuality(scene);

  const byId = new Map(scene.participants.map((participant) => [participant.id, participant]));

  for (const [index, participant] of scene.participants.entries()) {
    const previous = scene.participants[index - 1];

    if (previous) {
      expect(participant.x, `${participant.id} is not right of ${previous.id}`).toBeGreaterThan(
        previous.x,
      );
    }

    expect(participant.lifeline.y2).toBeGreaterThan(participant.lifeline.y1);
    expect(participant.lifeline.y1).toBeCloseTo(participant.box.y + participant.box.height, 6);
    expect(participant.lifeline.y2).toBeCloseTo(participant.footer.y, 6);
  }

  let previousY = Number.NEGATIVE_INFINITY;

  for (const message of scene.messages) {
    const y = message.points[0]?.y ?? 0;

    expect(y, `${message.id} runs back up the page`).toBeGreaterThanOrEqual(previousY);
    previousY = y;

    for (const point of message.points) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(scene.size.width);
      expect(point.y).toBeGreaterThan(byId.get(message.source)?.lifeline.y1 ?? 0);
      expect(point.y).toBeLessThanOrEqual(scene.size.height);
    }
  }

  for (const bar of scene.activations) {
    const participant = byId.get(bar.participant);

    expect(participant, `activation ${bar.id} has no participant`).toBeDefined();
    expect(bar.box.y).toBeGreaterThanOrEqual(participant?.lifeline.y1 ?? 0);
    expect(bar.box.y + bar.box.height).toBeLessThanOrEqual((participant?.lifeline.y2 ?? 0) + 0.01);
    expect(Math.abs(bar.box.x + bar.box.width / 2 - (participant?.x ?? 0))).toBeLessThanOrEqual(
      bar.box.width * (bar.depth + 1),
    );
  }

  for (const frame of scene.frames) {
    for (const message of scene.messages) {
      const start = message.points[0] as Point;

      if (start.y < frame.box.y || start.y > frame.box.y + frame.box.height) {
        continue;
      }

      for (const point of message.points) {
        expect(
          contains(frame.box, point),
          `${message.id} leaves ${frame.kind} frame ${frame.id}`,
        ).toBe(true);
      }
    }

    for (const section of frame.sections) {
      expect(section.y).toBeGreaterThanOrEqual(frame.box.y);
      expect(section.y).toBeLessThanOrEqual(frame.box.y + frame.box.height);
    }
  }
}

/** Layout is a pure function of its inputs: two runs must be byte-identical. */
export function assertDeterministic<T>(run: () => T): void {
  expect(run()).toEqual(run());
}

export function assertCrossingsNonIncreasing(result: OrderResult): void {
  expect(result.crossings).toBeLessThanOrEqual(result.initialCrossings);
}

export interface InvariantOptions extends OutlineContext {
  direction: Direction;
}

/** Everything except determinism, which needs the producing function rather than the scene. */
export function assertLayoutInvariants(scene: GraphScene, options: InvariantOptions): void {
  assertFiniteCoordinates(scene);
  assertPathQuality(scene);
  assertNoNodeOverlap(scene);
  assertEndpointsOnOutline(scene, options);
  assertPortsLeaveSquare(scene);
  assertLabelsUnstruck(scene, options);
  assertTitlesUnstruck(scene, options);
  assertNoEdgeThroughNode(scene, options);
  assertElbowRoutes(scene, options);
  assertRankMonotone(scene, options.direction);
  assertNoRankBacktrack(scene, options);
  assertClustersHold(scene);
}

// -------------------------------------------------------------------------------------- gantt

/**
 * The five properties a gantt layout cannot get wrong: every number is finite, every bar lies inside
 * the plotted area, rows step down the page and never share one, the axis reads left to right, and a
 * section band covers exactly the rows it owns.
 */
export function assertGanttInvariants(scene: GanttScene): void {
  assertFiniteCoordinates(scene);
  assertPathQuality(scene);

  const chart = scene.chart;

  // A chart with no tasks plots nothing, so it has no area; every other one has to have one.
  if (scene.tasks.length === 0) {
    expect(chart.width).toBe(0);
  } else {
    expect(chart.width).toBeGreaterThan(0);
  }
  expect(scene.size.width).toBeGreaterThanOrEqual(chart.x + chart.width);
  expect(scene.size.height).toBeGreaterThanOrEqual(chart.y + chart.height);

  for (const task of scene.tasks) {
    expect(task.bar.x, `${task.id} starts left of the chart`).toBeGreaterThanOrEqual(
      chart.x - 0.01,
    );
    expect(
      task.bar.x + task.bar.width,
      `${task.id} runs past the end of the chart`,
    ).toBeLessThanOrEqual(chart.x + chart.width + 0.01);
    expect(task.bar.y).toBeGreaterThanOrEqual(chart.y - 0.01);
    expect(task.bar.y + task.bar.height).toBeLessThanOrEqual(chart.y + chart.height + 0.01);
    if (task.milestone) {
      expect(task.bar.width, `${task.id} is a milestone with a length`).toBe(0);
      expect(task.milestoneD, `${task.id} is a milestone with no diamond`).toBeDefined();
    } else {
      expect(task.bar.width, `${task.id} is a bar with no width`).toBeGreaterThan(0);
      expect(task.milestoneD, `${task.id} is a bar with a diamond`).toBeUndefined();
    }

    expect(task.label.box.lines.length, `${task.id} has no measured label`).toBeGreaterThan(0);
    expect(scene.sections[task.section], `${task.id} is in no section`).toBeDefined();
  }

  const rows = new Map<number, { x: number; width: number; id: string }[]>();

  for (const task of scene.tasks) {
    const row = Math.round(task.bar.y * 100) / 100;

    rows.set(row, [
      ...(rows.get(row) ?? []),
      { x: task.bar.x, width: task.bar.width, id: task.id },
    ]);
  }

  for (const [row, bars] of rows) {
    const ordered = [...bars].sort((a, b) => a.x - b.x);

    for (const [index, bar] of ordered.entries()) {
      const previous = ordered[index - 1];

      if (previous) {
        expect(bar.x, `${bar.id} overlaps ${previous.id} on row ${row}`).toBeGreaterThanOrEqual(
          previous.x + previous.width - 0.01,
        );
      }
    }
  }

  let previousX = Number.NEGATIVE_INFINITY;

  for (const tick of scene.ticks) {
    expect(tick.x, 'the axis runs backwards').toBeGreaterThan(previousX);
    previousX = tick.x;
    expect(tick.x).toBeGreaterThanOrEqual(chart.x - 0.01);
    expect(tick.x).toBeLessThanOrEqual(chart.x + chart.width + 0.01);
    expect(tick.label.box.lines.length).toBeGreaterThan(0);
  }

  for (const section of scene.sections) {
    const owned = scene.tasks.filter((task) => task.section === section.index);

    for (const task of owned) {
      expect(task.bar.y, `${task.id} sits above its own section band`).toBeGreaterThanOrEqual(
        section.band.y - 0.01,
      );
      expect(
        task.bar.y + task.bar.height,
        `${task.id} sits below its own section band`,
      ).toBeLessThanOrEqual(section.band.y + section.band.height + 0.01);
    }

    if (section.label) {
      expect(section.label.x + section.label.box.width / 2).toBeLessThanOrEqual(chart.x + 0.01);
    }
  }
}
