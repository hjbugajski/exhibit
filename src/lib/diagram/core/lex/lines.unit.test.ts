import { describe, expect, it } from 'vitest';

import { readLines, splitHeader } from './lines.ts';

describe('readLines', () => {
  it('drops blank lines and trims statements', () => {
    const lines = readLines('flowchart TD\n\n   A --> B   \n');

    expect(lines.map((line) => line.text)).toEqual(['flowchart TD', 'A --> B']);
  });

  it('records 1-based line and column plus the source offset', () => {
    const source = 'flowchart TD\n  A --> B';
    const [, second] = readLines(source);

    expect(second?.span).toEqual({ offset: 15, length: 7, line: 2, column: 3 });
    expect(source.slice(15, 22)).toBe('A --> B');
  });

  it('strips %% comments but keeps them inside quotes', () => {
    const lines = readLines('A --> B %% joins them\nC["100%% sure"]\n%% whole line');

    expect(lines.map((line) => line.text)).toEqual(['A --> B', 'C["100%% sure"]']);
  });

  it('keeps %%{…}%% directives so the parser can report them', () => {
    const lines = readLines('%%{init: {"theme":"dark"}}%%\nflowchart TD');

    expect(lines[0]?.text).toBe('%%{init: {"theme":"dark"}}%%');
  });

  it('splits on top-level semicolons only', () => {
    const lines = readLines('A --> B; B --> C\nD["a;b"] --> E');

    expect(lines.map((line) => line.text)).toEqual(['A --> B', 'B --> C', 'D["a;b"] --> E']);
  });

  it('does not split the semicolon that closes an unquoted entity', () => {
    const lines = readLines('A --> B : say #quot;hi#quot;\nC --> D : #35;1; E --> F');

    expect(lines.map((line) => line.text)).toEqual([
      'A --> B : say #quot;hi#quot;',
      'C --> D : #35;1',
      'E --> F',
    ]);
  });

  it('reports the physical indent of the line a statement came from', () => {
    const lines = readLines('stateDiagram-v2\n    state A {\n        B --> C\n    }');

    expect(lines.map((line) => line.indent)).toEqual([0, 4, 8, 4]);
  });

  it('tolerates CRLF and a missing trailing newline', () => {
    const lines = readLines('pie\r\n"a" : 1');

    expect(lines.map((line) => line.text)).toEqual(['pie', '"a" : 1']);
  });
});

describe('splitHeader', () => {
  it('takes the first line when nothing precedes it', () => {
    const { header, statements } = splitHeader(readLines('flowchart TD\nA --> B'));

    expect(header?.text).toBe('flowchart TD');
    expect(statements.map((line) => line.text)).toEqual(['A --> B']);
  });

  it('looks past a leading directive but leaves it for the parser to report', () => {
    const source = '%%{init: {"theme":"dark"}}%%\nflowchart TD\nA --> B';
    const { header, statements } = splitHeader(readLines(source));

    expect(header?.text).toBe('flowchart TD');
    expect(statements.map((line) => line.text)).toEqual([
      '%%{init: {"theme":"dark"}}%%',
      'A --> B',
    ]);
  });

  it('has no header when every line is a directive', () => {
    const { header, statements } = splitHeader(readLines('%%{init: {}}%%'));

    expect(header).toBeNull();
    expect(statements).toHaveLength(1);
  });
});
