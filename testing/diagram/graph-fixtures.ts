/*
 * Synthetic `GraphModel`s and the layout options every diagram test lays them out with. Building
 * models directly rather than parsing sources keeps engine tests independent of the families.
 */

import { defaultLimits } from '@/lib/diagram/build.ts';
import type {
  Direction,
  GraphCluster,
  GraphEdge,
  GraphModel,
  GraphNode,
} from '@/lib/diagram/core/graph/model.ts';
import { defaultShapes } from '@/lib/diagram/core/shapes/registry.ts';
import { metricsMeasurer } from '@/lib/diagram/core/text/measurers.ts';
import { resolveMetrics } from '@/lib/diagram/metrics.ts';
import type { LayoutOptions } from '@/lib/diagram/types.ts';

export function layoutOptions(overrides: Partial<LayoutOptions> = {}): LayoutOptions {
  return {
    measurer: metricsMeasurer,
    metrics: resolveMetrics(),
    shapes: defaultShapes,
    edgeShape: 'ortho',
    clusters: 'recursive',
    orderSweeps: 8,
    limits: defaultLimits,
    ...overrides,
  };
}

export interface NodeSpec {
  id: string;
  label?: string;
  shape?: string;
  cluster?: string | null;
  classes?: string[];
}

export function node(spec: NodeSpec | string): GraphNode {
  const resolved = typeof spec === 'string' ? { id: spec } : spec;

  return {
    id: resolved.id,
    label: resolved.label === undefined ? [resolved.id] : resolved.label ? [resolved.label] : [],
    shape: resolved.shape ?? 'rect',
    classes: resolved.classes ?? [],
    cluster: resolved.cluster ?? null,
  };
}

export interface EdgeSpec {
  from: string;
  to: string;
  label?: string;
  minLen?: number;
  weight?: number;
  arrow?: GraphEdge['arrow'];
  startArrow?: GraphEdge['startArrow'];
  line?: GraphEdge['line'];
  id?: string;
}

export function edge(spec: EdgeSpec, ordinal = 0): GraphEdge {
  const built: GraphEdge = {
    id: spec.id ?? `${spec.from}->${spec.to}#${ordinal}`,
    source: spec.from,
    target: spec.to,
    line: spec.line ?? 'solid',
    arrow: spec.arrow ?? 'arrow',
    startArrow: spec.startArrow ?? 'none',
    minLen: spec.minLen ?? 1,
    weight: spec.weight ?? 1,
    classes: [],
  };

  if (spec.label !== undefined) {
    built.label = [spec.label];
  }

  return built;
}

export function cluster(id: string, parent: string | null = null, label?: string): GraphCluster {
  const built: GraphCluster = { id, parent, classes: [] };

  if (label !== undefined) {
    built.label = [label];
  }

  return built;
}

export interface ModelSpec {
  family?: string;
  direction?: Direction;
  nodes: (NodeSpec | string)[];
  edges?: EdgeSpec[];
  clusters?: GraphCluster[];
  title?: string;
}

export function model(spec: ModelSpec): GraphModel {
  const built: GraphModel = {
    family: spec.family ?? 'flowchart',
    direction: spec.direction ?? 'TB',
    nodes: spec.nodes.map((entry) => node(entry)),
    edges: (spec.edges ?? []).map((entry, index) => edge(entry, index)),
    clusters: spec.clusters ?? [],
  };

  if (spec.title !== undefined) {
    built.title = spec.title;
  }

  return built;
}

/** A linear chain `n0 -> n1 -> … -> n{count-1}`. */
export function chain(count: number, direction: Direction = 'TB'): GraphModel {
  const nodes = Array.from({ length: count }, (_, index) => `n${index}`);
  const edges = nodes.slice(1).map((to, index) => ({ from: `n${index}`, to }));

  return model({ direction, nodes, edges });
}
