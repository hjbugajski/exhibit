import { describe, expect, it } from 'vitest';

import { breakCycles, extractSelfLoops } from './acyclic.ts';
import type { LayoutGraph } from './model.ts';
import { addEdge, addNode, createLayoutGraph } from './model.ts';

function build(nodes: readonly string[], edges: readonly [string, string][]): LayoutGraph {
  const graph = createLayoutGraph();

  for (const id of nodes) {
    addNode(graph, { id, kind: 'real', width: 10, height: 10 });
  }

  for (const [source, target] of edges) {
    addEdge(graph, { id: `${source}${target}`, source, target, minLen: 1, weight: 1 });
  }

  return graph;
}

function shape(graph: LayoutGraph): string[] {
  return graph.edges.map((edge) => `${edge.source}->${edge.target}${edge.reversed ? '*' : ''}`);
}

describe('extractSelfLoops', () => {
  it('pulls self edges out of the layout graph', () => {
    const graph = build(
      ['A', 'B'],
      [
        ['A', 'A'],
        ['A', 'B'],
      ],
    );
    const loops = extractSelfLoops(graph);

    expect(loops.map((edge) => edge.id)).toEqual(['AA']);
    expect(shape(graph)).toEqual(['A->B']);
  });
});

describe('breakCycles', () => {
  it('leaves an acyclic graph alone', () => {
    const graph = build(
      ['A', 'B', 'C'],
      [
        ['A', 'B'],
        ['B', 'C'],
        ['A', 'C'],
      ],
    );

    expect(breakCycles(graph)).toEqual([]);
    expect(shape(graph)).toEqual(['A->B', 'B->C', 'A->C']);
  });

  it('reverses the back edge of a cycle', () => {
    const graph = build(
      ['A', 'B', 'C'],
      [
        ['A', 'B'],
        ['B', 'C'],
        ['C', 'A'],
      ],
    );
    const reversed = breakCycles(graph);

    expect(reversed.map((edge) => edge.id)).toEqual(['CA']);
    expect(shape(graph)).toEqual(['A->B', 'B->C', 'A->C*']);
  });

  it('walks in declaration order, so reruns pick the same back edge', () => {
    const run = (): string[] => {
      const graph = build(
        ['A', 'B', 'C'],
        [
          ['B', 'C'],
          ['C', 'A'],
          ['A', 'B'],
        ],
      );

      breakCycles(graph);

      return shape(graph);
    };

    // A is declared first, so the DFS enters at A -> B -> C and C -> A is the back edge.
    expect(run()).toEqual(['B->C', 'A->C*', 'A->B']);
    expect(run()).toEqual(run());
  });

  it('breaks a two-node cycle into parallel edges', () => {
    const graph = build(
      ['A', 'B'],
      [
        ['A', 'B'],
        ['B', 'A'],
      ],
    );

    breakCycles(graph);

    expect(shape(graph)).toEqual(['A->B', 'A->B*']);
  });

  it('handles nested cycles without revisiting a flipped edge', () => {
    const graph = build(
      ['A', 'B', 'C', 'D'],
      [
        ['A', 'B'],
        ['B', 'C'],
        ['C', 'B'],
        ['C', 'D'],
        ['D', 'A'],
      ],
    );

    breakCycles(graph);

    for (const edge of graph.edges) {
      expect(edge.source).not.toBe(edge.target);
    }

    expect(graph.edges.filter((edge) => edge.reversed).map((edge) => edge.id)).toEqual([
      'CB',
      'DA',
    ]);
  });
});
