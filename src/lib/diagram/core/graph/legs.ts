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
 */

import type { DiagramMetrics } from '../../metrics.ts';
import type { Point } from '../../types.ts';
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
  /** Rank coordinates the leg may move between, with room left for its own corners. */
  low: number;
  high: number;
  /** Which way the rank it is heading for lies. */
  toward: number;
  span: readonly [number, number];
  length: number;
  order: number;
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

    const low = Math.min(before[axis], after[axis]) + m.cornerRadius;
    const high = Math.max(before[axis], after[axis]) - m.cornerRadius;

    if (high - low < NEAR) {
      continue;
    }

    out.push({
      route,
      at,
      rank,
      low,
      high,
      toward: Math.sign(after[axis] - rank),
      span: [Math.min(from[lateral], to[lateral]), Math.max(from[lateral], to[lateral])] as const,
      length: Math.abs(to[lateral] - from[lateral]),
      order,
    });
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

/** Cross-axis legs, moved onto lanes of their own wherever two of them share one. */
export function separateLegs(routes: readonly LegRoute[], axis: Axis, m: DiagramMetrics): void {
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

  for (const leg of [...legs].sort((a, b) => b.length - a.length || a.order - b.order)) {
    for (let lane = 1; lane <= LANES && clash(leg, leg.rank); lane += 1) {
      for (const direction of [leg.toward, -leg.toward]) {
        const rank = leg.rank + direction * lane * gap;

        if (rank > leg.low - NEAR && rank < leg.high + NEAR && !clash(leg, rank)) {
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
