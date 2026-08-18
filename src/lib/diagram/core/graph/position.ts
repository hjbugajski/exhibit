/*
 * Coordinate assignment. The rank axis is trivial (bands sized by the tallest node on each rank);
 * the cross axis is the priority method, behind the `assignX` seam so Brandes-Köpf can drop in later
 * against the same golden fixtures.
 *
 * Virtual nodes carry infinite priority: that single rule is what makes a long edge come out as one
 * straight line instead of a staircase.
 */

import type { DiagramMetrics } from '../../metrics.ts';
import type { LayoutGraph, LayoutNode } from './model.ts';
import { adjacency, components, requireNode } from './model.ts';

export type AssignX = (graph: LayoutGraph, m: DiagramMetrics) => Map<string, number>;

const PASSES = 8;

function halfLeft(node: LayoutNode): number {
  return node.width / 2;
}

function halfRight(node: LayoutNode): number {
  return node.width / 2 + node.padRight;
}

function separation(a: LayoutNode, b: LayoutNode, m: DiagramMetrics): number {
  const real = (node: LayoutNode): boolean => node.kind === 'real' || node.kind === 'composite';

  return real(a) && real(b) ? m.nodeSep : m.edgeSep;
}

/** Minimum centre-to-centre distance between two neighbours on a rank. */
function gapMin(a: LayoutNode, b: LayoutNode, m: DiagramMetrics): number {
  return halfRight(a) + separation(a, b, m) + halfLeft(b);
}

function assignRankAxis(graph: LayoutGraph, m: DiagramMetrics): void {
  const heights = graph.ranks.map((rank) =>
    rank.reduce((tallest, id) => Math.max(tallest, requireNode(graph, id).height), 0),
  );
  let y = 0;

  for (const [rank, ids] of graph.ranks.entries()) {
    const height = heights[rank] ?? 0;

    y += rank === 0 ? height / 2 : (heights[rank - 1] ?? 0) / 2 + m.rankSep + height / 2;

    for (const id of ids) {
      requireNode(graph, id).y = y;
    }
  }
}

function seedRow(graph: LayoutGraph, ids: readonly string[], m: DiagramMetrics): void {
  let previous: LayoutNode | null = null;
  let x = 0;

  for (const id of ids) {
    const node = requireNode(graph, id);

    x = previous === null ? halfLeft(node) : x + gapMin(previous, node, m);
    node.x = x;
    previous = node;
  }
}

/** Higher wins the tug of war; a virtual node always beats a real one, so long edges stay straight. */
function priorityOf(node: LayoutNode, degree: number): number {
  return node.kind === 'virtual' || node.kind === 'label' ? Number.POSITIVE_INFINITY : degree;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

interface Row {
  nodes: LayoutNode[];
}

/** One node's turn in a sweep: where it wants to be, and how hard it gets to insist. */
interface Placement {
  index: number;
  node: LayoutNode;
  priority: number;
  target: number | null;
}

/**
 * Moves `index` toward `target`, clamped so it cannot push past an already-placed (higher priority)
 * neighbour, then shoves the not-yet-placed nodes between them along.
 */
function shift(
  row: Row,
  index: number,
  target: number,
  placed: boolean[],
  m: DiagramMetrics,
): void {
  const nodes = row.nodes;
  const self = nodes[index] as LayoutNode;
  let need = 0;
  let low = Number.NEGATIVE_INFINITY;

  for (let i = index - 1; i >= 0; i -= 1) {
    need += gapMin(nodes[i] as LayoutNode, nodes[i + 1] as LayoutNode, m);

    if (placed[i]) {
      low = (nodes[i] as LayoutNode).x + need;
      break;
    }
  }

  need = 0;

  let high = Number.POSITIVE_INFINITY;

  for (let i = index + 1; i < nodes.length; i += 1) {
    need += gapMin(nodes[i - 1] as LayoutNode, nodes[i] as LayoutNode, m);

    if (placed[i]) {
      high = (nodes[i] as LayoutNode).x - need;
      break;
    }
  }

  self.x = Math.min(Math.max(target, low), Math.max(low, high));

  for (let i = index + 1; i < nodes.length && !placed[i]; i += 1) {
    const previous = nodes[i - 1] as LayoutNode;
    const node = nodes[i] as LayoutNode;
    const minimum = previous.x + gapMin(previous, node, m);

    if (node.x >= minimum) {
      break;
    }

    node.x = minimum;
  }

  for (let i = index - 1; i >= 0 && !placed[i]; i -= 1) {
    const next = nodes[i + 1] as LayoutNode;
    const node = nodes[i] as LayoutNode;
    const maximum = next.x - gapMin(node, next, m);

    if (node.x <= maximum) {
      break;
    }

    node.x = maximum;
  }
}

/** Left-to-right sweep that repairs any separation the passes left violated. */
function legalize(graph: LayoutGraph, m: DiagramMetrics): void {
  for (const ids of graph.ranks) {
    let previous: LayoutNode | null = null;

    for (const id of ids) {
      const node = requireNode(graph, id);

      if (previous !== null) {
        node.x = Math.max(node.x, previous.x + gapMin(previous, node, m));
      }

      previous = node;
    }
  }
}

export const priorityAssignX: AssignX = (graph, m) => {
  const { out, in: incoming } = adjacency(graph);

  for (const ids of graph.ranks) {
    seedRow(graph, ids, m);
  }

  for (let pass = 0; pass < PASSES; pass += 1) {
    const downward = pass % 2 === 0;
    const order = downward
      ? [...graph.ranks.keys()].slice(1)
      : [...graph.ranks.keys()].slice(0, -1).reverse();

    for (const rank of order) {
      const ids = graph.ranks[rank] ?? [];
      const row: Row = { nodes: ids.map((id) => requireNode(graph, id)) };
      const placed: boolean[] = Array.from({ length: row.nodes.length }, () => false);
      const neighboursOf = (id: string): string[] =>
        downward
          ? (incoming.get(id) ?? []).map((edge) => edge.source)
          : (out.get(id) ?? []).map((edge) => edge.target);
      // Neighbours are always on the next rank over, never in this row, so every target can be read
      // before anything here moves.
      const entries: Placement[] = row.nodes.map((node, index) => {
        const neighbours = neighboursOf(node.id);

        return {
          index,
          node,
          priority: priorityOf(node, neighbours.length),
          target: median(neighbours.map((id) => requireNode(graph, id).x)),
        };
      });

      entries.sort((a, b) => b.priority - a.priority || a.index - b.index);

      for (let at = 0; at < entries.length; at += 1) {
        const first = entries[at] as Placement;
        const target = first.target;

        if (target === null) {
          placed[first.index] = true;
          continue;
        }

        /*
         * Every node that wants this exact spot is placed as one block centred on it. One at a time
         * the first of them takes the spot and the separation clamp shoves the rest to its right,
         * which is what pulls a fan-out off its parent and leaves a join bar sitting over its
         * leftmost branch instead of between them.
         */
        let end = at + 1;

        while (
          end < entries.length &&
          (entries[end] as Placement).priority === first.priority &&
          (entries[end] as Placement).target === target &&
          (entries[end] as Placement).index === (entries[end - 1] as Placement).index + 1
        ) {
          end += 1;
        }

        const block = entries.slice(at, end);
        let span = 0;

        for (let k = 1; k < block.length; k += 1) {
          span += gapMin((block[k - 1] as Placement).node, (block[k] as Placement).node, m);
        }

        let cursor = target - span / 2;

        for (const [k, member] of block.entries()) {
          const previous = block[k - 1];

          if (previous) {
            cursor = previous.node.x + gapMin(previous.node, member.node, m);
          }

          shift(row, member.index, cursor, placed, m);
          placed[member.index] = true;
        }

        at = end - 1;
      }
    }
  }

  legalize(graph, m);

  const xs = new Map<string, number>();

  for (const [id, node] of graph.nodes) {
    xs.set(id, node.x);
  }

  return xs;
};

/**
 * Disconnected components are ranked and ordered independently, so they can end up interleaved on
 * the cross axis. Pack them side by side in declaration order after the fact — a rigid cross-axis
 * translation, so nothing inside a component moves relative to anything else in it.
 */
function packComponents(graph: LayoutGraph, m: DiagramMetrics): void {
  const label = components(graph);
  const groups = new Map<number, LayoutNode[]>();

  for (const node of graph.nodes.values()) {
    const key = label.get(node.id) ?? 0;
    const group = groups.get(key);

    if (group) {
      group.push(node);
    } else {
      groups.set(key, [node]);
    }
  }

  if (groups.size < 2) {
    return;
  }

  let cursor = 0;

  for (const key of [...groups.keys()].sort((a, b) => a - b)) {
    const group = groups.get(key) as LayoutNode[];
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    for (const node of group) {
      min = Math.min(min, node.x - halfLeft(node));
      max = Math.max(max, node.x + halfRight(node));
    }

    const shiftBy = cursor - min;

    for (const node of group) {
      node.x += shiftBy;
    }

    cursor += max - min + m.nodeSep;
  }
}

export function assignPositions(
  graph: LayoutGraph,
  m: DiagramMetrics,
  assignX = priorityAssignX,
): void {
  assignRankAxis(graph, m);

  for (const [id, x] of assignX(graph, m)) {
    requireNode(graph, id).x = x;
  }

  packComponents(graph, m);
}
