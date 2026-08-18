/*
 * Gantt IR. Sections and tasks in source order, and every task still carries what the source said
 * rather than when it happens: a start is a date, a dependency or nothing at all, and an end is a
 * date, a duration or nothing at all.
 *
 * Scheduling is deliberately not done here. Resolving `after` chains, defaulting a start to the end
 * of the task before it and stepping a duration over excluded days are all decisions about the
 * *plan*, and they need the whole task list before any of them can be made — so the parser stays a
 * reader of statements and `layoutGantt` resolves in one pass over the finished IR.
 */

import type { DiagramIR, Span } from '../../types.ts';

/** Mermaid's task tags. `milestone` is a shape; the other three are states. */
export type GanttTag = 'done' | 'active' | 'crit' | 'milestone';

export type GanttStart =
  | { kind: 'date'; at: number }
  /** `after a b` — the task starts when the last of those tasks ends. */
  | { kind: 'after'; ids: readonly string[] }
  | { kind: 'auto' };

/**
 * A duration keeps its whole-day count beside its length. `excludes` can only step a duration that
 * is counted in days, and `2w` has to step fourteen of them rather than add fourteen days flat.
 */
export interface GanttDuration {
  ms: number;
  /** Whole days, or null for a sub-day duration (`12h`, `30min`). */
  days: number | null;
}

export type GanttEnd =
  | { kind: 'date'; at: number }
  | { kind: 'duration'; duration: GanttDuration }
  | { kind: 'auto' };

export interface GanttSection {
  /** Display name; empty for the implicit section holding tasks written before any `section`. */
  name: string;
  label: readonly string[];
  implicit: boolean;
  span: Span;
}

export interface GanttTask {
  /** The declared id, or `task-N` when the source gave none. Unique within the chart. */
  id: string;
  label: readonly string[];
  /** Index into `GanttIR.sections`. */
  section: number;
  tags: readonly GanttTag[];
  start: GanttStart;
  end: GanttEnd;
  span: Span;
}

export interface GanttIR extends DiagramIR {
  kind: 'gantt';
  /** As declared, already checked; unreadable tokens fell back to the default before landing here. */
  dateFormat: string;
  axisFormat: string;
  sections: readonly GanttSection[];
  tasks: readonly GanttTask[];
  /** `excludes weekends`. Named weekdays and explicit dates are reported and ignored. */
  excludeWeekends: boolean;
  /** True when the source asks for a marker — any `todayMarker` other than `off`. */
  todayMarker: boolean;
  title?: string;
}
