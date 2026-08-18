import { layoutGraph } from '../../core/graph/layout-graph.ts';
import type { DiagramFamily, GraphScene } from '../../types.ts';
import type { ClassIR } from './ir.ts';
import { parseClass } from './parse.ts';
import { toGraph } from './to-graph.ts';

export const classFamily: DiagramFamily<ClassIR, GraphScene> = {
  id: 'class',
  detect: (header) => /^classDiagram(?:-v2)?\b/.test(header),
  parse: parseClass,
  layout: (ir, options) => layoutGraph(toGraph(ir), options),
};
