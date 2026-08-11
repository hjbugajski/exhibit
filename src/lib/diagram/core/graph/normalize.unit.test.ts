import { describe, expect, it } from 'vitest';

import { defaultMetrics } from '../../metrics.ts';
import type { Size } from '../../types.ts';
import type { LayoutGraph } from './model.ts';
import { addEdge, addNode, createLayoutGraph, requireNode } from './model.ts';
import { chainPoint, normalizeEdges } from './normalize.ts';
import { assignRanks } from './rank.ts';

const m = defaultMetrics;

function build(edges: readonly (readonly [string, string, number])[]): LayoutGraph {
  const graph = createLayoutGraph();

  for (const id of new Set(edges.flatMap(([source, target]) => [source, target]))) {
    addNode(graph, { id, kind: 'real', width: 40, height: 30 });
  }

  for (const [source, target, minLen] of edges) {
    addEdge(graph, { id: `${source}${target}`, source, target, minLen, weight: 1 });
  }

  assignRanks(graph);

  return graph;
}

function spans(graph: LayoutGraph): number[] {
  return graph.edges.map(
    (edge) => requireNode(graph, edge.target).rank - requireNode(graph, edge.source).rank,
  );
}

describe('normalizeEdges', () => {
  it('leaves a one-rank edge alone', () => {
    const graph = build([['A', 'B', 1]]);
    const chains = normalizeEdges(graph, new Map(), m);

    expect(chains.size).toBe(0);
    expect(graph.nodes.size).toBe(2);
  });

  it('chains a long edge through one virtual node per intermediate rank', () => {
    const graph = build([['A', 'B', 4]]);
    const chains = normalizeEdges(graph, new Map(), m);
    const chain = chains.get('AB');

    expect(chain?.nodes).toHaveLength(3);
    expect(chain?.labelNode).toBeNull();
    expect(spans(graph)).toEqual([1, 1, 1, 1]);

    for (const id of chain?.nodes ?? []) {
      const node = requireNode(graph, id);

      expect(node.kind).toBe('virtual');
      expect(node).toMatchObject({ width: m.edgeSep, height: 0, edge: 'AB' });
    }
  });

  it('sizes the middle chain member to the label box', () => {
    const label: Size = { width: 60, height: 18 };
    const graph = build([['A', 'B', 2]]);
    const chains = normalizeEdges(graph, new Map([['AB', label]]), m);
    const chain = chains.get('AB');
    const node = requireNode(graph, chain?.labelNode as string);

    expect(chain?.nodes).toEqual([chain?.labelNode]);
    expect(node.kind).toBe('label');
    expect(node.width).toBe(m.edgeSep + label.width);
    expect(node.height).toBe(label.height);
  });

  it('puts the label on the middle rank of a longer span', () => {
    const graph = build([['A', 'B', 5]]);
    const chains = normalizeEdges(graph, new Map([['AB', { width: 20, height: 18 }]]), m);
    const chain = chains.get('AB');

    expect(chain?.nodes.indexOf(chain?.labelNode as string)).toBe(1);
    expect(requireNode(graph, chain?.labelNode as string).rank).toBe(2);
  });

  it('runs the edge through the middle of the label node', () => {
    const label: Size = { width: 60, height: 18 };
    const graph = build([['A', 'B', 2]]);
    const chains = normalizeEdges(graph, new Map([['AB', label]]), m);
    const id = chains.get('AB')?.labelNode as string;
    const node = requireNode(graph, id);

    node.x = 100;
    node.y = 50;

    expect(chainPoint(graph, id)).toEqual({ x: 100, y: 50 });
  });

  it('falls back to the node centre for a plain virtual', () => {
    const graph = build([['A', 'B', 2]]);
    const id = normalizeEdges(graph, new Map(), m).get('AB')?.nodes[0] as string;
    const node = requireNode(graph, id);

    node.x = 7;
    node.y = 9;

    expect(chainPoint(graph, id)).toEqual({ x: 7, y: 9 });
  });
});
