import { describe, expect, it } from 'vitest';

import { defaultMetrics } from '../../metrics.ts';
import type { Rect } from '../../types.ts';
import { defaultShapes, resolveShape } from '../shapes/registry.ts';
import type { GutterBand, GutterInput, TitleLaneInput } from './gutter.ts';
import { gutterLanes, gutterPoints, planGutter, planTitleLane } from './gutter.ts';

const m = defaultMetrics;

function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height };
}

/**
 * A `TB` cluster 200 wide, with a title band, holding two stacked nodes. An edge arriving from above
 * at `Bottom` has to get past `Top`.
 */
function band(overrides: Partial<GutterBand> = {}): GutterBand {
  return {
    id: 'g',
    box: rect(0, 0, 200, 300),
    titleHeight: 24,
    contents: [
      { node: 'Top', rect: rect(60, 60, 80, 40) },
      { node: 'Bottom', rect: rect(60, 200, 80, 40) },
    ],
    ...overrides,
  };
}

/**
 * `drawn` defaults to the blind chord from `outside` to the endpoint's centre — what the engine
 * would emit if the cluster were empty. Override it to describe a route that dodges on its own.
 */
function entering(overrides: Partial<GutterInput> = {}): GutterInput {
  const input: GutterInput = {
    band: band(),
    node: rect(60, 200, 80, 40),
    nodeId: 'Bottom',
    outside: { x: 100, y: -100 },
    drawn: [],
    enter: true,
    axis: 'y',
    m,
    ...overrides,
  };

  if (input.drawn.length > 0) {
    return input;
  }

  const centre = {
    x: input.node.x + input.node.width / 2,
    y: input.node.y + input.node.height / 2,
  };

  return { ...input, drawn: [input.outside, centre] };
}

describe('planGutter', () => {
  it('leaves a chord that already misses everything alone', () => {
    expect(planGutter(entering({ node: rect(60, 60, 80, 40), nodeId: 'Top' }))).toBeNull();
  });

  it('judges the route it is given, not a chord it imagines', () => {
    // Same endpoint and same contents; only the polyline the engine would draw differs. The blind
    // default hits `Top`, so a detour is planned; a route that already dodges it is left alone.
    expect(planGutter(entering())).not.toBeNull();
    expect(
      planGutter(
        entering({
          drawn: [
            { x: 100, y: -100 },
            { x: 190, y: -100 },
            { x: 190, y: 220 },
            { x: 100, y: 220 },
          ],
        }),
      ),
    ).toBeNull();
  });

  it('leaves a cluster with nothing else in it alone', () => {
    expect(
      planGutter(
        entering({ band: band({ contents: [{ node: 'Bottom', rect: rect(60, 200, 80, 40) }] }) }),
      ),
    ).toBeNull();
  });

  it('turns in on a rank gap between the obstacle and the endpoint', () => {
    const plan = planGutter(entering());

    expect(plan).toMatchObject({ cluster: 'g', border: 0, enter: true, cross: 100 });
    expect(plan?.jog).toBe(150);
  });

  it('keeps the lane clear of the title band and of the contents', () => {
    const plan = planGutter(entering()) as NonNullable<ReturnType<typeof planGutter>>;
    const [min, max] = plan.strip;

    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThanOrEqual(60);
    expect(gutterLanes(plan, 1, m)[0] as number).toBeGreaterThan(min);
    expect(gutterLanes(plan, 1, m)[0] as number).toBeLessThan(max);
  });

  it('runs the lane below the title band when the title shares the cross axis', () => {
    const plan = planGutter(
      entering({
        axis: 'x',
        band: band({
          box: rect(0, 0, 300, 200),
          contents: [
            { node: 'Left', rect: rect(60, 60, 40, 80) },
            { node: 'Right', rect: rect(200, 60, 40, 80) },
          ],
        }),
        node: rect(200, 60, 40, 80),
        nodeId: 'Right',
        outside: { x: -100, y: 100 },
      }),
    );

    // Title glyphs reach `clusterPadding / 2 + titleHeight`; a low lane has to start below them.
    expect(plan?.side === 'high' || (plan?.strip[0] as number) >= m.clusterPadding / 2 + 24).toBe(
      true,
    );
  });

  it('enters at the border the edge arrives at, not at a fixed side', () => {
    const plan = planGutter(
      entering({ node: rect(60, 60, 80, 40), nodeId: 'Top', outside: { x: 100, y: 900 } }),
    );

    expect(plan?.border).toBe(300);
    expect(plan?.jog).toBe(150);
  });

  it('leaves through the border the edge is heading for', () => {
    const plan = planGutter(
      entering({
        node: rect(60, 60, 80, 40),
        nodeId: 'Top',
        outside: { x: 100, y: 900 },
        enter: false,
      }),
    );

    expect(plan).toMatchObject({ border: 300, enter: false });
  });

  it('spreads the edges sharing one gutter across it and keeps them inside', () => {
    const plan = planGutter(entering()) as NonNullable<ReturnType<typeof planGutter>>;
    const lanes = gutterLanes(plan, 3, m);

    expect(new Set(lanes).size).toBe(3);
    expect(lanes.every((lane) => lane > plan.strip[0] && lane < plan.strip[1])).toBe(true);
  });

  it('opens two lanes to a full arrow apart rather than thirds of a padding band', () => {
    const plan = planGutter(entering()) as NonNullable<ReturnType<typeof planGutter>>;
    const [first, second] = gutterLanes(plan, 2, m) as [number, number];

    expect(second - first).toBeCloseTo(m.arrowWidth + m.strokeWidth * 2, 6);
    expect(first).toBeGreaterThanOrEqual(plan.strip[0] + m.strokeWidth * 2);
    expect(second).toBeLessThanOrEqual(plan.strip[1] - m.strokeWidth * 2);
  });
});

/**
 * A `TB` cluster whose title plate sits at the top left, holding one node wide enough to be met
 * either side of it. The endpoint's port defaults to the middle of its top side — under the plate.
 */
function crossing(overrides: Partial<TitleLaneInput> = {}): TitleLaneInput {
  const node = rect(40, 160, 200, 40);

  return {
    plates: [rect(16, 12, 140, 24)],
    box: rect(0, 0, 280, 300),
    node,
    shape: resolveShape(defaultShapes, 'rect'),
    port: { x: 140, y: 160 },
    outside: { x: 140, y: -100 },
    obstacles: [],
    taken: [],
    axis: 'y',
    m,
    ...overrides,
  };
}

describe('planTitleLane', () => {
  it('leaves a lane already clear of every plate alone', () => {
    expect(planTitleLane(crossing({ port: { x: 220, y: 160 } }))).toBeNull();
  });

  it('crosses the border on the near side of the plate, a stroke clear of it', () => {
    expect(planTitleLane(crossing())).toEqual({ x: 156 + m.strokeWidth, y: 0 });
  });

  it('keeps the whole lane clear when a nested plate covers the near side', () => {
    const lane = planTitleLane(
      crossing({ plates: [rect(16, 12, 140, 24), rect(60, 60, 140, 24)] }),
    );

    expect(lane).toEqual({ x: 200 + m.strokeWidth, y: 0 });
  });

  it('declines when the endpoint has no side left to be met on', () => {
    expect(planTitleLane(crossing({ node: rect(120, 160, 40, 40) }))).toBeNull();
  });

  it('declines when the lane it would take runs through something', () => {
    expect(planTitleLane(crossing({ obstacles: [rect(150, 60, 40, 40)] }))).toBeNull();
  });

  it('steps past a lane another edge into the same side already took', () => {
    const first = planTitleLane(crossing()) as NonNullable<ReturnType<typeof planTitleLane>>;
    const second = planTitleLane(crossing({ taken: [first.x] }));

    expect((second as NonNullable<typeof second>).x - first.x).toBe(
      m.arrowWidth + m.strokeWidth * 2,
    );
  });

  it('has nothing to move when the port is on a side beside the node', () => {
    expect(planTitleLane(crossing({ port: { x: 40, y: 180 } }))).toBeNull();
  });
});

describe('gutterPoints', () => {
  it('runs border, lane, then across to the endpoint when entering', () => {
    const plan = planGutter(entering()) as NonNullable<ReturnType<typeof planGutter>>;

    expect(gutterPoints(plan, 8, 'y')).toEqual([
      { x: 8, y: 0 },
      { x: 8, y: 150 },
      { x: 100, y: 150 },
    ]);
  });

  it('reverses to across, lane, then border when leaving', () => {
    const plan = planGutter(
      entering({
        node: rect(60, 60, 80, 40),
        nodeId: 'Top',
        outside: { x: 100, y: 900 },
        enter: false,
      }),
    ) as NonNullable<ReturnType<typeof planGutter>>;
    const points = gutterPoints(plan, 8, 'y');

    expect(points[0]?.x).toBe(100);
    expect(points.at(-1)).toEqual({ x: 8, y: 300 });
  });
});
