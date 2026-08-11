import { Reporter } from '../../core/diagnostics.ts';
import { layoutGraph } from '../../core/graph/layout-graph.ts';
import type { DiagramFamily, GraphScene } from '../../types.ts';
import type { StateIR } from './ir.ts';
import { parseState } from './parse.ts';
import { toGraph } from './to-graph.ts';

export const stateFamily: DiagramFamily<StateIR, GraphScene> = {
  id: 'state',
  detect: (header) => /^stateDiagram(?:-v2)?\b/.test(header),
  parse: parseState,
  layout: (ir, options) => {
    const report = new Reporter();
    const laid = layoutGraph(toGraph(ir, report), options);

    return { scene: laid.scene, diagnostics: [...report.diagnostics, ...laid.diagnostics] };
  },
};
