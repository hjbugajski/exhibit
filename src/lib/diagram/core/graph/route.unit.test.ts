import { describe, expect, it } from 'vitest';

import { defaultMetrics } from '../../metrics.ts';
import type { Point } from '../../types.ts';
import { flowShapes } from '../shapes/flow-shapes.ts';
import type { RouteEndpoint } from './route.ts';
import { anchorOn, loopSide, orthogonalize, rankAxis, routeEdge, routeSelfLoop } from './route.ts';

const m = defaultMetrics;

function endpoint(
  x: number,
  y: number,
  shape = 'rect',
  size = { width: 40, height: 30 },
): RouteEndpoint {
  return { centre: { x, y }, size, shape: flowShapes[shape] ?? (flowShapes['rect'] as never) };
}

describe('axes', () => {
  it('runs ranks down the y axis for TB and across x for LR', () => {
    expect(rankAxis('TB')).toBe('y');
    expect(rankAxis('BT')).toBe('y');
    expect(rankAxis('LR')).toBe('x');
    expect(loopSide('TB')).toBe('x');
    expect(loopSide('RL')).toBe('y');
  });
});

describe('anchorOn', () => {
  it('lands on the rectangle boundary', () => {
    expect(anchorOn(endpoint(100, 100), { x: 100, y: 400 }, m)).toEqual({ x: 100, y: 115 });
  });

  it('lands on a diamond edge rather than its bounding box', () => {
    const hit = anchorOn(endpoint(0, 0, 'diamond', { width: 40, height: 20 }), { x: 10, y: 10 }, m);

    // Edge (20,0)-(0,10) is x/20 + y/10 = 1; with x === y that is 20/3.
    expect(hit.x).toBeCloseTo(20 / 3, 6);
    expect(hit.y).toBeCloseTo(20 / 3, 6);
  });

  it('lands on a circle', () => {
    const hit = anchorOn(
      endpoint(50, 50, 'circle', { width: 40, height: 40 }),
      { x: 70, y: 70 },
      m,
    );

    expect(Math.hypot(hit.x - 50, hit.y - 50)).toBeCloseTo(20, 6);
  });
});

describe('orthogonalize', () => {
  it('elbows a diagonal hop at the midpoint of the rank axis', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 40, y: 100 },
    ];

    expect(orthogonalize(points, 'y')).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 50 },
      { x: 40, y: 50 },
      { x: 40, y: 100 },
    ]);
  });

  it('elbows across x when the rank axis is x', () => {
    expect(
      orthogonalize(
        [
          { x: 0, y: 0 },
          { x: 100, y: 40 },
        ],
        'x',
      ),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 40 },
      { x: 100, y: 40 },
    ]);
  });

  it('leaves an already-straight run alone', () => {
    const points: Point[] = [
      { x: 5, y: 0 },
      { x: 5, y: 20 },
      { x: 5, y: 60 },
    ];

    expect(orthogonalize(points, 'y')).toEqual(points);
  });
});

describe('routeEdge', () => {
  const straight = {
    source: endpoint(0, 0),
    target: endpoint(0, 200),
    interior: [],
    arrow: 'arrow' as const,
    startArrow: 'none' as const,
    offset: 0,
  };

  it('clips both ends to the node outlines', () => {
    const route = routeEdge({ ...straight, arrow: 'none' }, m, 'straight', 'y');

    expect(route.points).toEqual([
      { x: 0, y: 15 },
      { x: 0, y: 185 },
    ]);
  });

  it('trims the stroke by the arrow length and keeps the tip on the outline', () => {
    const route = routeEdge(straight, m, 'straight', 'y');

    expect(route.arrowTip).toEqual({ x: 0, y: 185 });
    expect(route.points.at(-1)).toEqual({ x: 0, y: 185 - m.arrowLength });
  });

  it('trims a start cap too', () => {
    const route = routeEdge({ ...straight, startArrow: 'arrow' }, m, 'straight', 'y');

    expect(route.startArrowTip).toEqual({ x: 0, y: 15 });
    expect(route.points[0]).toEqual({ x: 0, y: 15 + m.arrowLength });
  });

  it('threads the interior points of a virtual chain', () => {
    const route = routeEdge(
      { ...straight, arrow: 'none', target: endpoint(0, 400), interior: [{ x: 30, y: 200 }] },
      m,
      'straight',
      'y',
    );

    // The clip runs toward the first interior point, so it leaves the bottom edge off-centre.
    expect(route.points).toEqual([
      { x: 2.25, y: 15 },
      { x: 30, y: 200 },
      { x: 2.25, y: 385 },
    ]);
  });

  it('bundles a buried endpoint through its cluster border', () => {
    const route = routeEdge(
      {
        ...straight,
        arrow: 'none',
        target: endpoint(0, 400),
        targetBorder: { x: -50, y: 300, width: 100, height: 200 },
      },
      m,
      'straight',
      'y',
    );

    expect(route.points).toEqual([
      { x: 0, y: 15 },
      { x: 0, y: 300 },
      { x: 0, y: 385 },
    ]);
  });

  it('bulges a parallel edge perpendicular to its chord', () => {
    const route = routeEdge({ ...straight, arrow: 'none', offset: 10 }, m, 'ortho', 'y');

    expect(route.points).toEqual([
      { x: 0, y: 15 },
      { x: -10, y: 100 },
      { x: 0, y: 185 },
    ]);
  });

  it('pulls the run next to a spaced port onto it instead of jogging back off it', () => {
    // The port sits one slot right of the chain the layout laid down; jogging back onto the chain
    // would draw this edge along whatever else that corridor carries.
    const slot = m.arrowWidth + m.strokeWidth * 2;
    const route = routeEdge(
      {
        ...straight,
        arrow: 'none',
        target: endpoint(0, 400),
        interior: [{ x: 0, y: 200 }],
        sourcePort: { x: slot, y: 15 },
      },
      m,
      'ortho',
      'y',
    );

    expect(route.points).toEqual([
      { x: slot, y: 15 },
      { x: slot, y: 200 },
      { x: slot, y: 292.5 },
      { x: 0, y: 292.5 },
      { x: 0, y: 385 },
    ]);
  });

  it('straightens a run further off than a slot when the band between is empty', () => {
    const route = routeEdge(
      {
        ...straight,
        arrow: 'none',
        target: endpoint(0, 400),
        interior: [{ x: 0, y: 200 }],
        sourcePort: { x: 18, y: 15 },
        targetPort: { x: 0, y: 385 },
      },
      m,
      'ortho',
      'y',
    );

    expect(route.points[1]).toEqual({ x: 18, y: 200 });
  });

  it('keeps that run where it is when something stands in the band', () => {
    const route = routeEdge(
      {
        ...straight,
        arrow: 'none',
        target: endpoint(0, 400),
        interior: [{ x: 0, y: 200 }],
        sourcePort: { x: 18, y: 15 },
        targetPort: { x: 0, y: 385 },
        obstacles: [{ x: 4, y: 150, width: 10, height: 20 }],
      },
      m,
      'ortho',
      'y',
    );

    expect(route.points[1]).toEqual({ x: 18, y: 107.5 });
  });

  it('still makes the slot-wide correction with that same box in the way', () => {
    const slot = m.arrowWidth + m.strokeWidth * 2;
    const route = routeEdge(
      {
        ...straight,
        arrow: 'none',
        target: endpoint(0, 400),
        interior: [{ x: 0, y: 200 }],
        sourcePort: { x: slot, y: 15 },
        targetPort: { x: 0, y: 385 },
        obstacles: [{ x: 4, y: 150, width: 10, height: 20 }],
      },
      m,
      'ortho',
      'y',
    );

    expect(route.points[1]).toEqual({ x: slot, y: 200 });
  });

  it('leaves a jog wider than a slot to the elbow, run and all', () => {
    const route = routeEdge(
      {
        ...straight,
        arrow: 'none',
        target: endpoint(0, 400),
        interior: [{ x: 0, y: 200 }],
        sourcePort: { x: 40, y: 15 },
      },
      m,
      'ortho',
      'y',
    );

    expect(route.points[1]).toEqual({ x: 40, y: 107.5 });
    expect(route.points[2]).toEqual({ x: 0, y: 107.5 });
  });

  it('elbows a diagonal under the ortho shape', () => {
    const route = routeEdge(
      { ...straight, arrow: 'none', target: endpoint(120, 200) },
      m,
      'ortho',
      'y',
    );

    expect(route.points).toHaveLength(4);
    expect(route.points[1]?.x).toBe(route.points[0]?.x);
    expect(route.points[2]?.x).toBe(route.points[3]?.x);
  });
});

describe('routeSelfLoop', () => {
  it('leaves and re-enters the +x side for a top-down diagram', () => {
    const route = routeSelfLoop(endpoint(100, 100), 'x', 'arrow', 'none', m);
    const [exit, out, back] = route.points as [Point, Point, Point];
    const enter = route.arrowTip as Point;

    expect(exit.y).toBeLessThan(100);
    expect(enter.y).toBeGreaterThan(100);
    // Both ends are on the outline, so the lobe stands clear of the widest of them.
    expect(out.x).toBeCloseTo(Math.max(exit.x, enter.x) + m.selfLoopSize, 6);
    expect(back.x).toBe(out.x);
    expect(route.labelNormal).toEqual({ x: 1, y: 0 });
    expect(route.labelPoint).toEqual({ x: out.x, y: 100 });
  });

  it('drops the lobe below the node for a left-right diagram', () => {
    const route = routeSelfLoop(endpoint(100, 100), 'y', 'arrow', 'none', m);

    expect(route.points[1]?.y).toBe(115 + m.selfLoopSize);
    expect(route.labelNormal).toEqual({ x: 0, y: 1 });
  });

  it('nests one lobe per loop inside the reserved band, each with its own label point', () => {
    const routes = [0, 1, 2].map((index) =>
      routeSelfLoop(endpoint(100, 100), 'x', 'arrow', 'none', m, index, 3),
    );
    const outers = routes.map((route) => route.points[1]?.x as number);

    expect(outers[1] as number).toBeGreaterThan(outers[0] as number);
    expect(outers[2] as number).toBeGreaterThan(outers[1] as number);
    expect(outers[2] as number).toBeCloseTo(
      Math.max(routes[2]?.points[0]?.x as number, routes[2]?.arrowTip?.x as number) +
        m.selfLoopSize,
      6,
    );
    expect(new Set(routes.map((route) => route.labelPoint.x)).size).toBe(3);
    expect(new Set(routes.map((route) => JSON.stringify(route.points))).size).toBe(3);
  });

  it('draws a lone loop exactly as it did before loops were indexed', () => {
    expect(routeSelfLoop(endpoint(100, 100), 'x', 'arrow', 'none', m, 0, 1)).toEqual(
      routeSelfLoop(endpoint(100, 100), 'x', 'arrow', 'none', m),
    );
  });
});
