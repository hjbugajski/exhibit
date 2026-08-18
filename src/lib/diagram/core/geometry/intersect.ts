/*
 * Where an edge meets a node. The `ray*` family works in the node's local space: the shape is centred
 * on the origin and `toward` is a direction (any length) pointing at the other endpoint. Clipping
 * against the real outline rather than the bounding box is what makes an arrow touch a diamond's
 * edge instead of hovering off it. `segmentHitsRect` is the one absolute-space member: routing and
 * the layout invariants both need to ask whether a drawn segment crosses a box.
 */

import type { Point, Rect, Size } from '../../types.ts';

const EPSILON = 1e-9;

function normalize(toward: Point): Point | null {
  const length = Math.hypot(toward.x, toward.y);

  return length < EPSILON ? null : { x: toward.x / length, y: toward.y / length };
}

export function rayRect(box: Size, toward: Point): Point {
  const direction = normalize(toward);

  if (!direction) {
    return { x: box.width / 2, y: 0 };
  }

  const halfW = box.width / 2;
  const halfH = box.height / 2;
  const dx = Math.abs(direction.x);
  const dy = Math.abs(direction.y);
  const t = Math.min(
    dx < EPSILON ? Number.POSITIVE_INFINITY : halfW / dx,
    dy < EPSILON ? Number.POSITIVE_INFINITY : halfH / dy,
  );

  return { x: direction.x * t, y: direction.y * t };
}

/**
 * The rounded rectangle's own outline, not the box it fits in: a ray that leaves through a corner
 * meets the arc there rather than the sharp point the arc replaced. Ports ride a little way onto
 * those arcs, so the difference is the whole of whether an arrowhead touches the paint or hovers
 * off it.
 */
export function rayRoundedRect(box: Size, radius: number, toward: Point): Point {
  const direction = normalize(toward);

  if (!direction) {
    return { x: box.width / 2, y: 0 };
  }

  const halfW = box.width / 2;
  const halfH = box.height / 2;
  const r = Math.max(0, Math.min(radius, halfW, halfH));
  const hit = rayRect(box, direction);

  if (r < EPSILON || Math.abs(hit.x) <= halfW - r || Math.abs(hit.y) <= halfH - r) {
    return hit;
  }

  const centre = {
    x: Math.sign(hit.x) * (halfW - r),
    y: Math.sign(hit.y) * (halfH - r),
  };
  const along = direction.x * centre.x + direction.y * centre.y;
  const gap = along * along - (centre.x * centre.x + centre.y * centre.y - r * r);

  if (gap < 0) {
    return hit;
  }

  const t = along + Math.sqrt(gap);

  return { x: direction.x * t, y: direction.y * t };
}

/**
 * Liang–Barsky clip: the parameters along `a`–`b` between which the segment is inside the
 * axis-aligned `rect`, or `null` when it misses entirely. A rect with no area is never hit, so
 * callers can shrink a box by a tolerance without special-casing.
 */
export function clipSegmentToRect(a: Point, b: Point, rect: Rect): [number, number] | null {
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const slabs: readonly (readonly [number, number])[] = [
    [-dx, a.x - rect.x],
    [dx, rect.x + rect.width - a.x],
    [-dy, a.y - rect.y],
    [dy, rect.y + rect.height - a.y],
  ];
  let enter = 0;
  let exit = 1;

  for (const [p, q] of slabs) {
    if (p === 0) {
      if (q < 0) {
        return null;
      }

      continue;
    }

    const t = q / p;

    if (p < 0) {
      enter = Math.max(enter, t);
    } else {
      exit = Math.min(exit, t);
    }
  }

  return enter <= exit ? [enter, exit] : null;
}

/** Does the segment `a`–`b` share any point with the axis-aligned `rect`? */
export function segmentHitsRect(a: Point, b: Point, rect: Rect): boolean {
  return clipSegmentToRect(a, b, rect) !== null;
}

/** Do two axis-aligned rects share any area? Touching along an edge does not count. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * A cylinder: a box with an elliptical lid of half-height `lip` on the top and the bottom.
 *
 * Squeezing `x` until the lid's ellipse is a circle turns the outline into a rounded rectangle whose
 * corner radius is its own half-width — a shape with two semicircular ends and no flat run between
 * them, which is exactly what a lid is. So the ray is squeezed, solved there, and stretched back.
 */
export function rayCylinder(box: Size, lip: number, toward: Point): Point {
  const halfW = box.width / 2;
  const cap = Math.min(lip, box.height / 2);

  if (halfW < EPSILON || cap < EPSILON) {
    return rayRect(box, toward);
  }

  const hit = rayRoundedRect({ width: cap * 2, height: box.height }, cap, {
    x: (toward.x * cap) / halfW,
    y: toward.y,
  });

  return { x: (hit.x * halfW) / cap, y: hit.y };
}

export function rayEllipse(rx: number, ry: number, toward: Point): Point {
  const direction = normalize(toward);

  if (!direction || rx <= 0 || ry <= 0) {
    return { x: rx, y: 0 };
  }

  const scale = Math.hypot(direction.x / rx, direction.y / ry);

  if (scale < EPSILON) {
    return { x: rx, y: 0 };
  }

  return { x: direction.x / scale, y: direction.y / scale };
}

/**
 * Nearest boundary hit of the ray from the origin. The polygon is assumed to contain the origin;
 * when it does not (a degenerate shape) the bounding-box intersection is the fallback.
 */
export function rayPolygon(points: readonly Point[], toward: Point): Point {
  const direction = normalize(toward);

  if (!direction || points.length < 2) {
    return { x: 0, y: 0 };
  }

  let best: number | null = null;

  for (let i = 0; i < points.length; i += 1) {
    const a = points[i] as Point;
    const b = points[(i + 1) % points.length] as Point;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const denominator = direction.x * ey - direction.y * ex;

    if (Math.abs(denominator) < EPSILON) {
      continue;
    }

    const t = (a.x * ey - a.y * ex) / denominator;
    const u = (a.x * direction.y - a.y * direction.x) / denominator;

    if (t >= 0 && u >= 0 && u <= 1 && (best === null || t < best)) {
      best = t;
    }
  }

  if (best === null) {
    const xs = points.map((p) => Math.abs(p.x));
    const ys = points.map((p) => Math.abs(p.y));

    return rayRect({ width: 2 * Math.max(...xs), height: 2 * Math.max(...ys) }, direction);
  }

  return { x: direction.x * best, y: direction.y * best };
}
