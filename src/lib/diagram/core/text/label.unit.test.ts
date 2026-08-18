import { describe, expect, it } from 'vitest';

import { decodeEntities, labelLines, stripQuotes } from './label.ts';

describe('labelLines', () => {
  it.each([
    ['plain', ['plain']],
    ['"quoted"', ['quoted']],
    ['one<br>two', ['one', 'two']],
    ['one<br />two', ['one', 'two']],
    ['one\\ntwo', ['one', 'two']],
    ['  spaced    out  ', ['spaced out']],
    ['#quot;hi#quot;', ['"hi"']],
    ['#35;tag', ['#tag']],
    ['a #999; b', ['a ϧ b']],
    ['#unknown;', ['#unknown;']],
    ['', []],
    ['<br>', []],
  ])('%s', (raw, expected) => {
    expect(labelLines(raw)).toEqual(expected);
  });

  it('leaves a codepoint outside Unicode alone rather than throwing', () => {
    expect(labelLines('#999999999;')).toEqual(['#999999999;']);
  });
});

describe('stripQuotes and decodeEntities', () => {
  it('removes only one matching pair', () => {
    expect(stripQuotes('""double""')).toBe('"double"');
    expect(stripQuotes('"unbalanced')).toBe('"unbalanced');
  });

  it('decodes without touching the rest of the text', () => {
    expect(decodeEntities('a #colon; b #semi; c')).toBe('a : b ; c');
  });
});
