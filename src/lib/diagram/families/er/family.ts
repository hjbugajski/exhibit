import { layoutGraph } from '../../core/graph/layout-graph.ts';
import type { DiagramFamily, GraphScene } from '../../types.ts';
import type { ErIR } from './ir.ts';
import { parseEr } from './parse.ts';
import { toGraph } from './to-graph.ts';

export const erFamily: DiagramFamily<ErIR, GraphScene> = {
  id: 'er',
  detect: (header) => /^erDiagram\b/.test(header),
  parse: parseEr,
  /** `toGraph` reports nothing of its own — every ER diagnostic is a parse-time one. */
  layout: (ir, options) => layoutGraph(toGraph(ir), options),
};
