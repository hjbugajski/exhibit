/*
 * Crossing minimization. BFS seed, then alternating weighted-median sweeps each followed by
 * transpose-to-fixpoint, keeping whichever ordering counts fewest crossings — ties to the earliest
 * sweep, so the answer never depends on how the loop happened to end.
 *
 * Counting is Barth-Jünger-Mutzel: an accumulator tree over the southern layer, O(|E| log |V|)
 * instead of the naive O(|E|^2) pair scan.
 *
 * Runs on a normalized graph: every edge spans exactly one rank.
 */

import type { LayoutGraph, LayoutNode } from './model.ts';
import { adjacency, maxRank, nodesByIndex, requireNode } from './model.ts';

export interface OrderResult {
  /** Crossings of the BFS seed ordering — the floor the sweeps have to beat. */
  initialCrossings: number;
  /** Crossings of the ordering actually kept. */
  crossings: number;
  /** Index of the sweep whose ordering won; 0 means the seed survived. */
  bestSweep: number;
}

type Ranks = string[][];

function emptyRanks(graph: LayoutGraph): Ranks {
  const ranks: Ranks = [];

  for (let rank = 0; rank <= maxRank(graph); rank += 1) {
    ranks.push([]);
  }

  return ranks;
}

/** BFS from the sources of each component in declaration order; deterministic and already decent. */
function seedOrder(graph: LayoutGraph): Ranks {
  const ranks = emptyRanks(graph);
  const seen = new Set<string>();
  const { out, in: incoming } = adjacency(graph);

  const visit = (start: LayoutNode): void => {
    const queue: string[] = [start.id];

    seen.add(start.id);

    while (queue.length > 0) {
      const id = queue.shift() as string;
      const node = requireNode(graph, id);

      ranks[node.rank]?.push(id);

      const next = [
        ...(out.get(id) ?? []).map((edge) => edge.target),
        ...(incoming.get(id) ?? []).map((edge) => edge.source),
      ];

      for (const neighbour of next) {
        if (!seen.has(neighbour)) {
          seen.add(neighbour);
          queue.push(neighbour);
        }
      }
    }
  };

  const ordered = nodesByIndex(graph);

  for (const node of ordered) {
    if (!seen.has(node.id) && (incoming.get(node.id) ?? []).length === 0) {
      visit(node);
    }
  }

  for (const node of ordered) {
    if (!seen.has(node.id)) {
      visit(node);
    }
  }

  return ranks;
}

function positionsOf(ranks: Ranks): Map<string, number> {
  const positions = new Map<string, number>();

  for (const rank of ranks) {
    for (const [index, id] of rank.entries()) {
      positions.set(id, index);
    }
  }

  return positions;
}

/**
 * Barth-Jünger-Mutzel bilayer accumulator. `edges` are the pairs between the two layers in either
 * orientation; only their positions inside `north` / `south` matter.
 */
export function countBilayerCrossings(
  north: readonly string[],
  south: readonly string[],
  edges: readonly (readonly [string, string])[],
): number {
  if (edges.length < 2 || south.length === 0) {
    return 0;
  }

  const northPosition = new Map(north.map((id, index) => [id, index]));
  const southPosition = new Map(south.map((id, index) => [id, index]));
  const pairs: [number, number][] = [];

  for (const [from, to] of edges) {
    const a = northPosition.get(from);
    const b = southPosition.get(to);

    if (a !== undefined && b !== undefined) {
      pairs.push([a, b]);
    }
  }

  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  let firstIndex = 1;

  while (firstIndex < south.length) {
    firstIndex *= 2;
  }

  const tree: number[] = Array.from({ length: 2 * firstIndex - 1 }, () => 0);
  let crossings = 0;

  for (const [, southIndex] of pairs) {
    let index = southIndex + firstIndex - 1;

    tree[index] = (tree[index] ?? 0) + 1;

    while (index > 0) {
      if (index % 2 === 1) {
        crossings += tree[index + 1] ?? 0;
      }

      index = Math.trunc((index - 1) / 2);
      tree[index] = (tree[index] ?? 0) + 1;
    }
  }

  return crossings;
}

function layerEdges(graph: LayoutGraph): (readonly [string, string])[][] {
  const byRank: (readonly [string, string])[][] = [];

  for (const edge of graph.edges) {
    const source = requireNode(graph, edge.source);
    const rank = Math.min(source.rank, requireNode(graph, edge.target).rank);

    (byRank[rank] ??= []).push(
      source.rank === rank ? [edge.source, edge.target] : [edge.target, edge.source],
    );
  }

  return byRank;
}

export function countCrossings(graph: LayoutGraph, ranks: Ranks): number {
  const byRank = layerEdges(graph);
  let total = 0;

  for (let rank = 0; rank + 1 < ranks.length; rank += 1) {
    total += countBilayerCrossings(ranks[rank] ?? [], ranks[rank + 1] ?? [], byRank[rank] ?? []);
  }

  return total;
}

/**
 * Gansner's median value: for an even neighbour count, interpolate between the two medians weighted
 * by the left and right spreads. -1 means "no neighbours on the fixed side, stay put".
 */
function medianValue(positions: number[]): number {
  const count = positions.length;

  if (count === 0) {
    return -1;
  }

  const middle = Math.floor(count / 2);

  if (count % 2 === 1) {
    return positions[middle] as number;
  }

  if (count === 2) {
    return ((positions[0] as number) + (positions[1] as number)) / 2;
  }

  const low = positions[middle - 1] as number;
  const high = positions[middle] as number;
  const left = low - (positions[0] as number);
  const right = (positions[count - 1] as number) - high;

  return left + right === 0 ? (low + high) / 2 : (low * right + high * left) / (left + right);
}

interface Neighbours {
  north: Map<string, string[]>;
  south: Map<string, string[]>;
}

function neighboursOf(graph: LayoutGraph): Neighbours {
  const north = new Map<string, string[]>();
  const south = new Map<string, string[]>();

  for (const id of graph.nodes.keys()) {
    north.set(id, []);
    south.set(id, []);
  }

  for (const edge of graph.edges) {
    const up = requireNode(graph, edge.source).rank < requireNode(graph, edge.target).rank;
    const [above, below] = up ? [edge.source, edge.target] : [edge.target, edge.source];

    south.get(above)?.push(below);
    north.get(below)?.push(above);
  }

  return { north, south };
}

function sortRank(
  graph: LayoutGraph,
  rank: string[],
  fixed: Map<string, string[]>,
  positions: Map<string, number>,
): string[] {
  const keyed = rank.map((id, index) => {
    const neighbourPositions = (fixed.get(id) ?? [])
      .map((other) => positions.get(other))
      .filter((value): value is number => value !== undefined)
      .sort((a, b) => a - b);
    const median = medianValue(neighbourPositions);

    return { id, index, key: median < 0 ? index : median };
  });

  keyed.sort(
    (a, b) =>
      a.key - b.key ||
      a.index - b.index ||
      requireNode(graph, a.id).index - requireNode(graph, b.id).index,
  );

  return keyed.map((entry) => entry.id);
}

/** Crossings contributed by the ordered pair (left, right) on one side of their rank. */
function pairCrossings(left: readonly number[], right: readonly number[]): number {
  let count = 0;

  for (const a of left) {
    for (const b of right) {
      if (b < a) {
        count += 1;
      }
    }
  }

  return count;
}

const TRANSPOSE_LIMIT = 8;

function transpose(ranks: Ranks, neighbours: Neighbours): void {
  for (let pass = 0; pass < TRANSPOSE_LIMIT; pass += 1) {
    let improved = false;
    const positions = positionsOf(ranks);
    const at = (id: string, side: Map<string, string[]>): number[] =>
      (side.get(id) ?? [])
        .map((other) => positions.get(other))
        .filter((value): value is number => value !== undefined);

    for (const rank of ranks) {
      for (let i = 0; i + 1 < rank.length; i += 1) {
        const left = rank[i] as string;
        const right = rank[i + 1] as string;
        const before =
          pairCrossings(at(left, neighbours.north), at(right, neighbours.north)) +
          pairCrossings(at(left, neighbours.south), at(right, neighbours.south));
        const after =
          pairCrossings(at(right, neighbours.north), at(left, neighbours.north)) +
          pairCrossings(at(right, neighbours.south), at(left, neighbours.south));

        if (after < before) {
          rank[i] = right;
          rank[i + 1] = left;
          positions.set(right, i);
          positions.set(left, i + 1);
          improved = true;
        }
      }
    }

    if (!improved) {
      return;
    }
  }
}

function applyOrder(graph: LayoutGraph, ranks: Ranks): void {
  graph.ranks = ranks.map((rank) => [...rank]);

  for (const rank of ranks) {
    for (const [index, id] of rank.entries()) {
      requireNode(graph, id).order = index;
    }
  }
}

export function orderNodes(graph: LayoutGraph, sweeps: number): OrderResult {
  let ranks = seedOrder(graph);
  const neighbours = neighboursOf(graph);
  const initial = countCrossings(graph, ranks);
  let best = ranks.map((rank) => [...rank]);
  let bestCount = initial;
  let bestSweep = 0;

  for (let sweep = 1; sweep <= sweeps && bestCount > 0; sweep += 1) {
    const downward = sweep % 2 === 1;
    const next = ranks.map((rank) => [...rank]);
    const order = downward ? [...next.keys()].slice(1) : [...next.keys()].slice(0, -1).reverse();

    for (const rank of order) {
      const positions = positionsOf(next);
      const fixed = downward ? neighbours.north : neighbours.south;

      next[rank] = sortRank(graph, next[rank] as string[], fixed, positions);
    }

    transpose(next, neighbours);

    const count = countCrossings(graph, next);

    if (count < bestCount) {
      best = next.map((rank) => [...rank]);
      bestCount = count;
      bestSweep = sweep;
    }

    ranks = next;
  }

  applyOrder(graph, best);

  return { initialCrossings: initial, crossings: bestCount, bestSweep };
}
