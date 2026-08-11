import { describe, expect, it } from 'vitest';

import type { Point } from '../../types.ts';
import {
  clipSegmentToRect,
  rayEllipse,
  rayPolygon,
  rayRect,
  segmentHitsRect,
} from './intersect.ts';

const square: Point[] = [
  { x: -5, y: -5 },
  { x: 5, y: -5 },
  { x: 5, y: 5 },
  { x: -5, y: 5 },
];

const diamond: Point[] = [
  { x: 0, y: -10 },
  { x: 20, y: 0 },
  { x: 0, y: 10 },
  { x: -20, y: 0 },
];

describe('rayRect', () => {
  it('hits the side the direction points at', () => {
    expect(rayRect({ width: 40, height: 20 }, { x: 1, y: 0 })).toEqual({ x: 20, y: 0 });
    expect(rayRect({ width: 40, height: 20 }, { x: 0, y: -3 })).toEqual({ x: 0, y: -10 });
  });

  it('hits the corner on the box diagonal', () => {
    const hit = rayRect({ width: 20, height: 20 }, { x: 1, y: 1 });

    expect(hit.x).toBeCloseTo(10, 9);
    expect(hit.y).toBeCloseTo(10, 9);
  });

  it('is stable for a zero-length direction', () => {
    expect(rayRect({ width: 20, height: 10 }, { x: 0, y: 0 })).toEqual({ x: 10, y: 0 });
  });
});

describe('rayEllipse', () => {
  it('matches the analytic radius on the axes', () => {
    expect(rayEllipse(10, 6, { x: 1, y: 0 })).toEqual({ x: 10, y: 0 });

    const down = rayEllipse(10, 6, { x: 0, y: 2 });

    expect(down.x).toBeCloseTo(0, 9);
    expect(down.y).toBeCloseTo(6, 9);
  });

  it('lands on the ellipse for an off-axis direction', () => {
    const hit = rayEllipse(10, 6, { x: 1, y: 1 });

    expect((hit.x / 10) ** 2 + (hit.y / 6) ** 2).toBeCloseTo(1, 9);
  });

  it('is stable for a degenerate radius', () => {
    expect(rayEllipse(0, 0, { x: 1, y: 1 })).toEqual({ x: 0, y: 0 });
  });
});

describe('rayPolygon', () => {
  it('agrees with the rectangle intersection on a square', () => {
    const hit = rayPolygon(square, { x: 1, y: 1 });

    expect(hit.x).toBeCloseTo(5, 9);
    expect(hit.y).toBeCloseTo(5, 9);
  });

  it('lands on the slanted edge of a diamond, not its bounding box', () => {
    const hit = rayPolygon(diamond, { x: 1, y: 1 });

    // Edge from (20,0) to (0,10) is x/20 + y/10 = 1; with x === y that is x = 20/3.
    expect(hit.x).toBeCloseTo(20 / 3, 9);
    expect(hit.y).toBeCloseTo(20 / 3, 9);
  });

  it('hits the vertices along the axes', () => {
    expect(rayPolygon(diamond, { x: 1, y: 0 }).x).toBeCloseTo(20, 9);
    expect(rayPolygon(diamond, { x: 0, y: -1 }).y).toBeCloseTo(-10, 9);
  });

  it('takes the nearest crossing on a concave outline', () => {
    const notched: Point[] = [
      { x: -10, y: -10 },
      { x: 10, y: -10 },
      { x: 10, y: 10 },
      { x: -10, y: 10 },
      { x: -4, y: 0 },
    ];

    expect(rayPolygon(notched, { x: -1, y: 0 }).x).toBeCloseTo(-4, 9);
  });

  it('is stable for a degenerate outline or direction', () => {
    expect(rayPolygon([], { x: 1, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(rayPolygon(square, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe('segmentHitsRect', () => {
  const box = { x: 0, y: 0, width: 10, height: 10 };

  it('catches a segment crossing clean through', () => {
    expect(segmentHitsRect({ x: -5, y: 5 }, { x: 15, y: 5 }, box)).toBe(true);
  });

  it('catches a segment that starts inside', () => {
    expect(segmentHitsRect({ x: 5, y: 5 }, { x: 50, y: 50 }, box)).toBe(true);
  });

  it('misses a segment that stops short', () => {
    expect(segmentHitsRect({ x: -5, y: 5 }, { x: -1, y: 5 }, box)).toBe(false);
  });

  it('misses a segment running past on the diagonal', () => {
    expect(segmentHitsRect({ x: 11, y: -5 }, { x: 11, y: 15 }, box)).toBe(false);
  });

  it('never hits a rect with no area, so a shrunk box needs no special case', () => {
    expect(segmentHitsRect({ x: -5, y: 5 }, { x: 15, y: 5 }, { ...box, height: 0 })).toBe(false);
  });
});

describe('clipSegmentToRect', () => {
  const box = { x: 0, y: 0, width: 10, height: 10 };

  it('returns the parameters of the stretch inside the box', () => {
    expect(clipSegmentToRect({ x: -10, y: 5 }, { x: 10, y: 5 }, box)).toEqual([0.5, 1]);
  });

  it('starts at zero when the segment begins inside', () => {
    expect(clipSegmentToRect({ x: 5, y: 5 }, { x: 25, y: 5 }, box)).toEqual([0, 0.25]);
  });

  it('returns null for a miss', () => {
    expect(clipSegmentToRect({ x: -5, y: 5 }, { x: -1, y: 5 }, box)).toBeNull();
  });
});
