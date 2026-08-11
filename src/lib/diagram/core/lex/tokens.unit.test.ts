import { describe, expect, it } from 'vitest';

import type { Span } from '../../types.ts';
import { Scanner } from './scanner.ts';
import {
  readDelimited,
  readIdent,
  readNumber,
  readQuotedString,
  readRestOfLine,
} from './tokens.ts';

const base: Span = { offset: 0, length: 0, line: 1, column: 1 };

function scanner(text: string): Scanner {
  return new Scanner(text, base);
}

describe('readIdent', () => {
  it('reads mermaid-style ids including dots and dashes', () => {
    const sc = scanner('node-1.a[Label]');

    expect(readIdent(sc)).toBe('node-1.a');
    expect(sc.peek()).toBe('[');
  });

  it('reads non-ASCII ids', () => {
    expect(readIdent(scanner('café'))).toBe('café');
  });

  it('refuses to start on punctuation', () => {
    const sc = scanner('[a]');

    expect(readIdent(sc)).toBeNull();
    expect(sc.pos).toBe(0);
  });
});

describe('readQuotedString', () => {
  it('returns the inner text and consumes both quotes', () => {
    const sc = scanner('"a ] b" rest');

    expect(readQuotedString(sc)).toBe('a ] b');
    expect(sc.rest()).toBe(' rest');
  });

  it('leaves the cursor alone when unterminated', () => {
    const sc = scanner('"a b');

    expect(readQuotedString(sc)).toBeNull();
    expect(sc.pos).toBe(0);
  });
});

describe('readDelimited', () => {
  it('reads a simple group', () => {
    const sc = scanner('[Label] --> B');

    expect(readDelimited(sc, '[', ']')).toBe('Label');
    expect(sc.rest()).toBe(' --> B');
  });

  it('reads multi-character delimiters', () => {
    const sc = scanner('[[Subroutine]] tail');

    expect(readDelimited(sc, '[[', ']]')).toBe('Subroutine');
    expect(sc.rest()).toBe(' tail');
  });

  it('ignores delimiters inside quotes', () => {
    const sc = scanner('["a ] b"]');

    expect(readDelimited(sc, '[', ']')).toBe('"a ] b"');
    expect(sc.done).toBe(true);
  });

  it('nests the same delimiter pair', () => {
    const sc = scanner('[a [b] c]');

    expect(readDelimited(sc, '[', ']')).toBe('a [b] c');
  });

  it('returns null for a mismatched opener or an unterminated group', () => {
    expect(readDelimited(scanner('(a)'), '[', ']')).toBeNull();

    const sc = scanner('[a');

    expect(readDelimited(sc, '[', ']')).toBeNull();
    expect(sc.pos).toBe(0);
  });
});

describe('readNumber', () => {
  it('reads integers, decimals and signs', () => {
    expect(readNumber(scanner('42'))).toBe(42);
    expect(readNumber(scanner('3.5 rest'))).toBe(3.5);
    expect(readNumber(scanner('-0.25'))).toBe(-0.25);
    expect(readNumber(scanner('abc'))).toBeNull();
  });
});

describe('readRestOfLine', () => {
  it('consumes everything and trims', () => {
    const sc = scanner('title  My chart  ');

    sc.pos = 6;

    expect(readRestOfLine(sc)).toBe('My chart');
    expect(sc.done).toBe(true);
  });
});
