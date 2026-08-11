/*
 * Cycle breaking. Self-loops come out first (they are routed as a fixed lobe, not laid out), then a
 * DFS in declaration order reverses every back edge. Declaration order rather than degree order is
 * what makes two runs of the same source produce byte-identical geometry.
 *
 * Greedy-FAS would reverse fewer edges on dense cyclic graphs; it drops in behind this signature
 * later. DFS reversal is correct, just occasionally suboptimal.
 */

import type { LayoutEdge, LayoutGraph } from './model.ts';
import { adjacency, nodesByIndex } from './model.ts';

const WHITE = 0;
const GREY = 1;
const BLACK = 2;

/** Removes `a -> a` edges from the graph and hands them back for lobe routing. */
export function extractSelfLoops(graph: LayoutGraph): LayoutEdge[] {
  const loops: LayoutEdge[] = [];
  const kept: LayoutEdge[] = [];

  for (const edge of graph.edges) {
    if (edge.source === edge.target) {
      loops.push(edge);
    } else {
      kept.push(edge);
    }
  }

  graph.edges = kept;

  return loops;
}

/**
 * Reverses back edges in place. The traversal reads the adjacency captured before any reversal, so
 * a flipped edge is never re-walked in its new orientation.
 */
export function breakCycles(graph: LayoutGraph): LayoutEdge[] {
  const { out } = adjacency(graph);
  const state = new Map<string, number>();
  const reversed: LayoutEdge[] = [];

  for (const start of nodesByIndex(graph)) {
    if ((state.get(start.id) ?? WHITE) !== WHITE) {
      continue;
    }

    state.set(start.id, GREY);

    const stack: { id: string; next: number }[] = [{ id: start.id, next: 0 }];

    while (stack.length > 0) {
      const frame = stack[stack.length - 1] as { id: string; next: number };
      const edges = out.get(frame.id) ?? [];

      if (frame.next >= edges.length) {
        state.set(frame.id, BLACK);
        stack.pop();
        continue;
      }

      const edge = edges[frame.next] as LayoutEdge;

      frame.next += 1;

      // The edge may already have been flipped as part of another cycle.
      if (edge.reversed) {
        continue;
      }

      const colour = state.get(edge.target) ?? WHITE;

      if (colour === GREY) {
        const { source, target } = edge;

        edge.source = target;
        edge.target = source;
        edge.reversed = true;
        reversed.push(edge);
        continue;
      }

      if (colour === WHITE) {
        state.set(edge.target, GREY);
        stack.push({ id: edge.target, next: 0 });
      }
    }
  }

  return reversed;
}
