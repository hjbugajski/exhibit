/*
 * The `GraphModel` seam and the mutable working graph the layout phases share.
 *
 * A family's `to-graph.ts` produces a `GraphModel`; nothing below this line knows which family it
 * came from. `LayoutGraph` is the engine's internal, per-level scratch structure — one flat layer
 * of the recursive cluster layout, holding real nodes, collapsed cluster composites, and the
 * virtual nodes edge normalization adds.
 */

import type { ArrowKind, LineKind, Span } from '../../types.ts';

export type Direction = 'TB' | 'BT' | 'LR' | 'RL';

export interface GraphNode {
  id: string;
  /** Label source lines, already split on explicit breaks; wrapping happens in layout. */
  label: readonly string[];
  /** Name for the text alternative when the node draws no label; see `SceneNode.name`. */
  name?: string;
  /** Shape registry key. */
  shape: string;
  classes: readonly string[];
  /** Innermost containing cluster, or null for the top level. */
  cluster: string | null;
  span?: Span;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: readonly string[];
  line: LineKind;
  /** Cap at the target end. */
  arrow: ArrowKind;
  /** Cap at the source end. */
  startArrow: ArrowKind;
  /** Minimum rank span; the engine raises it to 2 for labelled edges. */
  minLen: number;
  /** Pull strength in coordinate assignment; 1 unless a family knows better. */
  weight: number;
  classes: readonly string[];
  span?: Span;
}

export interface GraphCluster {
  id: string;
  label?: readonly string[];
  parent: string | null;
  classes: readonly string[];
  span?: Span;
}

export interface GraphModel {
  /** Family id; becomes `Scene.family`. */
  family: string;
  direction: Direction;
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
  clusters: readonly GraphCluster[];
  title?: string;
  description?: string;
}

// --------------------------------------------------------------------------- internal graph

export type LayoutNodeKind = 'real' | 'composite' | 'virtual' | 'label';

export interface LayoutNode {
  id: string;
  kind: LayoutNodeKind;
  /** Layout space: width is the cross axis, height the rank axis, whatever the direction. */
  width: number;
  height: number;
  /** Extra cross-axis clearance on the +x side; self-loop lobes live there. */
  padRight: number;
  /** Insertion index — the deterministic tie-break every phase falls back to. */
  index: number;
  rank: number;
  order: number;
  x: number;
  y: number;
  /** Owning edge id for `virtual` and `label` nodes. */
  edge?: string;
}

export interface LayoutEdge {
  id: string;
  source: string;
  target: string;
  minLen: number;
  weight: number;
  /** True when cycle breaking flipped this edge; `source`/`target` are already swapped. */
  reversed: boolean;
}

export interface LayoutGraph {
  nodes: Map<string, LayoutNode>;
  edges: LayoutEdge[];
  /** Node ids per rank in cross-axis order; filled by `orderNodes`. */
  ranks: string[][];
}

export interface Adjacency {
  out: Map<string, LayoutEdge[]>;
  in: Map<string, LayoutEdge[]>;
}

export function createLayoutGraph(): LayoutGraph {
  return { nodes: new Map(), edges: [], ranks: [] };
}

export interface LayoutNodeInit {
  id: string;
  kind: LayoutNodeKind;
  width: number;
  height: number;
  padRight?: number;
  edge?: string;
}

export function addNode(graph: LayoutGraph, init: LayoutNodeInit): LayoutNode {
  const node: LayoutNode = {
    id: init.id,
    kind: init.kind,
    width: init.width,
    height: init.height,
    padRight: init.padRight ?? 0,
    index: graph.nodes.size,
    rank: 0,
    order: 0,
    x: 0,
    y: 0,
    edge: init.edge,
  };

  graph.nodes.set(node.id, node);

  return node;
}

export interface LayoutEdgeInit {
  id: string;
  source: string;
  target: string;
  minLen: number;
  weight: number;
}

export function addEdge(graph: LayoutGraph, init: LayoutEdgeInit): LayoutEdge {
  const edge: LayoutEdge = { ...init, minLen: Math.max(1, init.minLen), reversed: false };

  graph.edges.push(edge);

  return edge;
}

/** Invariant violation, not user error — `build.ts` turns it into one `internal-error`. */
export function requireNode(graph: LayoutGraph, id: string): LayoutNode {
  const node = graph.nodes.get(id);

  if (!node) {
    throw new Error(`Layout graph has no node '${id}'.`);
  }

  return node;
}

/** Nodes in insertion order — the declaration order every deterministic tie-break uses. */
export function nodesByIndex(graph: LayoutGraph): LayoutNode[] {
  return [...graph.nodes.values()].sort((a, b) => a.index - b.index);
}

export function adjacency(graph: LayoutGraph): Adjacency {
  const out = new Map<string, LayoutEdge[]>();
  const incoming = new Map<string, LayoutEdge[]>();

  for (const id of graph.nodes.keys()) {
    out.set(id, []);
    incoming.set(id, []);
  }

  for (const edge of graph.edges) {
    out.get(edge.source)?.push(edge);
    incoming.get(edge.target)?.push(edge);
  }

  return { out, in: incoming };
}

export function maxRank(graph: LayoutGraph): number {
  let max = 0;

  for (const node of graph.nodes.values()) {
    max = Math.max(max, node.rank);
  }

  return max;
}

/** Groups node ids into weakly connected components, each labelled by its lowest node index. */
export function components(graph: LayoutGraph): Map<string, number> {
  const neighbours = new Map<string, string[]>();

  for (const id of graph.nodes.keys()) {
    neighbours.set(id, []);
  }

  for (const edge of graph.edges) {
    neighbours.get(edge.source)?.push(edge.target);
    neighbours.get(edge.target)?.push(edge.source);
  }

  const label = new Map<string, number>();

  for (const start of nodesByIndex(graph)) {
    if (label.has(start.id)) {
      continue;
    }

    const queue = [start.id];

    label.set(start.id, start.index);

    while (queue.length > 0) {
      const current = queue.pop() as string;

      for (const next of neighbours.get(current) ?? []) {
        if (!label.has(next)) {
          label.set(next, start.index);
          queue.push(next);
        }
      }
    }
  }

  return label;
}
