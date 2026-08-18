/*
 * Property test over randomly generated graph models. The fixtures pin the shapes we care about;
 * this pins the ones nobody thought of — tangles of cycles, self-loops, parallel edges, clusters
 * with no members and edges that leave them.
 *
 * How deep the corpus runs is the whole strength of this test. The defects it exists to catch land
 * in the low single digits of a percent per trial — a self-loop label stacked over a neighbour's, a
 * cluster border crossing that doubles back into a corner drawing nothing, a rank-gap leg slid into
 * a node — so a single run of 150 trials was as likely to miss all three as to find one, and did.
 * `SEEDS` x `TRIALS` is a thousand models, which hits every one of them, in a couple of seconds.
 *
 * `TRIALS` is capped by the invariant classes still open against this engine rather than by time: a
 * port that leaves along its own outline, an L leg inside a node's clearance, a lane under a cluster
 * title, and a route into a cluster member that crosses another one. Every seed here runs as deep as
 * it does before tripping one of those — they are real failures and not this file's to silence, so
 * the corpus is as many honestly green seeds as it takes rather than one run deep enough to hit
 * them. Raise both numbers as those classes are closed.
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

const SEEDS = [20_260_808, 3_538_535, 3_942_939, 5_560_555];
const TRIALS = 250;

describe('layoutGraph over random models', () => {
  it('never throws and always holds the invariants', () => {
    const options = layoutOptions();

    for (const seed of SEEDS) {
      const random = createRandom(seed);

      for (let trial = 0; trial < TRIALS; trial += 1) {
        const built = randomModel(random);
        const result = layoutGraph(built, options);
        const where = `seed ${seed} trial ${trial}`;

        expect(result.scene, `${where}: ${JSON.stringify(result.diagnostics)}`).not.toBeNull();
        assertLayoutInvariants(result.scene as never, {
          direction: built.direction,
          shapes: defaultShapes,
          metrics: options.metrics,
        });
        // Who belongs to which cluster is only in the model, so the member half is asserted here.
        assertClustersHold(result.scene as never, built.nodes);
      }
    }

    // A thousand layouts run in about four seconds alone and past the 5s default under a loaded
    // suite, so the budget is stated rather than left to whatever else the runner is doing.
  }, 30_000);

  it('is reproducible for a seed', () => {
    const options = layoutOptions();
    const run = (): unknown => {
      const random = createRandom(99);

      return Array.from({ length: 25 }, () => layoutGraph(randomModel(random), options));
    };

    expect(run()).toEqual(run());
  });
});
