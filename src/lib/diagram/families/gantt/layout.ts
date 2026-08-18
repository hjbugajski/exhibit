/*
 * Gantt layout. Two passes and no search: the plan, then the picture.
 *
 * The plan resolves every task to an interval. A start is a date, the end of the tasks an `after`
 * clause names, or wherever the previous task finished; an end is a date, a duration walked over the
 * calendar, or a default day. One forward pass is enough because mermaid's own grammar is a forward
 * one — `after` may only name a task that is already written — and a dependency on a task further
 * down is reported rather than solved, which is the honest answer to a chart that reads backwards.
 *
 * The picture is a time axis mapped onto x and one row per task on y. The axis picks its step from a
 * ladder so that the range fits in about ten ticks, and the chart is then made wide enough that two
 * neighbouring tick labels cannot touch — which is why the labels are formatted and measured before
 * any width is decided. Section names live in a left gutter that is exactly as wide as the widest of
 * them, and each section keeps a band across its own rows so a stylesheet can stripe them.
 *
 * A task label is drawn inside its bar when it measurably fits and beside it when it does not, which
 * is a decision only layout can make and only after measuring — so `placement` is on the scene and
 * the renderer never guesses.
 *
 * There is no today marker. Drawing one means reading a clock, the core is forbidden one, and no
 * option carries an author-supplied `now` yet — so a source that writes `todayMarker` gets one info
 * diagnostic from the parser and nothing is drawn; the silent default stays silent.
 */

import { Reporter } from '../../core/diagnostics.ts';
import { reportExtent } from '../../core/extent.ts';
import { linearD } from '../../core/geometry/path.ts';
import { textStyle, wrapLabel } from '../../core/text/measure.ts';
import type {
  GanttScene,
  GanttState,
  LabelBox,
  LayoutOptions,
  LayoutResult,
  PlacedLabel,
  Rect,
  SceneGanttSection,
  SceneGanttTask,
  SceneGanttTick,
} from '../../types.ts';
import type { GanttIR, GanttTask } from './ir.ts';
import { MS_PER_DAY, MS_PER_HOUR, addDuration, formatInstant, skipExcluded } from './time.ts';

/** Ticks the axis aims for before it steps up the ladder. */
const MAX_TICKS = 10;

/** Axis steps, coarsening; past the last one a whole-year multiple is computed instead. */
const STEPS: readonly number[] = [
  MS_PER_HOUR,
  MS_PER_HOUR * 3,
  MS_PER_HOUR * 6,
  MS_PER_HOUR * 12,
  MS_PER_DAY,
  MS_PER_DAY * 2,
  MS_PER_DAY * 7,
  MS_PER_DAY * 14,
  MS_PER_DAY * 28,
  MS_PER_DAY * 91,
  MS_PER_DAY * 182,
  MS_PER_DAY * 364,
];

/** Narrowest a chart may be, whatever its labels ask for. */
const MIN_CHART_WIDTH = 360;

/** A bar with no length still has to be visible; a milestone draws a diamond instead. */
const MIN_BAR_WIDTH = 2;

const EMPTY_LABEL: LabelBox = { lines: [], width: 0, height: 0, lineHeight: 0, baseline: 0 };

interface Planned {
  task: GanttTask;
  start: number;
  end: number;
}

function centred(box: LabelBox, x: number, y: number): PlacedLabel {
  return { box, x, y };
}

function stateOf(task: GanttTask): GanttState {
  if (task.tags.includes('done')) {
    return 'done';
  }

  return task.tags.includes('active') ? 'active' : 'default';
}

/** The chart's own zero: the first date anybody wrote, so an all-relative chart still has an origin. */
function originOf(ir: GanttIR): number | null {
  for (const task of ir.tasks) {
    if (task.start.kind === 'date') {
      return task.start.at;
    }

    if (task.end.kind === 'date') {
      return task.end.at;
    }
  }

  return null;
}

/**
 * Every task as an interval, in source order. Unresolved dependencies and backwards end dates are
 * reported and then made to make sense, because half a chart is worse than a wrong one.
 */
function schedule(ir: GanttIR, report: Reporter, origin: number): Planned[] {
  const planned: Planned[] = [];
  const byId = new Map<string, Planned>();
  let previousEnd: number | null = null;

  for (const task of ir.tasks) {
    let start: number;

    if (task.start.kind === 'date') {
      start = task.start.at;
    } else if (task.start.kind === 'after') {
      const known = task.start.ids
        .map((id) => byId.get(id))
        .filter((entry): entry is Planned => entry !== undefined);
      const missing = task.start.ids.filter((id) => !byId.has(id));

      if (missing.length > 0) {
        report.warn(
          'unknown-dependency',
          `'${missing.join("', '")}' ${missing.length === 1 ? 'is not a task' : 'are not tasks'} defined above this one, so it was ignored.`,
          task.span,
        );
      }

      start =
        known.length > 0 ? Math.max(...known.map((entry) => entry.end)) : (previousEnd ?? origin);
    } else {
      start = previousEnd ?? origin;
    }

    start = skipExcluded(start, ir.excludeWeekends);

    const milestone = task.tags.includes('milestone');
    let end: number;

    if (task.end.kind === 'date') {
      end = task.end.at;

      if (end < start) {
        report.warn(
          'reversed-task',
          `'${task.id}' ends before it starts; it was drawn with no length.`,
          task.span,
        );
        end = start;
      }
    } else if (task.end.kind === 'duration') {
      end = addDuration(start, task.end.duration, ir.excludeWeekends);
    } else {
      end = milestone ? start : addDuration(start, { ms: MS_PER_DAY, days: 1 }, ir.excludeWeekends);
    }

    const entry: Planned = { task, start, end };

    planned.push(entry);
    byId.set(task.id, entry);
    previousEnd = end;
  }

  return planned;
}

/** Coarsest step that keeps the range under `MAX_TICKS` ticks. */
function stepFor(span: number): number {
  const found = STEPS.find((step) => span / step <= MAX_TICKS);

  if (found !== undefined) {
    return found;
  }

  const year = STEPS.at(-1) as number;

  return year * Math.ceil(span / (year * MAX_TICKS));
}

function alignDown(at: number, step: number): number {
  return Math.floor(at / step) * step;
}

export function layoutGantt(ir: GanttIR, options: LayoutOptions): LayoutResult<GanttScene> {
  const report = new Reporter();
  const m = options.metrics;
  // Three measured roles: section names are headings at node size, task and axis labels are captions
  // one step down — the same role a sequence message label plays.
  const sectionStyle = textStyle(m);
  const captionStyle = textStyle(m, 'edgeLabel');
  const wrapSection = (lines: readonly string[]): LabelBox =>
    lines.length === 0
      ? EMPTY_LABEL
      : wrapLabel(lines, sectionStyle, options.measurer, m.maxLabelWidth);
  const wrapCaption = (lines: readonly string[]): LabelBox =>
    lines.length === 0
      ? EMPTY_LABEL
      : wrapLabel(lines, captionStyle, options.measurer, m.maxLabelWidth);

  if (ir.tasks.length > options.limits.nodes) {
    report.error(
      'too-many-nodes',
      `Gantt chart has ${ir.tasks.length} tasks; the limit is ${options.limits.nodes}.`,
    );

    return { scene: null, diagnostics: report.diagnostics };
  }

  const scene: GanttScene = {
    kind: 'gantt',
    family: 'gantt',
    size: { width: m.padding * 2, height: m.padding * 2 },
    chart: { x: m.padding, y: m.padding, width: 0, height: 0 },
    sections: [],
    ticks: [],
    tasks: [],
  };
  const title = ir.title ?? ir.accTitle;

  if (title !== undefined) {
    scene.title = title;
  }

  if (ir.title !== undefined) {
    scene.caption = ir.title;
  }

  if (ir.accDescr !== undefined) {
    scene.description = ir.accDescr;
  }

  if (ir.tasks.length === 0) {
    report.warn('empty-diagram', 'The gantt chart has no tasks.');

    return { scene, diagnostics: report.diagnostics };
  }

  const origin = originOf(ir);

  if (origin === null) {
    report.info(
      'no-dates',
      'No task carries a date, so the chart starts at the epoch and only the relative lengths mean anything.',
    );
  }

  // ------------------------------------------------------------------------- the plan

  const planned = schedule(ir, report, origin ?? 0);
  const first = Math.min(...planned.map((entry) => entry.start));
  const last = Math.max(...planned.map((entry) => entry.end));
  const step = stepFor(Math.max(last - first, MS_PER_DAY));
  const domainStart = alignDown(first, step);
  const domainEnd = Math.max(domainStart + step, Math.ceil(last / step) * step);
  const domain = domainEnd - domainStart;

  // ------------------------------------------------------------------------ the frame

  const ticks: { at: number; label: LabelBox }[] = [];

  for (let at = domainStart; at <= domainEnd; at += step) {
    ticks.push({ at, label: wrapCaption([formatInstant(at, ir.axisFormat)]) });
  }

  const tickWidth = ticks.reduce((widest, tick) => Math.max(widest, tick.label.width), 0);
  const tickHeight = ticks.reduce((tallest, tick) => Math.max(tallest, tick.label.height), 0);
  const sectionLabels = ir.sections.map((section) => wrapSection(section.label));
  const gutter = sectionLabels.reduce(
    (widest, label) => Math.max(widest, label.width > 0 ? label.width + m.nodePaddingX * 2 : 0),
    0,
  );
  const chartWidth = Math.max(MIN_CHART_WIDTH, (tickWidth + m.labelGap * 4) * (ticks.length - 1));
  const rowHeight = m.minNodeHeight;
  const barHeight = rowHeight - m.labelGap * 2;
  const axisHeight = tickHeight + m.labelGap * 2;
  const left = m.padding + gutter;
  const top = m.padding + axisHeight;
  const xOf = (at: number): number => left + ((at - domainStart) / domain) * chartWidth;
  const right = left + chartWidth;

  scene.chart = { x: left, y: top, width: chartWidth, height: planned.length * rowHeight };

  // ------------------------------------------------------------------------- the rows

  let maxX = right;
  const tasks: SceneGanttTask[] = planned.map((entry, index) => {
    const rowY = top + index * rowHeight;
    const milestone = entry.task.tags.includes('milestone');
    const startX = xOf(entry.start);
    const endX = xOf(entry.end);
    const width = milestone ? 0 : Math.max(endX - startX, MIN_BAR_WIDTH);
    /*
     * A task with no length still draws a visible stub, and a task that ends where the domain does
     * starts at the right edge — so the stub would hang outside the plotted area. It is nudged back
     * inside instead: the bar is the chart's own content and nothing the axis does not cover.
     */
    const barX = milestone ? startX : Math.min(startX, right - width);
    const bar: Rect = { x: barX, y: rowY + m.labelGap, width, height: barHeight };
    const label = wrapCaption(entry.task.label);
    const centre = rowY + rowHeight / 2;
    const fits = !milestone && label.width + m.labelGap * 2 <= width && label.height <= barHeight;
    const half = barHeight / 2;
    const after = (milestone ? startX + half : barX + width) + m.labelGap + label.width / 2;
    const before = (milestone ? startX - half : barX) - m.labelGap - label.width / 2;
    // Outside labels run right by default and left only when the right would leave the chart and
    // the left would not: a label off the right edge widens the drawing, one off the left is lost.
    const overflows = after + label.width / 2 > right && before - label.width / 2 >= m.padding;
    const placement = fits ? 'inside' : overflows ? 'before' : 'after';
    const labelX =
      placement === 'inside' ? barX + width / 2 : placement === 'after' ? after : before;
    const built: SceneGanttTask = {
      id: entry.task.id,
      section: entry.task.section,
      bar,
      state: stateOf(entry.task),
      crit: entry.task.tags.includes('crit'),
      milestone,
      label: centred(label, labelX, centre),
      placement,
      startText: formatInstant(entry.start, ir.axisFormat),
      endText: formatInstant(entry.end, ir.axisFormat),
      span: entry.task.span,
    };

    if (milestone) {
      built.milestoneD = `${linearD([
        { x: startX, y: centre - half },
        { x: startX + half, y: centre },
        { x: startX, y: centre + half },
        { x: startX - half, y: centre },
      ])}Z`;
    }

    maxX = Math.max(maxX, labelX + label.width / 2);

    return built;
  });

  // --------------------------------------------------------------------- the sections

  const sections: SceneGanttSection[] = ir.sections.map((_section, index) => {
    const rows = planned
      .map((entry, row) => (entry.task.section === index ? row : -1))
      .filter((row) => row >= 0);
    const firstRow = rows.length > 0 ? (rows[0] as number) : 0;
    const band: Rect = {
      x: m.padding,
      y: top + firstRow * rowHeight,
      width: gutter + chartWidth,
      height: Math.max(rows.length, 0) * rowHeight,
    };
    const built: SceneGanttSection = { id: `section-${index}`, index, band };
    const label = sectionLabels[index] as LabelBox;

    if (label.lines.length > 0) {
      built.label = centred(label, m.padding + gutter / 2, band.y + band.height / 2);
    }

    return built;
  });

  scene.sections = sections;
  scene.tasks = tasks;
  scene.ticks = ticks.map((tick, index): SceneGanttTick => {
    const x = xOf(tick.at);

    return {
      id: `tick-${index}`,
      x,
      label: centred(tick.label, x, m.padding + axisHeight / 2),
    };
  });
  scene.size = {
    width: maxX + m.padding,
    height: top + scene.chart.height + m.padding,
  };

  reportExtent(report, scene.size);

  return { scene, diagnostics: report.diagnostics };
}
