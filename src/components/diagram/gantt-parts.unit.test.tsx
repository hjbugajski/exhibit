// @vitest-environment happy-dom
/*
 * The gantt view. Rendered directly against a laid-out scene rather than through `Diagram.Root`,
 * because the family is not registered yet: `Root` builds its own scene from a source, and until
 * `builtinFamilies` knows about gantt there is nothing for it to build. The config context is the
 * only thing the parts need from `Root`, so the test provides exactly that.
 *
 * What matters here is the part vocabulary, the draw order and the paint rule — the same three
 * things `styling-contract.unit.test.tsx` will enforce over the corpus once the family is wired.
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { defaultLimits, resolveLayoutOptions } from '@/lib/diagram/build';
import { Reporter } from '@/lib/diagram/core/diagnostics';
import { metricsMeasurer } from '@/lib/diagram/core/text/measurers';
import { layoutGantt } from '@/lib/diagram/families/gantt/layout';
import { parseGantt } from '@/lib/diagram/families/gantt/parse';
import { resolveMetrics } from '@/lib/diagram/metrics';
import type { GanttScene } from '@/lib/diagram/types';

import { DiagramConfigProvider } from './diagram-context';
import { GanttView } from './gantt-parts';

afterEach(() => {
  cleanup();
});

const GANTT = `gantt
  title Publishing pipeline
  axisFormat %m-%d
  section Write
    Draft the spec :done, spec, 2024-03-04, 3d
    Review         :active, crit, review, 2024-03-07, 2d
  section Ship
    Ship it        :ship, 2024-03-11, 1d
    Retrospective  :milestone, retro, 2024-03-12, 0d`;

function scenery(source = GANTT): GanttScene {
  const report = new Reporter();
  const parsed = parseGantt(source, { report, limits: defaultLimits });
  const laid = layoutGantt(parsed.ir as never, resolveLayoutOptions({ measurer: metricsMeasurer }));

  return laid.scene as GanttScene;
}

function draw(source = GANTT) {
  const scene = scenery(source);

  return render(
    <DiagramConfigProvider
      value={{
        metrics: resolveMetrics(),
        components: {},
        classNames: {},
        id: 'gantt-test',
        fit: 'scale',
      }}
    >
      <svg data-part="svg" viewBox={`0 0 ${scene.size.width} ${scene.size.height}`}>
        <GanttView scene={scene} />
      </svg>
    </DiagramConfigProvider>,
  );
}

function parts(container: HTMLElement, part: string): Element[] {
  return [...container.querySelectorAll(`[data-part="${part}"]`)];
}

const FORBIDDEN_ATTRIBUTE = /^(fill|stroke|color|font|stop-color|flood-color|lighting-color)/;

describe('gantt parts', () => {
  it('draws one group per scene collection, back to front', () => {
    const { container } = draw();
    const svg = container.querySelector('[data-part="svg"]') as Element;

    expect([...svg.children].map((child) => child.getAttribute('data-part'))).toEqual([
      'gantt-sections',
      'gantt-grid',
      'gantt-axis',
      'gantt-bars',
      'gantt-labels',
    ]);
  });

  it('bands every section and names it once', () => {
    const { container } = draw();

    expect(parts(container, 'gantt-section')).toHaveLength(2);
    expect(parts(container, 'gantt-section-band')).toHaveLength(2);
    expect(parts(container, 'gantt-section-label').map((label) => label.textContent)).toEqual([
      'Write',
      'Ship',
    ]);
  });

  it('draws a gridline and a tick label per tick', () => {
    const { container } = draw();
    const ticks = parts(container, 'gantt-axis-tick');

    expect(ticks.length).toBeGreaterThan(1);
    expect(parts(container, 'gantt-grid-line')).toHaveLength(ticks.length);
    expect(parts(container, 'gantt-axis-rule')).toHaveLength(1);
    expect(ticks[0]?.textContent).toMatch(/^\d\d-\d\d$/);
  });

  it('carries the author intent onto every bar', () => {
    const { container } = draw();
    const tasks = parts(container, 'gantt-task');

    expect(tasks.map((task) => task.getAttribute('data-state'))).toEqual([
      'done',
      'active',
      'default',
      'default',
    ]);
    expect(tasks[1]?.getAttribute('data-crit')).toBe('');
    expect(tasks[0]?.getAttribute('data-crit')).toBeNull();
    expect(tasks.map((task) => task.getAttribute('data-section'))).toEqual(['0', '0', '1', '1']);
  });

  it('draws a milestone as a diamond and never as a bar', () => {
    const { container } = draw();
    const milestone = parts(container, 'gantt-task').at(-1) as Element;

    expect(milestone.getAttribute('data-milestone')).toBe('');
    expect(milestone.querySelectorAll('[data-part="gantt-bar"]')).toHaveLength(0);
    expect(parts(container, 'gantt-milestone')).toHaveLength(1);
    expect(parts(container, 'gantt-bar')).toHaveLength(3);
  });

  it('tags every task label with where the layout put it', () => {
    const { container } = draw();
    const placements = parts(container, 'gantt-task-label').map((label) =>
      label.getAttribute('data-placement'),
    );

    expect(placements).toHaveLength(4);
    expect(placements.every((placement) => placement !== null)).toBe(true);
    expect(new Set(placements).has('inside')).toBe(true);
  });

  it('anchors an outside label away from its own bar', () => {
    const { container } = draw(
      'gantt\n  A :2024-03-01, 20d\n  A very long trailing label :2024-03-21, 1d',
    );
    const labels = parts(container, 'gantt-task-label');
    const outside = labels.find((label) => label.getAttribute('data-placement') !== 'inside');

    expect(outside?.getAttribute('text-anchor')).toMatch(/^(start|end)$/);
  });

  it('renders nothing at all for a chart with no tasks', () => {
    const { container } = draw('gantt');

    expect(container.querySelector('[data-part="svg"]')?.children).toHaveLength(0);
  });

  it('emits no paint attribute and no <style>', () => {
    const { container } = draw();

    expect(container.querySelectorAll('style')).toHaveLength(0);

    for (const element of container.querySelectorAll('*')) {
      for (const attribute of element.attributes) {
        expect(
          FORBIDDEN_ATTRIBUTE.test(attribute.name),
          `${element.tagName} carries the paint attribute "${attribute.name}"`,
        ).toBe(false);
      }

      expect(element.getAttribute('style')).toBeNull();
    }
  });

  it('keeps every emitted number on the two-decimal grid', () => {
    const { container } = draw();

    for (const element of container.querySelectorAll('*')) {
      for (const attribute of element.attributes) {
        if (/^(x|y|x1|x2|y1|y2|width|height)$/.test(attribute.name)) {
          expect(attribute.value, `${attribute.name}="${attribute.value}"`).toMatch(
            /^-?\d+(\.\d{1,2})?$/,
          );
        }
      }
    }
  });
});
