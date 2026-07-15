import { describe, expect, it } from 'vitest';

import { highlight, resolveHighlightLanguage } from './shiki';

describe('resolveHighlightLanguage', () => {
  it('accepts grammar names directly', () => {
    expect(resolveHighlightLanguage('typescript')).toBe('typescript');
    expect(resolveHighlightLanguage('json')).toBe('json');
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
  it('returns token lines colored by --shiki-* variable references', async () => {
    const tokens = await highlight("const greeting = 'hi';\nconsole.log(greeting);", 'typescript');

    expect(tokens).toHaveLength(2);

    const flat = tokens.flat();
    expect(flat.length).toBeGreaterThan(1);
    // Round-trip of source text: tokens per line concatenate back to the line, and the split has
    // no trailing entry to render as a stray blank line.
    expect(tokens.map((line) => line.map((token) => token.content).join(''))).toEqual([
      "const greeting = 'hi';",
      'console.log(greeting);',
    ]);
    // CSS-variables theme → colors are var() references styles.css resolves onto house tokens.
    for (const token of flat) {
      expect(token.color).toMatch(/^var\(--shiki-/);
    }
    // The keyword actually maps to a syntax slot, not just the foreground fallback.
    expect(flat.find((token) => token.content === 'const')?.color).toBe(
      'var(--shiki-token-keyword)',
    );
  });

  it('highlights every supported grammar without error', async () => {
    const samples = {
      bash: 'echo "$HOME"',
      css: 'a { color: red; }',
      html: '<p class="x">hi</p>',
      javascript: 'let x = 1;',
      json: '{"a": [1, true]}',
      jsx: 'const el = <div a={1} />;',
      markdown: '# Title\n\n- item',
      python: 'def f():\n    return 1',
      tsx: 'const el = <div a={1 as number} />;',
      typescript: 'type A = { b: string };',
      yaml: 'a: 1\nb: [x, y]',
    } as const;

    for (const [lang, code] of Object.entries(samples)) {
      const tokens = await highlight(code, lang as keyof typeof samples);
      expect(tokens.length, lang).toBeGreaterThan(0);
    }
  });
});
