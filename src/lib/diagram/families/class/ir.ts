/*
 * Class IR. Classes are kept in declaration order — that order is the deterministic tie-break every
 * layout phase falls back to, so it has to survive the parse.
 *
 * A class is a stack of text compartments, not a box with fields: the stereotype line, the name, the
 * attributes and the methods are all rendered as label lines of one node, so the IR stores the text
 * each line will be drawn as rather than a typed member model nothing downstream could use. What is
 * kept structured is what a caller can act on — the visibility marker, whether a member reads as a
 * method, and which compartment it belongs to.
 *
 * A relation is mermaid's own model: a marker at each end and the line between them. `A <|-- B` is a
 * marker at the `A` end, which is why the two ends are stored separately instead of as one "kind".
 */

import type { Direction } from '../../core/graph/model.ts';
import type { DiagramIR, Span } from '../../types.ts';

/** Mermaid's four visibility markers, kept as the character the author wrote, or none. */
export type ClassVisibility = '+' | '-' | '#' | '~' | '';

export interface ClassMember {
  visibility: ClassVisibility;
  /** Everything after the visibility marker, generics already rendered as `<T>`. */
  text: string;
  /** A member with an argument list draws in the method compartment; everything else is a field. */
  method: boolean;
  span: Span;
}

export interface ClassNode {
  id: string;
  /** Display name — a quoted label, else the id with its generic parameters rendered. */
  label: string;
  /** `<<interface>>` / `<<abstract>>`, without the angle brackets. */
  annotation?: string;
  attributes: readonly ClassMember[];
  methods: readonly ClassMember[];
  /** Containing namespace, or null at the top level. */
  namespace: string | null;
  span: Span;
}

/**
 * What is drawn at one end of a relation. `arrow` is the open association head (`>`); the other three
 * are the UML shapes mermaid spells `<|`, `*` and `o`.
 */
export type RelationMarker = 'none' | 'inheritance' | 'composition' | 'aggregation' | 'arrow';

export interface ClassRelation {
  id: string;
  from: string;
  to: string;
  /** Marker at the `from` end — the `<|`, `*`, `o` or `<` written left of the line. */
  fromMarker: RelationMarker;
  toMarker: RelationMarker;
  /** `..` is dotted, `--` solid. */
  dotted: boolean;
  label?: readonly string[];
  /** Multiplicity written beside each end, without its quotes. */
  fromCardinality?: string;
  toCardinality?: string;
  span: Span;
}

export interface ClassNamespace {
  id: string;
  span: Span;
}

export interface ClassIR extends DiagramIR {
  kind: 'class';
  direction: Direction;
  classes: readonly ClassNode[];
  relations: readonly ClassRelation[];
  namespaces: readonly ClassNamespace[];
}

/** One compartment line, as it will be measured and drawn. */
export function memberLine(member: ClassMember): string {
  return `${member.visibility}${member.text}`;
}

/**
 * Mermaid writes generics as `~T~` because `<` and `>` are taken by the relation operators. Nothing
 * downstream cares where they came from, so they are rendered once, here, and stored as text.
 */
export function renderGenerics(raw: string): string {
  return raw.replace(/~([^~]*)~/g, (whole, inner: string) => (inner ? `<${inner}>` : whole));
}
