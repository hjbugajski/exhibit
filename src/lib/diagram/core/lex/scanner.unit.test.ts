import { describe, expect, it } from 'vitest';

import type { Span } from '../../types.ts';
import { Scanner } from './scanner.ts';

const base: Span = { offset: 20, length: 12, line: 3, column: 5 };

function scanner(text: string): Scanner {
  return new Scanner(text, base);
}

describe('Scanner', () => {
  it('peeks without consuming and eats literals', () => {
    const sc = scanner('A --> B');

    expect(sc.peek()).toBe('A');
    expect(sc.peek(2)).toBe('-');
    expect(sc.pos).toBe(0);
    expect(sc.eat('A')).toBe(true);
    expect(sc.eat('X')).toBe(false);
    expect(sc.pos).toBe(1);
  });

  it('reports done past the end and reads the rest', () => {
    const sc = scanner('ab');

    expect(sc.done).toBe(false);
    sc.pos = 1;
    expect(sc.rest()).toBe('b');
    sc.pos = 2;
    expect(sc.done).toBe(true);
    expect(sc.peek()).toBe('');
  });

  it('matches anchored and advances only on a hit', () => {
    const sc = scanner('flowchart TD');

    expect(sc.match(/graph/y)).toBeNull();
    expect(sc.pos).toBe(0);
    expect(sc.match(/flowchart/y)?.[0]).toBe('flowchart');
    expect(sc.pos).toBe(9);
  });

  it('clones a non-sticky pattern so matching stays anchored', () => {
    const sc = scanner('abc');
    const pattern = /b/;

    expect(sc.match(pattern)).toBeNull();
    expect(pattern.sticky).toBe(false);
    expect(sc.match(/a/)?.[0]).toBe('a');
  });

  it('skips whitespace', () => {
    const sc = scanner('  \t A');

    sc.skipSpace();
    expect(sc.peek()).toBe('A');
  });

  it('maps spans back into source coordinates', () => {
    const sc = scanner('A --> B');

    sc.pos = 2;

    const start = sc.pos;

    sc.pos = 5;

    expect(sc.spanFrom(start)).toEqual({ offset: 22, length: 3, line: 3, column: 7 });
  });
});
