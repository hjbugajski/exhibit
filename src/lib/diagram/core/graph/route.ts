/*
 * Edge routing, in final space (the direction transform has already run). Order matters:
 * centres -> clip to the real outlines -> parallel offset -> elbow insertion -> arrow trimming.
 * Clipping before the elbow keeps every jog in the free band between ranks; trimming last means the
 * stroke stops exactly where the arrowhead begins instead of poking through it.
 *
 * Arrow `d` strings are not emitted here: the scene is translated to its padded origin first, and
 * rounding happens once, at emit.
 */

import type { DiagramMetrics } from '../../metrics.ts';
import type { ArrowKind, EdgeShape, Point, Rect, ShapeDef, Size } from '../../types.ts';
import { arrowHead } from '../geometry/arrow.ts';
import { clipSegmentToRect, rayRect, rectsOverlap } from '../geometry/intersect.ts';
import { distance } from '../geometry/path.ts';
import type { Direction } from './model.ts';
import { portPoint } from './ports.ts';
import { strokeGap } from './spacing.ts';

export type Axis = 'x' | 'y';

export function rankAxis(direction: Direction): Axis {
  return direction === 'TB' || direction === 'BT' ? 'y' : 'x';
}

/** Side the self-loop lobe leaves from: always layout +x, which is where clearance was reserved. */
export function loopSide(direction: Direction): Axis {
  return direction === 'TB' || direction === 'BT' ? 'x' : 'y';
}

export interface RouteEndpoint {
  centre: Point;
  size: Size;
  shape: ShapeDef;
}

/** A box routing has to stay out of: a node, a cluster's reserved title band, an edge label. */
export interface RouteObstacle {
  /** Node the box belongs to, so an edge's own endpoints can be skipped; null for a band or label. */
  node: string | null;
  rect: Rect;
}

export interface RouteInput {
  source: RouteEndpoint;
  target: RouteEndpoint;
  /** Virtual-chain points in author order, final space. */
  interior: readonly Point[];
  /** Border of the collapsed cluster an endpoint is buried in, when it is. */
  sourceBorder?: Rect;
  targetBorder?: Rect;
  /**
   * Gutter detour through that cluster, when the direct chord from the border would run through its
   * contents; see `gutter.ts`. A detour already contains the border crossing, so it replaces it.
   */
  sourceDetour?: readonly Point[];
  targetDetour?: readonly Point[];
  arrow: ArrowKind;
  startArrow: ArrowKind;
  /** Fixed outline point assigned by `ports.ts`, replacing the ray anchor at that end. */
  sourcePort?: Point;
  targetPort?: Point;
  /** Perpendicular bulge index for parallel edges; 0 leaves the chord alone. */
  offset: number;
  /** Draw this one as an L rather than an elbowed chord; see `elbowed` and `planElbow`. */
  elbow?: boolean;
  /**
   * Boxes this route may not be straightened into — every node but its own two ends, every cluster
   * title band, every edge label including its own. `alignPortRun` is the only reader, and an empty
   * list is the claim that the space around this route is empty, not that it is unknown.
   */
  obstacles?: readonly Rect[];
}

export interface RoutedEdge {
  points: Point[];
  /** Untrimmed ends, kept so the arrow `d` can be emitted after the scene is translated. */
  arrowTip: Point | null;
  startArrowTip: Point | null;
  /** Where an edge label goes when no label virtual node carried it (self-loops, short edges). */
  labelPoint: Point;
  /** Unit direction to push that label along, away from the stroke. */
  labelNormal: Point;
}

const NEAR = 0.01;

function same(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < NEAR && Math.abs(a.y - b.y) < NEAR;
}

function dedupe(points: readonly Point[]): Point[] {
  const out: Point[] = [];

  for (const point of points) {
    const previous = out.at(-1);

    if (!previous || !same(previous, point)) {
      out.push(point);
    }
  }

  return out;
}

/** Boundary point of a node's outline in the direction of `toward`, in absolute coordinates. */
export function anchorOn(endpoint: RouteEndpoint, toward: Point, m: DiagramMetrics): Point {
  const local = { x: toward.x - endpoint.centre.x, y: toward.y - endpoint.centre.y };
  const hit = endpoint.shape.anchor
    ? endpoint.shape.anchor(endpoint.size, local, m)
    : rayRect(endpoint.size, local);

  return { x: endpoint.centre.x + hit.x, y: endpoint.centre.y + hit.y };
}

/**
 * Where an edge attaches, in absolute coordinates: the boundary point the shape's port policy asks
 * for. A self-loop keeps the raw anchor — it needs two distinct points on one side, and a policy
 * that collapses a side to a single port would draw it as a line out and straight back.
 */
function portOn(endpoint: RouteEndpoint, toward: Point, m: DiagramMetrics, axis: Axis): Point {
  const local = { x: toward.x - endpoint.centre.x, y: toward.y - endpoint.centre.y };
  const hit = portPoint(endpoint.shape, endpoint.size, local, m, axis);

  return { x: endpoint.centre.x + hit.x, y: endpoint.centre.y + hit.y };
}

/**
 * Which way an end buried in a collapsed cluster faces: where a chord aimed at `toward` leaves the
 * cluster's box, measured from the box's own centre. It is the cluster that is opaque to the level
 * above, so this is one locus for every end inside it — both ends of an edge aim at the same point
 * and the ports they are given agree, which is an edge drawn as one run rather than one with a jog.
 */
export function borderPoint(border: Rect, toward: Point): Point {
  const centre = { x: border.x + border.width / 2, y: border.y + border.height / 2 };
  const hit = rayRect(border, { x: toward.x - centre.x, y: toward.y - centre.y });

  return { x: centre.x + hit.x, y: centre.y + hit.y };
}

/**
 * Where the chord from `from` to `toward` leaves that box, or null when it never crosses it. This is
 * the waypoint the trail is actually drawn through, and it is a point on the chord and nowhere else.
 *
 * The aim is the wrong answer here for the reason the cluster is not the node: an endpoint sits
 * wherever the packing put it inside a box that may be far wider, so the ray from the box's centre
 * can land on the side face past the node's own port. The trail then runs out to that crossing and
 * straight back — three collinear points the align pass flattens into a corner with nowhere to turn,
 * emitted as a `Q` that draws nothing over a stroke painted twice.
 */
function borderCrossing(border: Rect, from: Point, toward: Point): Point | null {
  const clip = clipSegmentToRect(from, toward, border);

  if (!clip) {
    return null;
  }

  const t = clip[1];

  return { x: from.x + (toward.x - from.x) * t, y: from.y + (toward.y - from.y) * t };
}

/**
 * Turns each diagonal hop into a rank-axis / cross-axis elbow at the midpoint of the hop. `orthoD`
 * then rounds the corners, which is the whole of the `ortho` look.
 */
export function orthogonalize(points: readonly Point[], axis: Axis): Point[] {
  if (points.length < 2) {
    return [...points];
  }

  const cross: Axis = axis === 'y' ? 'x' : 'y';
  const out: Point[] = [points[0] as Point];

  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1] as Point;
    const next = points[i] as Point;

    if (
      Math.abs(next[cross] - previous[cross]) > 0.5 &&
      Math.abs(next[axis] - previous[axis]) > 0.5
    ) {
      const middle = (previous[axis] + next[axis]) / 2;

      out.push(
        axis === 'y' ? { x: previous.x, y: middle } : { x: middle, y: previous.y },
        axis === 'y' ? { x: next.x, y: middle } : { x: middle, y: next.y },
      );
    }

    out.push(next);
  }

  return dedupe(out);
}

/**
 * The two legs of an L: out along the rank axis to the target's row, one corner, in across its side.
 * `planElbow` chose this shape and proved both legs clear, so whatever the trail bent at in between
 * — a virtual chain, a cluster border crossing — is dropped rather than followed.
 */
function elbowed(from: Point, to: Point, axis: Axis): Point[] {
  return [from, axis === 'y' ? { x: from.x, y: to.y } : { x: to.x, y: from.y }, to];
}

/** Bulges the chord of a parallel edge sideways so the pair does not draw on top of itself. */
function bulge(points: readonly Point[], offset: number): Point[] {
  const first = points[0] as Point;
  const last = points.at(-1) as Point;
  const length = distance(first, last);

  if (offset === 0 || points.length !== 2 || length < NEAR) {
    return [...points];
  }

  const normal = { x: -(last.y - first.y) / length, y: (last.x - first.x) / length };
  const middle = {
    x: (first.x + last.x) / 2 + normal.x * offset,
    y: (first.y + last.y) / 2 + normal.y * offset,
  };

  return [first, middle, last];
}

function trimEnd(points: Point[], kind: ArrowKind, m: DiagramMetrics): Point | null {
  if (kind === 'none' || points.length < 2) {
    return null;
  }

  const tip = points.at(-1) as Point;
  const from = points.at(-2) as Point;
  const head = arrowHead(kind, tip, from, m);

  if (!head) {
    return null;
  }

  // A segment shorter than the head would invert if it were trimmed; draw the head over it instead.
  if (distance(from, tip) > m.arrowLength) {
    points[points.length - 1] = head.anchor;
  }

  return tip;
}

function trimStart(points: Point[], kind: ArrowKind, m: DiagramMetrics): Point | null {
  if (kind === 'none' || points.length < 2) {
    return null;
  }

  const tip = points[0] as Point;
  const from = points[1] as Point;
  const head = arrowHead(kind, tip, from, m);

  if (!head) {
    return null;
  }

  if (distance(from, tip) > m.arrowLength) {
    points[0] = head.anchor;
  }

  return tip;
}

/** Cardinal side a port sits on, relative to the node's own extent: the axis it is furthest along. */
function portSide(size: Size, local: Point): Axis {
  return Math.abs(local.x) * size.height >= Math.abs(local.y) * size.width ? 'x' : 'y';
}

/**
 * One step straight out of the outline, for a port on a side the elbow pass does not leave through.
 * Every diagonal hop is turned into rank-axis legs first, so an edge attached to a left or right
 * side in a top-down graph would set off along the outline it just left instead of away from it.
 * The step is an arrowhead plus a corner: long enough to trim a head onto and to round the turn
 * after it, and never further than the point it is heading for.
 */
function stubOut(
  endpoint: RouteEndpoint,
  port: Point,
  next: Point,
  axis: Axis,
  m: DiagramMetrics,
): Point | null {
  const local = { x: port.x - endpoint.centre.x, y: port.y - endpoint.centre.y };
  const side = portSide(endpoint.size, local);

  if (side === axis) {
    return null;
  }

  const sign = Math.sign(local[side]);
  const room = (next[side] - port[side]) * sign;

  if (room <= NEAR) {
    return null;
  }

  const step = Math.min(m.arrowLength + m.cornerRadius, room);

  return side === 'x'
    ? { x: port.x + sign * step, y: port.y }
    : { x: port.x, y: port.y + sign * step };
}

/** The band a run sweeps moving from `run` to `port`, over the trail from `end` to `beyond`. */
function sweptBand(
  points: readonly Point[],
  end: number,
  beyond: number,
  axis: Axis,
  port: number,
  run: number,
  m: DiagramMetrics,
): Rect {
  const from = (points[end] as Point)[axis];
  const to = (points[beyond] as Point)[axis];
  const along: [number, number] = [
    Math.min(from, to) - m.strokeWidth,
    Math.max(from, to) + m.strokeWidth,
  ];
  const across: [number, number] = [
    Math.min(port, run) - m.strokeWidth,
    Math.max(port, run) + m.strokeWidth,
  ];
  const [x, y] = axis === 'y' ? [across, along] : [along, across];

  return { x: x[0], y: y[0], width: x[1] - x[0], height: y[1] - y[0] };
}

/**
 * The run next to a port, pulled onto the port's own cross coordinate — mutates `points`, which is
 * a fresh array by the time this runs, and answers how far along the trail the pull reached.
 *
 * The spacing pass slides an end along its side by up to one slot to keep it clear of its
 * neighbours, but the trail it joins was laid out to the node's centre. A slot is exactly the room
 * an arrowhead needs, so the leg out of a spaced port jogs straight back onto the corridor the
 * neighbour it was spaced away from arrives on, and the two strokes are drawn on top of each other
 * for as long as the corridor lasts. Moving the run instead of the port keeps them apart: the jog
 * disappears, and the run moves by less than the arrowhead that earned it.
 *
 * Past a slot the run is no longer a corridor this edge was pushed off — it is a lane the ordering
 * pass chose, and giving it up is the same claim about empty space an L-route makes, so it is held
 * to the same standard and only made when the band between the two is provably clear. Without that
 * the pull stops at an arbitrary width and a lane a hair too far away keeps a jog of its own: two
 * turns in opposite directions where one would do, which reads as a wobble rather than a route.
 */
function alignPortRun(
  points: Point[],
  end: number,
  far: number,
  axis: Axis,
  m: DiagramMetrics,
  obstacles: readonly Rect[],
): number {
  const lateral: Axis = axis === 'y' ? 'x' : 'y';
  const step = Math.sign(far - end);
  const at = end + step;

  if (at === far) {
    return end;
  }

  const port = (points[end] as Point)[lateral];
  const run = (points[at] as Point)[lateral];

  if (Math.abs(port - run) < NEAR) {
    return end;
  }

  let last = at;

  while (last + step !== far && Math.abs((points[last + step] as Point)[lateral] - run) < NEAR) {
    last += step;
  }

  if (Math.abs(port - run) > strokeGap(m) + NEAR) {
    const band = sweptBand(points, end, last + step, axis, port, run, m);

    if (obstacles.some((rect) => rectsOverlap(band, rect))) {
      return end;
    }
  }

  for (let i = at; i !== last + step; i += step) {
    points[i] = { ...(points[i] as Point), [lateral]: port };
  }

  return last;
}

/**
 * The trail with each end's first run aligned to its port; see `alignPortRun`. Only an end the
 * elbow pass leaves through, which is the end whose spacing runs across the route: a port on a side
 * beside the node steps out of it instead (`stubOut`), and pulling its run over would take away the
 * room that step needs.
 *
 * One run can answer to both ports, and then only one of them gets it — the far end may not take
 * back what the near end already moved, or the trail is dragged one way and then the other. Which
 * one wins decides where the single remaining jog sits, not how wide it is, so the end with less to
 * correct goes first: the lane the ordering pass chose is departed from as little as possible.
 */
function aligned(
  points: readonly Point[],
  input: RouteInput,
  axis: Axis,
  m: DiagramMetrics,
): Point[] {
  const out = [...points];
  const lateral: Axis = axis === 'y' ? 'x' : 'y';
  const last = out.length - 1;
  const across = (endpoint: RouteEndpoint, port: Point): boolean =>
    portSide(endpoint.size, { x: port.x - endpoint.centre.x, y: port.y - endpoint.centre.y }) ===
    axis;
  const pulls = (
    [
      { end: 0, far: last, endpoint: input.source },
      { end: last, far: 0, endpoint: input.target },
    ] as const
  ).filter(({ end, endpoint }) => across(endpoint, out[end] as Point));
  const offsetOf = ({ end, far }: { end: number; far: number }): number => {
    const at = end + Math.sign(far - end);

    return at === far ? 0 : Math.abs((out[end] as Point)[lateral] - (out[at] as Point)[lateral]);
  };
  let reached = 0;

  for (const [index, pull] of pulls.sort((a, b) => offsetOf(a) - offsetOf(b)).entries()) {
    reached = alignPortRun(
      out,
      pull.end,
      index === 0 ? pull.far : reached,
      axis,
      m,
      input.obstacles ?? [],
    );
  }

  return dedupe(out);
}

/** The trail with a step out of each end that needs one; see `stubOut`. */
function stubbed(
  points: readonly Point[],
  input: RouteInput,
  axis: Axis,
  m: DiagramMetrics,
): Point[] {
  const first = points[0] as Point;
  const last = points.at(-1) as Point;
  const out = stubOut(input.source, first, points[1] as Point, axis, m);
  const back = stubOut(input.target, last, points.at(-2) as Point, axis, m);

  return dedupe([
    first,
    ...(out ? [out] : []),
    ...points.slice(1, -1),
    ...(back ? [back] : []),
    last,
  ]);
}

function midpointOf(points: readonly Point[]): Point {
  const middle = Math.floor(points.length / 2);

  if (points.length % 2 === 1) {
    return points[middle] as Point;
  }

  const a = points[middle - 1] as Point;
  const b = points[middle] as Point;

  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function routeEdge(
  input: RouteInput,
  m: DiagramMetrics,
  edgeShape: EdgeShape,
  axis: Axis,
): RoutedEdge {
  const centres: Point[] = [input.source.centre];

  if (input.sourceDetour) {
    centres.push(...input.sourceDetour);
  } else if (input.sourceBorder) {
    const crossing = borderCrossing(
      input.sourceBorder,
      input.source.centre,
      input.interior[0] ?? input.target.centre,
    );

    if (crossing) {
      centres.push(crossing);
    }
  }

  centres.push(...input.interior);

  if (input.targetDetour) {
    centres.push(...input.targetDetour);
  } else if (input.targetBorder) {
    const crossing = borderCrossing(
      input.targetBorder,
      input.target.centre,
      input.interior.at(-1) ?? input.source.centre,
    );

    if (crossing) {
      centres.push(crossing);
    }
  }

  centres.push(input.target.centre);

  const trail = dedupe(centres);
  const clipped = [...trail];

  clipped[0] = input.sourcePort ?? portOn(input.source, trail[1] ?? input.target.centre, m, axis);
  clipped[clipped.length - 1] =
    input.targetPort ?? portOn(input.target, trail.at(-2) ?? input.source.centre, m, axis);

  const straight = dedupe(clipped);
  const offset = bulge(straight, input.offset);
  // A bulged chord is already the routing; elbowing it on top would fight the offset.
  const points =
    input.elbow && straight.length > 1
      ? dedupe(elbowed(straight[0] as Point, straight.at(-1) as Point, axis))
      : edgeShape === 'ortho' && offset.length === straight.length && offset.length > 1
        ? orthogonalize(stubbed(aligned(offset, input, axis, m), input, axis, m), axis)
        : offset;
  const startArrowTip = trimStart(points, input.startArrow, m);
  const arrowTip = trimEnd(points, input.arrow, m);

  return {
    points,
    arrowTip,
    startArrowTip,
    labelPoint: midpointOf(points),
    labelNormal: { x: 0, y: 0 },
  };
}

/**
 * Self-loops never enter the layered graph: they leave and re-enter the same side on a fixed lobe,
 * inside the clearance ranking reserved for them.
 *
 * @param index which of the node's loops this is, and `count` how many there are. They nest inside
 * the one reserved band — wider anchors and a deeper lobe each time — so `N` loops draw as `N`
 * distinct arcs with `N` label positions instead of `N` copies of one arc.
 */
export function routeSelfLoop(
  endpoint: RouteEndpoint,
  side: Axis,
  arrow: ArrowKind,
  startArrow: ArrowKind,
  m: DiagramMetrics,
  index = 0,
  count = 1,
): RoutedEdge {
  const spread = (index + 1) / (count + 1);
  const along: Point = side === 'x' ? { x: 1, y: -spread } : { x: -spread, y: 1 };
  const back: Point = side === 'x' ? { x: 1, y: spread } : { x: spread, y: 1 };
  const exit = anchorOn(
    endpoint,
    { x: endpoint.centre.x + along.x, y: endpoint.centre.y + along.y },
    m,
  );
  const enter = anchorOn(
    endpoint,
    { x: endpoint.centre.x + back.x, y: endpoint.centre.y + back.y },
    m,
  );
  const outer =
    Math.max(exit[side], enter[side]) + (m.selfLoopSize * (index + 1)) / Math.max(1, count);
  const lobe: Point[] =
    side === 'x'
      ? [exit, { x: outer, y: exit.y }, { x: outer, y: enter.y }, enter]
      : [exit, { x: exit.x, y: outer }, { x: enter.x, y: outer }, enter];
  const points = dedupe(lobe);
  const startArrowTip = trimStart(points, startArrow, m);
  const arrowTip = trimEnd(points, arrow, m);
  const labelPoint =
    side === 'x'
      ? { x: outer, y: (exit.y + enter.y) / 2 }
      : { x: (exit.x + enter.x) / 2, y: outer };

  return {
    points,
    arrowTip,
    startArrowTip,
    labelPoint,
    labelNormal: side === 'x' ? { x: 1, y: 0 } : { x: 0, y: 1 },
  };
}
