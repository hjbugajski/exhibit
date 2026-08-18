/*
 * Token readers shared by the family parsers. Each takes a `Scanner`, consumes on success, and
 * leaves the cursor untouched on failure so the caller can try another production.
 */

import type { Scanner } from './scanner.ts';

const IDENT = /[\p{L}\p{N}_][\p{L}\p{N}_.-]*/uy;
const NUMBER = /[+-]?(?:\d+(?:\.\d+)?|\.\d+)/y;

export function readIdent(scanner: Scanner): string | null {
  return scanner.match(IDENT)?.[0] ?? null;
}

export function readNumber(scanner: Scanner): number | null {
  const found = scanner.match(NUMBER);

  if (!found) {
    return null;
  }

  const value = Number(found[0]);

  return Number.isFinite(value) ? value : null;
}

/** Reads `"…"` and returns the inner text. Mermaid has no escape sequences inside quotes. */
export function readQuotedString(scanner: Scanner): string | null {
  if (scanner.peek() !== '"') {
    return null;
  }

  const start = scanner.pos;
  const end = scanner.text.indexOf('"', start + 1);

  if (end === -1) {
    return null;
  }

  scanner.pos = end + 1;

  return scanner.text.slice(start + 1, end);
}

/**
 * Reads a `open … close` group and returns the inner text, honoring quotes and nesting of the same
 * delimiter pair. Returns null (cursor unmoved) when the group is not there or is unterminated.
 */
export function readDelimited(scanner: Scanner, open: string, close: string): string | null {
  if (!scanner.startsWith(open)) {
    return null;
  }

  const start = scanner.pos;
  const text = scanner.text;
  let index = start + open.length;
  let depth = 1;
  let quoted = false;

  while (index < text.length) {
    if (text[index] === '"') {
      quoted = !quoted;
      index += 1;
      continue;
    }

    if (quoted) {
      index += 1;
      continue;
    }

    if (text.startsWith(close, index)) {
      depth -= 1;

      if (depth === 0) {
        scanner.pos = index + close.length;

        return text.slice(start + open.length, index);
      }

      index += close.length;
      continue;
    }

    if (text.startsWith(open, index)) {
      depth += 1;
      index += open.length;
      continue;
    }

    index += 1;
  }

  return null;
}

/** Consumes the remainder of the line and returns it trimmed. */
export function readRestOfLine(scanner: Scanner): string {
  const rest = scanner.rest();

  scanner.pos = scanner.text.length;

  return rest.trim();
}
