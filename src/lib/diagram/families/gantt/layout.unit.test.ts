/*
 * End to end for the gantt family: real sources through `buildDiagram`, so detection, the parser
 * and the layout are all under test at once.
 */

import { describe, expect, it } from 'vitest';

import { loadCorpus } from '@testing/diagram/corpus.ts';
import { goldenScene } from '@testing/diagram/golden.ts';
import { assertDeterministic, assertGanttInvariants } from '@testing/diagram/invariants.ts';

import { buildDiagram } from '../../build.ts';
import { metricsMeasurer } from '../../core/text/measurers.ts';
import { describeScene } from '../../describe.ts';
import { resolveMetrics } from '../../metrics.ts';
import type { BuildOptions, Diagnostic, GanttScene } from '../../types.ts';
import { MS_PER_DAY } from './time.ts';

const options: BuildOptions = { measurer: metricsMeasurer };
const metrics = resolveMetrics();
const corpus = loadCorpus('gantt');

function laid(source: string): { scene: GanttScene | null; diagnostics: readonly Diagnostic[] } {
  const result = buildDiagram(source, options);

  return { scene: result.scene as GanttScene | null, diagnostics: result.diagnostics };
}

function built(source: string): GanttScene {
  const result = buildDiagram(source, options);

  expect(result.family).toBe('gantt');
  expect(result.scene, JSON.stringify(result.diagnostics)).not.toBeNull();
  expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);

  return result.scene as GanttScene;
}

const header = 'gantt';

describe('gantt layout', () => {
  it('has fixtures to run', () => {
    expect(corpus.length).toBeGreaterThan(3);
  });

  it.each(corpus)('$name holds every layout invariant', ({ source }) => {
    assertGanttInvariants(built(source));
  });

  it.each(corpus)('$name matches its golden scene', ({ source }) => {
    expect(goldenScene(built(source))).toMatchSnapshot();
  });

  it.each(corpus)('$name lays out identically twice', ({ source }) => {
    assertDeterministic(() => laid(source));
  });
});

describe('gantt schedule', () => {
  it('places a bar from its start over its duration', () => {
    const scene = built(`${header}\n  A :2024-03-04, 3d\n  B :2024-03-07, 1d`);
    const [a, b] = scene.tasks;

    expect(a?.startText).toBe('2024-03-04');
    expect(a?.endText).toBe('2024-03-07');
    expect(b?.bar.x).toBeCloseTo((a?.bar.x as number) + (a?.bar.width as number), 6);
  });

  it('starts a task with no date where the one before it ended', () => {
    const scene = built(`${header}\n  A :2024-03-04, 2d\n  B :1d`);

    expect(scene.tasks[1]?.startText).toBe('2024-03-06');
  });

  it('starts an `after` task at the end of the task it names', () => {
    const scene = built(
      `${header}\n  A :a, 2024-03-04, 2d\n  B :b, 2024-03-04, 5d\n  C :after a b, 1d`,
    );

    expect(scene.tasks[2]?.startText).toBe('2024-03-09');
  });

  it('reports a dependency on a task that is not there and carries on', () => {
    const { scene, diagnostics } = laid(`${header}\n  A :2024-03-04, 2d\n  B :after ghost, 1d`);

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain('unknown-dependency');
    expect((scene as GanttScene).tasks[1]?.startText).toBe('2024-03-06');
  });

  it('steps a duration over an excluded weekend', () => {
    const plain = built(`${header}\n  A :2024-03-08, 3d`);
    const excluded = built(`${header}\n  excludes weekends\n  A :2024-03-08, 3d`);

    // 2024-03-08 is a Friday: three working days from it end on the Wednesday, not the Monday.
    expect(plain.tasks[0]?.endText).toBe('2024-03-11');
    expect(excluded.tasks[0]?.endText).toBe('2024-03-13');
  });

  it('pushes a start off an excluded day', () => {
    const scene = built(`${header}\n  excludes weekends\n  A :2024-03-09, 1d`);

    expect(scene.tasks[0]?.startText).toBe('2024-03-11');
  });

  it('draws a task that ends before it starts with no length, and says so', () => {
    const { scene, diagnostics } = laid(`${header}\n  A :2024-03-10, 2024-03-01`);

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain('reversed-task');
    expect((scene as GanttScene).tasks[0]?.bar.width).toBeGreaterThan(0);
  });

  it('gives a chart with no dates an origin and says so', () => {
    const { scene, diagnostics } = laid(`${header}\n  A :2d\n  B :1d`);

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain('no-dates');
    expect((scene as GanttScene).tasks[0]?.startText).toBe('1970-01-01');
  });
});

describe('gantt frame', () => {
  it('reads the axis left to right across the whole range', () => {
    const scene = built(`${header}\n  A :2024-03-04, 3d\n  B :2024-03-20, 3d`);
    const xs = scene.ticks.map((tick) => tick.x);

    expect(xs.length).toBeGreaterThan(1);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(scene.ticks[0]?.x).toBeCloseTo(scene.chart.x, 6);
  });

  it('measures every axis label it emits', () => {
    const scene = built(`${header}\n  axisFormat %b %d\n  A :2024-03-04, 3d`);

    for (const tick of scene.ticks) {
      expect(tick.label.box.lines).toHaveLength(1);
      expect(tick.label.box.width).toBeGreaterThan(0);
    }
  });

  it('widens the chart so two neighbouring tick labels cannot touch', () => {
    const narrow = built(`${header}\n  axisFormat %d\n  A :2024-03-04, 20d`);
    const wide = built(`${header}\n  axisFormat %A %B %d %Y\n  A :2024-03-04, 20d`);

    expect(wide.chart.width).toBeGreaterThan(narrow.chart.width);
  });

  it('gives a chart with one instant a day of range rather than none', () => {
    const scene = built(`${header}\n  A :milestone, 2024-03-04, 0d`);

    expect(scene.chart.width).toBeGreaterThan(0);
    expect(scene.ticks.length).toBeGreaterThan(1);
  });

  it('opens a left gutter only for named sections', () => {
    const bare = built(`${header}\n  A :2024-03-04, 1d`);
    const named = built(`${header}\n  section Discovery\n  A :2024-03-04, 1d`);

    expect(bare.chart.x).toBeCloseTo(metrics.padding, 6);
    expect(named.chart.x).toBeGreaterThan(metrics.padding);
    expect(named.sections[0]?.label?.box.lines).toEqual(['Discovery']);
  });

  it('bands a section across its own rows only', () => {
    const scene = built(
      `${header}\n  section One\n  A :2024-03-04, 1d\n  section Two\n  B :1d\n  C :1d`,
    );
    const [one, two] = scene.sections;

    expect(one?.band.height).toBeCloseTo(metrics.minNodeHeight, 6);
    expect(two?.band.height).toBeCloseTo(metrics.minNodeHeight * 2, 6);
    expect(two?.band.y).toBeCloseTo((one?.band.y as number) + (one?.band.height as number), 6);
  });

  it('steps every row down the page in source order', () => {
    const scene = built(`${header}\n  A :2024-03-04, 1d\n  B :1d\n  C :1d`);
    const ys = scene.tasks.map((task) => task.bar.y);

    expect(ys[1]).toBeGreaterThan(ys[0] as number);
    expect(ys[2]).toBeGreaterThan(ys[1] as number);
  });
});

describe('gantt bars', () => {
  it('carries the author intent onto every bar', () => {
    const scene = built(
      `${header}\n  A :done, 2024-03-04, 1d\n  B :active, crit, 2024-03-05, 1d\n  C :milestone, 2024-03-06, 0d`,
    );

    expect(scene.tasks.map((task) => `${task.state}/${task.crit}/${task.milestone}`)).toEqual([
      'done/false/false',
      'active/true/false',
      'default/false/true',
    ]);
  });

  it('draws a milestone as a diamond with no length', () => {
    const scene = built(`${header}\n  A :2024-03-04, 4d\n  M :milestone, 2024-03-06, 0d`);
    const milestone = scene.tasks[1];

    expect(milestone?.bar.width).toBe(0);
    expect(milestone?.milestoneD).toMatch(/^M[\d.]+,[\d.]+(L[\d.]+,[\d.]+){3}Z$/);
  });

  it('puts a label inside a bar wide enough for it and beside one that is not', () => {
    const scene = built(
      `${header}\n  Fits fine :2024-03-01, 30d\n  A very long task name indeed :2024-04-01, 1d`,
    );

    expect(scene.tasks[0]?.placement).toBe('inside');
    expect(scene.tasks[1]?.placement).not.toBe('inside');
  });

  it('turns a label back inside the chart at the right edge', () => {
    const scene = built(`${header}\n  A :2024-03-01, 10d\n  A long trailing label :2024-03-10, 1d`);
    const label = scene.tasks[1] as {
      placement: string;
      label: { x: number; box: { width: number } };
    };

    expect(label.placement).toBe('before');
    expect(label.label.x - label.label.box.width / 2).toBeGreaterThanOrEqual(metrics.padding);
  });

  it('never lets a label leave the drawing', () => {
    const scene = built(`${header}\n  A very long trailing label :2024-03-01, 1d`);

    for (const task of scene.tasks) {
      expect(task.label.x + task.label.box.width / 2).toBeLessThanOrEqual(scene.size.width);
    }
  });
});

describe('gantt scene', () => {
  it('draws an empty chart as an empty scene rather than nothing', () => {
    const { scene, diagnostics } = laid(header);

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain('empty-diagram');
    expect(scene).toMatchObject({ kind: 'gantt', tasks: [], sections: [], ticks: [] });
  });

  it('carries the title and accessibility text onto the scene', () => {
    const scene = built(
      `${header}\n  title Publishing\n  accTitle: Ignored\n  accDescr: Two tasks\n  A :2024-03-04, 1d`,
    );

    expect(scene).toMatchObject({
      title: 'Publishing',
      caption: 'Publishing',
      description: 'Two tasks',
    });
  });

  it('reports the today marker only when the source asks for one', () => {
    const asked = laid(`${header}\n  todayMarker stroke:#f00\n  A :2024-03-04, 1d`);
    const silent = laid(`${header}\n  A :2024-03-04, 1d`);
    const off = laid(`${header}\n  todayMarker off\n  A :2024-03-04, 1d`);

    expect(asked.diagnostics.map((diagnostic) => diagnostic.message).join(' ')).toContain(
      'today marker',
    );

    for (const { diagnostics } of [silent, off]) {
      expect(diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
        'unsupported-construct',
      );
    }
  });

  it('refuses a chart past the task limit', () => {
    const result = buildDiagram(`${header}\n  A :1d\n  B :1d`, {
      ...options,
      limits: { nodes: 1 },
    });

    expect(result.scene).toBeNull();
    expect(result.diagnostics.at(-1)).toMatchObject({ code: 'too-many-nodes' });
  });

  it('leaves no colour anywhere in the scene', () => {
    const scene = built(`${header}\n  A :done, crit, 2024-03-04, 1d`);

    expect(JSON.stringify(scene)).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|oklch\(/i);
  });
});

describe('describeGanttScene', () => {
  it('names the chart, its sections and every row', () => {
    const scene = built(
      `${header}\n  title Plan\n  section Build\n  Engine :crit, active, 2024-03-04, 2d\n  Ship :milestone, 2024-03-06, 0d`,
    );
    const described = describeScene(scene);

    expect(described.summary).toBe(
      'Gantt chart "Plan": 2 tasks, 1 section, 2024-03-04 to 2024-03-06.',
    );
    expect(described.details).toEqual([
      'Section Build.',
      'Engine (critical, active): 2024-03-04 to 2024-03-06.',
      'Ship: milestone on 2024-03-06.',
    ]);
  });

  it('says a chart with no tasks is empty', () => {
    expect(describeScene(built(header)).summary).toBe('Gantt chart: empty.');
  });

  it('caps a long chart and counts the rest', () => {
    const rows = Array.from({ length: 60 }, (_, index) => `  T${index} :1d`).join('\n');
    const scene = built(`${header}\n  A :2024-03-04, 1d\n${rows}`);
    const described = describeScene(scene);

    expect(described.details).toHaveLength(41);
    expect(described.details.at(-1)).toContain('21 more rows');
  });
});

describe('gantt calendar arithmetic', () => {
  it('measures a week as seven days', () => {
    const scene = built(`${header}\n  A :2024-03-04, 1w`);
    const days = (scene.tasks[0]?.bar.width as number) / (scene.chart.width / 28);

    expect(scene.tasks[0]?.endText).toBe('2024-03-11');
    expect(days).toBeGreaterThan(0);
    expect(MS_PER_DAY).toBe(86_400_000);
  });
});
