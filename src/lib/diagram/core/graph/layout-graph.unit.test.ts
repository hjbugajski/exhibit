import { describe, expect, it } from 'vitest';

import { goldenScene } from '@testing/diagram/golden.ts';
import { chain, cluster, layoutOptions, model } from '@testing/diagram/graph-fixtures.ts';
import {
  assertClustersHold,
  assertDeterministic,
  assertLayoutInvariants,
  assertNoEdgeThroughNode,
  assertNoNodeOverlap,
  assertTitlesUnstruck,
} from '@testing/diagram/invariants.ts';

import { resolveMetrics } from '../../metrics.ts';
import type { GraphScene, Point, Rect, SceneCluster, SceneEdge, SceneNode } from '../../types.ts';
import { defaultShapes } from '../shapes/registry.ts';
import { layoutGraph } from './layout-graph.ts';
import type { Direction, GraphModel } from './model.ts';

const options = layoutOptions();

function laid(built: GraphModel, overrides = {}) {
  const result = layoutGraph(built, { ...options, ...overrides });

  expect(result.scene, JSON.stringify(result.diagnostics)).not.toBeNull();

  return result;
}

const fixtures: { name: string; direction: Direction; model: GraphModel }[] = [
  { name: 'single node', direction: 'TB', model: model({ nodes: ['only'] }) },
  { name: 'empty graph', direction: 'TB', model: model({ nodes: [] }) },
  { name: 'chain TB', direction: 'TB', model: chain(4) },
  { name: 'chain BT', direction: 'BT', model: chain(4, 'BT') },
  { name: 'chain LR', direction: 'LR', model: chain(4, 'LR') },
  { name: 'chain RL', direction: 'RL', model: chain(4, 'RL') },
  {
    name: 'branch and merge',
    direction: 'TB',
    model: model({
      nodes: ['start', { id: 'check', shape: 'diamond', label: 'Ready?' }, 'yes', 'no', 'done'],
      edges: [
        { from: 'start', to: 'check' },
        { from: 'check', to: 'yes', label: 'yes' },
        { from: 'check', to: 'no', label: 'no' },
        { from: 'yes', to: 'done' },
        { from: 'no', to: 'done' },
      ],
    }),
  },
  {
    name: 'cycle',
    direction: 'TB',
    model: model({
      nodes: ['a', 'b', 'c'],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'a' },
      ],
    }),
  },
  {
    name: 'self loop',
    direction: 'TB',
    model: model({
      nodes: ['a', 'b'],
      edges: [
        { from: 'a', to: 'a', label: 'retry' },
        { from: 'a', to: 'b' },
      ],
    }),
  },
  {
    name: 'parallel edges',
    direction: 'TB',
    model: model({
      nodes: ['a', 'b'],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ],
    }),
  },
  {
    name: 'long labelled edge',
    direction: 'TB',
    model: model({
      nodes: ['a', 'b', 'c', 'd'],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'd' },
        { from: 'a', to: 'd', label: 'skip the whole middle' },
      ],
    }),
  },
  {
    name: 'nested clusters',
    direction: 'TB',
    model: model({
      nodes: [
        'top',
        { id: 'b', cluster: 'inner' },
        { id: 'c', cluster: 'inner' },
        { id: 'd', cluster: 'outer' },
        'tail',
      ],
      edges: [
        { from: 'top', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'd' },
        { from: 'd', to: 'tail' },
      ],
      clusters: [cluster('outer', null, 'Outer'), cluster('inner', 'outer', 'Inner')],
    }),
  },
  {
    name: 'disconnected components',
    direction: 'TB',
    model: model({
      nodes: ['a', 'b', 'c', 'd', 'lonely'],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'c', to: 'd' },
      ],
    }),
  },
  {
    name: 'mixed shapes',
    direction: 'LR',
    model: model({
      direction: 'LR',
      nodes: [
        { id: 'a', shape: 'stadium' },
        { id: 'b', shape: 'circle' },
        { id: 'c', shape: 'hexagon' },
        { id: 'd', shape: 'cylinder' },
        { id: 'e', shape: 'state-bar', label: '' },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'd' },
        { from: 'd', to: 'e' },
      ],
    }),
  },
  {
    name: 'blank labels',
    direction: 'TB',
    model: model({
      nodes: [
        { id: 'a', label: '' },
        { id: 'b', label: '' },
      ],
      edges: [{ from: 'a', to: 'b', label: '' }],
    }),
  },
];

interface LabelledEdge {
  d: string;
  labelPlate?: boolean;
  label?: { box: { width: number; height: number }; x: number; y: number };
}

function labelledFork(direction: Direction): GraphModel {
  return model({
    direction,
    nodes: ['start', { id: 'check', shape: 'diamond', label: 'Ready?' }, 'yes', 'no'],
    edges: [
      { from: 'start', to: 'check' },
      { from: 'check', to: 'yes', label: 'yes' },
      { from: 'check', to: 'no', label: 'a much longer label' },
    ],
  });
}

/** The rect the stroke must stay out of: the label box plus the keep-out it is cut for. */
function gapBox(edge: LabelledEdge) {
  const label = edge.label as NonNullable<LabelledEdge['label']>;
  const pad = options.metrics.labelPadding;

  return {
    x: label.x - label.box.width / 2 - pad,
    y: label.y - label.box.height / 2 - pad,
    width: label.box.width + pad * 2,
    height: label.box.height + pad * 2,
  };
}

function coordinates(d: string): { x: number; y: number }[] {
  return [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
  }));
}

function inside(point: { x: number; y: number }, rect: ReturnType<typeof gapBox>): boolean {
  const slack = 0.02;

  return (
    point.x > rect.x + slack &&
    point.x < rect.x + rect.width - slack &&
    point.y > rect.y + slack &&
    point.y < rect.y + rect.height - slack
  );
}

describe('layoutGraph invariants', () => {
  it.each(fixtures)('$name holds every layout invariant', ({ model: built, direction }) => {
    const scene = laid(built).scene;

    assertLayoutInvariants(scene as never, {
      direction,
      shapes: defaultShapes,
      metrics: options.metrics,
    });
    // Cluster membership is only in the model, so it is asserted beside the scene-only invariants.
    assertClustersHold(scene as never, built.nodes);
  });

  it.each(fixtures)('$name lays out identically twice', ({ model: built }) => {
    assertDeterministic(() => layoutGraph(built, layoutOptions()));
  });

  it.each(['ortho', 'straight', 'smooth'] as const)(
    'holds the invariants with edgeShape %s',
    (edgeShape) => {
      for (const fixture of fixtures) {
        const scene = laid(fixture.model, { edgeShape }).scene;

        assertLayoutInvariants(scene as never, {
          direction: fixture.direction,
          shapes: defaultShapes,
          metrics: options.metrics,
        });
        assertClustersHold(scene as never, fixture.model.nodes);
      }
    },
  );
});

describe('layoutGraph golden scenes', () => {
  it.each(fixtures)('$name matches its golden scene', ({ model: built }) => {
    expect(goldenScene(laid(built).scene as never)).toMatchSnapshot();
  });
});

describe('layoutGraph scene shape', () => {
  it('produces an empty padded scene for an empty model', () => {
    const scene = laid(model({ nodes: [] })).scene;

    expect(scene).toMatchObject({
      kind: 'graph',
      family: 'flowchart',
      nodes: [],
      edges: [],
      clusters: [],
      size: { width: options.metrics.padding * 2, height: options.metrics.padding * 2 },
    });
  });

  it('starts the drawing at the padding offset', () => {
    const scene = laid(model({ nodes: ['only'] })).scene as never as {
      nodes: { x: number; y: number; width: number; height: number }[];
    };
    const node = scene.nodes[0] as { x: number; y: number; width: number; height: number };

    expect(node.x - node.width / 2).toBeCloseTo(options.metrics.padding, 9);
    expect(node.y - node.height / 2).toBeCloseTo(options.metrics.padding, 9);
  });

  it('carries the family, title and description through', () => {
    const built: GraphModel = {
      ...model({ nodes: ['a'] }),
      family: 'state',
      title: 'Publish flow',
      description: 'Two states',
    };

    expect(laid(built).scene).toMatchObject({
      family: 'state',
      title: 'Publish flow',
      description: 'Two states',
    });
  });

  it('nests cluster boxes and stamps their depth', () => {
    const scene = laid(fixtures[11]?.model as GraphModel).scene as never as {
      clusters: { id: string; depth: number; children: { id: string; depth: number }[] }[];
    };
    const outer = scene.clusters[0] as {
      id: string;
      depth: number;
      children: { id: string; depth: number }[];
    };

    expect(outer.id).toBe('outer');
    expect(outer.depth).toBe(0);
    expect(outer.children[0]).toMatchObject({ id: 'inner', depth: 1 });
  });

  it('sets every cluster title against the leading edge of its title band', () => {
    for (const direction of ['TB', 'BT', 'LR', 'RL'] as const) {
      const scene = laid(
        model({
          direction,
          nodes: [{ id: 'a', cluster: 'g' }, { id: 'b', cluster: 'g' }, 'c'],
          edges: [
            { from: 'a', to: 'b' },
            { from: 'b', to: 'c' },
          ],
          clusters: [cluster('g', null, 'Exhibit server')],
        }),
      ).scene as GraphScene;
      const box = scene.clusters[0]?.box as Rect;
      const title = scene.clusters[0]?.title as NonNullable<SceneCluster['title']>;
      const m = options.metrics;

      // Left edge of the glyphs, one padding in; the band is at the top whatever the direction.
      expect(title.x - title.box.width / 2).toBeCloseTo(box.x + m.clusterPadding, 6);
      expect(title.y - title.box.height / 2).toBeGreaterThanOrEqual(box.y);
      expect(title.y + title.box.height / 2).toBeLessThanOrEqual(
        box.y + m.clusterPadding + Math.max(m.clusterTitleHeight, title.box.height),
      );
    }
  });

  /*
   * An edge from outside a cluster to a member that is not the first one in it. The route has to get
   * past the members in front of the endpoint, and the detour planner is what does that — it decides
   * by looking at the polyline the router actually emits, so a near miss in the model is not enough.
   */
  it('keeps an edge into a deep cluster member off the members in front of it', () => {
    for (const direction of ['TB', 'BT', 'LR', 'RL'] as const) {
      const scene = laid(
        model({
          direction,
          nodes: ['kick', 'outsider', { id: 'build', cluster: 'g' }, { id: 'ship', cluster: 'g' }],
          edges: [
            { from: 'kick', to: 'build' },
            { from: 'outsider', to: 'ship' },
            { from: 'build', to: 'ship' },
          ],
          clusters: [cluster('g', null, 'Release')],
        }),
      ).scene as GraphScene;

      assertNoEdgeThroughNode(scene, { shapes: defaultShapes, metrics: options.metrics });
    }
  });

  /*
   * An edge from outside a cluster to the first member of it, entering across the side the title
   * band sits on. The plate the renderer paints behind the glyphs is opaque, so a lane that runs
   * under it is a stroke cut in half — the port pass has to meet the endpoint beside the title
   * instead, at both ends, so what is drawn is one straight run rather than a run with a jog in it.
   */
  it('meets an endpoint beside its cluster title rather than under it', () => {
    for (const direction of ['TB', 'BT', 'LR', 'RL'] as const) {
      const scene = laid(
        model({
          direction,
          nodes: [
            { id: 'store', label: 'Object store' },
            { id: 'version', cluster: 'g', label: 'Version row' },
          ],
          edges: [{ from: 'store', to: 'version' }],
          clusters: [cluster('g', null, 'Publish path')],
        }),
      ).scene as GraphScene;
      const edge = scene.edges[0] as SceneEdge;
      const lateral = direction === 'TB' || direction === 'BT' ? 'x' : 'y';

      assertTitlesUnstruck(scene, {
        direction,
        shapes: defaultShapes,
        metrics: options.metrics,
      });

      // Both ends took the same lane, so the run is straight: anything under an arrowhead's width
      // is the ends' own outlines disagreeing by a fraction of a pixel, not a jog.
      const lanes = edge.points.map((point) => point[lateral]);

      expect(Math.max(...lanes) - Math.min(...lanes), `${direction}: ${edge.d}`).toBeLessThan(
        options.metrics.arrowWidth,
      );
    }
  });

  it('centres every edge label on a point of its own edge', () => {
    for (const direction of ['TB', 'BT', 'LR', 'RL'] as const) {
      const scene = laid(
        model({
          direction,
          nodes: ['start', { id: 'check', shape: 'diamond', label: 'Ready?' }, 'yes', 'no'],
          edges: [
            { from: 'start', to: 'check' },
            { from: 'check', to: 'yes', label: 'yes' },
            { from: 'check', to: 'no', label: 'a much longer label' },
          ],
        }),
      ).scene as never as {
        edges: { label?: { x: number; y: number }; points: { x: number; y: number }[] }[];
      };
      const labelled = scene.edges.filter((edge) => edge.label);

      expect(labelled).toHaveLength(2);

      for (const edge of labelled) {
        const label = edge.label as { x: number; y: number };
        const onPath = edge.points.some(
          (point) => Math.abs(point.x - label.x) < 0.01 && Math.abs(point.y - label.y) < 0.01,
        );

        expect(onPath, `${direction}: label at ${label.x},${label.y}`).toBe(true);
      }
    }
  });

  it('cuts the label box out of the stroke it sits on', () => {
    for (const edgeShape of ['ortho', 'straight', 'smooth'] as const) {
      for (const direction of ['TB', 'BT', 'LR', 'RL'] as const) {
        const scene = laid(labelledFork(direction), { edgeShape }).scene as never as {
          edges: LabelledEdge[];
        };
        const labelled = scene.edges.filter((edge) => edge.label);

        expect(labelled).toHaveLength(2);

        for (const edge of labelled) {
          const where = `${edgeShape} ${direction} ${edge.d}`;

          expect(edge.labelPlate, where).toBeUndefined();
          expect(edge.d.match(/M/g), where).toHaveLength(2);

          for (const point of coordinates(edge.d)) {
            expect(inside(point, gapBox(edge)), `${where} at ${point.x},${point.y}`).toBe(false);
          }
        }
      }
    }
  });

  it('keeps the stroke whole and asks for the plate when the label swallows it', () => {
    const scene = laid(labelledFork('TB'), { metrics: resolveMetrics({ rankSep: 16 }) })
      .scene as never as { edges: LabelledEdge[] };
    const labelled = scene.edges.filter((edge) => edge.label);

    expect(labelled).toHaveLength(2);

    for (const edge of labelled) {
      expect(edge.labelPlate, edge.d).toBe(true);
      expect(edge.d.match(/M/g), edge.d).toHaveLength(1);
    }
  });

  it('leaves a self-loop label alone: it is placed beside the stroke, not on it', () => {
    const scene = laid(
      model({ nodes: ['a', 'b'], edges: [{ from: 'a', to: 'a', label: 'retry' }] }),
    ).scene as never as { edges: LabelledEdge[] };
    const loop = scene.edges[0] as LabelledEdge;

    expect(loop.labelPlate).toBeUndefined();
    expect(loop.d.match(/M/g)).toHaveLength(1);
  });

  it('marks a reversed edge but keeps its points in author order', () => {
    const scene = laid(
      model({
        nodes: ['a', 'b'],
        edges: [
          { from: 'a', to: 'b' },
          { from: 'b', to: 'a' },
        ],
      }),
    ).scene as never as {
      nodes: { id: string; y: number }[];
      edges: { id: string; reversed: boolean; points: { y: number }[] }[];
    };
    const back = scene.edges[1] as { reversed: boolean; points: { y: number }[] };
    const first = back.points[0] as { y: number };
    const last = back.points.at(-1) as { y: number };

    expect(back.reversed).toBe(true);
    expect(first.y).toBeGreaterThan(last.y);
  });
});

describe('layoutGraph ports', () => {
  const m = options.metrics;

  it('leaves a pointy shape at the vertex of the side its branches take', () => {
    for (const direction of ['TB', 'BT', 'LR', 'RL'] as const) {
      const scene = laid(labelledFork(direction)).scene as GraphScene;
      const check = scene.nodes.find((node) => node.id === 'check') as SceneNode;
      const exits = scene.edges
        .filter((edge) => edge.source === 'check')
        .map((edge) => edge.points[0] as Point);
      const vertical = direction === 'TB' || direction === 'BT';
      const sign = direction === 'BT' || direction === 'RL' ? -1 : 1;

      expect(exits).toHaveLength(2);

      for (const exit of exits) {
        // Both branches leave the same axis point, and fan out past the outline rather than on it.
        expect(exit.x).toBeCloseTo(vertical ? check.x : check.x + (sign * check.width) / 2, 6);
        expect(exit.y).toBeCloseTo(vertical ? check.y + (sign * check.height) / 2 : check.y, 6);
      }
    }
  });

  it('keeps an arrowhead of room between edges that would converge on one point', () => {
    const scene = laid(
      model({
        nodes: ['a', 'b'],
        edges: [
          { from: 'a', to: 'b', arrow: 'none' },
          { from: 'a', to: 'b', arrow: 'none' },
          { from: 'b', to: 'a', arrow: 'none' },
        ],
      }),
    ).scene as GraphScene;
    const a = scene.nodes.find((node) => node.id === 'a') as SceneNode;
    const xs = scene.edges
      .map((edge) => (edge.source === 'a' ? edge.points[0] : edge.points.at(-1)) as Point)
      .filter((point) => point.y > a.y)
      .map((point) => point.x)
      .sort((left, right) => left - right);

    expect(xs).toHaveLength(3);

    for (let i = 1; i < xs.length; i += 1) {
      expect((xs[i] as number) - (xs[i - 1] as number)).toBeGreaterThanOrEqual(
        m.arrowWidth + m.strokeWidth * 2 - 0.01,
      );
    }
  });

  it('rides the corner arc rather than stacking, and stays on the outline doing it', () => {
    const scene = laid(
      model({
        nodes: [{ id: 'a', label: 'a' }, 'b', 'c', 'd', 'e'],
        edges: [
          { from: 'a', to: 'b' },
          { from: 'a', to: 'c' },
          { from: 'a', to: 'd' },
          { from: 'a', to: 'e' },
        ],
      }),
    ).scene as GraphScene;
    const a = scene.nodes.find((node) => node.id === 'a') as SceneNode;
    const size = { width: a.width, height: a.height };
    const exits = scene.edges.map((edge) => edge.points[0] as Point);
    const straight = a.width / 2 - m.cornerRadius - m.arrowWidth / 2;

    // Four ports on a node this narrow do not fit on the straight, so the outer two ride an arc.
    expect(Math.max(...exits.map((point) => Math.abs(point.x - a.x)))).toBeGreaterThan(straight);

    for (const point of exits) {
      const local = { x: point.x - a.x, y: point.y - a.y };
      const hit = defaultShapes['rect']?.anchor?.(size, local, m) as Point;

      expect(Math.hypot(local.x, local.y)).toBeCloseTo(Math.hypot(hit.x, hit.y), 6);
    }
  });

  it('bridges a mid-air jog with one curve where two corners would have met', () => {
    const scene = laid(
      model({
        nodes: ['a', 'b', 'c'],
        edges: [
          { from: 'a', to: 'b' },
          { from: 'b', to: 'c' },
          { from: 'c', to: 'a' },
        ],
      }),
    ).scene as GraphScene;
    const back = scene.edges.find((edge) => edge.reversed) as SceneEdge;

    expect(back.d, back.d).toContain('C');
  });
});

describe('layoutGraph diagnostics', () => {
  it('refuses a model over the node limit', () => {
    const result = layoutGraph(chain(5), { ...options, limits: { ...options.limits, nodes: 4 } });

    expect(result.scene).toBeNull();
    expect(result.diagnostics[0]).toMatchObject({ severity: 'error', code: 'too-many-nodes' });
  });

  it('refuses a model over the edge limit', () => {
    const result = layoutGraph(chain(5), { ...options, limits: { ...options.limits, edges: 3 } });

    expect(result.scene).toBeNull();
    expect(result.diagnostics[0]).toMatchObject({ severity: 'error', code: 'too-many-edges' });
  });

  it('refuses clusters nested past the limit', () => {
    const built = model({
      nodes: [{ id: 'a', cluster: 'c3' }],
      clusters: [cluster('c1'), cluster('c2', 'c1'), cluster('c3', 'c2')],
    });
    const result = layoutGraph(built, {
      ...options,
      limits: { ...options.limits, clusterDepth: 2 },
    });

    expect(result.scene).toBeNull();
    expect(result.diagnostics[0]).toMatchObject({
      severity: 'error',
      code: 'cluster-depth-exceeded',
    });
  });

  it('flattens clusters and says so when they are disabled', () => {
    const built = model({
      nodes: [{ id: 'a', cluster: 'g' }, 'b'],
      edges: [{ from: 'a', to: 'b' }],
      clusters: [cluster('g', null, 'Group')],
    });
    const result = layoutGraph(built, { ...options, clusters: 'ignore' });

    expect(result.scene?.clusters).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'info', code: 'clusters-ignored' }),
    );
  });

  it('drops an edge with an unknown endpoint', () => {
    const built = model({ nodes: ['a'], edges: [{ from: 'a', to: 'ghost' }] });
    const result = layoutGraph(built, options);

    expect(result.scene?.edges).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: 'unknown-endpoint' }),
    );
  });

  it('drops a duplicate node id', () => {
    const built = model({ nodes: ['a', 'a'] });
    const result = layoutGraph(built, options);

    expect(result.scene?.nodes).toHaveLength(1);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: 'duplicate-node' }),
    );
  });
});

describe('layoutGraph density', () => {
  it('keeps nodes apart at every ordering sweep count', () => {
    for (const orderSweeps of [0, 1, 8]) {
      const scene = laid(fixtures[6]?.model as GraphModel, { orderSweeps }).scene;

      assertNoNodeOverlap(scene as never);
    }
  });
});
