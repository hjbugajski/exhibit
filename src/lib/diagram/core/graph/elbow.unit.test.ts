import { describe, expect, it } from 'vitest';

import { defaultMetrics } from '../../metrics.ts';
import type { Point, Rect } from '../../types.ts';
import { flowShapes } from '../shapes/flow-shapes.ts';
import { stateShapes } from '../shapes/state-shapes.ts';
import type { ElbowEdge } from './elbow.ts';
import { planElbow } from './elbow.ts';
import type { RouteEndpoint, RouteObstacle } from './route.ts';

const m = defaultMetrics;

function endpoint(
  x: number,
  y: number,
  shape = 'rect',
  size = { width: 60, height: 32 },
): RouteEndpoint {
  return {
    centre: { x, y },
    size,
    shape: flowShapes[shape] ?? stateShapes[shape] ?? (flowShapes['rect'] as never),
  };
}

/** A circle has no flat to slide along, so its port — and the L's lane — is its own centre. */
function marker(x: number, y: number): RouteEndpoint {
  return endpoint(x, y, 'circle', { width: 32, height: 32 });
}

/** A source above and to the left of its target, with the aim the port pass would be given. */
function edge(target: RouteEndpoint, source = marker(100, 100)): ElbowEdge {
  return {
    source,
    target,
    sourceId: 'a',
    targetId: 'b',
    aim: target.centre,
    interior: [],
  };
}

function obstacle(rect: Rect): RouteObstacle {
  return { node: 'other', rect };
}

describe('planElbow', () => {
  it('aims the target port at the source lane on the target row', () => {
    const aim = planElbow(edge(endpoint(280, 240)), [], 'y', m) as Point;

    expect(aim).toEqual({ x: 100, y: 240 });
  });

  it('mirrors for a target above the source', () => {
    const aim = planElbow(edge(endpoint(280, 240), marker(100, 400)), [], 'y', m) as Point;

    expect(aim).toEqual({ x: 100, y: 240 });
  });

  it('works on the other axis, where the rank runs across', () => {
    const aim = planElbow(edge(endpoint(280, 260), marker(100, 100)), [], 'x', m) as Point;

    expect(aim).toEqual({ x: 280, y: 100 });
  });

  it('drops from the port rather than the centre, so a wide source leans toward its target', () => {
    const aim = planElbow(edge(endpoint(280, 240), endpoint(100, 100)), [], 'y', m) as Point;

    expect(aim.y).toBe(240);
    expect(aim.x).toBeGreaterThan(100);
    expect(aim.x).toBeLessThan(130);
  });

  it('refuses a lateral leg too short to read as an elbow', () => {
    expect(planElbow(edge(endpoint(160, 240)), [], 'y', m)).toBeNull();
  });

  it('refuses a target too close along the rank axis to turn in', () => {
    expect(planElbow(edge(endpoint(280, 126)), [], 'y', m)).toBeNull();
  });

  it('refuses a target the source is already lined up with', () => {
    expect(planElbow(edge(endpoint(100, 240)), [], 'y', m)).toBeNull();
  });

  it('refuses a blocked vertical leg', () => {
    const blocked = [obstacle({ x: 80, y: 160, width: 40, height: 30 })];

    expect(planElbow(edge(endpoint(280, 240)), blocked, 'y', m)).toBeNull();
  });

  it('refuses a blocked lateral leg', () => {
    const blocked = [obstacle({ x: 170, y: 230, width: 30, height: 20 })];

    expect(planElbow(edge(endpoint(280, 240)), blocked, 'y', m)).toBeNull();
  });

  it('ignores a box belonging to one of its own endpoints', () => {
    const own: RouteObstacle = { node: 'b', rect: { x: 170, y: 230, width: 30, height: 20 } };

    expect(planElbow(edge(endpoint(280, 240)), [own], 'y', m)).not.toBeNull();
  });

  it('keeps a connector bar out of it, whichever end it is', () => {
    const size = { width: 80, height: 8 };

    expect(planElbow(edge(endpoint(280, 240, 'state-bar', size)), [], 'y', m)).toBeNull();
    expect(
      planElbow(edge(endpoint(280, 240), endpoint(100, 100, 'state-bar', size)), [], 'y', m),
    ).toBeNull();
  });

  it('measures the lateral leg to the outline, not to the centre', () => {
    // A diamond twice as wide leaves less than the minimum between the lane and its left vertex,
    // even though its centre is the same distance away as the rectangle's that qualifies.
    const wide = endpoint(200, 240, 'diamond', { width: 160, height: 60 });

    expect(planElbow(edge(endpoint(200, 240)), [], 'y', m)).not.toBeNull();
    expect(planElbow(edge(wide), [], 'y', m)).toBeNull();
  });

  it('takes a chain that stayed in the source lane and then stepped across', () => {
    const chain = {
      ...edge(endpoint(280, 340)),
      interior: [
        { x: 100, y: 180 },
        { x: 280, y: 260 },
      ],
    };

    expect(planElbow(chain, [], 'y', m)).not.toBeNull();
  });

  it('leaves a chain that picked a lane of its own alone', () => {
    const chain = { ...edge(endpoint(280, 340)), interior: [{ x: 190, y: 180 }] };

    expect(planElbow(chain, [], 'y', m)).toBeNull();
  });
});
