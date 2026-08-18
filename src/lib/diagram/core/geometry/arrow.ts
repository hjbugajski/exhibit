/*
 * Arrowheads are inline geometry, never `<marker>`: markers need document-unique ids (two diagrams
 * on a page collide), interact badly with stroke scaling, and rely on uneven `context-stroke`
 * support. A plain path inherits color from its edge and is trivially overridable.
 *
 * `anchor` is where the edge stroke must stop so it does not poke through the head.
 *
 * The solid head is sized by `arrowLength`/`arrowWidth`; the `--o` circle and `--x` cross are caps
 * rather than heads and take `arrowCapSize`, so narrowing the head does not shrink them with it.
 */

import type { DiagramMetrics } from '../../metrics.ts';
import type { ArrowKind, Point } from '../../types.ts';
import { polygonD, round2 } from './path.ts';

export interface ArrowHead {
  d: string;
  /** Trimmed endpoint for the edge stroke. */
  anchor: Point;
}

function direction(tip: Point, from: Point): Point {
  const dx = tip.x - from.x;
  const dy = tip.y - from.y;
  const length = Math.hypot(dx, dy);

  return length < 1e-9 ? { x: 0, y: 1 } : { x: dx / length, y: dy / length };
}

function back(tip: Point, unit: Point, amount: number): Point {
  return { x: tip.x - unit.x * amount, y: tip.y - unit.y * amount };
}

function circleD(center: Point, radius: number): string {
  const r = round2(radius);
  const left = round2(center.x - radius);
  const right = round2(center.x + radius);
  const y = round2(center.y);

  return `M${left},${y}A${r},${r} 0 1 0 ${right},${y}A${r},${r} 0 1 0 ${left},${y}Z`;
}

/** Null for `kind: 'none'` — the edge then runs to its clipped endpoint untrimmed. */
export function arrowHead(
  kind: ArrowKind,
  tip: Point,
  from: Point,
  m: DiagramMetrics,
): ArrowHead | null {
  if (kind === 'none') {
    return null;
  }

  const unit = direction(tip, from);
  const normal = { x: -unit.y, y: unit.x };

  if (kind === 'circle') {
    const radius = m.arrowCapSize / 2;

    return { d: circleD(back(tip, unit, radius), radius), anchor: back(tip, unit, radius * 2) };
  }

  if (kind === 'cross') {
    const size = m.arrowCapSize;
    const center = back(tip, unit, size / 2);
    const arm = size / 2;
    const a = { x: center.x + (unit.x + normal.x) * arm, y: center.y + (unit.y + normal.y) * arm };
    const b = { x: center.x - (unit.x + normal.x) * arm, y: center.y - (unit.y + normal.y) * arm };
    const c = { x: center.x + (unit.x - normal.x) * arm, y: center.y + (unit.y - normal.y) * arm };
    const e = { x: center.x - (unit.x - normal.x) * arm, y: center.y - (unit.y - normal.y) * arm };

    return {
      d:
        `M${round2(a.x)},${round2(a.y)}L${round2(b.x)},${round2(b.y)}` +
        `M${round2(c.x)},${round2(c.y)}L${round2(e.x)},${round2(e.y)}`,
      anchor: back(tip, unit, size),
    };
  }

  const base = back(tip, unit, m.arrowLength);
  const half = m.arrowWidth / 2;

  return {
    d: polygonD([
      tip,
      { x: base.x + normal.x * half, y: base.y + normal.y * half },
      { x: base.x - normal.x * half, y: base.y - normal.y * half },
    ]),
    anchor: base,
  };
}
