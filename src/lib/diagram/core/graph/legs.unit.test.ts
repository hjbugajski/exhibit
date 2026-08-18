import { describe, expect, it } from 'vitest';

import { defaultMetrics } from '../../metrics.ts';
import type { Point } from '../../types.ts';
import type { LegRoute } from './legs.ts';
import { separateLegs } from './legs.ts';

const m = defaultMetrics;
const gap = m.arrowWidth + m.strokeWidth * 2;

/** A route that runs down to `rank`, across from `from` to `to`, then on down to `end`. */
function transfer(from: number, to: number, rank = 100, end = 200): LegRoute {
  return {
    points: [
      { x: from, y: 0 },
      { x: from, y: rank },
      { x: to, y: rank },
      { x: to, y: end },
    ],
    labelPoint: { x: (from + to) / 2, y: rank },
  };
}

/** A route from its points alone, with a label point nowhere near any of them. */
function route(points: Point[]): LegRoute {
  return { points, labelPoint: { x: -1000, y: -1000 } };
}

describe('separateLegs', () => {
  it('leaves legs that miss each other on the lane they turned in', () => {
    const routes = [transfer(0, 100), transfer(200, 300)];

    separateLegs(routes, [], 'y', m);

    expect(routes.map((route) => route.points[1]?.y)).toEqual([100, 100]);
  });

  it('moves the shorter of two legs sharing a lane off it', () => {
    const long = transfer(0, 300);
    const short = transfer(100, 200);

    separateLegs([long, short], [], 'y', m);

    expect(long.points[1]?.y).toBe(100);
    expect(long.points[2]?.y).toBe(100);
    expect(short.points[1]?.y).toBe(100 + gap);
    expect(short.points[2]?.y).toBe(100 + gap);
  });

  it('nests the leg it moves toward the rank it is heading for', () => {
    // Running back up the diagram: the lane it takes is the one nearer the rank it ends on, so its
    // own stem never has to cross the leg it made room beside.
    const up = (from: number, to: number): LegRoute =>
      route([
        { x: from, y: 200 },
        { x: from, y: 100 },
        { x: to, y: 100 },
        { x: to, y: 0 },
      ]);
    const long = up(0, 300);
    const short = up(100, 200);

    separateLegs([long, short], [], 'y', m);

    expect(long.points[1]?.y).toBe(100);
    expect(short.points[1]?.y).toBe(100 - gap);
  });

  it('takes the other lane when the one it would rather have has no room', () => {
    // 10 of rank left after the leg is not enough to turn a corner in, so the lane it wants is out
    // and the one behind it is not.
    const routes = [transfer(0, 300, 100, 200), transfer(100, 200, 100, 110)];

    separateLegs(routes, [], 'y', m);

    expect(routes[1]?.points[1]?.y).toBe(100 - gap);
  });

  it('leaves a leg with no room either way alone', () => {
    const pinched = route([
      { x: 100, y: 96 },
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 104 },
    ]);

    separateLegs([transfer(0, 300, 100, 200), pinched], [], 'y', m);

    expect(pinched.points[1]?.y).toBe(100);
  });

  it('spreads the legs of one rank gap across it when several collide', () => {
    const routes = [transfer(0, 300), transfer(50, 280), transfer(80, 260)];

    separateLegs(routes, [], 'y', m);

    const lanes = routes.map((route) => route.points[1]?.y as number);

    expect(new Set(lanes).size).toBe(3);

    for (const [index, lane] of lanes.entries()) {
      for (const other of lanes.slice(index + 1)) {
        expect(Math.abs(lane - other)).toBeGreaterThanOrEqual(gap - 0.01);
      }
    }
  });

  it('carries a label riding the leg it moves', () => {
    const long = transfer(0, 300);
    const short = transfer(100, 200);

    separateLegs([long, short], [], 'y', m);

    expect(short.labelPoint).toEqual({ x: 150, y: 100 + gap });
    expect(long.labelPoint).toEqual({ x: 150, y: 100 });
  });

  it('leaves a label that is not on the leg where it is', () => {
    const long = transfer(0, 300);
    const short = transfer(100, 200);

    short.labelPoint = { x: 150, y: 40 };
    separateLegs([long, short], [], 'y', m);

    expect(short.labelPoint).toEqual({ x: 150, y: 40 });
  });

  it('leaves a leg that only crosses another alone', () => {
    // Four units of shared lane is a crossing, not a shared stroke; moving for it would put a kink
    // in the shorter leg to hide something nothing can see.
    const long = transfer(0, 300);
    const crossing = transfer(298, 302);

    separateLegs([long, crossing], [], 'y', m);

    expect(crossing.points[1]?.y).toBe(100);
  });

  it('ignores a U-turn, which has no gap to move inside', () => {
    const lobe = route([
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 60, y: 100 },
      { x: 60, y: 0 },
    ]);
    const straight = transfer(0, 60);

    separateLegs([lobe, straight], [], 'y', m);

    expect(lobe.points[1]?.y).toBe(100);
  });

  it('places the second leg of a route against where the first one ended up', () => {
    // Two lateral legs of one route, one rank-axis segment apart: moving the long one rewrites the
    // bound the short one is placed against, so a window read once up front is already stale.
    const moved = route([
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 40, y: 100 },
      { x: 40, y: 116 },
      { x: 200, y: 116 },
      { x: 200, y: 300 },
    ]);
    const crowd = [
      route([
        { x: 40, y: 50 },
        { x: 40, y: 116 },
        { x: 500, y: 116 },
        { x: 500, y: 300 },
      ]),
      route([
        { x: 40, y: 50 },
        { x: 40, y: 125 },
        { x: 500, y: 125 },
        { x: 500, y: 300 },
      ]),
      route([
        { x: 20, y: 50 },
        { x: 20, y: 100 },
        { x: -400, y: 100 },
        { x: -400, y: 300 },
      ]),
    ];

    separateLegs([...crowd, moved], [], 'y', m);

    const ranks = moved.points.map((point) => point.y);

    // The route ran down the page before the pass and still does, and its own two legs are either a
    // lane apart or on the same lane — never the 2 units of overlap this pass exists to remove.
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));

    const between = Math.abs((moved.points[3] as Point).y - (moved.points[1] as Point).y);

    expect(between === 0 || between >= gap - 0.01, `${between}`).toBe(true);
  });

  it('refuses a lane that would slide a leg into a node it was clear of', () => {
    // The window runs to the far point, which is a node centre on the next rank: without the box in
    // the obstacle set the displaced leg lands inside it.
    const blocked = transfer(100, 200, 100, 200);
    const node = { x: 90, y: 104, width: 120, height: 38 };

    separateLegs([transfer(0, 300, 100, 200), blocked], [node], 'y', m);

    expect((blocked.points[1] as Point).y).toBe(100 - gap);
  });

  it('runs on the cross axis when ranks run across x', () => {
    const long = route([{ x: 0, y: 0 }, ...transfer(0, 300).points.map(swap)]);
    const short = route([{ x: 0, y: 0 }, ...transfer(100, 200).points.map(swap)]);

    separateLegs([long, short], [], 'x', m);

    expect(short.points[2]?.x).toBe(100 + gap);
  });
});

function swap(point: Point): Point {
  return { x: point.y, y: point.x };
}
