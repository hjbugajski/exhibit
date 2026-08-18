import type { DiagramFamily, SequenceScene } from '../../types.ts';
import type { SequenceIR } from './ir.ts';
import { layoutSequence } from './layout.ts';
import { parseSequence } from './parse.ts';

export const sequenceFamily: DiagramFamily<SequenceIR, SequenceScene> = {
  id: 'sequence',
  detect: (header) => /^sequenceDiagram\b/.test(header),
  parse: parseSequence,
  layout: layoutSequence,
};
