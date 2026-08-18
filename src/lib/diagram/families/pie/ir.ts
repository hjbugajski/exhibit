/*
 * Pie IR. The whole family is `pie`, an optional title, `showData`, and rows of `"label" : value` in
 * declaration order — nothing else exists in mermaid's pie grammar.
 */

import type { DiagramIR, Span } from '../../types.ts';

export interface PieSlice {
  label: string;
  /** Non-negative; the parser drops negative rows with a diagnostic. */
  value: number;
  span: Span;
}

export interface PieIR extends DiagramIR {
  kind: 'pie';
  title?: string;
  /** `pie showData` — the renderer shows raw values beside legend labels. */
  showData: boolean;
  slices: readonly PieSlice[];
}
