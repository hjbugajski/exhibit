/*
 * ER IR -> `GraphModel`. This file is the whole ER layout implementation: everything after it —
 * ranking, ordering, positioning, routing — is the shared layered engine, unchanged.
 *
 * An entity is one plain rectangle whose label is its name followed by one line per attribute, the
 * way a state's description lines stack under its name. Mermaid draws a ruled table instead; the
 * rows carry the same text in the same order, and a table shape is a rendering change rather than a
 * model one.
 *
 * A relationship has no direction, so neither end takes an arrowhead. Its two cardinalities are
 * author intent and travel as classes — `er-source-…` / `er-target-…`, one per end — because the
 * scene's `ArrowKind` vocabulary has no crow's foot in it yet. `--` versus `..` maps onto the
 * existing solid/dotted line intent, which is exactly what identifying versus non-identifying means
 * on the paint.
 */

import type { GraphEdge, GraphModel, GraphNode } from '../../core/graph/model.ts';
import type { ErAttribute, ErEntity, ErIR } from './ir.ts';

/** ER has no direction statement, so every diagram is laid out top to bottom. */
const DIRECTION = 'TB';

const ENTITY_SHAPE = 'rect';

/** One attribute as it is written on the entity: type, name, key markers, then the comment. */
function attributeLine(attribute: ErAttribute): string {
  const parts = [attribute.type, attribute.name];

  if (attribute.keys.length > 0) {
    parts.push(attribute.keys.join(','));
  }

  if (attribute.comment !== undefined) {
    parts.push(`"${attribute.comment}"`);
  }

  return parts.join(' ');
}

function labelOf(entity: ErEntity): string[] {
  const name = entity.label.length > 0 ? [...entity.label] : [entity.id];

  return [...name, ...entity.attributes.map(attributeLine)];
}

export function toGraph(ir: ErIR): GraphModel {
  const nodes: GraphNode[] = ir.entities.map((entity) => ({
    id: entity.id,
    label: labelOf(entity),
    // The label is the whole attribute table; the text alternative reads the entity by its name.
    name: entity.id,
    shape: ENTITY_SHAPE,
    classes: [],
    cluster: null,
    span: entity.span,
  }));

  const edges: GraphEdge[] = ir.relationships.map((relationship) => {
    const edge: GraphEdge = {
      id: relationship.id,
      source: relationship.from,
      target: relationship.to,
      line: relationship.identifying ? 'solid' : 'dotted',
      arrow: 'none',
      startArrow: 'none',
      minLen: 1,
      weight: 1,
      classes: [
        `er-source-${relationship.fromCardinality}`,
        `er-target-${relationship.toCardinality}`,
      ],
      span: relationship.span,
    };

    if (relationship.label) {
      edge.label = relationship.label;
    }

    return edge;
  });

  const model: GraphModel = {
    family: 'er',
    direction: DIRECTION,
    nodes,
    edges,
    clusters: [],
  };

  if (ir.accTitle !== undefined) {
    model.title = ir.accTitle;
  }

  if (ir.accDescr !== undefined) {
    model.description = ir.accDescr;
  }

  return model;
}
