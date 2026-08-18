/*
 * Rank-gap lanes.
 *
 * An edge that has to move sideways between two ranks turns in the middle of the gap between them,
 * which is the right answer for one edge and the wrong one for two. The gap has one middle, so every
 * edge crossing it turns on the same line, and any two whose legs overlap there are drawn as one
 * stroke for as far as the overlap runs. Nothing a single route can see says otherwise — the leg it
 * collides with belongs to another edge — so the legs are spread here, once every edge is routed, by
 * sliding each along the gap it already sits in.
 *
 * Longest first, and a leg that has to move goes toward the rank it is heading for. The leg that
 * travels furthest keeps the lane it turned in and the shorter ones nest inside it, which is the
 * arrangement where no leg crosses the stem of another.
 *
 * Two things bound a move, and both are read at the moment it is made rather than when the legs were
 * collected. The room in the gap comes from the points either side of the leg, and moving one leg of
 * a route rewrites those points for the next one along it — a window snapshotted up front is a bound
 * that no longer exists, and placing against it folds the route back on itself. The obstacles are the
 * node boxes: the gap a leg slides in is only free until the next rank starts, and a leg that has
 * been handed a window running to a point inside a node can otherwise be moved straight into it. A
 * lane is refused when it would put the leg through a box its own lane was clear of, so a leg is
 * never moved into an obstacle, and one that started against one is not held still by it.
 */

import type { DiagramMetrics } from '../../metrics.ts';
import type { Point, Rect } from '../../types.ts';
import { segmentHitsRect } from '../geometry/intersect.ts';
import type { Axis } from './route.ts';
import { strokeGap } from './spacing.ts';

const NEAR = 0.01;

/** How many lanes either side of the middle a crowded gap is allowed to hand out. */
const LANES = 4;

/** What a leg is allowed to move: the polyline it belongs to, and the label riding on it. */
export interface LegRoute {
  points: Point[];
  labelPoint: Point;
}

interface Leg {
  route: LegRoute;
  /** Index of the first of the leg's two points. */
  at: number;
  rank: number;
  span: readonly [number, number];
  length: number;
  order: number;
}

/** Rank coordinates the leg may move between, with room left for its own corners, as they stand. */
function windowOf(leg: Leg, axis: Axis, m: DiagramMetrics): { low: number; high: number } {
  const before = (leg.route.points[leg.at - 1] as Point)[axis];
  const after = (leg.route.points[leg.at + 2] as Point)[axis];

  return {
    low: Math.min(before, after) + m.cornerRadius,
    high: Math.max(before, after) - m.cornerRadius,
  };
}

/** Which way the rank the leg is heading for lies, as it stands. */
function toward(leg: Leg, axis: Axis): number {
  return Math.sign((leg.route.points[leg.at + 2] as Point)[axis] - leg.rank);
}

function legsOf(route: LegRoute, order: number, axis: Axis, m: DiagramMetrics): Leg[] {
  const lateral: Axis = axis === 'y' ? 'x' : 'y';
  const points = route.points;
  const out: Leg[] = [];

  for (let at = 1; at + 2 < points.length; at += 1) {
    const before = points[at - 1] as Point;
    const from = points[at] as Point;
    const to = points[at + 1] as Point;
    const after = points[at + 2] as Point;
    const rank = from[axis];

    // A transfer between two ranks: flat on the rank axis, with the legs either side of it on
    // opposite sides. A U-turn back the way it came has no gap to move inside.
    if (
      Math.abs(to[axis] - rank) > NEAR ||
      (before[axis] - rank) * (after[axis] - rank) >= 0 ||
      Math.abs(to[lateral] - from[lateral]) < NEAR
    ) {
      continue;
    }

    const leg: Leg = {
      route,
      at,
      rank,
      span: [Math.min(from[lateral], to[lateral]), Math.max(from[lateral], to[lateral])] as const,
      length: Math.abs(to[lateral] - from[lateral]),
      order,
    };
    const { low, high } = windowOf(leg, axis, m);

    if (high - low >= NEAR) {
      out.push(leg);
    }
  }

  return out;
}

/**
 * Do two legs share enough of a lane to be drawn as one stroke? Crossing at a point is not sharing:
 * a lane one corner wide is all the overlap a leg needs to pass through another, and moving for that
 * would trade a crossing nobody can see for a kink everybody can.
 */
function overlaps(a: Leg, b: Leg, least: number): boolean {
  return Math.min(a.span[1], b.span[1]) - Math.max(a.span[0], b.span[0]) > least;
}

/** The leg drawn on `rank`, as a pair of points. */
function segment(leg: Leg, rank: number, axis: Axis): [Point, Point] {
  return axis === 'y'
    ? [
        { x: leg.span[0], y: rank },
        { x: leg.span[1], y: rank },
      ]
    : [
        { x: rank, y: leg.span[0] },
        { x: rank, y: leg.span[1] },
      ];
}

/** Cross-axis legs, moved onto lanes of their own wherever two of them share one. */
export function separateLegs(
  routes: readonly LegRoute[],
  obstacles: readonly Rect[],
  axis: Axis,
  m: DiagramMetrics,
): void {
  const legs: Leg[] = [];

  for (const [order, route] of routes.entries()) {
    legs.push(...legsOf(route, order, axis, m));
  }

  if (legs.length < 2) {
    return;
  }

  const gap = strokeGap(m);
  const lateral: Axis = axis === 'y' ? 'x' : 'y';
  // Only a leg within a lane of this one can be in its way, so only those buckets are looked at.
  const placed = new Map<number, Leg[]>();
  const clash = (leg: Leg, rank: number): boolean => {
    const key = Math.round(rank / gap);

    for (const near of [key - 1, key, key + 1]) {
      for (const other of placed.get(near) ?? []) {
        if (Math.abs(other.rank - rank) < gap - NEAR && overlaps(leg, other, m.cornerRadius)) {
          return true;
        }
      }
    }

    return false;
  };
  const struck = (leg: Leg, rank: number): readonly Rect[] => {
    const [from, to] = segment(leg, rank, axis);

    return obstacles.filter((rect) => segmentHitsRect(from, to, rect));
  };

  for (const leg of [...legs].sort((a, b) => b.length - a.length || a.order - b.order)) {
    const already = struck(leg, leg.rank);

    for (let lane = 1; lane <= LANES && clash(leg, leg.rank); lane += 1) {
      const { low, high } = windowOf(leg, axis, m);
      const heading = toward(leg, axis);

      for (const direction of [heading, -heading]) {
        const rank = leg.rank + direction * lane * gap;

        if (
          rank > low - NEAR &&
          rank < high + NEAR &&
          !clash(leg, rank) &&
          struck(leg, rank).every((rect) => already.includes(rect))
        ) {
          const points = leg.route.points;
          const label = leg.route.labelPoint;

          // A label with no node of its own sits on the polyline's midpoint, which may be this leg.
          if (
            Math.abs(label[axis] - leg.rank) < NEAR &&
            label[lateral] > leg.span[0] - NEAR &&
            label[lateral] < leg.span[1] + NEAR
          ) {
            leg.route.labelPoint = { ...label, [axis]: rank };
          }

          leg.rank = rank;
          points[leg.at] = { ...(points[leg.at] as Point), [axis]: rank };
          points[leg.at + 1] = { ...(points[leg.at + 1] as Point), [axis]: rank };
          break;
        }
      }
    }

    const key = Math.round(leg.rank / gap);
    const bucket = placed.get(key);

    if (bucket) {
      bucket.push(leg);
    } else {
      placed.set(key, [leg]);
    }
  }
}
