import { describe, expect, it } from 'vitest';

import type { HighlightLanguage } from './highlight';
import { highlight, resolveHighlightLanguage } from './highlight';

/** The semantic class of the first token matching `value`, ignoring line grouping. */
function classOf(code: string, language: HighlightLanguage, value: string) {
  return highlight(code, language)
    .flat()
    .find((token) => token.value === value)?.className;
}

describe('resolveHighlightLanguage', () => {
  it('accepts canonical names directly', () => {
    expect(resolveHighlightLanguage('typescript')).toBe('typescript');
    expect(resolveHighlightLanguage('json')).toBe('json');
    expect(resolveHighlightLanguage('sql')).toBe('sql');
  });

  it('maps common aliases', () => {
    expect(resolveHighlightLanguage('ts')).toBe('typescript');
    expect(resolveHighlightLanguage('js')).toBe('javascript');
    expect(resolveHighlightLanguage('py')).toBe('python');
    expect(resolveHighlightLanguage('shell')).toBe('bash');
    expect(resolveHighlightLanguage('yml')).toBe('yaml');
    expect(resolveHighlightLanguage('md')).toBe('markdown');
  });

  it('normalizes case and whitespace', () => {
    expect(resolveHighlightLanguage(' TypeScript ')).toBe('typescript');
    expect(resolveHighlightLanguage('TSX')).toBe('tsx');
  });

  it('returns null for unknown or missing languages', () => {
    expect(resolveHighlightLanguage(undefined)).toBeNull();
    expect(resolveHighlightLanguage('')).toBeNull();
    expect(resolveHighlightLanguage('cobol')).toBeNull();
  });
});

describe('highlight', () => {
  it('groups tokens into lines that round-trip the source', () => {
    const code = "const greeting = 'hi';\nconsole.log(greeting);";
    const lines = highlight(code, 'typescript');

    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.map((token) => token.value).join('')).join('\n')).toBe(code);
  });

  it('keeps a trailing newline as an empty line', () => {
    expect(highlight('a: 1\n', 'yaml').at(-1)).toEqual([]);
  });

  it('classifies token families', () => {
    expect(classOf("const x = 'hi';", 'typescript', 'const')).toBe('keyword');
    expect(classOf("const x = 'hi';", 'typescript', "'hi'")).toBe('string');
    expect(classOf('// note', 'typescript', '// note')).toBe('comment');
    expect(classOf('{"a": 1}', 'json', '"a"')).toBe('property');
    expect(classOf('{"a": 1}', 'json', '1')).toBe('number');
    expect(classOf('{"a": true}', 'json', 'true')).toBe('literal');
    expect(classOf('<p class="x">hi</p>', 'html', 'p')).toBe('tag');
    expect(classOf('<p class="x">hi</p>', 'html', 'class')).toBe('attr');
    expect(classOf('select * from t', 'sql', 'select')).toBe('keyword');
  });

  it('highlights every supported language without error', () => {
    const samples = {
      bash: 'echo "$HOME"',
      css: 'a { color: red; }',
      html: '<p class="x">hi</p>',
      javascript: 'let x = 1;',
      json: '{"a": [1, true]}',
      jsx: 'const el = <div a={1} />;',
      markdown: '# Title\n\n- item',
      python: 'def f():\n    return 1',
      sql: 'select * from t where a = 1;',
      tsx: 'const el = <div a={1 as number} />;',
      typescript: 'type A = { b: string };',
      yaml: 'a: 1\nb: [x, y]',
    } satisfies Record<HighlightLanguage, string>;

    for (const [language, code] of Object.entries(samples)) {
      const lines = highlight(code, language as HighlightLanguage);

      expect(lines.flat().length, language).toBeGreaterThan(0);
      expect(
        lines.map((line) => line.map((token) => token.value).join('')).join('\n'),
        language,
      ).toBe(code);
    }
  });

  it('does not throw on an empty body', () => {
    expect(highlight('', 'html')).toEqual([[]]);
  });
});
