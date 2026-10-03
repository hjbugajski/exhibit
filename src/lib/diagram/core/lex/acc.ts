/*
 * Mermaid's accessibility title and description, shared by every family that reads one.
 *
 * `accTitle: text` and `accDescr: text` are single statements each family recognizes with its own
 * keyword grammar and reads with `readAccText`. `accDescr { … }` spans logical lines, so
 * `readStatements` consumes it instead: it is the one construct in these grammars that a per-line
 * `statement()` cannot see the end of. A block that never closes keeps the text it did collect and
 * says so, the same recovery contract a bad statement gets.
 */

import type { DiagnosticSink } from '../../types.ts';
import type { LogicalLine } from './lines.ts';
import type { Scanner } from './scanner.ts';
import { normalizeSpace, readRestOfLine } from './tokens.ts';

export const ACC_DESCR_BLOCK = /^accDescr\s*\{\s*(.*)$/;

/**
 * Reads the value of a one-line `accTitle` or `accDescr` whose keyword `scanner` has just consumed.
 * The `:` is optional, and the value is whitespace-normalized because it is read aloud.
 */
export function readAccText(scanner: Scanner): string {
  scanner.skipSpace();
  scanner.eat(':');

  return normalizeSpace(readRestOfLine(scanner));
}

export interface DescriptionBlock {
  description: string;
  /** Index of the block's last line, so the caller's loop resumes after it. */
  end: number;
}

/**
 * Consumes an `accDescr { … }` block whose opening line is `lines[start]` and whose text after the
 * brace is `first`. Lines join with a space: the description is read aloud, not drawn.
 */
export function readDescriptionBlock(
  lines: readonly LogicalLine[],
  start: number,
  first: string,
  report: DiagnosticSink,
): DescriptionBlock {
  const parts: string[] = [];
  let index = start;
  let closed = false;
  let text = first.trim();

  for (;;) {
    if (text.endsWith('}')) {
      closed = true;
      text = text.slice(0, -1).trim();
    }

    if (text) {
      parts.push(text);
    }

    if (closed || index + 1 >= lines.length) {
      break;
    }

    index += 1;
    text = (lines[index] as LogicalLine).text;
  }

  if (!closed) {
    report.warn(
      'unclosed-block',
      'accDescr block is missing its closing brace.',
      (lines[start] as LogicalLine).span,
    );
  }

  return { description: parts.join(' '), end: index };
}
