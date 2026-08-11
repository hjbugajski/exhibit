/*
 * Long-edge normalization. Every edge spanning more than one rank becomes a chain of virtual nodes,
 * one per intermediate rank, so ordering and coordinate assignment treat it as a first-class citizen
 * — which is what makes long edges come out straight.
 *
 * Edge labels are virtual nodes too: a labelled edge is forced to span at least two ranks, and the
 * virtual on the middle rank is sized to the measured label. Ordering then keeps the label clear of
 * everything for free, without dagre's rank doubling.
 *
 * The edge runs through the middle of that node and the label is centred on the same point, so a
 * label is always *on* its edge rather than floating beside it. What keeps the stroke off the
 * glyphs is geometry, not paint: `assemble` emits the `d` with the label box cut out of it.
 */

import type { DiagramMetrics } from '../../metrics.ts';
import type { Point, Size } from '../../types.ts';
import type { LayoutGraph } from './model.ts';
import { addEdge, addNode, requireNode } from './model.ts';

export interface EdgeChain {
  /** Virtual node ids in rank order, from the ranked source toward the ranked target. */
  nodes: string[];
  /** The chain member carrying the label box, if any. */
  labelNode: string | null;
}

/** A NUL prefix keeps generated ids out of any namespace a family can produce. */
const GENERATED = '\u0000';

function virtualId(edgeId: string, rank: number): string {
  return `${GENERATED}v:${edgeId}:${rank}`;
}

/**
 * @param labelSizes layout-space label boxes keyed by edge id. The chain member that carries one is
 * widened by `edgeSep` so its neighbours keep their distance from the label box, not from the
 * stroke through it.
 */
export function normalizeEdges(
  graph: LayoutGraph,
  labelSizes: ReadonlyMap<string, Size>,
  m: DiagramMetrics,
): Map<string, EdgeChain> {
  const chains = new Map<string, EdgeChain>();
  const original = graph.edges;

  graph.edges = [];

  for (const edge of original) {
    const source = requireNode(graph, edge.source);
    const target = requireNode(graph, edge.target);
    const span = target.rank - source.rank;

    if (span <= 1) {
      graph.edges.push(edge);
      continue;
    }

    const ranks: number[] = [];

    for (let rank = source.rank + 1; rank < target.rank; rank += 1) {
      ranks.push(rank);
    }

    const label = labelSizes.get(edge.id);
    const labelIndex = label ? Math.floor((ranks.length - 1) / 2) : -1;
    const chain: EdgeChain = { nodes: [], labelNode: null };

    for (const [index, rank] of ranks.entries()) {
      const carriesLabel = index === labelIndex && label !== undefined;
      const node = addNode(graph, {
        id: virtualId(edge.id, rank),
        kind: carriesLabel ? 'label' : 'virtual',
        width: carriesLabel ? m.edgeSep + label.width : m.edgeSep,
        height: carriesLabel ? label.height : 0,
        edge: edge.id,
      });

      node.rank = rank;
      chain.nodes.push(node.id);

      if (carriesLabel) {
        chain.labelNode = node.id;
      }
    }

    let previous = edge.source;

    for (const [index, id] of chain.nodes.entries()) {
      addEdge(graph, {
        id: `${edge.id}${GENERATED}${index}`,
        source: previous,
        target: id,
        minLen: 1,
        weight: edge.weight,
      });
      previous = id;
    }

    addEdge(graph, {
      id: `${edge.id}${GENERATED}${chain.nodes.length}`,
      source: previous,
      target: edge.target,
      minLen: 1,
      weight: edge.weight,
    });

    chains.set(edge.id, chain);
  }

  return chains;
}

/** Where the edge crosses a chain member — and, for a label node, where the label is centred. */
export function chainPoint(graph: LayoutGraph, id: string): Point {
  const node = requireNode(graph, id);

  return { x: node.x, y: node.y };
}
