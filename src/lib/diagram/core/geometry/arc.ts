/*
 * Pie and donut arcs. Angles are radians in SVG space: 0 points right, they grow clockwise, and a
 * pie starts at -PI/2 (twelve o'clock).
 */

import type { Point } from '../../types.ts';
import { round2 } from './path.ts';

export interface ArcSpec {
  center: Point;
  outerRadius: number;
  /** 0 for a pie slice, > 0 for a donut. */
  innerRadius: number;
  startAngle: number;
  endAngle: number;
}

const FULL = Math.PI * 2;

function onCircle(center: Point, radius: number, angle: number): Point {
  return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
}

function n(value: number): string {
  return String(round2(value));
}

function point(p: Point): string {
  return `${n(p.x)},${n(p.y)}`;
}

function circleD(center: Point, radius: number, sweep: 0 | 1): string {
  const left = onCircle(center, radius, Math.PI);
  const right = onCircle(center, radius, 0);

  return (
    `M${point(left)}` +
    `A${n(radius)},${n(radius)} 0 1 ${sweep} ${point(right)}` +
    `A${n(radius)},${n(radius)} 0 1 ${sweep} ${point(left)}`
  );
}

export function arcD(spec: ArcSpec): string {
  const { center, outerRadius, innerRadius, startAngle, endAngle } = spec;
  const sweepAngle = endAngle - startAngle;

  if (sweepAngle <= 0) {
    return '';
  }

  if (sweepAngle >= FULL - 1e-9) {
    const outer = circleD(center, outerRadius, 1);

    return innerRadius > 0 ? `${outer}Z${circleD(center, innerRadius, 0)}Z` : `${outer}Z`;
  }

  const large = sweepAngle > Math.PI ? 1 : 0;
  const outerStart = onCircle(center, outerRadius, startAngle);
  const outerEnd = onCircle(center, outerRadius, endAngle);
  const outerArc = `A${n(outerRadius)},${n(outerRadius)} 0 ${large} 1 ${point(outerEnd)}`;

  if (innerRadius <= 0) {
    return `M${point(center)}L${point(outerStart)}${outerArc}Z`;
  }

  const innerEnd = onCircle(center, innerRadius, endAngle);
  const innerStart = onCircle(center, innerRadius, startAngle);
  const innerArc = `A${n(innerRadius)},${n(innerRadius)} 0 ${large} 0 ${point(innerStart)}`;

  return `M${point(outerStart)}${outerArc}L${point(innerEnd)}${innerArc}Z`;
}

/** Where a slice's own label sits: the midpoint angle at 68% of the outer radius. */
export function arcCentroid(spec: ArcSpec, ratio = 0.68): Point {
  const radius = spec.innerRadius + (spec.outerRadius - spec.innerRadius) * ratio;

  return onCircle(spec.center, radius, (spec.startAngle + spec.endAngle) / 2);
}
