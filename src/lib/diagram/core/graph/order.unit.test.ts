import { describe, expect, it } from 'vitest';

import { createRandom } from '@testing/diagram/fuzz.ts';
import { assertCrossingsNonIncreasing } from '@testing/diagram/invariants.ts';

import type { LayoutGraph } from './model.ts';
import { addEdge, addNode, createLayoutGraph, requireNode } from './model.ts';
import { countBilayerCrossings, countCrossings, orderNodes } from './order.ts';
import { assignRanks } from './rank.ts';

/** The O(n^2) definition of a crossing, used as the oracle for the accumulator. */
function naiveCrossings(
  north: readonly string[],
  south: readonly string[],
  edges: readonly (readonly [string, string])[],
): number {
  const at = (list: readonly string[], id: string): number => list.indexOf(id);
  let count = 0;

  for (let i = 0; i < edges.length; i += 1) {
    for (let j = i + 1; j < edges.length; j += 1) {
      const a = edges[i] as readonly [string, string];
      const b = edges[j] as readonly [string, string];
      const a1 = at(north, a[0]);
      const a2 = at(south, a[1]);
      const b1 = at(north, b[0]);
      const b2 = at(south, b[1]);

      if ((a1 - b1) * (a2 - b2) < 0) {
        count += 1;
      }
    }
  }

  return count;
}

describe('countBilayerCrossings', () => {
  const north = ['a', 'b', 'c'];
  const south = ['x', 'y', 'z'];

  it('counts nothing for parallel edges', () => {
    expect(
      countBilayerCrossings(north, south, [
        ['a', 'x'],
        ['b', 'y'],
        ['c', 'z'],
      ]),
    ).toBe(0);
  });

  it('counts one for a single swap', () => {
    expect(
      countBilayerCrossings(north, south, [
        ['a', 'y'],
        ['b', 'x'],
      ]),
    ).toBe(1);
  });

  it('counts three for a full reversal of three edges', () => {
    expect(
      countBilayerCrossings(north, south, [
        ['a', 'z'],
        ['b', 'y'],
        ['c', 'x'],
      ]),
    ).toBe(3);
  });

  it('counts a fan from one node as zero', () => {
    expect(
      countBilayerCrossings(north, south, [
        ['b', 'x'],
        ['b', 'y'],
        ['b', 'z'],
      ]),
    ).toBe(0);
  });

  it('counts six for a full reversal of four edges', () => {
    const wide = ['a', 'b', 'c', 'd'];

    expect(
      countBilayerCrossings(wide, wide, [
        ['a', 'd'],
        ['b', 'c'],
        ['c', 'b'],
        ['d', 'a'],
      ]),
    ).toBe(6);
  });

  it('agrees with the naive counter on random bilayers', () => {
    const random = createRandom(20_260_808);

    for (let trial = 0; trial < 200; trial += 1) {
      const width = 2 + Math.floor(random() * 7);
      const top = Array.from({ length: width }, (_, index) => `t${index}`);
      const bottom = Array.from({ length: width }, (_, index) => `b${index}`);
      const edges: [string, string][] = [];

      for (let edge = 0; edge < width * 2; edge += 1) {
        edges.push([
          top[Math.floor(random() * width)] as string,
          bottom[Math.floor(random() * width)] as string,
        ]);
      }

      expect(countBilayerCrossings(top, bottom, edges)).toBe(naiveCrossings(top, bottom, edges));
    }
  });
});

function crossedGraph(): LayoutGraph {
  const graph = createLayoutGraph();

  for (const id of ['a1', 'a2', 'a3', 'b1', 'b2', 'b3']) {
    addNode(graph, { id, kind: 'real', width: 40, height: 30 });
  }

  // Declared so the seed order puts a1,a2,a3 over b1,b2,b3 with every edge crossing.
  for (const [source, target] of [
    ['a1', 'b3'],
    ['a2', 'b2'],
    ['a3', 'b1'],
  ] as const) {
    addEdge(graph, { id: `${source}${target}`, source, target, minLen: 1, weight: 1 });
  }

  assignRanks(graph);

  return graph;
}

describe('orderNodes', () => {
  it('never returns a worse ordering than the seed', () => {
    const graph = crossedGraph();
    const result = orderNodes(graph, 8);

    assertCrossingsNonIncreasing(result);
    expect(countCrossings(graph, graph.ranks)).toBe(result.crossings);
  });

  it('improves on the seed across a random corpus, and never worsens it', () => {
    const random = createRandom(4_242);
    let improved = 0;

    for (let trial = 0; trial < 60; trial += 1) {
      const graph = createLayoutGraph();
      const layers = [0, 1, 2].map((layer) =>
        Array.from({ length: 4 }, (_, index) => `l${layer}n${index}`),
      );

      for (const [layer, ids] of layers.entries()) {
        for (const id of ids) {
          addNode(graph, { id, kind: 'real', width: 40, height: 30 }).rank = layer;
        }
      }

      for (const layer of [0, 1]) {
        for (let edge = 0; edge < 6; edge += 1) {
          const source = (layers[layer] as string[])[Math.floor(random() * 4)] as string;
          const target = (layers[layer + 1] as string[])[Math.floor(random() * 4)] as string;

          addEdge(graph, {
            id: `${source}-${target}-${edge}`,
            source,
            target,
            minLen: 1,
            weight: 1,
          });
        }
      }

      const result = orderNodes(graph, 8);

      assertCrossingsNonIncreasing(result);

      if (result.crossings < result.initialCrossings) {
        improved += 1;
      }
    }

    expect(improved).toBeGreaterThan(0);
  });

  it('assigns orders that match the rank listing', () => {
    const graph = crossedGraph();

    orderNodes(graph, 8);

    for (const rank of graph.ranks) {
      for (const [index, id] of rank.entries()) {
        expect(requireNode(graph, id).order).toBe(index);
      }
    }
  });

  it('is deterministic across runs', () => {
    const run = (): string[][] => {
      const graph = crossedGraph();

      orderNodes(graph, 8);

      return graph.ranks;
    };

    expect(run()).toEqual(run());
  });

  it('keeps the seed when no sweep improves on it', () => {
    const graph = createLayoutGraph();

    for (const id of ['a', 'b']) {
      addNode(graph, { id, kind: 'real', width: 10, height: 10 });
    }

    addEdge(graph, { id: 'ab', source: 'a', target: 'b', minLen: 1, weight: 1 });
    assignRanks(graph);

    expect(orderNodes(graph, 8)).toEqual({ initialCrossings: 0, crossings: 0, bestSweep: 0 });
  });
});
