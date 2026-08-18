/*
 * The block form of mermaid's accessibility description, shared by every family that reads one.
 *
 * `accDescr: text` is a single statement any family handles inline; `accDescr { … }` spans logical
 * lines, so it has to be consumed by the outer loop instead — it is the one construct in these
 * grammars that a per-line `statement()` cannot see the end of. A block that never closes keeps the
 * text it did collect and says so, the same recovery contract a bad statement gets.
 */

import type { DiagnosticSink } from '../../types.ts';
import type { LogicalLine } from './lines.ts';

export const ACC_DESCR_BLOCK = /^accDescr\s*\{\s*(.*)$/;

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
