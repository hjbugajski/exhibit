/*
 * Cross-boundary edge routing.
 *
 * A collapsed cluster is opaque to the layered engine, so an edge crossing its border knows only the
 * border point: the chord from there to the endpoint inside runs blind through whatever the cluster
 * contains, which is how a stroke ends up drawn under an unrelated node. The one region provably
 * free of geometry is the padding band `clusterPads` reserves on every side, so a crossing edge is
 * detoured along it — in through a gutter lane, along the rank axis, then across into the endpoint
 * on a rank gap no node occupies. Edges sharing a gutter are spread across its width.
 *
 * Everything here is in final space and works off the rank axis alone, so all four directions share
 * one implementation. The title band is always at the final-space top of a cluster box, which is the
 * low side of the rank axis for `TB`/`BT` and of the cross axis for `LR`/`RL`; a lane on that side
 * starts below the glyphs rather than running through them.
 */

import type { DiagramMetrics } from '../../metrics.ts';
import type { Point, Rect, ShapeDef } from '../../types.ts';
import { segmentHitsRect } from '../geometry/intersect.ts';
import { titlePad } from './cluster.ts';
import { sideRun } from './ports.ts';
import type { Axis } from './route.ts';
import { separate, strokeGap } from './spacing.ts';

/** A box inside a cluster, with the id of the node it belongs to (`null` for a nested cluster). */
export interface GutterObstacle {
  node: string | null;
  rect: Rect;
}

export interface GutterBand {
  /** Cluster id; edges sharing a gutter are grouped by it. */
  id: string;
  box: Rect;
  /** Title band reserved at the final-space top of the box; 0 when the cluster has no title. */
  titleHeight: number;
  /** Everything laid out inside the cluster, at any depth. */
  contents: readonly GutterObstacle[];
}

export interface GutterPlan {
  cluster: string;
  side: 'low' | 'high';
  /** Cross-axis span the lane may take, once the title band is excluded. */
  strip: readonly [number, number];
  /** Rank coordinate of the cluster border the detour crosses. */
  border: number;
  /** Rank coordinate of the cross-axis move between the lane and the endpoint. */
  jog: number;
  /** Cross coordinate of the endpoint. */
  cross: number;
  /** True when the detour enters the cluster (target end), false when it leaves it (source end). */
  enter: boolean;
}

export interface GutterInput {
  band: GutterBand;
  /** The endpoint inside the cluster. */
  node: Rect;
  nodeId: string;
  /** The point the edge reaches the cluster from, or leaves it toward; outside the box. */
  outside: Point;
  /** The polyline the engine draws for this edge with no detour — the thing being judged. */
  drawn: readonly Point[];
  enter: boolean;
  axis: Axis;
  m: DiagramMetrics;
}

const cross = (axis: Axis): Axis => (axis === 'y' ? 'x' : 'y');

function low(rect: Rect, axis: Axis): number {
  return axis === 'x' ? rect.x : rect.y;
}

function high(rect: Rect, axis: Axis): number {
  return axis === 'x' ? rect.x + rect.width : rect.y + rect.height;
}

function centre(rect: Rect, axis: Axis): number {
  return (low(rect, axis) + high(rect, axis)) / 2;
}

function face(rect: Rect, axis: Axis, direction: number): number {
  return direction > 0 ? high(rect, axis) : low(rect, axis);
}

function pointAt(axis: Axis, rank: number, at: number): Point {
  return axis === 'y' ? { x: at, y: rank } : { x: rank, y: at };
}

/**
 * Padding reserved on one side of a cluster box. The title band always sits at the final-space top,
 * which is the low side of whichever axis final-space `y` became.
 */
function padOf(axis: Axis, side: 'low' | 'high', band: GutterBand, m: DiagramMetrics): number {
  return axis === 'y' && side === 'low' ? titlePad(m, band.titleHeight) : m.clusterPadding;
}

/**
 * The band a lane may run down: the padding reserved on that side, less whatever the title glyphs
 * take. A title is centred in its own band, so half the padding is still free below it.
 */
function freeStrip(
  band: GutterBand,
  axis: Axis,
  side: 'low' | 'high',
  m: DiagramMetrics,
): readonly [number, number] {
  const pad = padOf(axis, side, band, m);

  if (side === 'high') {
    const edge = high(band.box, axis);

    return [edge - pad, edge];
  }

  const edge = low(band.box, axis);
  const glyphs = pad > m.clusterPadding ? m.clusterPadding / 2 + band.titleHeight : 0;

  return [edge + glyphs, edge + pad];
}

function overlaps(a: readonly [number, number], b: readonly [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

function span(rect: Rect, axis: Axis): readonly [number, number] {
  return [low(rect, axis), high(rect, axis)];
}

/** A nested cluster the endpoint lives in is scenery, not an obstacle — the route has to enter it. */
function surrounds(outer: Rect, inner: Rect): boolean {
  return (
    outer.x <= inner.x &&
    outer.y <= inner.y &&
    outer.x + outer.width >= inner.x + inner.width &&
    outer.y + outer.height >= inner.y + inner.height
  );
}

/**
 * Does the route the engine draws without a detour already miss everything inside the cluster?
 *
 * This used to be a model of that route — border point to endpoint, elbowed the way `routeEdge`
 * elbows. It cannot be: `routeEdge` orthogonalizes the whole trail at once, lands on the endpoint's
 * outline rather than its centre, and applies ports and parallel offsets, so the modelled elbow sat
 * up to half a node away from the drawn one. That error went both ways — detours invented for
 * routes that were already clear, and missed for routes that were not — so the caller hands over
 * the real polyline instead.
 */
function drawnIsClear(drawn: readonly Point[], obstacles: readonly Rect[]): boolean {
  for (let i = 1; i < drawn.length; i += 1) {
    for (const rect of obstacles) {
      if (segmentHitsRect(drawn[i - 1] as Point, drawn[i] as Point, rect)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Plans the part of a route that runs inside a cluster, or returns `null` when the direct chord is
 * already clear and a detour would only add corners.
 */
export function planGutter(input: GutterInput): GutterPlan | null {
  const { band, node, axis, m } = input;
  const lateral = cross(axis);
  const travel = input.enter
    ? centre(node, axis) - input.outside[axis]
    : input.outside[axis] - centre(node, axis);
  const forward = Math.sign(travel) || 1;
  const obstacles = band.contents
    .filter((entry) => entry.node !== input.nodeId && !surrounds(entry.rect, node))
    .map((entry) => entry.rect);
  // The endpoint's own rank band is off limits; the detour turns in just short of it.
  const approach = input.enter ? -forward : forward;
  const nodeFace = face(node, axis, approach);

  if (obstacles.length === 0 || drawnIsClear(input.drawn, obstacles)) {
    return null;
  }

  const inner: readonly [number, number] = [
    low(band.box, axis) + padOf(axis, 'low', band, m) - m.clusterPadding / 2,
    high(band.box, axis) - padOf(axis, 'high', band, m) + m.clusterPadding / 2,
  ];
  // The border the detour crosses and the side the jog sits on are the same side of the endpoint.
  const border = face(band.box, axis, approach);
  const candidates = (['low', 'high'] as const)
    .map((side) => {
      const strip = freeStrip(band, lateral, side, m);
      const reach: readonly [number, number] = [
        Math.min(strip[0], low(node, lateral)),
        Math.max(strip[1], high(node, lateral)),
      ];
      const inLine = obstacles.filter((rect) => overlaps(span(rect, lateral), reach));
      let limit: number | null = null;

      for (const rect of inLine) {
        const near = face(rect, axis, -approach);

        if (approach * (near - nodeFace) > 0 && (limit === null || approach * (near - limit) < 0)) {
          limit = near;
        }
      }

      const raw = limit === null ? nodeFace + (approach * m.rankSep) / 2 : (nodeFace + limit) / 2;
      const jog = Math.min(Math.max(raw, inner[0]), inner[1]);
      const at = centre(node, lateral);
      // The lane can land anywhere in the strip, so verify against the end furthest from the
      // endpoint: that is the longest the cross-axis move can ever be.
      const worst = Math.abs(strip[0] - at) > Math.abs(strip[1] - at) ? strip[0] : strip[1];
      const legs: readonly (readonly [Point, Point])[] = [
        [pointAt(axis, border, worst), pointAt(axis, jog, worst)],
        [pointAt(axis, jog, worst), pointAt(axis, jog, at)],
        [pointAt(axis, jog, at), pointAt(axis, nodeFace, at)],
      ];

      return {
        side,
        strip,
        jog,
        distance: Math.abs(at - worst),
        clear:
          strip[1] > strip[0] &&
          !legs.some(([a, b]) => obstacles.some((rect) => segmentHitsRect(a, b, rect))),
      };
    })
    .filter((entry) => entry.clear)
    .sort((a, b) => a.distance - b.distance);
  const chosen = candidates[0];

  if (!chosen) {
    return null;
  }

  return {
    cluster: band.id,
    side: chosen.side,
    strip: chosen.strip,
    border,
    jog: chosen.jog,
    cross: centre(node, lateral),
    enter: input.enter,
  };
}

export interface TitleLaneInput {
  /** Every cluster title plate in the diagram; see `titleRect`. */
  plates: readonly Rect[];
  /** Border box of the cluster the endpoint is buried in. */
  box: Rect;
  /** The endpoint inside the cluster. */
  node: Rect;
  shape: ShapeDef;
  /** Port the pass gave that end: the lane the crossing runs on, and the side it arrives across. */
  port: Point;
  /** The point the edge reaches the cluster from, or leaves it toward; outside the box. */
  outside: Point;
  /** Boxes the moved crossing may not run through — every node but this one, every label. */
  obstacles: readonly Rect[];
  /** Lanes edges already dodged onto this same side of this same endpoint. */
  taken: readonly number[];
  axis: Axis;
  m: DiagramMetrics;
}

/**
 * Where a route crosses a cluster border when the title plate stands in the lane it was given, or
 * null when that lane is already clear, or when the endpoint has no side left to be met on.
 *
 * The plate is opaque by design — it is what makes a title readable over a tinted cluster — so a
 * stroke that runs under one is not drawn faintly, it is cut in half, and the arrowhead beyond the
 * cut reads as a second edge. The band the title sits in is reserved height only: an edge entering
 * from the title side has to cross it, and the whole of the freedom it has in doing so is which lane
 * it crosses on. So the lane moves to the near edge of the plate and the port moves with it, which is
 * a straight run past the title rather than a stroke through it — and when the endpoint's own side is
 * too short to reach such a lane, nothing here is better than what it already has.
 */
export function planTitleLane(input: TitleLaneInput): Point | null {
  const { plates, box, node, port, axis, m } = input;
  const lateral = cross(axis);
  /*
   * A plate, less half a stroke either way — the same slack `crosses` gives an edge label, and for
   * the same reason: a lane that grazes the plate with the outer half of its width is a lane running
   * beside the title, and moving it a fraction of a pixel to say so buys a corner and nothing else. A
   * lane offered instead sits a whole stroke out, so it clears the glyphs by the plate's own padding.
   */
  const half = m.strokeWidth / 2;
  const keepOuts = plates.map((plate) => ({
    x: plate.x + half,
    y: plate.y + half,
    width: plate.width - m.strokeWidth,
    height: plate.height - m.strokeWidth,
  }));
  const approach = Math.sign(centre(node, axis) - input.outside[axis]) || 1;
  const border = face(box, axis, -approach);
  const entry = face(node, axis, -approach);

  // A port on a side beside the node is not the end of a lane across the band; it has no lane to move.
  if (Math.abs(port[axis] - entry) > 0.5) {
    return null;
  }

  const legAt = (at: number): readonly [Point, Point] => [
    pointAt(axis, border, at),
    pointAt(axis, entry, at),
  ];
  const hits = (leg: readonly [Point, Point], rects: readonly Rect[]): boolean =>
    rects.some((rect) => segmentHitsRect(leg[0], leg[1], rect));
  const inTheWay = plates.filter((_, index) =>
    hits(legAt(port[lateral]), [keepOuts[index] as Rect]),
  );

  if (inTheWay.length === 0) {
    return null;
  }

  const reach = sideRun(input.shape, { width: node.width, height: node.height }, axis, m);
  const middle = centre(node, lateral);
  const gap = strokeGap(m);
  // Every side of every plate in the way, nearest first: a lane clear of one may still cross another,
  // which is the case where the route crosses into a cluster and on into one nested inside it. A lane
  // another edge into this side already took is stepped past rather than shared — two edges asking
  // for one lane are split across it by the spacing pass, which puts one of them back under the
  // glyphs both were moved out from under.
  const lanes = inTheWay
    .flatMap((plate) => [
      { at: high(plate, lateral) + m.strokeWidth, outward: 1 },
      { at: low(plate, lateral) - m.strokeWidth, outward: -1 },
    ])
    .map(({ at, outward }) => {
      let lane = at;

      while (input.taken.some((other) => Math.abs(other - lane) < gap)) {
        lane += outward * gap;
      }

      return lane;
    })
    .filter((lane) => Math.abs(lane - middle) <= reach)
    .sort((a, b) => Math.abs(a - port[lateral]) - Math.abs(b - port[lateral]));

  for (const lane of lanes) {
    const leg = legAt(lane);

    if (!hits(leg, [...keepOuts, ...input.obstacles])) {
      return leg[0];
    }
  }

  return null;
}

/**
 * Lane coordinates for the `count` edges sharing one gutter: spread evenly across the strip, kept a
 * stroke clear of the border it runs beside, and pushed apart when even spacing leaves two of them
 * too close to read as two lanes. A padding band is narrow enough that a third edge routinely wants
 * more room than there is, and then evenly spaced is all there is to give.
 */
export function gutterLanes(plan: GutterPlan, count: number, m: DiagramMetrics): number[] {
  const inset = m.strokeWidth * 2;
  const min = plan.strip[0] + inset;
  const max = plan.strip[1] - inset;

  if (max <= min) {
    return Array.from({ length: count }, () => (plan.strip[0] + plan.strip[1]) / 2);
  }

  return separate(
    Array.from({ length: count }, (_, slot) => min + ((max - min) * (slot + 1)) / (count + 1)),
    Array.from({ length: Math.max(0, count - 1) }, () => strokeGap(m)),
    min,
    max,
  );
}

/** The detour points, in route order: border first when entering, border last when leaving. */
export function gutterPoints(plan: GutterPlan, lane: number, axis: Axis): Point[] {
  const points = [
    pointAt(axis, plan.border, lane),
    pointAt(axis, plan.jog, lane),
    pointAt(axis, plan.jog, plan.cross),
  ];

  return plan.enter ? points : points.reverse();
}
