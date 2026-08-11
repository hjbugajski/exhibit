import { Reporter } from '../../core/diagnostics.ts';
import { layoutGraph } from '../../core/graph/layout-graph.ts';
import type { DiagramFamily, GraphScene } from '../../types.ts';
import type { FlowchartIR } from './ir.ts';
import { parseFlowchart } from './parse.ts';
import { toGraphModel } from './to-graph.ts';

export const flowchartFamily: DiagramFamily<FlowchartIR, GraphScene> = {
  id: 'flowchart',
  detect: (header) => /^(?:flowchart|graph)\b/.test(header),
  parse: parseFlowchart,
  layout: (ir, options) => {
    const report = new Reporter();
    const laid = layoutGraph(toGraphModel(ir, report), options);

    return { scene: laid.scene, diagnostics: [...report.diagnostics, ...laid.diagnostics] };
  },
};
