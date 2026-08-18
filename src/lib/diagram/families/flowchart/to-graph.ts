/*
 * `FlowchartIR` -> `GraphModel`, the seam the shared layered engine sits behind. It is a flat
 * projection on purpose: everything interesting about flowchart layout is already the engine's job,
 * so this file exists to prove the seam is real rather than to make decisions.
 *
 * The one decision it does make is the same one the state family makes. An edge endpoint may name a
 * subgraph, which the parser has already minted a node for; that node is a phantom sitting beside
 * the box it was meant to be, so it is dropped and the edge is retargeted to a member. A subgraph
 * with no members has nothing to retarget to — an endpoint cannot attach to an empty box — so the
 * edge is dropped with a warning rather than quietly left pointing at the phantom.
 */

import { clusterEndpoint } from '../../core/graph/cluster.ts';
import type { GraphCluster, GraphEdge, GraphModel, GraphNode } from '../../core/graph/model.ts';
import type { DiagnosticSink } from '../../types.ts';
import type { FlowchartIR } from './ir.ts';

/** Nodes inside each subgraph at any depth, in declaration order; an empty subgraph gets no entry. */
function membersOf(ir: FlowchartIR): Map<string, string[]> {
  const parentOf = new Map(ir.clusters.map((entry) => [entry.id, entry.parent]));
  const members = new Map<string, string[]>();

  for (const node of ir.nodes.values()) {
    const seen = new Set<string>();

    for (let at = node.cluster; at !== null && !seen.has(at); at = parentOf.get(at) ?? null) {
      seen.add(at);

      // A node declared inside the subgraph that shares its id is that subgraph's phantom.
      if (at !== node.id) {
        members.set(at, [...(members.get(at) ?? []), node.id]);
      }
    }
  }

  return members;
}

export function toGraphModel(ir: FlowchartIR, report: DiagnosticSink): GraphModel {
  const subgraphs = membersOf(ir);
  const phantoms = new Set(ir.clusters.map((cluster) => cluster.id));

  const resolve = (
    id: string,
    role: 'source' | 'target',
    edge: GraphEdge['span'],
  ): string | null => {
    if (!phantoms.has(id)) {
      return id;
    }

    const member = clusterEndpoint(subgraphs.get(id) ?? [], role);

    if (member === null) {
      return null;
    }

    report.info(
      'subgraph-endpoint',
      `Edge endpoint '${id}' is a subgraph, so the edge was attached to '${member}' inside it.`,
      edge,
    );

    return member;
  };

  const nodes: GraphNode[] = [...ir.nodes.values()]
    .filter((node) => !phantoms.has(node.id))
    .map((node) => ({
      id: node.id,
      label: node.label.lines,
      shape: node.shape,
      classes: node.classes,
      cluster: node.cluster,
      span: node.span,
    }));

  const edges: GraphEdge[] = [];

  for (const edge of ir.edges) {
    const source = resolve(edge.from, 'source', edge.span);
    const target = resolve(edge.to, 'target', edge.span);

    if (source === null || target === null) {
      report.warn(
        'empty-subgraph',
        `Subgraph '${source === null ? edge.from : edge.to}' has no nodes, so an edge was dropped.`,
        edge.span,
      );

      continue;
    }

    const built: GraphEdge = {
      id: edge.id,
      source,
      target,
      line: edge.invisible ? 'invisible' : edge.line,
      arrow: edge.arrow,
      startArrow: edge.startArrow,
      minLen: edge.minLen,
      weight: 1,
      classes: edge.classes,
      span: edge.span,
    };

    if (edge.label) {
      built.label = edge.label.lines;
    }

    edges.push(built);
  }

  const clusters: GraphCluster[] = ir.clusters.map((cluster) => {
    const built: GraphCluster = {
      id: cluster.id,
      parent: cluster.parent,
      classes: [],
      span: cluster.span,
    };

    if (cluster.label) {
      built.label = cluster.label.lines;
    }

    return built;
  });

  const model: GraphModel = {
    family: 'flowchart',
    direction: ir.direction,
    nodes,
    edges,
    clusters,
  };

  if (ir.accTitle) {
    model.title = ir.accTitle;
  }

  if (ir.accDescr) {
    model.description = ir.accDescr;
  }

  return model;
}
