import { describe, expect, it } from 'vitest';

import { defaultMetrics } from '../../metrics.ts';
import type { LayoutGraph } from './model.ts';
import { addEdge, addNode, createLayoutGraph, requireNode } from './model.ts';
import { normalizeEdges } from './normalize.ts';
import { orderNodes } from './order.ts';
import type { AssignX } from './position.ts';
import { assignPositions } from './position.ts';
import { assignRanks } from './rank.ts';

const m = defaultMetrics;

interface Spec {
  nodes: readonly (readonly [string, number, number])[];
  edges: readonly (readonly [string, string, number?])[];
}

function laidOut(spec: Spec, assignX?: AssignX): LayoutGraph {
  const graph = createLayoutGraph();

  for (const [id, width, height] of spec.nodes) {
    addNode(graph, { id, kind: 'real', width, height });
  }

  for (const [source, target, minLen] of spec.edges) {
    addEdge(graph, {
      id: `${source}${target}`,
      source,
      target,
      minLen: minLen ?? 1,
      weight: 1,
    });
  }

  assignRanks(graph);
  normalizeEdges(graph, new Map(), m);
  orderNodes(graph, 8);
  assignPositions(graph, m, assignX);

  return graph;
}

function at(graph: LayoutGraph, id: string): { x: number; y: number } {
  const node = requireNode(graph, id);

  return { x: node.x, y: node.y };
}

describe('assignPositions', () => {
  it('separates rank bands by rankSep plus the two half heights', () => {
    const graph = laidOut({
      nodes: [
        ['A', 40, 30],
        ['B', 40, 50],
      ],
      edges: [['A', 'B']],
    });

    expect(at(graph, 'B').y - at(graph, 'A').y).toBeCloseTo(15 + m.rankSep + 25, 9);
  });

  it('keeps nodeSep between two real nodes on a rank', () => {
    const graph = laidOut({
      nodes: [
        ['A', 40, 30],
        ['B', 60, 30],
        ['C', 40, 30],
      ],
      edges: [
        ['A', 'B'],
        ['A', 'C'],
      ],
    });
    const b = requireNode(graph, 'B');
    const c = requireNode(graph, 'C');

    expect(Math.abs(b.x - c.x)).toBeGreaterThanOrEqual(
      b.width / 2 + m.nodeSep + c.width / 2 - 0.01,
    );
  });

  it('centres a fan-out on its parent instead of hanging it off the leftmost child', () => {
    const graph = laidOut({
      nodes: [
        ['A', 40, 30],
        ['B', 60, 30],
        ['C', 40, 30],
        ['D', 80, 30],
      ],
      edges: [
        ['A', 'B'],
        ['A', 'C'],
        ['A', 'D'],
      ],
    });
    const children = ['B', 'C', 'D'].map((id) => at(graph, id).x);

    expect(Math.min(...children)).toBeLessThan(at(graph, 'A').x);
    expect(Math.max(...children)).toBeGreaterThan(at(graph, 'A').x);
  });

  it('runs a long edge straight down its virtual chain', () => {
    const graph = laidOut({
      nodes: [
        ['A', 40, 30],
        ['B', 40, 30],
        ['W', 200, 30],
        ['X', 200, 30],
      ],
      edges: [
        ['A', 'B', 3],
        ['A', 'W'],
        ['W', 'X'],
        ['X', 'B'],
      ],
    });
    const virtuals = [...graph.nodes.values()].filter((node) => node.kind === 'virtual');

    expect(virtuals.length).toBe(2);

    for (const virtual of virtuals) {
      expect(virtual.x).toBeCloseTo(virtuals[0]?.x ?? 0, 6);
    }
  });

  it('packs disconnected components side by side without overlap', () => {
    const graph = laidOut({
      nodes: [
        ['A', 40, 30],
        ['B', 40, 30],
        ['C', 40, 30],
        ['D', 40, 30],
      ],
      edges: [
        ['A', 'B'],
        ['C', 'D'],
      ],
    });
    const first = Math.max(at(graph, 'A').x, at(graph, 'B').x);
    const second = Math.min(at(graph, 'C').x, at(graph, 'D').x);

    expect(second - first).toBeGreaterThanOrEqual(40 + m.nodeSep - 0.01);
  });

  it('routes the cross axis through the assignX seam', () => {
    const fixed: AssignX = (graph) => new Map([...graph.nodes.keys()].map((id) => [id, 7]));
    const graph = laidOut(
      {
        nodes: [
          ['A', 40, 30],
          ['B', 40, 30],
        ],
        edges: [['A', 'B']],
      },
      fixed,
    );

    expect(at(graph, 'A').x).toBe(7);
    expect(at(graph, 'B').x).toBe(7);
  });

  it('reserves self-loop clearance on the +x side', () => {
    const graph = createLayoutGraph();

    addNode(graph, { id: 'A', kind: 'real', width: 40, height: 30, padRight: m.selfLoopSize });
    addNode(graph, { id: 'B', kind: 'real', width: 40, height: 30 });
    addEdge(graph, { id: 'AC', source: 'A', target: 'C', minLen: 1, weight: 1 });
    addNode(graph, { id: 'C', kind: 'real', width: 40, height: 30 });
    addEdge(graph, { id: 'BC', source: 'B', target: 'C', minLen: 1, weight: 1 });
    assignRanks(graph);
    orderNodes(graph, 8);
    assignPositions(graph, m);

    expect(at(graph, 'B').x - at(graph, 'A').x).toBeGreaterThanOrEqual(
      20 + m.selfLoopSize + m.nodeSep + 20 - 0.01,
    );
  });
});
