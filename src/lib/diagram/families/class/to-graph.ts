/*
 * Class IR -> `GraphModel`. This file is the whole class layout implementation: everything after it
 * — ranking, ordering, positioning, routing, clusters — is the shared layered engine, unchanged.
 *
 * A class draws as one rectangle whose label is the stack of its compartments: the stereotype line,
 * the name, then the attributes and the methods, one member per line. That is why no compartment
 * shape is needed to lay one out — the box is sized by measuring those lines, exactly the way a
 * state description sizes its state.
 *
 * The relation markers map onto the arrow kinds the scene already has (`ArrowKind` is a contract in
 * `types.ts`, not a family's to extend): a triangle draws as the solid head, both diamonds as the
 * round cap. What the two diamonds mean is not lost — every relation carries its UML name in
 * `classes`, which is emitted as `data-class` for paint to key on, and never as paint itself.
 */

import type { GraphCluster, GraphEdge, GraphModel, GraphNode } from '../../core/graph/model.ts';
import type { ArrowKind } from '../../types.ts';
import type { ClassIR, ClassNode, ClassRelation, RelationMarker } from './ir.ts';
import { memberLine } from './ir.ts';

const CLASS_SHAPE = 'rect';

const MARKER_ARROWS: Record<RelationMarker, ArrowKind> = {
  none: 'none',
  inheritance: 'arrow',
  composition: 'circle',
  aggregation: 'circle',
  arrow: 'arrow',
};

/**
 * The UML name of a relation, from the markers it was written with. Both ends are considered because
 * mermaid puts the marker on the end it belongs to — `A <|-- B` and `B --|> A` are the same
 * inheritance, drawn from opposite ends.
 */
function relationName(relation: ClassRelation): string {
  const markers: readonly RelationMarker[] = [relation.fromMarker, relation.toMarker];

  if (markers.includes('inheritance')) {
    return relation.dotted ? 'realization' : 'inheritance';
  }

  if (markers.includes('composition')) {
    return 'composition';
  }

  if (markers.includes('aggregation')) {
    return 'aggregation';
  }

  if (markers.includes('arrow')) {
    return relation.dotted ? 'dependency' : 'association';
  }

  return 'link';
}

/**
 * Multiplicities as one more line of the edge label. The engine gives an edge a single label box, so
 * a pair of end-anchored cardinalities has nowhere of its own to go; written as `1 .. many`, with the
 * dots kept on the side that has no number, the line still says which end each one belongs to.
 */
function cardinalityLine(relation: ClassRelation): string | null {
  const from = relation.fromCardinality;
  const to = relation.toCardinality;

  if (from === undefined && to === undefined) {
    return null;
  }

  return `${from ?? ''} .. ${to ?? ''}`.trim();
}

/** Stereotype, name, attributes, methods — the compartments, as the lines they are drawn on. */
function labelOf(node: ClassNode): string[] {
  const lines: string[] = [];

  if (node.annotation) {
    lines.push(`«${node.annotation}»`);
  }

  lines.push(node.label);

  for (const member of node.attributes) {
    lines.push(memberLine(member));
  }

  for (const member of node.methods) {
    lines.push(memberLine(member));
  }

  return lines;
}

export function toGraph(ir: ClassIR): GraphModel {
  const nodes: GraphNode[] = ir.classes.map((entry) => ({
    id: entry.id,
    label: labelOf(entry),
    name: entry.label,
    shape: CLASS_SHAPE,
    classes: [],
    cluster: entry.namespace,
    span: entry.span,
  }));
  const clusters: GraphCluster[] = ir.namespaces.map((entry) => ({
    id: entry.id,
    label: [entry.id],
    parent: null,
    classes: [],
    span: entry.span,
  }));
  const edges: GraphEdge[] = [];

  for (const relation of ir.relations) {
    const cardinality = cardinalityLine(relation);
    const label = [...(relation.label ?? []), ...(cardinality === null ? [] : [cardinality])];
    const edge: GraphEdge = {
      id: relation.id,
      source: relation.from,
      target: relation.to,
      line: relation.dotted ? 'dotted' : 'solid',
      arrow: MARKER_ARROWS[relation.toMarker],
      startArrow: MARKER_ARROWS[relation.fromMarker],
      minLen: 1,
      weight: 1,
      classes: [relationName(relation)],
      span: relation.span,
    };

    if (label.length > 0) {
      edge.label = label;
    }

    edges.push(edge);
  }

  const model: GraphModel = {
    family: 'class',
    direction: ir.direction,
    nodes,
    edges,
    clusters,
  };

  if (ir.accTitle !== undefined) {
    model.title = ir.accTitle;
  }

  if (ir.accDescr !== undefined) {
    model.description = ir.accDescr;
  }

  return model;
}
