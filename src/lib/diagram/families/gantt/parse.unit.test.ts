import { describe, expect, it } from 'vitest';

import { loadCorpus } from '@testing/diagram/corpus.ts';
import { mutations } from '@testing/diagram/fuzz.ts';

import { defaultLimits } from '../../build.ts';
import { Reporter } from '../../core/diagnostics.ts';
import type { Diagnostic } from '../../types.ts';
import type { GanttIR } from './ir.ts';
import { parseGantt } from './parse.ts';
import {
  MS_PER_DAY,
  epochDayFromCivil,
  formatInstant,
  parseDate,
  parseDateFormat,
} from './time.ts';

function parse(source: string): { ir: GanttIR | null; diagnostics: readonly Diagnostic[] } {
  const report = new Reporter();

  return parseGantt(source, { report, limits: defaultLimits });
}

/** Snapshot view: the structure, without spans or the echoed source. */
function compact(ir: GanttIR | null): unknown {
  if (!ir) {
    return null;
  }

  return {
    dateFormat: ir.dateFormat,
    axisFormat: ir.axisFormat,
    excludeWeekends: ir.excludeWeekends,
    todayMarker: ir.todayMarker,
    sections: ir.sections.map(
      (section) =>
        `${section.implicit ? '(implicit)' : section.name} "${section.label.join(' | ')}"`,
    ),
    tasks: ir.tasks.map((task) => {
      const start =
        task.start.kind === 'date'
          ? day(task.start.at)
          : task.start.kind === 'after'
            ? `after ${task.start.ids.join(' ')}`
            : 'auto';
      const end =
        task.end.kind === 'date'
          ? day(task.end.at)
          : task.end.kind === 'duration'
            ? `${task.end.duration.ms}ms/${task.end.duration.days ?? '-'}d`
            : 'auto';

      return (
        `${task.id} [${task.section}] "${task.label.join(' | ')}"` +
        `${task.tags.length > 0 ? ` {${task.tags.join(',')}}` : ''}: ${start} -> ${end}`
      );
    }),
    title: ir.title,
    accTitle: ir.accTitle,
    accDescr: ir.accDescr,
  };
}

/** Instants read back as ISO days, so a snapshot says a date rather than an epoch. */
function day(at: number): string {
  return formatInstant(at, '%Y-%m-%d %H:%M');
}

function codes(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((diagnostic) => diagnostic.code);
}

const header = 'gantt';

const cases: { name: string; source: string }[] = [
  { name: 'header only', source: header },
  { name: 'one task with a start and a duration', source: `${header}\n  Draft :2024-03-04, 3d` },
  {
    name: 'id, start and end',
    source: `${header}\n  Draft :draft, 2024-03-04, 2024-03-08`,
  },
  { name: 'duration only', source: `${header}\n  Draft :3d` },
  { name: 'start only', source: `${header}\n  Draft :2024-03-04` },
  {
    name: 'every tag',
    source: `${header}\n  A :done, a, 2024-03-04, 1d\n  B :active, crit, b, 2024-03-05, 1d\n  C :milestone, c, 2024-03-06, 0d`,
  },
  { name: 'after one task', source: `${header}\n  A :a, 2024-03-04, 1d\n  B :after a, 2d` },
  {
    name: 'after several tasks',
    source: `${header}\n  A :a, 2024-03-04, 1d\n  B :b, 2024-03-04, 3d\n  C :c, after a b, 2d`,
  },
  {
    name: 'sections',
    source: `${header}\n  section One\n  A :2024-03-04, 1d\n  section Two\n  B :1d`,
  },
  {
    name: 'tasks before any section',
    source: `${header}\n  A :2024-03-04, 1d\n  section One\n  B :1d`,
  },
  {
    name: 'declared date format',
    source: `${header}\n  dateFormat DD-MM-YYYY\n  A :04-03-2024, 1d`,
  },
  {
    name: 'slashed date format',
    source: `${header}\n  dateFormat YYYY/MM/DD\n  A :2024/03/04, 1d`,
  },
  {
    name: 'american date format',
    source: `${header}\n  dateFormat MM-DD-YYYY\n  A :03-04-2024, 1d`,
  },
  {
    name: 'date format with a time',
    source: `${header}\n  dateFormat YYYY-MM-DD HH:mm\n  A :2024-03-04 09:30, 12h`,
  },
  { name: 'axis format', source: `${header}\n  axisFormat %b %d\n  A :2024-03-04, 1d` },
  {
    name: 'every duration unit',
    source: `${header}\n  A :2024-03-04, 3d\n  B :2w\n  C :12h\n  D :30min\n  E :90s`,
  },
  { name: 'excludes weekends', source: `${header}\n  excludes weekends\n  A :2024-03-08, 3d` },
  { name: 'today marker off', source: `${header}\n  todayMarker off\n  A :2024-03-04, 1d` },
  {
    name: 'title and accessibility statements',
    source: `${header}\n  title Plan\n  accTitle: The plan\n  accDescr: Two tasks\n  A :2024-03-04, 1d`,
  },
  {
    name: 'label breaks and entities',
    source: `${header}\n  First<br/>second #quot;q#quot; :2024-03-04, 1d`,
  },
  {
    name: 'comments are stripped',
    source: `${header}\n  %% a note\n  A :2024-03-04, 1d %% trailing`,
  },
];

describe('parseGantt', () => {
  it.each(cases)('$name', ({ source }) => {
    expect(compact(parse(source).ir)).toMatchSnapshot();
  });
});

describe('parseGantt structure', () => {
  it('keeps tasks in source order and numbers the ones with no id', () => {
    const ir = parse(`${header}\n  A :2024-03-04, 1d\n  B :b, 2024-03-05, 1d`).ir as GanttIR;

    expect(ir.tasks.map((task) => task.id)).toEqual(['task-0', 'b']);
  });

  it('opens an implicit section for tasks written before the first one', () => {
    const ir = parse(`${header}\n  A :1d\n  section Named\n  B :1d`).ir as GanttIR;

    expect(ir.sections.map((section) => section.implicit)).toEqual([true, false]);
    expect(ir.tasks.map((task) => task.section)).toEqual([0, 1]);
  });

  it('keeps the span of the line a task came from', () => {
    const ir = parse(`${header}\n  A :2024-03-04, 1d`).ir as GanttIR;

    expect(ir.tasks[0]?.span).toMatchObject({ line: 2, column: 3 });
  });

  it('reads a date in the format in force at that line', () => {
    const ir = parse(`${header}\n  A :2024-03-04, 1d\n  dateFormat DD-MM-YYYY\n  B :05-03-2024, 1d`)
      .ir as GanttIR;

    expect(
      ir.tasks.map((task) => (task.start.kind === 'date' ? day(task.start.at) : task.start.kind)),
    ).toEqual(['2024-03-04 00:00', '2024-03-05 00:00']);
  });

  it('counts a week as seven steppable days', () => {
    const ir = parse(`${header}\n  A :2024-03-04, 2w`).ir as GanttIR;

    expect(ir.tasks[0]?.end).toEqual({
      kind: 'duration',
      duration: { ms: 14 * MS_PER_DAY, days: 14 },
    });
  });

  it('leaves a sub-day duration unsteppable', () => {
    const ir = parse(`${header}\n  A :2024-03-04, 12h`).ir as GanttIR;

    expect(ir.tasks[0]?.end).toMatchObject({ duration: { days: null } });
  });
});

describe('parseGantt recovery', () => {
  it('keeps the good statements around a bad one', () => {
    const { ir, diagnostics } = parse(`${header}\n  A :2024-03-04, 1d\n  no colon here\n  B :1d`);

    expect((ir as GanttIR).tasks).toHaveLength(2);
    expect(codes(diagnostics)).toEqual(['expected-task-data']);
    expect(diagnostics[0]).toMatchObject({ severity: 'error', span: { line: 3 } });
  });

  it('reports a task with nothing after the colon', () => {
    expect(codes(parse(`${header}\n  A :`).diagnostics)).toEqual(['expected-task-data']);
  });

  it('reports a task with no name', () => {
    expect(codes(parse(`${header}\n   :2024-03-04, 1d`).diagnostics)).toEqual([
      'expected-task-name',
    ]);
  });

  it('reports a section with no name', () => {
    expect(codes(parse(`${header}\n  section`).diagnostics)).toEqual(['expected-section-name']);
  });

  it('warns about an unreadable date and falls back to a following start', () => {
    const { ir, diagnostics } = parse(`${header}\n  A :2024-13-45, 1d`);

    expect(codes(diagnostics)).toEqual(['unreadable-date']);
    expect((ir as GanttIR).tasks[0]?.start).toEqual({ kind: 'auto' });
  });

  it('renames a duplicate id rather than losing the row', () => {
    const { ir, diagnostics } = parse(`${header}\n  A :a, 2024-03-04, 1d\n  B :a, 2024-03-05, 1d`);

    expect(codes(diagnostics)).toEqual(['duplicate-task-id']);
    expect((ir as GanttIR).tasks.map((task) => task.id)).toEqual(['a', 'task-1']);
  });

  it('ignores task fields past the third', () => {
    const { ir, diagnostics } = parse(`${header}\n  A :a, 2024-03-04, 1d, extra`);

    expect(codes(diagnostics)).toEqual(['extra-task-fields']);
    expect((ir as GanttIR).tasks[0]?.id).toBe('a');
  });

  it('reports a missing header', () => {
    const { ir, diagnostics } = parse('flowchart TD\n  A --> B');

    expect(ir).toBeNull();
    expect(codes(diagnostics)).toEqual(['missing-header']);
  });

  it('never throws on truncated or hostile input', () => {
    const sources = [
      header,
      `${header}\n  :`,
      `${header}\n  A :`,
      `${header}\n  A :,,,`,
      `${header}\n  dateFormat`,
      `${header}\n  axisFormat`,
      `${header}\n  section`,
      `${header}\n  excludes`,
      `${header}\n  todayMarker`,
      `${header}\n  A :after`,
      `${header}\n  A :after ,`,
      `${header}\n  A :done, active, crit, milestone`,
      `${header}\n  dateFormat DDD\n  A :2024-03-04, 1d`,
    ];

    for (const source of sources) {
      expect(() => parse(source), source).not.toThrow();
    }
  });
});

describe('parseGantt unsupported constructs', () => {
  it.each([
    ['tickInterval 1week', 'unsupported-construct'],
    ['weekday monday', 'unsupported-construct'],
    ['inclusiveEndDates', 'unsupported-construct'],
    ['topAxis', 'unsupported-construct'],
    ['includes 2024-03-08', 'unsupported-construct'],
    ['click a href "https://example.com"', 'unsupported-construct'],
    ['excludes 2024-03-08', 'unsupported-construct'],
    ['todayMarker stroke:#f00', 'unsupported-construct'],
    ['dateFormat Do MMMM', 'unsupported-date-token'],
    ['axisFormat %Q', 'unsupported-axis-token'],
    ['%%{init: {"theme": "dark"}}%%', 'unsupported-directive'],
  ])('reports %s as %s and keeps parsing', (statement, code) => {
    const { ir, diagnostics } = parse(`${header}\n  ${statement}\n  A :2024-03-04, 1d`);

    expect(codes(diagnostics)).toContain(code);
    expect(diagnostics[0]?.severity).toBe('info');
    expect((ir as GanttIR).tasks).toHaveLength(1);
  });

  it('keeps the default format when a token is not understood', () => {
    const { ir } = parse(`${header}\n  dateFormat Do MMMM\n  A :2024-03-04, 1d`);

    expect((ir as GanttIR).dateFormat).toBe('YYYY-MM-DD');
    expect((ir as GanttIR).tasks[0]?.start).toMatchObject({ kind: 'date' });
  });

  it('takes `weekends` out of a mixed excludes list and reports the rest', () => {
    const { ir, diagnostics } = parse(`${header}\n  excludes weekends, 2024-03-08\n  A :1d`);

    expect((ir as GanttIR).excludeWeekends).toBe(true);
    expect(codes(diagnostics)).toEqual(['unsupported-construct']);
  });
});

describe('gantt calendar', () => {
  it('agrees with the Gregorian calendar on the epoch and on leap days', () => {
    expect(epochDayFromCivil(1970, 1, 1)).toBe(0);
    expect(epochDayFromCivil(2024, 3, 1) - epochDayFromCivil(2024, 2, 28)).toBe(2);
    expect(epochDayFromCivil(1900, 3, 1) - epochDayFromCivil(1900, 2, 28)).toBe(1);
  });

  it('refuses a date the calendar has no day for', () => {
    const format = parseDateFormat('YYYY-MM-DD');

    expect(parseDate('2023-02-29', format)).toBeNull();
    expect(parseDate('2024-02-29', format)).not.toBeNull();
    expect(parseDate('2024-1-1', format)).toBeNull();
    expect(parseDate('2024-01-01x', format)).toBeNull();
  });

  it('prints every axis directive it claims', () => {
    const at = parseDate('2024-03-04', parseDateFormat('YYYY-MM-DD')) as number;

    expect(formatInstant(at, '%Y-%y-%m-%d-%e')).toBe('2024-24-03-04-4');
    expect(formatInstant(at, '%B %b %A %a')).toBe('March Mar Monday Mon');
    expect(formatInstant(at, '%H:%M:%S %j %%')).toBe('00:00:00 064 %');
  });
});

describe('parseGantt accessibility blocks', () => {
  it('reads a multi-line accDescr block', () => {
    const { ir, diagnostics } = parse(
      `${header}\n  accDescr {\n    the release\n    schedule\n  }\n  A :2024-03-04, 1d`,
    );

    expect(codes(diagnostics)).toEqual([]);
    expect(ir?.accDescr).toBe('the release schedule');
    expect((ir as GanttIR).tasks).toHaveLength(1);
  });
});

describe('parseGantt robustness', () => {
  it.each(loadCorpus('gantt'))('$name survives 200 mutations', ({ source }) => {
    for (const mutated of mutations(source, 200, 11)) {
      expect(() => parse(mutated), mutated).not.toThrow();
    }
  });
});
