/*
 * The statement loop every family parser shares: the `accDescr { … }` block, per-line error
 * recovery, and an optional early stop. Keyword recognition stays with each family, because keyword
 * casing is family grammar.
 */

import type { DiagnosticSink } from '../../types.ts';
import { reportStatementError } from '../diagnostics.ts';
import { ACC_DESCR_BLOCK, readDescriptionBlock } from './acc.ts';
import type { LogicalLine } from './lines.ts';

export interface StatementHandlers {
  /** Parses one logical line. A throw becomes one diagnostic on the line, and the loop moves on. */
  statement(line: LogicalLine): void;
  /** Receives each `accDescr { … }` block's text, in source order. */
  description(text: string): void;
  /** Returns false to send an `accDescr {` line to `statement` instead, as an open note does. */
  blockAllowed?(): boolean;
  /** Runs after every statement, thrown or not; `true` ends the loop at that line. */
  stop?(line: LogicalLine): boolean;
}

export interface StatementResult {
  /** Statements that threw. */
  failures: number;
  /** True when `stop` ended the loop before the last line. */
  stopped: boolean;
}

/** Drives `handlers` over `lines`. Never throws: a failed statement is a diagnostic on `report`. */
export function readStatements(
  lines: readonly LogicalLine[],
  report: DiagnosticSink,
  handlers: StatementHandlers,
): StatementResult {
  let failures = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] as LogicalLine;
    const block = (handlers.blockAllowed?.() ?? true) ? ACC_DESCR_BLOCK.exec(line.text) : null;

    if (block) {
      const read = readDescriptionBlock(lines, index, block[1] ?? '', report);

      handlers.description(read.description);
      index = read.end;

      continue;
    }

    try {
      handlers.statement(line);
    } catch (cause) {
      reportStatementError(report, cause, line.span);
      failures += 1;
    }

    if (handlers.stop?.(line)) {
      return { failures, stopped: true };
    }
  }

  return { failures, stopped: false };
}
