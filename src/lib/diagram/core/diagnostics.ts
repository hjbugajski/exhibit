/*
 * Diagnostics are values, not exceptions: `parseDiagram` / `layoutDiagram` / `buildDiagram` never
 * throw. `StatementError` is the one internal exception, thrown by a parser to unwind the current
 * logical line and caught by the line driver, which turns it into one diagnostic and moves on.
 */

import type { Diagnostic, DiagnosticSink, Severity, Span } from '../types.ts';

export class Reporter implements DiagnosticSink {
  private readonly entries: Diagnostic[] = [];

  get diagnostics(): readonly Diagnostic[] {
    return this.entries;
  }

  get count(): number {
    return this.entries.length;
  }

  add(
    severity: Severity,
    code: string,
    message: string,
    span?: Span,
    expected?: readonly string[],
  ): void {
    const entry: Diagnostic = { severity, code, message };

    if (span) {
      entry.span = span;
    }

    if (expected?.length) {
      entry.expected = expected;
    }

    this.entries.push(entry);
  }

  error(code: string, message: string, span?: Span, expected?: readonly string[]): void {
    this.add('error', code, message, span, expected);
  }

  warn(code: string, message: string, span?: Span, expected?: readonly string[]): void {
    this.add('warning', code, message, span, expected);
  }

  info(code: string, message: string, span?: Span, expected?: readonly string[]): void {
    this.add('info', code, message, span, expected);
  }

  /** Merges diagnostics produced by a nested pass (a family's own reporter, say). */
  addAll(diagnostics: readonly Diagnostic[]): void {
    this.entries.push(...diagnostics);
  }
}

/** Thrown to abandon one logical line. Never escapes the family's statement driver. */
export class StatementError extends Error {
  readonly code: string;
  readonly span?: Span;
  readonly expected?: readonly string[];

  constructor(code: string, message: string, span?: Span, expected?: readonly string[]) {
    super(message);
    this.name = 'StatementError';
    this.code = code;
    this.span = span;
    this.expected = expected;
  }
}

/** Reports `cause` against `line`, using the statement's own span and code when it carries one. */
export function reportStatementError(report: DiagnosticSink, cause: unknown, span: Span): void {
  if (cause instanceof StatementError) {
    report.error(cause.code, cause.message, cause.span ?? span, cause.expected);
    return;
  }

  report.error(
    'unparsable-statement',
    cause instanceof Error ? cause.message : String(cause),
    span,
  );
}
