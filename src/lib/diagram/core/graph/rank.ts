/*
 * Ranking: longest path plus source/sink tightening. Network simplex minimizes total weighted edge
 * length and is what dagre uses; it is ~300 fiddly lines for a small visual delta at our graph
 * sizes, so it is deliberately not here and `ranker` is not an option.
 *
 * Input must be acyclic and self-loop free (see `acyclic.ts`).
 */

import type { LayoutEdge, LayoutGraph } from './model.ts';
import { adjacency, nodesByIndex, requireNode } from './model.ts';

/**
 * Kahn topological order, breaking ties by declaration index. Nodes left over by a residual cycle
 * (which cycle breaking should have removed) are appended in declaration order so ranking still
 * terminates with a usable answer.
 */
function topologicalOrder(graph: LayoutGraph): string[] {
  const { out, in: incoming } = adjacency(graph);
  const remaining = new Map<string, number>();
  const ready: string[] = [];

  for (const node of nodesByIndex(graph)) {
    const degree = (incoming.get(node.id) ?? []).length;

    remaining.set(node.id, degree);

    if (degree === 0) {
      ready.push(node.id);
    }
  }

  const order: string[] = [];

  while (ready.length > 0) {
    ready.sort((a, b) => requireNode(graph, a).index - requireNode(graph, b).index);

    const id = ready.shift() as string;

    order.push(id);

    for (const edge of out.get(id) ?? []) {
      const left = (remaining.get(edge.target) ?? 0) - 1;

      remaining.set(edge.target, left);

      if (left === 0) {
        ready.push(edge.target);
      }
    }
  }

  if (order.length < graph.nodes.size) {
    const seen = new Set(order);

    for (const node of nodesByIndex(graph)) {
      if (!seen.has(node.id)) {
        order.push(node.id);
      }
    }
  }

  return order;
}

function normalizeRanks(graph: LayoutGraph): void {
  let min = Number.POSITIVE_INFINITY;

  for (const node of graph.nodes.values()) {
    min = Math.min(min, node.rank);
  }

  if (!Number.isFinite(min) || min === 0) {
    return;
  }

  for (const node of graph.nodes.values()) {
    node.rank -= min;
  }
}

export function assignRanks(graph: LayoutGraph): void {
  const { out, in: incoming } = adjacency(graph);

  for (const node of graph.nodes.values()) {
    node.rank = 0;
  }

  for (const id of topologicalOrder(graph)) {
    const node = requireNode(graph, id);
    let rank = 0;

    for (const edge of incoming.get(id) ?? []) {
      rank = Math.max(rank, requireNode(graph, edge.source).rank + edge.minLen);
    }

    node.rank = rank;
  }

  tightenSources(graph, out, incoming);
  tightenSinks(graph, out, incoming);
  normalizeRanks(graph);
}

/**
 * An in-degree-0 node sits at rank 0 by construction, which leaves a long dangling edge when its
 * only consumer is deep in the graph. Pull it down to the tightest rank its out-edges allow.
 */
function tightenSources(
  graph: LayoutGraph,
  out: Map<string, LayoutEdge[]>,
  incoming: Map<string, LayoutEdge[]>,
): void {
  for (const node of nodesByIndex(graph)) {
    const outgoing = out.get(node.id) ?? [];

    if ((incoming.get(node.id) ?? []).length > 0 || outgoing.length === 0) {
      continue;
    }

    let tightest = Number.POSITIVE_INFINITY;

    for (const edge of outgoing) {
      tightest = Math.min(tightest, requireNode(graph, edge.target).rank - edge.minLen);
    }

    if (Number.isFinite(tightest)) {
      node.rank = tightest;
    }
  }
}

/**
 * Symmetric, and a no-op straight out of longest path — it only bites once cluster collapse has
 * changed the minLens under it, which is exactly why it is kept.
 */
function tightenSinks(
  graph: LayoutGraph,
  out: Map<string, LayoutEdge[]>,
  incoming: Map<string, LayoutEdge[]>,
): void {
  for (const node of nodesByIndex(graph)) {
    const inbound = incoming.get(node.id) ?? [];

    if ((out.get(node.id) ?? []).length > 0 || inbound.length === 0) {
      continue;
    }

    let tightest = Number.NEGATIVE_INFINITY;

    for (const edge of inbound) {
      tightest = Math.max(tightest, requireNode(graph, edge.source).rank + edge.minLen);
    }

    if (Number.isFinite(tightest)) {
      node.rank = tightest;
    }
  }
}
