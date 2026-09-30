/*
 * Pie parser. One header line plus rows; recovery is per logical line, like every other family.
 *
 * Mermaid requires slice labels to be quoted, so an unquoted row is an error with the exact shape it
 * expected rather than a silent drop.
 */

import { StatementError } from '../../core/diagnostics.ts';
import { readAccText } from '../../core/lex/acc.ts';
import type { LogicalLine } from '../../core/lex/lines.ts';
import { readLines, splitHeader } from '../../core/lex/lines.ts';
import { Scanner } from '../../core/lex/scanner.ts';
import { readStatements } from '../../core/lex/statements.ts';
import {
  normalizeSpace,
  readNumber,
  readQuotedString,
  readRestOfLine,
} from '../../core/lex/tokens.ts';
import type { DiagnosticSink, ParseContext, ParseResult } from '../../types.ts';
import type { PieIR, PieSlice } from './ir.ts';

const HEADER = /^pie\b/;
const SHOW_DATA = /showData\b/y;
const TITLE = /title\b/y;
const ACC_TITLE = /accTitle\b/y;
const ACC_DESCR = /accDescr\b/y;

interface Draft {
  report: DiagnosticSink;
  showData: boolean;
  title?: string;
  accTitle?: string;
  accDescr?: string;
  slices: PieSlice[];
}

/** `pie`, then `showData` and `title …` in either order — mermaid accepts both on the header. */
function header(draft: Draft, line: LogicalLine): void {
  const scanner = new Scanner(line.text, line.span);

  scanner.match(HEADER);
  scanner.skipSpace();

  if (scanner.match(SHOW_DATA)) {
    draft.showData = true;
    scanner.skipSpace();
  }

  if (scanner.match(TITLE)) {
    draft.title = normalizeSpace(readRestOfLine(scanner));
    return;
  }

  const rest = readRestOfLine(scanner);

  if (rest) {
    draft.report.warn('unknown-statement', `Ignored '${rest}' after the pie header.`, line.span, [
      'showData',
      'title',
    ]);
  }
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

  if (scanner.match(TITLE)) {
    draft.title = normalizeSpace(readRestOfLine(scanner));
    return;
  }

  if (scanner.match(SHOW_DATA)) {
    draft.showData = true;
    return;
  }

  if (scanner.match(ACC_TITLE)) {
    draft.accTitle = readAccText(scanner);

    return;
  }

  if (scanner.match(ACC_DESCR)) {
    draft.accDescr = readAccText(scanner);

    return;
  }

  slice(draft, scanner, line);
}

function slice(draft: Draft, scanner: Scanner, line: LogicalLine): void {
  const label = readQuotedString(scanner);

  if (label === null) {
    throw new StatementError('expected-slice', 'Expected a quoted slice label.', line.span, [
      '"label" : value',
    ]);
  }

  scanner.skipSpace();

  if (!scanner.eat(':')) {
    throw new StatementError('expected-value', 'Expected `:` and a slice value.', line.span, [':']);
  }

  scanner.skipSpace();

  const value = readNumber(scanner);

  if (value === null) {
    throw new StatementError('invalid-value', 'Expected a number for the slice value.', line.span, [
      'number',
    ]);
  }

  const rest = readRestOfLine(scanner);

  if (rest) {
    draft.report.warn(
      'trailing-text',
      `Ignored '${rest}' after the value of slice '${normalizeSpace(label)}'.`,
      line.span,
    );
  }

  if (value < 0) {
    draft.report.warn(
      'negative-value',
      `Slice '${normalizeSpace(label)}' has a negative value and was dropped.`,
      line.span,
    );

    return;
  }

  draft.slices.push({ label: normalizeSpace(label), value, span: line.span });
}

export function parsePie(source: string, ctx: ParseContext): ParseResult<PieIR> {
  const report = ctx.report;
  const { header: first, statements } = splitHeader(readLines(source));

  if (!first || !HEADER.test(first.text)) {
    report.error('missing-header', 'A pie chart must start with `pie`.', first?.span);

    return { ir: null, diagnostics: report.diagnostics };
  }

  const draft: Draft = { report, showData: false, slices: [] };
  const before = report.count;

  header(draft, first);

  readStatements(statements, report, {
    statement: (line) => statement(draft, line),
    description: (text) => {
      draft.accDescr = text;
    },
  });

  const failed = report.diagnostics
    .slice(before)
    .some((diagnostic) => diagnostic.severity === 'error');

  if (draft.slices.length === 0 && failed) {
    return { ir: null, diagnostics: report.diagnostics };
  }

  const ir: PieIR = {
    kind: 'pie',
    source,
    showData: draft.showData,
    slices: draft.slices,
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
