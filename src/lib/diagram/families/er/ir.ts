/*
 * Entity-relationship IR. Entities are kept in declaration order — that order is the deterministic
 * tie-break every layout phase falls back to, so it has to survive the parse.
 *
 * Cardinality is stored as the four names mermaid's crow's-foot pairs mean rather than as the
 * glyphs that spell them: `|o` and `o|` are the same statement read from opposite ends, and a
 * renderer needs the meaning, not which side of the line it was written on.
 */

import type { DiagramIR, Span } from '../../types.ts';

export type ErCardinality = 'zero-or-one' | 'exactly-one' | 'zero-or-more' | 'one-or-more';

export type ErKey = 'PK' | 'FK' | 'UK';

export interface ErAttribute {
  type: string;
  name: string;
  /** `PK` / `FK` / `UK` markers, in the order they were written. */
  keys: readonly ErKey[];
  comment?: string;
  span: Span;
}

export interface ErEntity {
  id: string;
  /** Display name lines; empty when the entity was named by its id alone. */
  label: readonly string[];
  attributes: readonly ErAttribute[];
  span: Span;
}

export interface ErRelationship {
  id: string;
  from: string;
  to: string;
  /** How many `from` rows one `to` row may have, and the mirror of it. */
  fromCardinality: ErCardinality;
  toCardinality: ErCardinality;
  /** `--` rather than `..`: the child cannot exist without the parent. */
  identifying: boolean;
  label?: readonly string[];
  span: Span;
}

export interface ErIR extends DiagramIR {
  kind: 'er';
  entities: readonly ErEntity[];
  relationships: readonly ErRelationship[];
}
