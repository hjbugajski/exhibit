/*
 * The flowchart IR: the shape a source parses into, before any geometry exists. Nodes live in an
 * insertion-ordered `Map` because declaration order is the deterministic tie-break every layout
 * phase falls back to, and it has to survive the whole pipeline.
 *
 * Label text sits here too, next to `LabelSource`: the shared reader from `core/text/label.ts` plus
 * the one flowchart-only rule, which is that a markdown string is recognized so it can be reported
 * rather than rendered.
 */

import { splitLines, stripQuotes } from '../../core/text/label.ts';
import type { ArrowKind, DiagramIR, LineKind, Span } from '../../types.ts';

export type FlowDirection = 'TB' | 'BT' | 'LR' | 'RL';

/** Label lines as authored, already split on explicit breaks. Wrapping happens in layout. */
export interface LabelSource {
  lines: readonly string[];
}

export interface FlowNode {
  id: string;
  label: LabelSource;
  /** Shape registry key. */
  shape: string;
  /** `classDef` / `:::` names. Author intent only — never paint. */
  classes: string[];
  /** Innermost subgraph the node appeared in, or null for the top level. */
  cluster: string | null;
  span: Span;
}

export interface FlowEdge {
  /** `${from}->${to}#${ordinal}` — stable across re-parses of the same source. */
  id: string;
  from: string;
  to: string;
  line: LineKind;
  /** Cap at the target end. */
  arrow: ArrowKind;
  /** Cap at the source end (`<-->`, `o--o`, `x--x`). */
  startArrow: ArrowKind;
  label?: LabelSource;
  /** Rank span from the link's length; the engine raises it to 2 when the edge is labelled. */
  minLen: number;
  /** `~~~`: the link constrains layout but is not drawn. */
  invisible: boolean;
  classes: string[];
  span: Span;
}

export interface FlowCluster {
  id: string;
  label?: LabelSource;
  parent: string | null;
  span: Span;
}

export interface FlowchartIR extends DiagramIR {
  readonly kind: 'flowchart';
  readonly source: string;
  direction: FlowDirection;
  nodes: Map<string, FlowNode>;
  edges: FlowEdge[];
  /** Flat list; `parent` gives the tree. */
  clusters: FlowCluster[];
  /** `classDef` names in declaration order. Declared paint is parsed and dropped. */
  classDefs: string[];
  accTitle?: string;
  accDescr?: string;
}

// ------------------------------------------------------------------------------- label text

/** A mermaid markdown string — `A["\`**bold**\`"]`. Recognized so it can be reported, never rendered. */
export function isMarkdownLabel(raw: string): boolean {
  const text = stripQuotes(raw).trim();

  return text.length >= 2 && text.startsWith('`') && text.endsWith('`');
}

/**
 * Strip one quote pair, decode entities, split on `<br>` / `<br/>` / `\n`, trim each line and
 * collapse internal whitespace. Whitespace-only lines are dropped, so `A[" "]` is a node with no
 * label rather than a node with a blank one.
 */
export function parseLabelText(raw: string): LabelSource {
  const text = stripQuotes(raw).trim();
  const unfenced =
    text.length >= 2 && text.startsWith('`') && text.endsWith('`') ? text.slice(1, -1) : text;

  return { lines: splitLines(unfenced) };
}
