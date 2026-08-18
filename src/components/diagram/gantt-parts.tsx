/*
 * SVG for the gantt family. Same rule as every other view: `data-part` plus the author intent the
 * scene recorded (`data-state`, `data-crit`, `data-milestone`, `data-placement`), never a paint
 * attribute.
 *
 * Draw order is the reading order of the chart. The section bands are the ground, the gridlines lie
 * on them, the axis names the grid, the bars cover it, and every label is painted last — a task
 * label placed beside its bar crosses whatever gridline happens to be there, and a label drawn
 * before the bars would be struck out by the next one along.
 */

import { memo } from 'react';

import { round2 } from '@/lib/diagram/core/geometry/path';
import type {
  PlacedLabel,
  Rect,
  Scene,
  SceneGanttSection,
  SceneGanttTask,
  SceneGanttTick,
} from '@/lib/diagram/types';

import { useDiagramConfig } from './diagram-context';
import { tspans } from './svg-text';

type NamedSection = SceneGanttSection & { label: PlacedLabel };

function box(rect: Rect): { x: number; y: number; width: number; height: number } {
  return {
    x: round2(rect.x),
    y: round2(rect.y),
    width: round2(rect.width),
    height: round2(rect.height),
  };
}

// ------------------------------------------------------------------------------------ sections

/** One band per section, plus its name in the left gutter. */
function Sections({ sections }: { sections: readonly SceneGanttSection[] }) {
  const { classNames } = useDiagramConfig();

  if (sections.length === 0) {
    return null;
  }

  return (
    <g data-part="gantt-sections" className={classNames.ganttSections}>
      {sections.map((section) => (
        <g
          className={classNames.ganttSection}
          data-id={section.id}
          data-index={section.index}
          data-part="gantt-section"
          key={section.id}
        >
          <rect
            className={classNames.ganttSectionBand}
            data-part="gantt-section-band"
            {...box(section.band)}
          />
        </g>
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------------- axis, grid

function Grid({ chart, ticks }: { chart: Rect; ticks: readonly SceneGanttTick[] }) {
  const { classNames } = useDiagramConfig();

  if (ticks.length === 0) {
    return null;
  }

  return (
    <g data-part="gantt-grid" className={classNames.ganttGrid}>
      {ticks.map((tick) => (
        <line
          className={classNames.ganttGridLine}
          data-id={tick.id}
          data-part="gantt-grid-line"
          key={tick.id}
          x1={round2(tick.x)}
          x2={round2(tick.x)}
          y1={round2(chart.y)}
          y2={round2(chart.y + chart.height)}
        />
      ))}
    </g>
  );
}

function Axis({ chart, ticks }: { chart: Rect; ticks: readonly SceneGanttTick[] }) {
  const { classNames } = useDiagramConfig();

  if (ticks.length === 0) {
    return null;
  }

  return (
    <g data-part="gantt-axis" className={classNames.ganttAxis}>
      <line
        className={classNames.ganttAxisRule}
        data-part="gantt-axis-rule"
        x1={round2(chart.x)}
        x2={round2(chart.x + chart.width)}
        y1={round2(chart.y)}
        y2={round2(chart.y)}
      />
      {ticks.map((tick) => (
        <text
          className={classNames.ganttAxisTick}
          data-id={tick.id}
          data-part="gantt-axis-tick"
          key={tick.id}
          textAnchor="middle"
        >
          {tspans(tick.label.box, tick.label.x, tick.label.y)}
        </text>
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------------------- bars

/** A bar, or the diamond a milestone draws instead of one. */
function Bars({ tasks }: { tasks: readonly SceneGanttTask[] }) {
  const { classNames, metrics } = useDiagramConfig();

  if (tasks.length === 0) {
    return null;
  }

  return (
    <g data-part="gantt-bars" className={classNames.ganttBars}>
      {tasks.map((task) => (
        <g
          className={classNames.ganttTask}
          data-crit={task.crit ? '' : undefined}
          data-id={task.id}
          data-milestone={task.milestone ? '' : undefined}
          data-part="gantt-task"
          data-section={task.section}
          data-state={task.state}
          key={task.id}
        >
          {task.milestone && task.milestoneD ? (
            <path
              className={classNames.ganttMilestone}
              d={task.milestoneD}
              data-part="gantt-milestone"
            />
          ) : (
            <rect
              className={classNames.ganttBar}
              data-part="gantt-bar"
              rx={metrics.cornerRadius}
              {...box(task.bar)}
            />
          )}
        </g>
      ))}
    </g>
  );
}

// -------------------------------------------------------------------------------------- labels

/** Section names and task names, in one layer over the drawing. */
function Labels({
  sections,
  tasks,
}: {
  sections: readonly SceneGanttSection[];
  tasks: readonly SceneGanttTask[];
}) {
  const { classNames } = useDiagramConfig();
  const named = sections.filter((section): section is NamedSection => section.label !== undefined);

  if (named.length === 0 && tasks.length === 0) {
    return null;
  }

  return (
    <g data-part="gantt-labels" className={classNames.ganttLabels}>
      {named.map((section) => (
        <text
          className={classNames.ganttSectionLabel}
          data-id={section.id}
          data-index={section.index}
          data-part="gantt-section-label"
          key={section.id}
          textAnchor="middle"
        >
          {tspans(section.label.box, section.label.x, section.label.y)}
        </text>
      ))}
      {tasks.map((task) => {
        const anchor =
          task.placement === 'inside' ? 'middle' : task.placement === 'after' ? 'start' : 'end';
        const offset =
          task.placement === 'inside'
            ? 0
            : task.placement === 'after'
              ? -task.label.box.width / 2
              : task.label.box.width / 2;

        return (
          <text
            className={classNames.ganttTaskLabel}
            data-crit={task.crit ? '' : undefined}
            data-id={task.id}
            data-part="gantt-task-label"
            data-placement={task.placement}
            data-state={task.state}
            key={task.id}
            textAnchor={anchor}
          >
            {tspans(task.label.box, task.label.x + offset, task.label.y)}
          </text>
        );
      })}
    </g>
  );
}

/** Painter's order: bands behind, then the grid, the axis, the bars, and every label last. */
export const GanttView = memo(function GanttView({ scene }: { scene: Scene }) {
  if (scene.kind !== 'gantt') {
    return null;
  }

  return (
    <>
      <Sections sections={scene.sections} />
      <Grid chart={scene.chart} ticks={scene.ticks} />
      <Axis chart={scene.chart} ticks={scene.ticks} />
      <Bars tasks={scene.tasks} />
      <Labels sections={scene.sections} tasks={scene.tasks} />
    </>
  );
});
