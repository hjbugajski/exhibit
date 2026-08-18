/*
 * The gantt half of the text alternative, in the shape `describe.ts` dispatches to: a summary that
 * names the chart and its size, and one detail line per section and task, capped. The heading is
 * passed in, so the family name still comes from the one table that holds every family's.
 *
 * A row reads as "what, when, how long", because a bar's whole content is its interval and a screen
 * reader gets none of it from the picture. The dates are the ones layout already formatted in the
 * chart's own `axisFormat`: reformatting them here would need the calendar code, and printing an
 * epoch would be worse than saying nothing.
 */

import { capped, count } from '../../core/text/prose.ts';
import type { GanttScene, SceneGanttTask } from '../../types.ts';

export interface GanttDescription {
  summary: string;
  details: readonly string[];
}

function nameOf(task: SceneGanttTask): string {
  return task.label.box.lines.join(' ').trim() || task.id;
}

/** What a bar is, before when it is: a milestone is an instant and a state is worth announcing. */
function qualifier(task: SceneGanttTask): string {
  const parts: string[] = [];

  if (task.crit) {
    parts.push('critical');
  }

  if (task.state !== 'default') {
    parts.push(task.state);
  }

  return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}

export function describeGanttScene(scene: GanttScene, heading: string): GanttDescription {
  const lines: string[] = [];
  const sections = new Map(scene.sections.map((section) => [section.index, section]));
  let current = -1;

  for (const task of scene.tasks) {
    if (task.section !== current) {
      current = task.section;

      const label = sections.get(current)?.label?.box.lines.join(' ').trim();

      if (label) {
        lines.push(`Section ${label}.`);
      }
    }

    lines.push(
      task.milestone
        ? `${nameOf(task)}${qualifier(task)}: milestone on ${task.startText}.`
        : `${nameOf(task)}${qualifier(task)}: ${task.startText} to ${task.endText}.`,
    );
  }

  const named = scene.sections.filter((section) => section.label !== undefined).length;
  const parts = [count(scene.tasks.length, 'task')];

  if (named > 0) {
    parts.push(count(named, 'section'));
  }

  if (scene.tasks.length === 0) {
    return { summary: `${heading}: empty.`, details: [] };
  }

  // Which row runs earliest and which runs latest is a question about the picture, so it is asked of
  // the geometry — the formatted dates are text and may not sort.
  const opens = scene.tasks.reduce((earliest, task) =>
    task.bar.x < earliest.bar.x ? task : earliest,
  );
  const closes = scene.tasks.reduce((latest, task) =>
    task.bar.x + task.bar.width > latest.bar.x + latest.bar.width ? task : latest,
  );

  return {
    summary: `${heading}: ${parts.join(', ')}, ${opens.startText} to ${closes.endText}.`,
    details: capped(lines, 'row'),
  };
}
