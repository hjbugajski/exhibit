import { describe, expect, it } from 'vitest';

import { Reporter, StatementError } from '../diagnostics.ts';
import type { LogicalLine } from './lines.ts';
import { readLines } from './lines.ts';
import type { StatementHandlers } from './statements.ts';
import { readStatements } from './statements.ts';

function run(source: string, handlers: Partial<StatementHandlers> = {}) {
  const report = new Reporter();
  const seen: string[] = [];
  const descriptions: string[] = [];
  const result = readStatements(readLines(source), report, {
    statement: (line) => seen.push(line.text),
    description: (text) => descriptions.push(text),
    ...handlers,
  });

  return { result, seen, descriptions, report };
}

describe('readStatements', () => {
  it('consumes an accDescr block and hands its text to `description`', () => {
    const { seen, descriptions } = run('A\naccDescr {\n  first\n  second\n}\nB');

    expect(descriptions).toEqual(['first second']);
    expect(seen).toEqual(['A', 'B']);
  });

  it('delivers two descriptions in source order', () => {
    const { descriptions } = run('accDescr { one }\naccDescr { two }');

    expect(descriptions).toEqual(['one', 'two']);
  });

  it('sends the block line to `statement` when `blockAllowed` is false', () => {
    const { seen, descriptions } = run('accDescr { note text }', { blockAllowed: () => false });

    expect(descriptions).toEqual([]);
    expect(seen).toEqual(['accDescr { note text }']);
  });

  it('reports a throwing line with its span, counts it, and runs the next line', () => {
    const lines = readLines('bad\ngood');
    const report = new Reporter();
    const seen: string[] = [];
    const result = readStatements(lines, report, {
      statement: (line) => {
        if (line.text === 'bad') {
          throw new StatementError('bad-line', 'Bad line.');
        }

        seen.push(line.text);
      },
      description: () => {},
    });

    expect(result).toEqual({ failures: 1, stopped: false });
    expect(seen).toEqual(['good']);
    expect(report.diagnostics).toEqual([
      { severity: 'error', code: 'bad-line', message: 'Bad line.', span: lines[0]?.span },
    ]);
  });

  it('ends at the line where `stop` returns true', () => {
    const { result, seen } = run('A\nB\nC', { stop: (line) => line.text === 'B' });

    expect(result).toEqual({ failures: 0, stopped: true });
    expect(seen).toEqual(['A', 'B']);
  });

  it('does not call `stop` for a block', () => {
    const stopped: LogicalLine[] = [];

    run('accDescr { text }\nA', {
      stop: (line) => {
        stopped.push(line);

        return false;
      },
    });

    expect(stopped.map((line) => line.text)).toEqual(['A']);
  });

  it('warns about an unclosed block and keeps its text', () => {
    const { descriptions, report } = run('accDescr {\n  never closed');

    expect(descriptions).toEqual(['never closed']);
    expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['unclosed-block']);
  });
});
