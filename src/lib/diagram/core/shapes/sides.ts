/*
 * `ShapeDef.sides` for the two outlines more than one shape is built from: the rounded rectangle and
 * the ellipse. Both answer the same question — how much of a side is straight, and how much of it
 * curves away — which is all the port pass needs to keep an attachment point on the paint.
 */

import type { DiagramMetrics } from '../../metrics.ts';
import type { ShapeDef, Size } from '../../types.ts';

interface Sides {
  flat: Size;
  corner: number;
}

/** What each corner of `radius` leaves straight on the sides it rounds, and the arc it rounds with. */
export function roundedSides(
  radius: (box: Size, m: DiagramMetrics) => number,
): NonNullable<ShapeDef['sides']> {
  return (box, m) => {
    const r = Math.min(radius(box, m), box.width / 2, box.height / 2);

    return {
      flat: { width: Math.max(0, box.width - r * 2), height: Math.max(0, box.height - r * 2) },
      corner: r,
    };
  };
}

/** An outline that is all arc: every port rides it, none of it is straight. */
export function ellipseSides(box: Size): Sides {
  return { flat: { width: 0, height: 0 }, corner: Math.min(box.width, box.height) / 2 };
}
