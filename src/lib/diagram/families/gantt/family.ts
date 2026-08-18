/* The gantt family, in the shape every other family has — id, detect, parse, layout. */

import type { DiagramFamily, GanttScene } from '../../types.ts';
import type { GanttIR } from './ir.ts';
import { layoutGantt } from './layout.ts';
import { parseGantt } from './parse.ts';

export const ganttFamily: DiagramFamily<GanttIR, GanttScene> = {
  id: 'gantt',
  detect: (header) => /^gantt\b/.test(header),
  parse: parseGantt,
  layout: layoutGantt,
};
