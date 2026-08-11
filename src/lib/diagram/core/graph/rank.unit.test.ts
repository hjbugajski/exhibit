import { describe, expect, it } from 'vitest';

import type { LayoutGraph } from './model.ts';
import { addEdge, addNode, createLayoutGraph } from './model.ts';
import { assignRanks } from './rank.ts';

function build(
  nodes: readonly string[],
  edges: readonly (readonly [string, string, number?])[],
): LayoutGraph {
  const graph = createLayoutGraph();

  for (const id of nodes) {
    addNode(graph, { id, kind: 'real', width: 10, height: 10 });
  }

  for (const [source, target, minLen] of edges) {
    addEdge(graph, {
      id: `${source}${target}`,
      source,
      target,
      minLen: minLen ?? 1,
      weight: 1,
    });
  }

  return graph;
}

function ranks(graph: LayoutGraph): Record<string, number> {
  return Object.fromEntries([...graph.nodes.values()].map((node) => [node.id, node.rank]));
}

describe('assignRanks', () => {
  it('takes the longest path, not the shortest', () => {
    const graph = build(
      ['A', 'B', 'C'],
      [
        ['A', 'B'],
        ['B', 'C'],
        ['A', 'C'],
      ],
    );

    assignRanks(graph);

    expect(ranks(graph)).toEqual({ A: 0, B: 1, C: 2 });
  });

  it('honours minLen', () => {
    const graph = build(['A', 'B'], [['A', 'B', 3]]);

    assignRanks(graph);

    expect(ranks(graph)).toEqual({ A: 0, B: 3 });
  });

  it('tightens a dangling source down onto its consumer', () => {
    const graph = build(
      ['A', 'B', 'C', 'X'],
      [
        ['A', 'B'],
        ['B', 'C'],
        ['X', 'C'],
      ],
    );

    assignRanks(graph);

    // Without tightening X sits at rank 0 with a three-rank dangling edge.
    expect(ranks(graph)).toEqual({ A: 0, B: 1, C: 2, X: 1 });
  });

  it('starts every disconnected component at rank 0', () => {
    const graph = build(
      ['A', 'B', 'C', 'D', 'E'],
      [
        ['A', 'B'],
        ['C', 'D'],
      ],
    );

    assignRanks(graph);

    expect(ranks(graph)).toEqual({ A: 0, B: 1, C: 0, D: 1, E: 0 });
  });

  it('normalizes the lowest rank to zero', () => {
    const graph = build(['A', 'B'], [['A', 'B', 2]]);

    assignRanks(graph);

    expect(Math.min(...Object.values(ranks(graph)))).toBe(0);
  });

  it('still terminates when a cycle survives cycle breaking', () => {
    const graph = build(
      ['A', 'B'],
      [
        ['A', 'B'],
        ['B', 'A'],
      ],
    );

    assignRanks(graph);

    for (const rank of Object.values(ranks(graph))) {
      expect(Number.isFinite(rank)).toBe(true);
    }
  });
});
