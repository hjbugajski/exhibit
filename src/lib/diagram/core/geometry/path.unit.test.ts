import { describe, expect, it } from 'vitest';

import { resolveMetrics } from '../../metrics.ts';
import type { Point } from '../../types.ts';
import {
  boundsOf,
  edgeD,
  ellipseD,
  linearD,
  orthoD,
  polygonD,
  polylineLength,
  rectD,
  round2,
  smoothD,
  splitAround,
} from './path.ts';

const elbow: Point[] = [
  { x: 0, y: 0 },
  { x: 0, y: 40 },
  { x: 60, y: 40 },
];

const style = (cornerRadius: number, jogReach = 20) => resolveMetrics({ cornerRadius, jogReach });

/** Every curve of a `d` as a cubic, quadratics converted, so one sampler covers both. */
function curves(d: string): [Point, Point, Point, Point][] {
  const out: [Point, Point, Point, Point][] = [];
  let cursor: Point = { x: 0, y: 0 };

  for (const [, letter, body] of d.matchAll(/([MLQC])([^A-Za-z]*)/g)) {
    const numbers = [...(body as string).matchAll(/-?\d+(?:\.\d+)?/g)].map((n) => Number(n[0]));
    const points: Point[] = [];

    for (let i = 0; i + 1 < numbers.length; i += 2) {
      points.push({ x: numbers[i] as number, y: numbers[i + 1] as number });
    }

    const end = points.at(-1) as Point;
    const toward = (from: Point, control: Point): Point => ({
      x: from.x + ((control.x - from.x) * 2) / 3,
      y: from.y + ((control.y - from.y) * 2) / 3,
    });

    if (letter === 'Q') {
      out.push([cursor, toward(cursor, points[0] as Point), toward(end, points[0] as Point), end]);
    } else if (letter === 'C') {
      out.push([cursor, points[0] as Point, points[1] as Point, end]);
    }

    cursor = end;
  }

  return out;
}

function atT(curve: readonly [Point, Point, Point, Point], t: number): Point {
  const u = 1 - t;
  const [a, b, c, e] = curve;
  const on = (axis: 'x' | 'y'): number =>
    u ** 3 * a[axis] + 3 * u * u * t * b[axis] + 3 * u * t * t * c[axis] + t ** 3 * e[axis];

  return { x: on('x'), y: on('y') };
}

function samples(d: string, steps = 64): Point[] {
  return curves(d).flatMap((curve) =>
    Array.from({ length: steps + 1 }, (_, step) => atT(curve, step / steps)),
  );
}

/**
 * How far past its own chord a curve runs, as a fraction of that chord — the overshoot that reads
 * as a hook off the end of a segment. Zero means every sample sits between its two endpoints.
 */
function chordOvershoot(d: string, steps = 64): number {
  let worst = 0;

  for (const curve of curves(d)) {
    const [from, , , to] = curve;
    const ux = to.x - from.x;
    const uy = to.y - from.y;
    const length = ux * ux + uy * uy;

    for (let step = 0; length > 0 && step <= steps; step += 1) {
      const p = atT(curve, step / steps);
      const along = ((p.x - from.x) * ux + (p.y - from.y) * uy) / length;

      worst = Math.max(worst, -along, along - 1);
    }
  }

  return worst;
}

describe('round2', () => {
  it('rounds to two decimals', () => {
    expect(round2(1.006)).toBe(1.01);
    expect(round2(1.004)).toBe(1);
  });

  it('never emits negative zero or a non-finite number', () => {
    expect(Object.is(round2(-0.001), 0)).toBe(true);
    expect(round2(Number.NaN)).toBe(0);
    expect(round2(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('linearD', () => {
  it('emits a move and lines at two decimals', () => {
    expect(
      linearD([
        { x: 1.234, y: 2 },
        { x: 3, y: 4 },
      ]),
    ).toBe('M1.23,2L3,4');
  });

  it('is empty for no points', () => {
    expect(linearD([])).toBe('');
  });
});

describe('orthoD', () => {
  it('rounds the corner and pins both endpoints', () => {
    const d = orthoD(elbow, style(8));

    expect(d.startsWith('M0,0')).toBe(true);
    expect(d.endsWith('L60,40')).toBe(true);
    expect(d).toContain('Q0,40');
  });

  it('keeps the corner cut inside the shorter segment', () => {
    const d = orthoD(
      [
        { x: 0, y: 0 },
        { x: 0, y: 10 },
        { x: 60, y: 10 },
      ],
      style(40),
    );

    expect(d).toContain('L0,5');
  });

  it('degrades to a line for two points or a zero radius', () => {
    const straight: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ];

    expect(orthoD(straight, style(8))).toBe('M0,0L10,10');
    expect(orthoD(elbow, style(0))).toBe(linearD(elbow));
  });

  it('draws a corner too small to round as a square one', () => {
    const d = orthoD(
      [
        { x: 0, y: 0 },
        { x: 0, y: 0.04 },
        { x: 60, y: 0.04 },
      ],
      style(6),
    );

    expect(d).toBe('M0,0L0,0.04L60,0.04');
  });
});

describe('orthoD emission hygiene', () => {
  it('drops a vertex its neighbours run straight through', () => {
    const d = orthoD(
      [
        { x: 0, y: 0 },
        { x: 0, y: 20 },
        { x: 0, y: 40 },
      ],
      style(8),
    );

    expect(d).toBe('M0,0L0,40');
  });

  it('drops a repeated vertex instead of rounding a corner against nothing', () => {
    const d = orthoD(
      [
        { x: 0, y: 0 },
        { x: 0, y: 40 },
        { x: 0, y: 40.001 },
        { x: 60, y: 40 },
      ],
      style(8),
    );

    expect(d).toBe('M0,0L0,32Q0,40 8,40L60,40');
  });

  it('emits no zero-length line between two corners that meet', () => {
    // A 12-unit bridge is exactly two 6-unit cuts, so the corners share a point.
    const d = orthoD(
      [
        { x: 0, y: 0 },
        { x: 0, y: 100 },
        { x: 12, y: 100 },
        { x: 12, y: 0 },
      ],
      style(6, 0),
    );

    expect(d).toBe('M0,0L0,94Q0,100 6,100Q12,100 12,94L12,0');
    expect(d).not.toMatch(/L(-?[\d.]+),(-?[\d.]+)L\1,\2/);
  });
});

describe('orthoD jog smoothing', () => {
  /** Down, a short step sideways, down again: two opposed corners in mid air. */
  const jog = (bridge: number): Point[] => [
    { x: 0, y: 0 },
    { x: 0, y: 100 },
    { x: bridge, y: 100 },
    { x: bridge, y: 200 },
  ];

  it('bridges an opposed corner pair with one tangent-continuous cubic', () => {
    expect(orthoD(jog(20), style(6))).toBe('M0,0L0,80C0,100 20,100 20,120L20,200');
  });

  it('keeps the curve inside the jog corridor', () => {
    const points = samples(orthoD(jog(20), style(6)));

    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(-0.01);
      expect(point.x).toBeLessThanOrEqual(20.01);
      expect(point.y).toBeGreaterThanOrEqual(79.99);
      expect(point.y).toBeLessThanOrEqual(120.01);
    }
  });

  it('leaves a jog too wide for its reach as two rounded corners', () => {
    const d = orthoD(jog(41), style(6));

    expect(d.match(/Q/g)).toHaveLength(2);
    expect(d).not.toContain('C');
  });

  it('leaves a U-turn rounded: both corners turn the same way', () => {
    const uTurn: Point[] = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 20, y: 100 },
      { x: 20, y: 0 },
    ];
    const d = orthoD(uTurn, style(6));

    expect(d.match(/Q/g)).toHaveLength(2);
    expect(d).not.toContain('C');
  });

  it('needs room on both straights before it reaches for one', () => {
    const cramped: Point[] = [
      { x: 0, y: 0 },
      { x: 0, y: 8 },
      { x: 10, y: 8 },
      { x: 10, y: 100 },
    ];

    expect(orthoD(cramped, style(6))).not.toContain('C');
  });
});

describe('smoothD', () => {
  it('pins the first and last points', () => {
    const d = smoothD(elbow);

    expect(d.startsWith('M0,0')).toBe(true);
    expect(d.endsWith('60,40')).toBe(true);
    expect(d.split('C')).toHaveLength(3);
  });

  /*
   * The uniform parameterization this replaced sized the tangent at a knot from the chord across it,
   * so one short segment beside a long one hooked the curve back past its own endpoints: 4.8 chord
   * lengths past, on `near duplicate`, and 0.35 on `uneven`. Centripetal knots hold both to zero.
   */
  it.each([
    {
      name: 'near duplicate',
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100.5, y: 0.5 },
        { x: 100.6, y: 60 },
      ],
    },
    {
      name: 'uneven',
      points: [
        { x: 0, y: 0 },
        { x: 160, y: 0 },
        { x: 172, y: 0 },
        { x: 172, y: 90 },
      ],
    },
  ])('never runs past the ends of a segment: $name', ({ points }) => {
    expect(chordOvershoot(smoothD(points))).toBeLessThanOrEqual(0.001);
  });
});

describe('edgeD', () => {
  it('dispatches on the edge shape', () => {
    expect(edgeD(elbow, 'straight', style(8))).toBe(linearD(elbow));
    expect(edgeD(elbow, 'ortho', style(8))).toBe(orthoD(elbow, style(8)));
    expect(edgeD(elbow, 'smooth', style(8))).toBe(smoothD(elbow));
  });
});

describe('rectD', () => {
  it('closes a square-cornered rectangle when the radius is zero', () => {
    expect(rectD({ width: 20, height: 10 }, 0)).toBe('M-10,-5L10,-5L10,5L-10,5Z');
  });

  it('clamps the radius to half the shorter side', () => {
    expect(rectD({ width: 20, height: 10 }, 50)).toBe(rectD({ width: 20, height: 10 }, 5));
  });

  it('emits four corner arcs when rounded', () => {
    const d = rectD({ width: 40, height: 20 }, 4);

    expect(d.split('A')).toHaveLength(5);
    expect(d.endsWith('Z')).toBe(true);
  });
});

describe('polygonD and ellipseD', () => {
  it('closes a polygon', () => {
    expect(
      polygonD([
        { x: 0, y: -5 },
        { x: 5, y: 0 },
        { x: 0, y: 5 },
      ]),
    ).toBe('M0,-5L5,0L0,5Z');
  });

  it('draws an ellipse as two half arcs', () => {
    expect(ellipseD(10, 6)).toBe('M-10,0A10,6 0 1 0 10,0A10,6 0 1 0 -10,0Z');
  });
});

describe('boundsOf', () => {
  it('bounds a point set', () => {
    expect(boundsOf(elbow)).toEqual({ x: 0, y: 0, width: 60, height: 40 });
  });

  it('is empty for no points', () => {
    expect(boundsOf([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe('splitAround', () => {
  const box = { x: 40, y: -10, width: 20, height: 20 };
  const across: Point[] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ];

  it('cuts a crossing polyline into the two runs outside the box', () => {
    expect(splitAround(across, box)).toEqual([
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
      ],
      [
        { x: 60, y: 0 },
        { x: 100, y: 0 },
      ],
    ]);
  });

  it('keeps the interior vertices of each run', () => {
    const bent: Point[] = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 40 },
      { x: 100, y: 40 },
    ];

    expect(splitAround(bent, { x: 10, y: 30, width: 40, height: 20 })).toEqual([
      [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 30 },
      ],
      [
        { x: 50, y: 40 },
        { x: 100, y: 40 },
      ],
    ]);
  });

  it('returns the whole polyline as one run when the box is missed', () => {
    expect(splitAround(across, { x: 40, y: 20, width: 20, height: 20 })).toEqual([across]);
  });

  it('clips the tail off a polyline that ends inside the box', () => {
    expect(
      splitAround(
        [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
        ],
        box,
      ),
    ).toEqual([
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
      ],
    ]);
  });

  it('returns nothing when the box swallows the polyline', () => {
    expect(
      splitAround(
        [
          { x: 45, y: 0 },
          { x: 55, y: 0 },
        ],
        box,
      ),
    ).toEqual([]);
  });
});

describe('polylineLength', () => {
  it('sums the segments', () => {
    expect(polylineLength(elbow)).toBe(100);
  });

  it('is zero for a run with nothing to draw', () => {
    expect(polylineLength([{ x: 3, y: 4 }])).toBe(0);
  });
});
