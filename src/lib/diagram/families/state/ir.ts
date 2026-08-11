/*
 * State IR. States are kept in declaration order — that order is the deterministic tie-break every
 * layout phase falls back to, so it has to survive the parse.
 *
 * `[*]` is expanded here, not in layout: every occurrence becomes its own start or end state, which
 * is what mermaid draws and what keeps the mapping to `GraphModel` a straight rename.
 */

import type { Direction } from '../../core/graph/model.ts';
import type { DiagramIR, Span } from '../../types.ts';

export type StateNodeType = 'simple' | 'start' | 'end' | 'choice' | 'fork' | 'join' | 'composite';

export interface StateNode {
  id: string;
  type: StateNodeType;
  /** Description lines; empty for markers, which draw as fixed-size glyphs. */
  label: readonly string[];
  /** Containing composite state, or null at the top level. */
  parent: string | null;
  span: Span;
}

export interface StateTransition {
  id: string;
  from: string;
  to: string;
  label?: readonly string[];
  span: Span;
}

export interface StateNote {
  id: string;
  target: string;
  placement: 'left' | 'right';
  label: readonly string[];
  span: Span;
}

export interface StateIR extends DiagramIR {
  kind: 'state';
  direction: Direction;
  states: readonly StateNode[];
  transitions: readonly StateTransition[];
  notes: readonly StateNote[];
}
