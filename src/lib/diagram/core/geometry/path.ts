/*
 * Path emission. Every number that reaches a `d` string goes through `round2` — rounding at emit
 * (never mid-pipeline) is what keeps golden scenes stable across platforms and keeps the markup
 * small. Emission rounds the polyline it was handed before anything else, so a corner cut, an
 * S-curve or a collinearity test is computed against the numbers that will actually be printed.
 */

import type { DiagramMetrics } from '../../metrics.ts';
import type { EdgeShape, Point, Rect, Size } from '../../types.ts';
import { clipSegmentToRect } from './intersect.ts';

export function round2(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const rounded = Math.round(value * 100) / 100;

  return Object.is(rounded, -0) ? 0 : rounded;
}

function n(value: number): string {
  return String(round2(value));
}

function point(p: Point): string {
  return `${n(p.x)},${n(p.y)}`;
}

export function boundsOf(points: readonly Point[]): Rect {
  if (points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Sine of the largest turn a vertex may make and still be a point on a straight line. */
export const COLLINEAR_SIN = 1e-3;

/**
 * A corner cut this small rounds to the corner itself, so it is drawn square instead: a quadratic
 * whose control point is also one of its endpoints has no tangent to be continuous with.
 */
const SQUARE_CORNER = 0.05;

/** Emission precision, applied to every point an emitter derives so `d` can be compared exactly. */
function snap(p: Point): Point {
  return { x: round2(p.x), y: round2(p.y) };
}

/** Sine of the turn at `b`, so the test for a straight line is the same at any scale. */
function turnOf(a: Point, b: Point, c: Point): number {
  const inLength = distance(a, b);
  const outLength = distance(b, c);

  return inLength === 0 || outLength === 0 ? 0 : cross(a, b, c) / (inLength * outLength);
}

/**
 * Is `b` a vertex its neighbours run straight through? A doubling back is collinear too and is not
 * redundant — dropping it would erase the leg that comes back.
 */
function straightThrough(a: Point, b: Point, c: Point): boolean {
  const forward = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);

  return forward > 0 && Math.abs(turnOf(a, b, c)) < COLLINEAR_SIN;
}

/**
 * The polyline as it will be printed: every vertex rounded, then every vertex that draws nothing
 * dropped — a repeat of the one before it, or one its neighbours run straight through. Both are
 * invisible in the paint, both break naive path tooling, and a repeat would otherwise have a corner
 * rounded against a zero-length segment.
 */
function simplify(points: readonly Point[]): Point[] {
  const out: Point[] = [];

  for (const p of points) {
    const previous = out.at(-1);
    const rounded = snap(p);

    if (!previous || previous.x !== rounded.x || previous.y !== rounded.y) {
      out.push(rounded);
    }
  }

  for (let i = out.length - 2; i > 0; i -= 1) {
    if (straightThrough(out[i - 1] as Point, out[i] as Point, out[i + 1] as Point)) {
      out.splice(i, 1);
    }
  }

  return out;
}

export function linearD(points: readonly Point[]): string {
  const trail = simplify(points);

  if (trail.length === 0) {
    return '';
  }

  const [first, ...rest] = trail as [Point, ...Point[]];

  return `M${point(first)}${rest.map((p) => `L${point(p)}`).join('')}`;
}

/** An S-curve's two ends, on the straights either side of the pair of corners it replaces. */
interface Jog {
  from: Point;
  to: Point;
}

/**
 * A pair of opposed corners bridged by a segment short enough to read as a wobble rather than a
 * deliberate dogleg — the mid-air jog a routed edge makes when its lane shifts. One tangent-
 * continuous cubic replaces both corners; the corners themselves become its control points, which
 * is what pins it inside the jog's own bounding box (control points inside, hull inside, curve
 * inside) so nothing it used to clear can be crossed now.
 *
 * A U-turn is not a jog: its corners turn the same way, and rounding them is the whole shape.
 */
function jogAt(points: readonly Point[], i: number, m: DiagramMetrics): Jog | null {
  const previous = points[i - 1] as Point;
  const a = points[i] as Point;
  const b = points[i + 1] as Point;
  const next = points[i + 2];

  if (!next || turnOf(previous, a, b) * turnOf(a, b, next) >= 0) {
    return null;
  }

  const inLength = distance(previous, a);
  const outLength = distance(b, next);
  const reach = Math.min(m.jogReach, inLength / 2, outLength / 2);

  if (reach < m.cornerRadius || distance(a, b) > reach * 2) {
    return null;
  }

  return {
    from: snap(lerp(a, previous, reach / inLength)),
    to: snap(lerp(b, next, reach / outLength)),
  };
}

/**
 * Rounded elbow: each interior vertex is cut back along both adjacent segments and bridged with a
 * quadratic through the corner, except where two opposed corners collapse into one S-curve. Both
 * cuts are half the shorter adjacent segment at most, so no two of them can ever overlap.
 *
 * Label knockout splits the polyline before this runs, so a jog broken by a label gap arrives as two
 * runs with one corner each and stays square-cut on both sides of the label.
 */
export function orthoD(points: readonly Point[], m: DiagramMetrics): string {
  const trail = simplify(points);

  if (trail.length < 3 || m.cornerRadius <= 0) {
    return linearD(trail);
  }

  let cursor = trail[0] as Point;
  let d = `M${point(cursor)}`;
  const lineTo = (p: Point): void => {
    if (p.x !== cursor.x || p.y !== cursor.y) {
      d += `L${point(p)}`;
    }

    cursor = p;
  };

  for (let i = 1; i < trail.length - 1; i += 1) {
    const previous = trail[i - 1] as Point;
    const corner = trail[i] as Point;
    const next = trail[i + 1] as Point;
    const jog = jogAt(trail, i, m);

    if (jog) {
      lineTo(jog.from);
      d += `C${point(corner)} ${point(next)} ${point(jog.to)}`;
      cursor = jog.to;
      i += 1;
      continue;
    }

    const inLength = distance(previous, corner);
    const outLength = distance(corner, next);
    const cut = Math.min(m.cornerRadius, inLength / 2, outLength / 2);

    if (cut < SQUARE_CORNER) {
      lineTo(corner);
      continue;
    }

    lineTo(snap(lerp(corner, previous, cut / inLength)));
    cursor = snap(lerp(corner, next, cut / outLength));
    d += `Q${point(corner)} ${point(cursor)}`;
  }

  lineTo(trail[trail.length - 1] as Point);

  return d;
}

/** Centripetal knot spacing: the distance between two points, to the power alpha = 0.5. */
function knot(a: Point, b: Point): number {
  return Math.sqrt(distance(a, b));
}

/** The neighbour a pinned endpoint does not have: its real one, reflected through it. */
function mirror(about: Point, p: Point): Point {
  return { x: about.x * 2 - p.x, y: about.y * 2 - p.y };
}

/** Catmull-Rom tangent at `over`, from its own neighbourhood and the knot spacing either side. */
function tangentAt(from: Point, over: Point, to: Point, before: number, after: number): Point {
  return {
    x: (over.x - from.x) / before - (to.x - from.x) / (before + after) + (to.x - over.x) / after,
    y: (over.y - from.y) / before - (to.y - from.y) / (before + after) + (to.y - over.y) / after,
  };
}

/**
 * Centripetal Catmull-Rom through the polyline, converted to cubics; endpoints stay pinned.
 *
 * Uniform parameterization sizes the tangent at a point from the chord across it, so a short segment
 * beside a long one hooks the curve back out past its own endpoints and can cusp — and on a routed
 * edge, a short elbow segment between two long runs is the normal case. Centripetal knots (alpha
 * 0.5) provably cannot cusp or self-intersect, and cost one square root per point. The tangent at a
 * shared point comes from that point's own neighbourhood, so both cubics meeting there use it and
 * the join is tangent-continuous.
 */
export function smoothD(points: readonly Point[]): string {
  const trail = simplify(points);

  if (trail.length < 3) {
    return linearD(trail);
  }

  let d = `M${point(trail[0] as Point)}`;

  for (let i = 0; i < trail.length - 1; i += 1) {
    const p1 = trail[i] as Point;
    const p2 = trail[i + 1] as Point;
    const p0 = trail[i - 1] ?? mirror(p1, p2);
    const p3 = trail[i + 2] ?? mirror(p2, p1);
    const t01 = knot(p0, p1);
    const t12 = knot(p1, p2);
    const t23 = knot(p2, p3);
    const m1 = tangentAt(p0, p1, p2, t01, t12);
    const m2 = tangentAt(p1, p2, p3, t12, t23);

    d +=
      `C${point({ x: p1.x + (m1.x * t12) / 3, y: p1.y + (m1.y * t12) / 3 })} ` +
      `${point({ x: p2.x - (m2.x * t12) / 3, y: p2.y - (m2.y * t12) / 3 })} ${point(p2)}`;
  }

  return d;
}

export function edgeD(points: readonly Point[], shape: EdgeShape, m: DiagramMetrics): string {
  if (shape === 'smooth') {
    return smoothD(points);
  }

  return shape === 'ortho' ? orthoD(points, m) : linearD(points);
}

/**
 * The runs of `points` that lie outside `rect`, in order — the geometry behind knocking an edge
 * label out of its own stroke. A polyline that never enters the rect comes back as one run equal to
 * the input, one that ends inside it comes back with that tail clipped off, and one the rect
 * swallows comes back empty. Runs are polylines, so each still has to be turned into a `d` by the
 * caller's edge shape.
 */
export function splitAround(points: readonly Point[], rect: Rect): Point[][] {
  const runs: Point[][] = [];
  let current: Point[] = [];

  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] as Point;
    const b = points[i] as Point;
    const inside = clipSegmentToRect(a, b, rect);

    if (!inside) {
      if (current.length === 0) {
        current.push(a);
      }

      current.push(b);
      continue;
    }

    const [enter, exit] = inside;

    // `enter > 0` means `a` is outside, so the stretch before the rect is still drawn.
    if (enter > 0) {
      if (current.length === 0) {
        current.push(a);
      }

      current.push(lerp(a, b, enter));
    }

    if (current.length > 1) {
      runs.push(current);
    }

    current = exit < 1 ? [lerp(a, b, exit), b] : [];
  }

  if (current.length > 1) {
    runs.push(current);
  }

  return runs;
}

export function polylineLength(points: readonly Point[]): number {
  let total = 0;

  for (let i = 1; i < points.length; i += 1) {
    total += distance(points[i - 1] as Point, points[i] as Point);
  }

  return total;
}

export function polygonD(points: readonly Point[]): string {
  return points.length === 0 ? '' : `${linearD(points)}Z`;
}

/** Origin-centred rounded rectangle. */
export function rectD(box: Size, radius: number): string {
  const halfW = box.width / 2;
  const halfH = box.height / 2;
  const r = Math.max(0, Math.min(radius, halfW, halfH));

  if (r === 0) {
    return polygonD([
      { x: -halfW, y: -halfH },
      { x: halfW, y: -halfH },
      { x: halfW, y: halfH },
      { x: -halfW, y: halfH },
    ]);
  }

  const arc = `A${n(r)},${n(r)} 0 0 1 `;

  return (
    `M${n(-halfW + r)},${n(-halfH)}` +
    `L${n(halfW - r)},${n(-halfH)}${arc}${n(halfW)},${n(-halfH + r)}` +
    `L${n(halfW)},${n(halfH - r)}${arc}${n(halfW - r)},${n(halfH)}` +
    `L${n(-halfW + r)},${n(halfH)}${arc}${n(-halfW)},${n(halfH - r)}` +
    `L${n(-halfW)},${n(-halfH + r)}${arc}${n(-halfW + r)},${n(-halfH)}Z`
  );
}

/** Origin-centred ellipse as two half arcs. */
export function ellipseD(rx: number, ry: number): string {
  return (
    `M${n(-rx)},0` + `A${n(rx)},${n(ry)} 0 1 0 ${n(rx)},0` + `A${n(rx)},${n(ry)} 0 1 0 ${n(-rx)},0Z`
  );
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function lerp(from: Point, toward: Point, t: number): Point {
  return { x: from.x + (toward.x - from.x) * t, y: from.y + (toward.y - from.y) * t };
}

function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
