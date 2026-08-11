/*
 * Property test over randomly generated graph models. The fixtures pin the shapes we care about;
 * this pins the ones nobody thought of — tangles of cycles, self-loops, parallel edges, clusters
 * with no members and edges that leave them.
 */

import { describe, expect, it } from 'vitest';

import { createRandom } from '@testing/diagram/fuzz.ts';
import { layoutOptions } from '@testing/diagram/graph-fixtures.ts';
import { assertClustersHold, assertLayoutInvariants } from '@testing/diagram/invariants.ts';

import { defaultShapes } from '../shapes/registry.ts';
import { layoutGraph } from './layout-graph.ts';
import type { Direction, GraphCluster, GraphEdge, GraphModel, GraphNode } from './model.ts';

const DIRECTIONS: readonly Direction[] = ['TB', 'BT', 'LR', 'RL'];
const SHAPES = ['rect', 'round', 'diamond', 'circle', 'hexagon', 'stadium', 'state-bar'];

function randomModel(random: () => number): GraphModel {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T;
  const nodeCount = 1 + Math.floor(random() * 12);
  const clusterCount = Math.floor(random() * 4);
  const clusters: GraphCluster[] = [];

  for (let index = 0; index < clusterCount; index += 1) {
    const parent = index > 0 && random() < 0.5 ? (clusters[index - 1] as GraphCluster).id : null;

    clusters.push({
      id: `g${index}`,
      parent,
      classes: [],
      label: random() < 0.5 ? [`Group ${index}`] : undefined,
    });
  }

  const nodes: GraphNode[] = [];

  for (let index = 0; index < nodeCount; index += 1) {
    nodes.push({
      id: `n${index}`,
      label: random() < 0.15 ? [] : [`Node ${index}`],
      shape: pick(SHAPES),
      classes: [],
      cluster: clusters.length > 0 && random() < 0.6 ? pick(clusters).id : null,
    });
  }

  const edges: GraphEdge[] = [];
  const edgeCount = Math.floor(random() * nodeCount * 2);

  for (let index = 0; index < edgeCount; index += 1) {
    const source = pick(nodes).id;
    const target = random() < 0.1 ? source : pick(nodes).id;

    edges.push({
      id: `e${index}`,
      source,
      target,
      label: random() < 0.3 ? ['edge label'] : undefined,
      line: 'solid',
      arrow: pick(['arrow', 'none', 'circle', 'cross'] as const),
      startArrow: random() < 0.2 ? 'arrow' : 'none',
      minLen: 1 + Math.floor(random() * 3),
      weight: 1,
      classes: [],
    });
  }

  return { family: 'flowchart', direction: pick(DIRECTIONS), nodes, edges, clusters };
}

describe('layoutGraph over random models', () => {
  it('never throws and always holds the invariants', () => {
    const random = createRandom(20_260_808);
    const options = layoutOptions();

    for (let trial = 0; trial < 150; trial += 1) {
      const built = randomModel(random);
      const result = layoutGraph(built, options);

      expect(result.scene, `trial ${trial}: ${JSON.stringify(result.diagnostics)}`).not.toBeNull();
      assertLayoutInvariants(result.scene as never, {
        direction: built.direction,
        shapes: defaultShapes,
        metrics: options.metrics,
      });
      // Who belongs to which cluster is only in the model, so the member half is asserted here.
      assertClustersHold(result.scene as never, built.nodes);
    }
  });

  it('is reproducible for a seed', () => {
    const options = layoutOptions();
    const run = (): unknown => {
      const random = createRandom(99);

      return Array.from({ length: 25 }, () => layoutGraph(randomModel(random), options));
    };

    expect(run()).toEqual(run());
  });
});
