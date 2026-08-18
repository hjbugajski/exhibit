/*
 * The builtin family list. A family is a plain object — id, detect, parse, layout — so adding one
 * is `families: [...builtinFamilies, myFamily]` at the call site, with no registration step and no
 * factory. The `DiagramFamily` contract itself lives in types.ts.
 */

import { classFamily } from './families/class/family.ts';
import { erFamily } from './families/er/family.ts';
import { flowchartFamily } from './families/flowchart/family.ts';
import { ganttFamily } from './families/gantt/family.ts';
import { pieFamily } from './families/pie/family.ts';
import { sequenceFamily } from './families/sequence/family.ts';
import { stateFamily } from './families/state/family.ts';
import type { DiagramFamily } from './types.ts';

export const builtinFamilies: readonly DiagramFamily[] = [
  flowchartFamily,
  sequenceFamily,
  stateFamily,
  classFamily,
  erFamily,
  pieFamily,
  ganttFamily,
];

export function findFamily(
  families: readonly DiagramFamily[],
  id: string,
): DiagramFamily | undefined {
  return families.find((family) => family.id === id);
}
