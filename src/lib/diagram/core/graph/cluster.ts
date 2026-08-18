/*
 * Cluster support for the recursive-collapse strategy: the nesting tree, the level each edge belongs
 * to (the lowest common ancestor of its endpoints), and the padding maths that turns a laid-out
 * subgraph into a composite node in its parent.
 *
 * The recursion itself lives in `layout-graph.ts`; everything here is pure data so the two stay
 * acyclic. The documented cost of collapse is bundling: several edges entering one cluster converge
 * at its border before fanning out inside.
 */

import type { DiagramMetrics } from '../../metrics.ts';
import type { Rect, Size } from '../../types.ts';
import type { Direction, GraphCluster, GraphModel, GraphNode } from './model.ts';

/**
 * Composite nodes share an id space with real nodes, so generated ids get a U+001F prefix. A unit
 * separator is as impossible in a mermaid identifier as NUL and, unlike NUL, does not make the file
 * that carries it read as binary to grep, ripgrep and GitHub code search.
 */
const COMPOSITE_PREFIX = '\u001Fcluster:';

export function compositeId(clusterId: string): string {
  return `${COMPOSITE_PREFIX}${clusterId}`;
}

export function isCompositeId(id: string): boolean {
  return id.startsWith(COMPOSITE_PREFIX);
}

export function clusterIdOf(id: string): string {
  return id.slice(COMPOSITE_PREFIX.length);
}

export interface ClusterTree {
  byId: Map<string, GraphCluster>;
  /** Child clusters of a level, in declaration order; `null` keys the top level. */
  childrenOf: Map<string | null, GraphCluster[]>;
  /** Root-first ancestor chain of a cluster, ending with the cluster itself. */
  chainOf: Map<string, string[]>;
  depthOf: Map<string, number>;
  maxDepth: number;
}

/**
 * Clusters whose parent is missing, or which sit on a parent cycle, are reparented to the top level
 * rather than dropped — a broken tree from a family bug should still draw.
 */
export function buildClusterTree(clusters: readonly GraphCluster[]): ClusterTree {
  const byId = new Map(clusters.map((cluster) => [cluster.id, cluster]));
  const chainOf = new Map<string, string[]>();
  const depthOf = new Map<string, number>();

  const resolving = new Set<string>();
  const chain = (id: string): string[] => {
    const cached = chainOf.get(id);

    if (cached) {
      return cached;
    }

    resolving.add(id);

    const parent = byId.get(id)?.parent;
    const usable = parent != null && parent !== id && byId.has(parent) && !resolving.has(parent);
    const resolved = usable ? [...chain(parent), id] : [id];

    resolving.delete(id);
    chainOf.set(id, resolved);

    return resolved;
  };

  const childrenOf = new Map<string | null, GraphCluster[]>();
  let maxDepth = 0;

  childrenOf.set(null, []);

  for (const cluster of clusters) {
    const resolved = chain(cluster.id);
    const depth = resolved.length;
    const parent = resolved.at(-2) ?? null;

    depthOf.set(cluster.id, depth);
    maxDepth = Math.max(maxDepth, depth);

    const siblings = childrenOf.get(parent);

    if (siblings) {
      siblings.push(cluster);
    } else {
      childrenOf.set(parent, [cluster]);
    }
  }

  return { byId, childrenOf, chainOf, depthOf, maxDepth };
}

/** The chain of clusters containing a node, root first; empty when the node is at the top level. */
function chainOfNode(tree: ClusterTree, cluster: string | null): string[] {
  return cluster === null ? [] : (tree.chainOf.get(cluster) ?? []);
}

export interface Levels {
  /** Level each node sits directly in. */
  nodeLevel: Map<string, string | null>;
  /** Level each edge is laid out at: the lowest cluster containing both endpoints. */
  edgeLevel: Map<string, string | null>;
  /** Entity an endpoint attaches to at its edge's level: the node itself or a composite. */
  entityOf: Map<string, { source: string; target: string }>;
}

function lowestCommonLevel(a: readonly string[], b: readonly string[]): string | null {
  let common: string | null = null;

  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) {
      break;
    }

    common = a[i] as string;
  }

  return common;
}

/** The child of `level` that contains `chain`'s node, or the node itself when it sits at `level`. */
function representative(chain: readonly string[], level: string | null, nodeId: string): string {
  const index = level === null ? 0 : chain.indexOf(level) + 1;
  const owner = chain[index];

  return owner === undefined ? nodeId : compositeId(owner);
}

export function resolveLevels(model: GraphModel, tree: ClusterTree): Levels {
  const nodeLevel = new Map<string, string | null>();
  const chains = new Map<string, string[]>();

  for (const node of model.nodes) {
    const valid = node.cluster !== null && tree.byId.has(node.cluster) ? node.cluster : null;

    nodeLevel.set(node.id, valid);
    chains.set(node.id, chainOfNode(tree, valid));
  }

  const edgeLevel = new Map<string, string | null>();
  const entityOf = new Map<string, { source: string; target: string }>();

  for (const edge of model.edges) {
    const from = chains.get(edge.source);
    const to = chains.get(edge.target);

    if (!from || !to) {
      continue;
    }

    const level = lowestCommonLevel(from, to);

    edgeLevel.set(edge.id, level);
    entityOf.set(edge.id, {
      source: representative(from, level, edge.source),
      target: representative(to, level, edge.target),
    });
  }

  return { nodeLevel, edgeLevel, entityOf };
}

export function nodesAtLevel(model: GraphModel, levels: Levels, level: string | null): GraphNode[] {
  return model.nodes.filter((node) => (levels.nodeLevel.get(node.id) ?? null) === level);
}

/**
 * An edge endpoint may name a cluster, and a cluster is not a node. Retarget it to the member the
 * author meant: `prefer` lets a family nominate one (a state's start or end marker), and otherwise
 * a cluster is entered at its first member and left from its last.
 */
export function clusterEndpoint(
  members: readonly string[],
  role: 'source' | 'target',
  prefer?: (members: readonly string[], role: 'source' | 'target') => string | undefined,
): string | null {
  return prefer?.(members, role) ?? (role === 'target' ? members[0] : members.at(-1)) ?? null;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Which layout-space side of a box is its final-space top, once the direction transform has run.
 * The cluster title band has to be reserved there, not at layout-space top.
 */
export function finalTopSide(direction: Direction): keyof Insets {
  if (direction === 'TB') {
    return 'top';
  }

  if (direction === 'BT') {
    return 'bottom';
  }

  return 'left';
}

/**
 * Height a cluster title reserves at the final-space top of its box: the plate the renderer paints
 * around the glyphs, floored at the metric so a single short line still reads as a band. Measuring
 * the glyphs alone under-reserves by the plate's own padding, and every title that wraps to a second
 * line then overhangs the band onto whatever the cluster holds.
 */
export function titleBand(m: DiagramMetrics, title: Size): number {
  return Math.max(m.clusterTitleHeight, title.height + m.labelGap * 2);
}

/**
 * Padding on the side a title band sits on: half a padding in from the border, the band, then a
 * whole padding below it.
 *
 * Splitting one padding either side of the band, which is what this used to be, leaves half a
 * padding underneath — and half a padding is not a gap. An edge entering the cluster from that side
 * ends there, under a title plate that is opaque by design, and the whole tail of the stroke is
 * masked out from under its own arrowhead.
 */
export function titlePad(m: DiagramMetrics, titleHeight: number): number {
  return titleHeight > 0 ? m.clusterPadding * 1.5 + titleHeight : m.clusterPadding;
}

/**
 * The plate painted behind a cluster title, in the same space as `box` — which is final space, since
 * the band is always at the final-space top.
 *
 * Layout and paint have to agree on this rect exactly: the renderer knocks whatever is under it out
 * of the paint, so routing has to treat it as a box to stay out of. The band it sits in is the whole
 * width of the cluster, but the plate is not, and reserving the band instead both blocks lanes that
 * are free and misses the half of the plate that hangs below it.
 *
 * The title takes the leading edge of its band rather than the middle of it: a title centred over a
 * box reads as an orphaned node label. The band's minimum width already reserves `clusterPadding`
 * either side, so the inset always fits; a title wider than its box falls back to centred rather than
 * overhanging on one side only.
 */
export function titleRect(box: Rect, title: Size, m: DiagramMetrics): Rect {
  const width = title.width + m.labelGap * 2;
  const height = title.height + m.labelGap * 2;
  const inset = Math.min(m.clusterPadding + title.width / 2, box.width / 2);

  return {
    x: box.x + inset - width / 2,
    y: box.y + (m.clusterPadding + titleBand(m, title)) / 2 - height / 2,
    width,
    height,
  };
}

/** Layout-space padding around a collapsed cluster, with the title band on the final-top side. */
export function clusterPads(direction: Direction, m: DiagramMetrics, titleHeight: number): Insets {
  const pads: Insets = {
    top: m.clusterPadding,
    right: m.clusterPadding,
    bottom: m.clusterPadding,
    left: m.clusterPadding,
  };

  pads[finalTopSide(direction)] = titlePad(m, titleHeight);

  return pads;
}
