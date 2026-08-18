/*
 * One `<tspan>` per measured line at an explicit baseline — never `dy` accumulation, so a line the
 * browser cannot render does not shift the rest. Every family view draws its text through this, so
 * what was measured is what is emitted.
 */

import type { ReactNode } from 'react';

import { round2 } from '@/lib/diagram/core/geometry/path';
import type { LabelBox } from '@/lib/diagram/types';

/** Lines of `box`, centred on `(cx, cy)`. The caller supplies `text-anchor`. */
export function tspans(box: LabelBox, cx: number, cy: number): ReactNode {
  const top = cy - box.height / 2;

  return box.lines.map((line, index) => (
    <tspan key={index} x={round2(cx)} y={round2(top + box.baseline + index * box.lineHeight)}>
      {line}
    </tspan>
  ));
}
