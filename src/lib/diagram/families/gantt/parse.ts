/*
 * Gantt parser. Line-oriented outer loop, one diagnostic per bad line, carry on — the same recovery
 * contract every family here honours.
 *
 * Two things are specific to this grammar. A task line is `name : fields`, where the fields are
 * positional and their meaning depends on how many there are: three are `id, start, end`, two are
 * `start, end` and one is whatever it reads as. That is mermaid's rule, and it is why the reader
 * classifies each field (a date? a duration? an `after` clause?) instead of trusting its position
 * alone. And dates are read in the `dateFormat` in force *at that line*: the directive is a
 * statement like any other, so a chart may — unwisely — change it half way down, and a task above
 * the first `dateFormat` is read in mermaid's default.
 */

import { StatementError, reportStatementError } from '../../core/diagnostics.ts';
import { ACC_DESCR_BLOCK, readDescriptionBlock } from '../../core/lex/acc.ts';
import type { LogicalLine } from '../../core/lex/lines.ts';
import { readLines, splitHeader } from '../../core/lex/lines.ts';
import { Scanner } from '../../core/lex/scanner.ts';
import { readRestOfLine } from '../../core/lex/tokens.ts';
import { labelLines } from '../../core/text/label.ts';
import type { DiagnosticSink, ParseContext, ParseResult, Span } from '../../types.ts';
import type {
  GanttDuration,
  GanttEnd,
  GanttIR,
  GanttSection,
  GanttStart,
  GanttTag,
  GanttTask,
} from './ir.ts';
import type { DateFormat } from './time.ts';
import {
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  parseAxisFormat,
  parseDate,
  parseDateFormat,
} from './time.ts';

const HEADER = /^gantt\b/;

const KEYWORD =
  /(dateFormat|axisFormat|tickInterval|excludes|includes|todayMarker|inclusiveEndDates|topAxis|weekday|weekend|section|title|accTitle|accDescr|click|href|call|link)\b/iy;

/** Mermaid's defaults, applied to a chart that declares neither. */
export const DEFAULT_DATE_FORMAT = 'YYYY-MM-DD';
export const DEFAULT_AXIS_FORMAT = '%Y-%m-%d';

const TAGS: ReadonlySet<string> = new Set(['done', 'active', 'crit', 'milestone']);

const DURATION = /^(\d+(?:\.\d+)?)\s*(ms|min|s|m|h|d|w)$/i;

const UNITS: Readonly<Record<string, number>> = {
  ms: 1,
  s: 1000,
  m: MS_PER_MINUTE,
  min: MS_PER_MINUTE,
  h: MS_PER_HOUR,
  d: MS_PER_DAY,
  w: MS_PER_DAY * 7,
};

/** Recognized, deliberately not drawn. Each one names itself, so the author knows what was dropped. */
const UNSUPPORTED: Readonly<Record<string, string>> = {
  tickinterval: '`tickInterval` is not supported; the axis picks its own step from the date range.',
  weekday: '`weekday` is not supported; a week always starts where the range does.',
  inclusiveenddates:
    '`inclusiveEndDates` is not supported; an end date is the instant a task finishes.',
  topaxis: '`topAxis` is not supported; the axis is always drawn above the chart.',
  includes: '`includes` is not supported; only `excludes weekends` changes the calendar.',
  click: '`click` bindings are not supported; a diagram never becomes a link.',
  href: '`href` bindings are not supported; a diagram never becomes a link.',
  call: '`call` bindings are not supported; a diagram never runs script.',
  link: '`link` bindings are not supported; a diagram never becomes a link.',
};

interface Draft {
  report: DiagnosticSink;
  sections: GanttSection[];
  tasks: GanttTask[];
  ids: Set<string>;
  dateFormat: string;
  format: DateFormat;
  axisFormat: string;
  excludeWeekends: boolean;
  todayMarker: boolean;
  title?: string;
  accTitle?: string;
  accDescr?: string;
}

function text(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/** The section a task belongs to, creating the implicit one when the chart declared none yet. */
function currentSection(draft: Draft, span: Span): number {
  if (draft.sections.length === 0) {
    draft.sections.push({ name: '', label: [], implicit: true, span });
  }

  return draft.sections.length - 1;
}

function sectionStatement(draft: Draft, scanner: Scanner, span: Span): void {
  const name = text(readRestOfLine(scanner));

  if (!name) {
    throw new StatementError('expected-section-name', 'Expected a section name.', span, ['a name']);
  }

  draft.sections.push({ name, label: labelLines(name), implicit: false, span });
}

function dateFormatStatement(draft: Draft, scanner: Scanner, span: Span): void {
  const raw = text(readRestOfLine(scanner));

  if (!raw) {
    throw new StatementError('expected-date-format', 'Expected a date format.', span, [
      DEFAULT_DATE_FORMAT,
    ]);
  }

  const format = parseDateFormat(raw);

  if (format.unsupported.length > 0) {
    draft.report.info(
      'unsupported-date-token',
      `\`${format.unsupported.join('`, `')}\` is not a date token this reader knows, so \`${DEFAULT_DATE_FORMAT}\` was used instead.`,
      span,
    );

    return;
  }

  draft.dateFormat = raw;
  draft.format = format;
}

function axisFormatStatement(draft: Draft, scanner: Scanner, span: Span): void {
  const raw = text(readRestOfLine(scanner));

  if (!raw) {
    throw new StatementError('expected-axis-format', 'Expected an axis format.', span, [
      DEFAULT_AXIS_FORMAT,
    ]);
  }

  const format = parseAxisFormat(raw);

  if (format.unsupported.length > 0) {
    draft.report.info(
      'unsupported-axis-token',
      `\`${format.unsupported.join('`, `')}\` is not an axis directive this reader knows, so \`${DEFAULT_AXIS_FORMAT}\` was used instead.`,
      span,
    );

    return;
  }

  draft.axisFormat = raw;
}

function excludesStatement(draft: Draft, scanner: Scanner, span: Span): void {
  const rest = text(readRestOfLine(scanner)).toLowerCase();
  const entries = rest
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const other = entries.filter((entry) => entry !== 'weekends');

  if (entries.includes('weekends')) {
    draft.excludeWeekends = true;
  }

  if (other.length > 0) {
    draft.report.info(
      'unsupported-construct',
      `Only \`excludes weekends\` changes the calendar; \`${other.join('`, `')}\` was ignored.`,
      span,
    );
  }
}

function todayMarkerStatement(draft: Draft, scanner: Scanner, span: Span): void {
  const rest = text(readRestOfLine(scanner)).toLowerCase();

  if (rest === 'off') {
    draft.todayMarker = false;

    return;
  }

  draft.todayMarker = true;
  draft.report.info(
    'unsupported-construct',
    'The today marker is not drawn: a layout may not read a clock, so "today" would depend on when the drawing was built.',
    span,
  );
}

function accStatement(draft: Draft, scanner: Scanner, keyword: string): void {
  scanner.skipSpace();
  scanner.eat(':');

  const value = text(readRestOfLine(scanner));

  if (keyword === 'acctitle') {
    draft.accTitle = value;
  } else {
    draft.accDescr = value;
  }
}

function durationOf(field: string): GanttDuration | null {
  const found = DURATION.exec(field);

  if (!found) {
    return null;
  }

  const amount = Number(found[1]);
  const unit = (found[2] as string).toLowerCase();
  const ms = amount * (UNITS[unit] as number);
  const perDay = unit === 'd' ? 1 : unit === 'w' ? 7 : 0;
  const days = perDay > 0 && Number.isInteger(amount * perDay) ? amount * perDay : null;

  return { ms, days };
}

function afterOf(field: string): readonly string[] | null {
  const found = /^after\s+(.+)$/i.exec(field);

  if (!found) {
    return null;
  }

  return (found[1] as string).split(/[\s,]+/).filter(Boolean);
}

function startOf(draft: Draft, field: string, span: Span): GanttStart | null {
  const after = afterOf(field);

  if (after) {
    return { kind: 'after', ids: after };
  }

  const at = parseDate(field, draft.format);

  if (at !== null) {
    return { kind: 'date', at };
  }

  if (/^until\s/i.test(field)) {
    draft.report.info(
      'unsupported-construct',
      '`until` is not supported; the task keeps its own duration instead.',
      span,
    );
  }

  return null;
}

function endOf(draft: Draft, field: string): GanttEnd | null {
  const duration = durationOf(field);

  if (duration) {
    return { kind: 'duration', duration };
  }

  const at = parseDate(field, draft.format);

  return at === null ? null : { kind: 'date', at };
}

/** A declared id has to be unique: the scene keys rows by it and `after` resolves against it. */
function idFor(draft: Draft, declared: string | null, span: Span): string {
  const fallback = `task-${draft.tasks.length}`;

  if (declared === null || declared === '') {
    return fallback;
  }

  if (draft.ids.has(declared)) {
    draft.report.warn(
      'duplicate-task-id',
      `Another task is already called '${declared}'; this one is '${fallback}'.`,
      span,
    );

    return fallback;
  }

  draft.ids.add(declared);

  return declared;
}

/**
 * `name : [tags,] [id,] start, end`. The fields left after the tags are positional, and how many
 * there are is what says which is which — the shape mermaid's own examples are written in.
 */
function taskStatement(draft: Draft, line: LogicalLine): void {
  const colon = line.text.indexOf(':');

  if (colon === -1) {
    throw new StatementError(
      'expected-task-data',
      'A task is `name : dates`; this line has no `:`.',
      line.span,
      [':'],
    );
  }

  const label = labelLines(line.text.slice(0, colon));
  const fields = line.text
    .slice(colon + 1)
    .split(',')
    .map((field) => text(field))
    .filter((field) => field.length > 0);
  const tags: GanttTag[] = [];

  while (fields.length > 0 && TAGS.has((fields[0] as string).toLowerCase())) {
    tags.push((fields.shift() as string).toLowerCase() as GanttTag);
  }

  if (label.length === 0) {
    throw new StatementError(
      'expected-task-name',
      'Expected a task name before the `:`.',
      line.span,
      ['a task name'],
    );
  }

  if (fields.length === 0) {
    throw new StatementError(
      'expected-task-data',
      'Expected a start date, a duration or `after <id>` after the `:`.',
      line.span,
      ['a date', 'a duration', 'after <id>'],
    );
  }

  if (fields.length > 3) {
    draft.report.info(
      'extra-task-fields',
      `A task reads at most an id, a start and an end; \`${fields.slice(3).join('`, `')}\` was ignored.`,
      line.span,
    );
  }

  const declaredId = fields.length >= 3 ? (fields[0] as string) : null;
  const startField = fields.length >= 3 ? (fields[1] as string) : null;
  const endField = (fields.length >= 3 ? fields[2] : fields.at(-1)) as string;
  let start: GanttStart = { kind: 'auto' };
  let end: GanttEnd = { kind: 'auto' };

  const readStart = (field: string): boolean => {
    const found = startOf(draft, field, line.span);

    if (found) {
      start = found;
    }

    return found !== null;
  };

  const readEnd = (field: string): boolean => {
    const found = endOf(draft, field);

    if (found) {
      end = found;
    }

    return found !== null;
  };

  if (fields.length === 1) {
    // One field says either when the task starts or how long it takes, and which one it says is
    // readable from the field itself.
    if (!readStart(endField) && !readEnd(endField)) {
      draft.report.warn(
        'unreadable-date',
        `'${endField}' is not a date in \`${draft.dateFormat}\`, a duration like \`3d\` or an \`after\` clause; the task starts where the one before it ended.`,
        line.span,
      );
    }
  } else {
    const first = startField ?? (fields[0] as string);

    if (!readStart(first)) {
      draft.report.warn(
        'unreadable-date',
        `'${first}' is not a date in \`${draft.dateFormat}\` or an \`after\` clause; the task starts where the one before it ended.`,
        line.span,
      );
    }

    if (!readEnd(endField)) {
      draft.report.warn(
        'unreadable-date',
        `'${endField}' is not a date in \`${draft.dateFormat}\` or a duration like \`3d\`; the task takes its default length.`,
        line.span,
      );
    }
  }

  draft.tasks.push({
    id: idFor(draft, declaredId, line.span),
    label,
    section: currentSection(draft, line.span),
    tags,
    start,
    end,
    span: line.span,
  });
}

function statement(draft: Draft, line: LogicalLine): void {
  if (line.text.startsWith('%%{')) {
    draft.report.info(
      'unsupported-directive',
      'Configuration directives (`%%{…}%%`) are ignored.',
      line.span,
    );

    return;
  }

  const scanner = new Scanner(line.text, line.span);
  const keyword = scanner.match(KEYWORD)?.[0]?.toLowerCase();

  if (keyword === undefined) {
    taskStatement(draft, line);

    return;
  }

  const unsupported = UNSUPPORTED[keyword];

  if (unsupported) {
    draft.report.info('unsupported-construct', unsupported, line.span);

    return;
  }

  switch (keyword) {
    case 'dateformat':
      dateFormatStatement(draft, scanner, line.span);

      return;
    case 'axisformat':
      axisFormatStatement(draft, scanner, line.span);

      return;
    case 'excludes':
    case 'weekend':
      excludesStatement(draft, scanner, line.span);

      return;
    case 'todaymarker':
      todayMarkerStatement(draft, scanner, line.span);

      return;
    case 'section':
      sectionStatement(draft, scanner, line.span);

      return;
    case 'title':
      scanner.skipSpace();
      scanner.eat(':');
      draft.title = text(readRestOfLine(scanner));

      return;
    case 'acctitle':
    case 'accdescr':
      accStatement(draft, scanner, keyword);

      return;
  }
}

export function parseGantt(source: string, ctx: ParseContext): ParseResult<GanttIR> {
  const report = ctx.report;
  const { header: first, statements } = splitHeader(readLines(source));

  if (!first || !HEADER.test(first.text)) {
    report.error('missing-header', 'A gantt chart must start with `gantt`.', first?.span);

    return { ir: null, diagnostics: report.diagnostics };
  }

  const draft: Draft = {
    report,
    sections: [],
    tasks: [],
    ids: new Set(),
    dateFormat: DEFAULT_DATE_FORMAT,
    format: parseDateFormat(DEFAULT_DATE_FORMAT),
    axisFormat: DEFAULT_AXIS_FORMAT,
    excludeWeekends: false,
    todayMarker: false,
  };
  const before = report.count;

  for (let index = 0; index < statements.length; index += 1) {
    const line = statements[index] as LogicalLine;
    const block = ACC_DESCR_BLOCK.exec(line.text);

    if (block) {
      const read = readDescriptionBlock(statements, index, block[1] ?? '', report);

      draft.accDescr = read.description;
      index = read.end;

      continue;
    }

    try {
      statement(draft, line);
    } catch (cause) {
      reportStatementError(report, cause, line.span);
    }

    if (draft.tasks.length > ctx.limits.nodes) {
      report.error(
        'too-many-nodes',
        `Gantt chart has more than ${ctx.limits.nodes} tasks.`,
        line.span,
      );

      return { ir: null, diagnostics: report.diagnostics };
    }
  }

  const failed = report.diagnostics
    .slice(before)
    .some((diagnostic) => diagnostic.severity === 'error');

  if (draft.tasks.length === 0 && failed) {
    return { ir: null, diagnostics: report.diagnostics };
  }

  const ir: GanttIR = {
    kind: 'gantt',
    source,
    dateFormat: draft.dateFormat,
    axisFormat: draft.axisFormat,
    sections: draft.sections,
    tasks: draft.tasks,
    excludeWeekends: draft.excludeWeekends,
    todayMarker: draft.todayMarker,
  };

  if (draft.title !== undefined) {
    ir.title = draft.title;
  }

  if (draft.accTitle !== undefined) {
    ir.accTitle = draft.accTitle;
  }

  if (draft.accDescr !== undefined) {
    ir.accDescr = draft.accDescr;
  }

  return { ir, diagnostics: report.diagnostics };
}
