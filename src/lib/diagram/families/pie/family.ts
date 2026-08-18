import type { DiagramFamily, PieScene } from '../../types.ts';
import type { PieIR } from './ir.ts';
import { layoutPie } from './layout.ts';
import { parsePie } from './parse.ts';

export const pieFamily: DiagramFamily<PieIR, PieScene> = {
  id: 'pie',
  detect: (header) => /^pie\b/.test(header),
  parse: parsePie,
  layout: layoutPie,
};
