/*
 * Logical-line splitter shared by every family. Strips `%%` comments outside quotes, splits on
 * newlines and top-level `;` (excluding the one that closes a `#entity;`), drops blanks, and keeps a
 * span per line so a diagnostic can point at the source. `%%{…}%%` directives are deliberately NOT treated as comments: they must survive to
 * the parser so it can report them as unsupported rather than silently honoring them.
 */

import type { Span } from '../../types.ts';

export interface LogicalLine {
  text: string;
  span: Span;
  /** Leading whitespace characters on the physical line the statement came from. */
  indent: number;
}

export function readLines(source: string): LogicalLine[] {
  const lines: LogicalLine[] = [];
  let offset = 0;
  let lineNumber = 1;

  for (;;) {
    const newline = source.indexOf('\n', offset);
    const end = newline === -1 ? source.length : newline;
    const raw = source.slice(offset, end).replace(/\r$/, '');

    collectStatements(lines, stripComment(raw), offset, lineNumber);

    if (newline === -1) {
      break;
    }

    offset = newline + 1;
    lineNumber += 1;
  }

  return lines;
}

/**
 * The header line and the lines a family reads as statements. Mermaid documents `%%{…}%%` init
 * directives as a preamble *above* the header, which is the only place anyone writes them, so the
 * header is the first line that is not one. The directives stay in `statements` so the family still
 * reports them as unsupported — skipping them here decides which line names the family, nothing more.
 */
export function splitHeader(lines: readonly LogicalLine[]): {
  header: LogicalLine | null;
  statements: LogicalLine[];
} {
  const index = lines.findIndex((line) => !line.text.startsWith('%%{'));

  return index === -1
    ? { header: null, statements: [...lines] }
    : { header: lines[index] as LogicalLine, statements: lines.filter((_, at) => at !== index) };
}

/** Truncates at the first `%%` outside quotes, unless it opens a `%%{…}%%` directive. */
function stripComment(raw: string): string {
  let quoted = false;

  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (!quoted && char === '%' && raw[i + 1] === '%') {
      return raw[i + 2] === '{' ? raw : raw.slice(0, i);
    }
  }

  return raw;
}

/**
 * True when the `;` at `index` closes a mermaid entity reference (`#quot;`, `#35;`). Entities are
 * legal outside quotes, so the statement splitter has to agree with the `#(\w+);` shape the family
 * decoders use or it tears the label in half.
 */
function closesEntity(raw: string, index: number): boolean {
  let i = index - 1;

  while (i >= 0 && /\w/.test(raw.charAt(i))) {
    i -= 1;
  }

  return i >= 0 && i < index - 1 && raw[i] === '#';
}

function collectStatements(
  lines: LogicalLine[],
  raw: string,
  lineOffset: number,
  lineNumber: number,
): void {
  const indent = raw.length - raw.trimStart().length;
  let start = 0;
  let quoted = false;

  for (let i = 0; i <= raw.length; i += 1) {
    const char = raw[i];

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (i < raw.length && (quoted || char !== ';' || closesEntity(raw, i))) {
      continue;
    }

    const segment = raw.slice(start, i);
    const text = segment.trim();

    if (text) {
      const lead = segment.length - segment.trimStart().length;

      lines.push({
        text,
        span: {
          offset: lineOffset + start + lead,
          length: text.length,
          line: lineNumber,
          column: start + lead + 1,
        },
        indent,
      });
    }

    start = i + 1;
  }
}
