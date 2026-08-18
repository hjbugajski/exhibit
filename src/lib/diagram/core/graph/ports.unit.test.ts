import { describe, expect, it } from 'vitest';

import { defaultMetrics } from '../../metrics.ts';
import type { Point, Rect, ShapeDef, Size } from '../../types.ts';
import { flowShapes } from '../shapes/flow-shapes.ts';
import { stateShapes } from '../shapes/state-shapes.ts';
import type { PortEdge, PortNode } from './ports.ts';
import { assignPorts, portPoint } from './ports.ts';

const m = defaultMetrics;

/** A `TB` fork bar: 80 long on the cross axis, 8 thick, centred on (100, 100). */
const bar: Rect = { x: 60, y: 96, width: 80, height: 8 };

/** A plain node box, 120 x 40, centred on (100, 100). */
const box: Rect = { x: 40, y: 80, width: 120, height: 40 };

function node(rect: Rect, shape: string): PortNode {
  return { box: rect, shape: flowShapes[shape] ?? (stateShapes[shape] as never) };
}

function edge(id: string, source: string, target: string, near: Point): PortEdge {
  return { id, source, target, nearSource: near, nearTarget: near };
}

/** Is the point on the shape's own outline, measured along its ray from the centre? */
function onOutline(shape: ShapeDef, box: Size, hit: Point): boolean {
  const anchor = shape.anchor?.(box, hit, m) ?? hit;

  return Math.abs(Math.hypot(hit.x, hit.y) - Math.hypot(anchor.x, anchor.y)) < 0.01;
}

describe('portPoint', () => {
  const size = { width: 120, height: 40 };

  it('leaves through the side the route leaves through, not the one the chord points at', () => {
    // Down and well to the left, on a TB layout: the stroke leaves the bottom and turns, so the
    // port belongs on the bottom however far sideways the neighbour is — and stops an arrowhead's
    // half-width short of where that side stops being straight, so the head stands on the flat.
    const hit = portPoint(flowShapes['rect'] as never, size, { x: -300, y: 60 }, m, 'y');

    expect(hit.x).toBeCloseTo(-(60 - m.cornerRadius - m.arrowWidth / 2), 6);
    expect(hit.y).toBe(20);
    expect(onOutline(flowShapes['rect'] as never, size, hit)).toBe(true);
  });

  it('leaves a hit that is already clear of the corners alone', () => {
    expect(portPoint(flowShapes['rect'] as never, size, { x: 0, y: -60 }, m, 'y')).toEqual({
      x: 0,
      y: -20,
    });
  });

  it('takes a side beside the node when the neighbour is beside it', () => {
    const hit = portPoint(flowShapes['rect'] as never, size, { x: 300, y: 4 }, m, 'y');

    expect(hit.x).toBeCloseTo(60, 6);
  });

  it('puts every port on a pointy shape at the vertex of the side it leaves through', () => {
    const diamond = flowShapes['diamond'] as never;
    const left = portPoint(diamond, size, { x: -8, y: 30 }, m, 'y');
    const right = portPoint(diamond, size, { x: 8, y: 30 }, m, 'y');

    expect(left).toEqual({ x: 0, y: 20 });
    expect(right).toEqual({ x: 0, y: 20 });
    expect(portPoint(diamond, size, { x: 300, y: -8 }, m, 'y')).toEqual({ x: 60, y: 0 });
  });

  it('meets a fully round side square on when nothing is crowding it', () => {
    // A stadium's ends are semicircles: with no straight run at all, one edge takes the apex.
    expect(portPoint(flowShapes['stadium'] as never, size, { x: -300, y: 40 }, m, 'x')).toEqual({
      x: -60,
      y: 0,
    });
  });
});

describe('assignPorts spread bars', () => {
  it("spreads a fork's exits evenly along the bar instead of pinching them at its centre", () => {
    const ports = assignPorts(
      new Map([['F', node(bar, 'state-bar')]]),
      [edge('a', 'F', 'Left', { x: 40, y: 200 }), edge('b', 'F', 'Right', { x: 160, y: 200 })],
      'y',
      m,
    );

    expect(ports.get('a')?.source).toEqual({ x: 60 + 80 / 3, y: 104 });
    expect(ports.get('b')?.source).toEqual({ x: 60 + (80 * 2) / 3, y: 104 });
  });

  it('orders the ports by where the neighbours sit, not by declaration', () => {
    const ports = assignPorts(
      new Map([['F', node(bar, 'state-bar')]]),
      [edge('a', 'F', 'Right', { x: 160, y: 200 }), edge('b', 'F', 'Left', { x: 40, y: 200 })],
      'y',
      m,
    );

    expect((ports.get('b')?.source?.x as number) < (ports.get('a')?.source?.x as number)).toBe(
      true,
    );
  });

  it('breaks a tie on declaration order so the layout stays deterministic', () => {
    const ports = assignPorts(
      new Map([['F', node(bar, 'state-bar')]]),
      [edge('a', 'F', 'One', { x: 100, y: 200 }), edge('b', 'F', 'Two', { x: 100, y: 200 })],
      'y',
      m,
    );

    expect((ports.get('a')?.source?.x as number) < (ports.get('b')?.source?.x as number)).toBe(
      true,
    );
  });

  it('puts an arriving edge on the face it arrives at', () => {
    const ports = assignPorts(
      new Map([['J', node(bar, 'state-bar')]]),
      [edge('a', 'In', 'J', { x: 100, y: 10 })],
      'y',
      m,
    );

    expect(ports.get('a')?.target).toEqual({ x: 100, y: 96 });
  });

  it('spreads along the y axis when ranks run across x', () => {
    const vertical: Rect = { x: 96, y: 60, width: 8, height: 80 };
    const ports = assignPorts(
      new Map([['F', node(vertical, 'state-bar')]]),
      [edge('a', 'F', 'Up', { x: 200, y: 40 }), edge('b', 'F', 'Down', { x: 200, y: 160 })],
      'x',
      m,
    );

    expect(ports.get('a')?.source).toEqual({ x: 104, y: 60 + 80 / 3 });
    expect(ports.get('b')?.source).toEqual({ x: 104, y: 60 + (80 * 2) / 3 });
  });

  it('ignores a self-loop', () => {
    const ports = assignPorts(
      new Map([['F', node(bar, 'state-bar')]]),
      [edge('a', 'F', 'F', { x: 0, y: 0 })],
      'y',
      m,
    );

    expect(ports.size).toBe(0);
  });
});

describe('assignPorts asked-for lanes', () => {
  it('puts a port where the router asked rather than where the chord crosses', () => {
    const asked = { ...edge('a', 'Up', 'T', { x: 100, y: 0 }), alongTarget: 24 };
    const ports = assignPorts(new Map([['T', node(box, 'rect')]]), [asked], 'y', m);
    const port = ports.get('a')?.target as Point;

    expect(port.x).toBeCloseTo(124, 6);
  });

  it('keeps a lane the side cannot hold on the straight of it', () => {
    const asked = { ...edge('a', 'Up', 'T', { x: 100, y: 0 }), alongTarget: 400 };
    const ports = assignPorts(new Map([['T', node(box, 'rect')]]), [asked], 'y', m);
    const port = ports.get('a')?.target as Point;

    expect(port.x).toBeCloseTo(100 + 60 - m.cornerRadius - m.arrowWidth / 2, 6);
  });
});

describe('assignPorts same-side spacing', () => {
  const need = m.arrowWidth + m.strokeWidth * 2;

  it('keeps an arrowhead of room between two edges arriving at the same side', () => {
    const ports = assignPorts(
      new Map([['T', node(box, 'rect')]]),
      [edge('a', 'Up', 'T', { x: 99, y: 0 }), edge('b', 'Down', 'T', { x: 101, y: 0 })],
      'y',
      m,
    );
    const first = ports.get('a')?.target as Point;
    const second = ports.get('b')?.target as Point;

    expect(first.y).toBe(80);
    expect(second.y).toBe(80);
    expect(second.x - first.x).toBeGreaterThanOrEqual(need);
  });

  it('leaves the end that is already on its lane alone and moves the one that is not', () => {
    // One edge arrives straight down the node's own axis, so the port it asks for is the port that
    // draws it as a single run; the other leaves the same side for somewhere far off it and is bent
    // whichever slot it gets. Split evenly, both come out bent.
    const ports = assignPorts(
      new Map([['T', node(box, 'rect')]]),
      [edge('a', 'T', 'Away', { x: 96, y: 0 }), edge('b', 'Up', 'T', { x: 100, y: 0 })],
      'y',
      m,
    );

    expect(ports.get('b')?.target).toEqual({ x: 100, y: 80 });
    expect(ports.get('a')?.source?.x).toBeCloseTo(100 - need, 6);
  });

  it('keeps the order they arrive in and stays inside the run of the side', () => {
    const arrivals = [90, 92, 94, 96, 98, 100].map((x, index) =>
      edge(`e${index}`, `n${index}`, 'T', { x, y: 0 }),
    );
    const ports = assignPorts(new Map([['T', node(box, 'rect')]]), arrivals, 'y', m);
    const xs = arrivals.map((entry) => (ports.get(entry.id) as { target: Point }).target.x);
    const limit = 60 - m.arrowWidth / 2;

    for (const [index, x] of xs.entries()) {
      expect(x).toBeGreaterThanOrEqual(100 - limit - 0.01);
      expect(x).toBeLessThanOrEqual(100 + limit + 0.01);

      if (index > 0) {
        expect(x - (xs[index - 1] as number)).toBeGreaterThanOrEqual(need - 0.01);
      }
    }
  });

  it('rides the corner arcs of a side too short to hold its ports, and stays on the outline', () => {
    // An LR node 40 high with 18 of corner radius: the straight part of its right side is 4 long,
    // so three ports have nowhere to go but onto the arcs at either end of it.
    const tall: Rect = { x: 40, y: 80, width: 120, height: 40 };
    const shape = flowShapes['round'] as ShapeDef;
    const size = { width: tall.width, height: tall.height };
    const ports = assignPorts(
      new Map([['T', node(tall, 'round')]]),
      [
        edge('a', 'T', 'Up', { x: 400, y: 40 }),
        edge('b', 'T', 'Down', { x: 400, y: 160 }),
        edge('c', 'Back', 'T', { x: 400, y: 100 }),
      ],
      'x',
      m,
    );
    const ys = ['a', 'b', 'c']
      .map((id) => (ports.get(id)?.source ?? ports.get(id)?.target) as Point)
      .map((point) => {
        const local = { x: point.x - 100, y: point.y - 100 };
        const hit = shape.anchor?.(size, local, m) as Point;

        expect(Math.hypot(local.x, local.y)).toBeCloseTo(Math.hypot(hit.x, hit.y), 6);
        expect(local.x).toBeGreaterThan(0);

        return point.y;
      })
      .sort((left, right) => left - right);

    for (let i = 1; i < ys.length; i += 1) {
      expect((ys[i] as number) - (ys[i - 1] as number)).toBeGreaterThanOrEqual(need - 0.01);
    }
  });

  it('spaces the two faces of a node independently', () => {
    const ports = assignPorts(
      new Map([['T', node(box, 'rect')]]),
      [edge('in', 'Up', 'T', { x: 100, y: 0 }), edge('out', 'T', 'Down', { x: 100, y: 300 })],
      'y',
      m,
    );

    expect(ports.get('in')?.target).toEqual({ x: 100, y: 80 });
    expect(ports.get('out')?.source).toEqual({ x: 100, y: 120 });
  });

  it('keeps an exit clear of the arrowhead of an edge arriving on the same side', () => {
    const ports = assignPorts(
      new Map([['T', node(box, 'rect')]]),
      [edge('in', 'Up', 'T', { x: 100, y: 0 }), edge('out', 'T', 'Back', { x: 100, y: 0 })],
      'y',
      m,
    );
    const arrival = ports.get('in')?.target as Point;
    const exit = ports.get('out')?.source as Point;

    expect(arrival.y).toBe(80);
    expect(exit.y).toBe(80);
    expect(Math.abs(exit.x - arrival.x)).toBeGreaterThanOrEqual(need);
  });

  it('spreads a crowd along a lid that has no straight run at all, and only as far as it must', () => {
    // A cylinder's lid is elliptical the whole way across: one edge takes the apex, three cannot.
    const cylinder: Rect = { x: 40, y: 80, width: 120, height: 60 };
    const shape = flowShapes['cylinder'] as ShapeDef;
    const size = { width: cylinder.width, height: cylinder.height };
    const arrivals = [40, 100, 160].map((x, index) =>
      edge(`e${index}`, `n${index}`, 'T', { x, y: 0 }),
    );
    const xs = [...assignPorts(new Map([['T', node(cylinder, 'cylinder')]]), arrivals, 'y', m)]
      .map(([, port]) => port.target as Point)
      .map((point) => {
        const local = { x: point.x - 100, y: point.y - 110 };
        const hit = shape.anchor?.(size, local, m) as Point;

        expect(Math.hypot(local.x, local.y)).toBeCloseTo(Math.hypot(hit.x, hit.y), 4);

        return point.x;
      })
      .sort((left, right) => left - right);

    for (const [index, x] of xs.entries()) {
      expect(x).toBeCloseTo(100 + (index - 1) * need, 4);
    }
  });

  it('lets two edges leaving a pointy shape share its vertex, so a fork forks from a point', () => {
    const ports = assignPorts(
      new Map([['D', node(box, 'diamond')]]),
      [edge('a', 'D', 'One', { x: 40, y: 300 }), edge('b', 'D', 'Two', { x: 160, y: 300 })],
      'y',
      m,
    );

    expect(ports.get('a')?.source).toEqual({ x: 100, y: 120 });
    expect(ports.get('b')?.source).toEqual({ x: 100, y: 120 });
  });

  it('slides edges arriving at one vertex apart: two arrowheads cannot share a point', () => {
    const shape = flowShapes['diamond'] as ShapeDef;
    const size = { width: box.width, height: box.height };
    const ports = assignPorts(
      new Map([['D', node(box, 'diamond')]]),
      [
        edge('a', 'One', 'D', { x: 40, y: 300 }),
        edge('b', 'Two', 'D', { x: 100, y: 300 }),
        edge('c', 'Three', 'D', { x: 160, y: 300 }),
      ],
      'y',
      m,
    );
    const xs = ['a', 'b', 'c'].map((id) => {
      const point = ports.get(id)?.target as Point;
      const local = { x: point.x - 100, y: point.y - 100 };
      const hit = shape.anchor?.(size, local, m) as Point;

      expect(Math.hypot(local.x, local.y)).toBeCloseTo(Math.hypot(hit.x, hit.y), 6);

      return point.x;
    });

    expect(xs[1]).toBeCloseTo(100, 4);
    expect((xs[1] as number) - (xs[0] as number)).toBeCloseTo(need, 4);
    expect((xs[2] as number) - (xs[1] as number)).toBeCloseTo(need, 4);
  });

  it('keeps an edge arriving at a vertex clear of one leaving it', () => {
    const ports = assignPorts(
      new Map([['D', node(box, 'diamond')]]),
      [edge('in', 'Up', 'D', { x: 100, y: 0 }), edge('out', 'D', 'Back', { x: 100, y: 0 })],
      'y',
      m,
    );
    const arrival = ports.get('in')?.target as Point;
    const exit = ports.get('out')?.source as Point;

    expect(Math.abs(exit.x - arrival.x)).toBeCloseTo(need, 4);
  });
});
